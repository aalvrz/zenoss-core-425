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
import cStringIO
from itertools import *
from icmpecho.constants import ICMPv4_TYPE, ICMPv6_TYPE
from icmpecho import _network

_LOG = logging.getLogger("icmpecho")

class NetworkError(StandardError):
  pass

_MARKER = object()
def safe_hasattr(obj, name):
    return getattr(obj, name, _MARKER) is not _MARKER

def _gen_random_bytes(count):
  for i in xrange(count):
    yield random.randint(0x00, 0xff)

def _gen_groups(n, iterable, fillvalue=None):
    "_gen_groups(3, 'ABCDEFG', 'x') --> ABC DEF Gxx"
    args = [iter(iterable)] * n
    return izip_longest(fillvalue=fillvalue, *args)

def _gen_shorts(bytes):
  for high_order_byte, low_order_byte in _gen_groups(2, bytes, 0x00):
    yield high_order_byte << 8 | low_order_byte

def _compute_checksum(bytes):
  "Compute the Internet Checksum http://tools.ietf.org/html/rfc1071"
  shorts = _gen_shorts(bytes)
  sum_ = sum(shorts)
  sum_ = (sum_ >> 16 & 0xffff) + (sum_ & 0xffff)
  sum_ += sum_ >> 16 & 0xffff
  return ~sum_ & 0xffff

class EchoEncoder(object):

  def __init__(self, type_, identifier, sequence, data_size):
    self._type = type_
    self._code = 0x00
    self._checksum = 0x0000
    self._identifier = identifier
    self._sequence = sequence
    self._data = list(_gen_random_bytes(data_size))

  def encode_packet(self):
    return ''.join(self._gen_packet())

  def _gen_packet(self):
    self._checksum = _compute_checksum(self._gen_bytes())
    for byte in self._gen_bytes():
      yield chr(byte)

  def _gen_bytes(self):
    yield self._type
    yield self._code
    for short in self._checksum, self._identifier, self._sequence:
      yield short >> 8 & 0xff
      yield short & 0xff
    for byte in self._data:
      yield byte

def _receive_from(socket_):
  bufsize = 4096
  while True:
    try:
      packet, sockaddr = socket_.recvfrom(bufsize)
      yield packet, sockaddr
    except socket.error, e:
      if e.errno == errno.EAGAIN:
        break
      raise

class VersionHelper(object):

  def __init__(self, socket_):
    self.socket = socket_
    self.socket.setblocking(0)

class Helper4(VersionHelper):

  def setup_socket(self, ttl=None, qos=None):
    if ttl is not None:
      self.socket.setsockopt(socket.IPPROTO_IP, socket.IP_TTL, ttl)
    if qos is not None:
      self.socket.setsockopt(socket.IPPROTO_IP, socket.IP_TOS, qos)
    return self.socket

  def create_echo_encoder(self, identifier, sequence, data_size):
    return EchoEncoder(ICMPv4_TYPE.ECHO_REQUEST, identifier, sequence, data_size)

  def receive(self):
    for packet, sockaddr in _receive_from(self.socket):
      try:
        reply = _network.decode(socket.AF_INET, packet)
        yield reply, sockaddr
      except RuntimeError, e:
        _LOG.debug("Failed to decode IPv4 packet: %s: %s" % (e.__class__.__name__, e))

class Helper6(VersionHelper):

  def __init__(self, socket_):
    VersionHelper.__init__(self, socket_)
    if safe_hasattr(socket, "IPV6_RECVHOPLIMIT"):
      self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_RECVHOPLIMIT, 1)
    if safe_hasattr(socket, "IPV6_RECVTCLASS"):
      self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_RECVTCLASS, 1)

  def setup_socket(self, ttl=None, qos=None):
    if ttl is not None:
      self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_UNICAST_HOPS, ttl)
    if qos is not None:
      self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_TCLASS, qos)
    return self.socket

  def create_echo_encoder(self, identifier, sequence, data_size):
    return EchoEncoder(ICMPv6_TYPE.ECHO_REQUEST, identifier, sequence, data_size)

  def receive(self):
    for packet, sockaddr in _receive_from(self.socket):
      try:
        reply = _network.decode(socket.AF_INET6, packet)
        if safe_hasattr(socket, "IPV6_RECVHOPLIMIT"):
          reply['ttl'] = self.socket.getsockopt(socket.IPPROTO_IPV6, socket.IPV6_RECVHOPLIMIT)
        else:
          reply['ttl'] = None
        if safe_hasattr(socket, "IPV6_RECVTCLASS"):
          reply['qos'] = self.socket.getsockopt(socket.IPPROTO_IPV6, socket.IPV6_TCLASS)
        else:
          reply['qos'] = None
        if reply['type'] == ICMPv6_TYPE.ECHO_REPLY:
          reply['address'] = sockaddr[0]
        yield reply, sockaddr
      except RuntimeError, e:
        _LOG.debug("Failed to decode IPv6 packet: %s: %s" % (e.__class__.__name__, e))

class Network(object):

  def __init__(self, ipv4_socket, ipv6_socket):
    self._version_helpers = {}
    if ipv4_socket is not None:
      self._version_helpers[socket.AF_INET] = Helper4(ipv4_socket)
    if ipv6_socket is not None:
      self._version_helpers[socket.AF_INET6] = Helper6(ipv6_socket)

  def send(self, family, sockaddr, echo_kwargs, socket_kwargs={}):
    """echo_kwargs must have identifier, sequence and data_size.
       socket_kwargs may have ttl and qos"""
    _LOG.debug("send family=%s, sockaddr=%s, echo_kwargs=%s, socket_kwargs=%s" %
               (family, sockaddr, echo_kwargs, socket_kwargs))
    if family not in self._version_helpers:
      raise NetworkError("Illegal family: %s" % family)
    helper = self._version_helpers[family]
    socket_ = helper.setup_socket(**socket_kwargs)
    encoder = helper.create_echo_encoder(**echo_kwargs)
    num_bytes_sent = socket_.sendto(encoder.encode_packet(), sockaddr)
    _LOG.debug("sent %i bytes to %s" % (num_bytes_sent, sockaddr[0]))

  def receive(self):
    for helper in self._version_helpers.itervalues():
      for reply, sockaddr in helper.receive():
        yield reply, sockaddr
