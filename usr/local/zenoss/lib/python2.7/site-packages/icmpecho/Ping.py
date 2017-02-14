##############################################################################
# 
# Copyright (C) Zenoss, Inc. 2011, all rights reserved.
# 
# This content is made available according to terms specified in
# License.zenoss under the directory where your Zenoss product is installed.
# 
##############################################################################


import os
import socket
import errno
import logging
import random
import time
from itertools import izip_longest
from icmpecho.constants import ICMPv4_TYPE, ICMPv6_TYPE
from icmpecho import _network

log = logging.getLogger("zen.icmpecho")

_MARKER = object()
def safe_hasattr(obj, name):
    return getattr(obj, name, _MARKER) is not _MARKER


class Ping(object):
    def __init__(self, pingsocket, pingType, identifier=None):
        self.socket = pingsocket
        self.socket.setblocking(0)

        # pingType is either IPv4 or IPv6 ECHO
        self._pingType = pingType

        # WTH magic number is this?
        self._code = 0x00

        # This is usually the process id, and is used to distinguish
        # between multiple ping processes sending out packets
        self._identifier = identifier if identifier else os.getpid()

        # Must fit within an unsigned short
        if self._identifier > 65535:
            self._identifier = self._identifier % 65536

    def close(self):
        """
        Provides a file-like interface
        """
        return self.socket.close()

    def fileno(self):
        """
        Provides a file-like interface
        """
        return self.socket.fileno()

    def _makePingData(self, count):
        data = []
        for i in xrange(count):
            data.append(random.randint(0x00, 0xff))
        return data

    def _gen_groups(self, n, iterable, fillvalue=None):
        "_gen_groups(3, 'ABCDEFG', 'x') --> ABC DEF Gxx"
        args = [iter(iterable)] * n
        return izip_longest(fillvalue=fillvalue, *args)

    def _gen_shorts(self, bytes):
        for high_order_byte, low_order_byte in self._gen_groups(2, bytes, 0x00):
            yield high_order_byte << 8 | low_order_byte

    def _generateChecksum(self, bytes):
        """
        Compute the Internet Checksum http://tools.ietf.org/html/rfc1071
        """
        shorts = self._gen_shorts(bytes)
        sum_ = sum(shorts)
        sum_ = (sum_ >> 16 & 0xffff) + (sum_ & 0xffff)
        sum_ += sum_ >> 16 & 0xffff
        return ~sum_ & 0xffff

    def makePingPacket(self, sequence, data_size):
        self._sequence = sequence

        # Blank checksum -- gets used to generate the first pass of the packet
        self._checksum = 0x0000

        self._data = self._makePingData(data_size)

        # Generate the checksum on the raw packet
        self._checksum = self._generateChecksum(self._generateRawPacket())

        # Return the packet, including checksum
        return ''.join([ chr(byte) for byte in self._generateRawPacket()] )

    def _generateRawPacket(self):
        """
        Generator to create a packet, with and without a checksum.
        """
        yield self._pingType
        yield self._code

        for short in self._checksum, self._identifier, self._sequence:
            yield short >> 8 & 0xff
            yield short & 0xff

        for byte in self._data:
            yield byte

    def send(self, sockaddr, socket_kwargs, echo_kwargs):
        self._setSocketOpts(**socket_kwargs)
        icmpEchoPacket = self.makePingPacket(**echo_kwargs)

        startTime = time.time()
        bytesSent = self.socket.sendto(icmpEchoPacket, sockaddr)
        log.debug("Sent %i bytes to %s", bytesSent, sockaddr[0])
        return startTime

    def _recvfrom(self):
        # Why 4k?
        bufsize = 4096
        while True:
            try:
                packet, sockaddr = self.socket.recvfrom(bufsize)
                yield packet, sockaddr
            except socket.error, e:
                if e.errno == errno.EAGAIN:
                    break
                raise


class Ping4(Ping):
    _EXPECTED_REPLY_TYPES = (
            ICMPv4_TYPE.ECHO_REPLY,
            ICMPv4_TYPE.DESTINATION_UNREACHABLE,
            ICMPv4_TYPE.TIME_EXCEEDED,
    )

    def __init__(self, pingsocket, identifier=None):
        Ping.__init__(self, pingsocket, ICMPv4_TYPE.ECHO_REQUEST, identifier)

    def _setSocketOpts(self, ttl=None, qos=None):
        if ttl is not None:
            self.socket.setsockopt(socket.IPPROTO_IP, socket.IP_TTL, ttl)
        if qos is not None:
            self.socket.setsockopt(socket.IPPROTO_IP, socket.IP_TOS, qos)
        return self.socket

    def receive(self):
        for packet, sockaddr in self._recvfrom():
            try:
                reply = _network.decode(socket.AF_INET, packet)
                if reply['identifier'] != self._identifier:
                    log.debug("Identifier mismatch: packet=%s, expected=%s -- ignoring",
                             reply['identifier'], self._identifier)
                    continue

                if reply['type'] == ICMPv4_TYPE.ECHO_REPLY:
                    reply['alive'] = True
                else:
                    reply['alive'] = False

                yield reply, sockaddr
            except RuntimeError, e:
                if log.getEffectiveLevel() < logging.DEBUG:
                    log.debug("Failed to decode IPv4 packet: %s: %s",
                              e.__class__.__name__, e)


class Ping6(Ping):
    _EXPECTED_REPLY_TYPES = (
            ICMPv6_TYPE.ECHO_REPLY,
            ICMPv6_TYPE.DESTINATION_UNREACHABLE,
            ICMPv6_TYPE.TIME_EXCEEDED,
    )

    def __init__(self, pingsocket, identifier=None):
        Ping.__init__(self, pingsocket, ICMPv6_TYPE.ECHO_REQUEST, identifier)
        if safe_hasattr(socket, "IPV6_RECVHOPLIMIT"):
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_RECVHOPLIMIT, 1)
        if safe_hasattr(socket, "IPV6_RECVTCLASS"):
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_RECVTCLASS, 1)

    def _setSocketOpts(self, ttl=None, qos=None):
        if ttl is not None and safe_hasattr(socket, "IPV6_RECVHOPLIMIT"):
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_UNICAST_HOPS, ttl)
        if qos is not None and safe_hasattr(socket, "IPV6_RECVTCLASS"):
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_TCLASS, qos)
        return self.socket

    def receive(self):
        for packet, sockaddr in self._recvfrom():
            try:
                reply = _network.decode(socket.AF_INET6, packet)
                if reply['identifier'] != self._identifier:
                    log.debug("Identifier mismatch: packet=%s, expected=%s -- ignoring",
                             reply['identifier'], self._identifier)
                    continue
                    
                if safe_hasattr(socket, "IPV6_RECVHOPLIMIT"):
                    reply['ttl'] = self.socket.getsockopt(socket.IPPROTO_IPV6,
                                                          socket.IPV6_RECVHOPLIMIT)
                else:
                    reply['ttl'] = None

                if safe_hasattr(socket, "IPV6_RECVTCLASS"):
                    reply['qos'] = self.socket.getsockopt(socket.IPPROTO_IPV6,
                                                          socket.IPV6_TCLASS)
                else:
                    reply['qos'] = None

                if reply['type'] == ICMPv6_TYPE.ECHO_REPLY:
                    reply['address'] = sockaddr[0]
                    reply['alive'] = True
                else:
                    reply['alive'] = False

                yield reply, sockaddr
            except RuntimeError, e:
                if log.getEffectiveLevel() < logging.DEBUG:
                    log.debug("Failed to decode IPv6 packet: %s: %s",
                              e.__class__.__name__, e)
