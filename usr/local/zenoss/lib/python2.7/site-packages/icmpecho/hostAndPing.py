##############################################################################
# 
# Copyright (C) Zenoss, Inc. 2011, all rights reserved.
# 
# This content is made available according to terms specified in
# License.zenoss under the directory where your Zenoss product is installed.
# 
##############################################################################


import socket
import logging
from zope import interface
from datetime import datetime
from icmpecho.constants import ICMPv4_TYPE, ICMPv6_TYPE

_LOG = logging.getLogger("icmpecho")

_EXPECTED_REPLY_TYPES = {socket.AF_INET: (ICMPv4_TYPE.ECHO_REPLY,
                                          ICMPv4_TYPE.DESTINATION_UNREACHABLE,
                                          ICMPv4_TYPE.TIME_EXCEEDED,
                                          ),
                         socket.AF_INET6: (ICMPv6_TYPE.ECHO_REPLY,
                                           ICMPv6_TYPE.DESTINATION_UNREACHABLE,
                                           ICMPv6_TYPE.TIME_EXCEEDED,
                                           ),
                         }

def _compute_latency(time_sent):
  "return difference of datetime objects in milliseconds"
  latency = datetime.utcnow() - time_sent
  if latency.days:
    raise ValueError('Must not have days', latency)
  return latency.seconds * 1000.0 + latency.microseconds / 1000.0

class IOutput(interface.Interface):

  def on_echo_sent():
    "handle echo-sent event"

  def on_reply_received(reply, sockaddr, latency):
    """handle reply-received event. reply['type'] is ICMP_ECHOREPLY, 
    ICMP_DEST_UNREACH, or ICMP_TIME_EXCEEDED. reply['address'] is always the
    host address. If the type is ICMP_ECHOREPLY, sockaddr[0] is also the host
    address. If if the type is ICMP_DEST_UNREACH or ICMP_TIME_EXCEEDED, 
    sockaddr[0] is the address of an intermediate router."""

class IHost(interface.Interface):
  
  hostname = interface.Attribute("hostname")
  family = interface.Attribute("family")
  address = interface.Attribute("address")
  data_size = interface.Attribute("data_size")
  qos = interface.Attribute("qos")

class Host(object):
  interface.implements(IHost)

  def __init__(self, hostname, family, sockaddr, identifier, data_size, ttl, qos):
    
    # IHost interface
    self.hostname = hostname
    self.family = family
    self.address = sockaddr[0]
    self.data_size = data_size
    self.qos = qos
    
    self._sockaddr = sockaddr
    self._identifier = identifier
    self._last_sequence = None
    self._active_sequences = {}
    self._ttl = ttl
    self.output = IOutput(self)

  def on_echo_sent(self):
    if self._last_sequence is None:
      sequence = 1
    else:
      sequence = self._last_sequence + 1
    self._active_sequences[sequence] = datetime.utcnow()
    echo_kwargs = dict(identifier=self._identifier,
                       sequence=sequence,
                       data_size=self.data_size,
                       )
    socket_kwargs = dict(ttl=self._ttl, qos=self.qos,)
    self._last_sequence = sequence
    self.output.on_echo_sent()
    return self.family, self._sockaddr, echo_kwargs, socket_kwargs

  def on_send_error(self, error):
    self.output.on_send_error(error)

  def on_reply_received(self, reply, sockaddr):
    matches_last_sequence = False
    if reply['type'] not in _EXPECTED_REPLY_TYPES[self.family]:
      _LOG.debug("Received ICMP packet of type %s for %s" % 
                 (reply['type'], self.hostname,))
    elif reply['identifier'] != self._identifier:
      _LOG.debug("Identifier mismatch: packet=%s, expected=%s hostname=%s" % 
                 (reply['identifier'], self._identifier, self.hostname,))
    elif reply['sequence'] not in self._active_sequences:
      _LOG.debug("Sequence mismatch: packet=%s, expected=%s hostname=%s" %
                 (reply['sequence'], self._active_sequences, self.hostname,))
    else:
      send_time = self._active_sequences.pop(reply['sequence'])
      latency = _compute_latency(send_time)
      self.output.on_reply_received(reply, sockaddr, latency)
      if reply['sequence'] == self._last_sequence:
        matches_last_sequence = True
    return matches_last_sequence

class Ping(object):

  def __init__(self, hosts, network):
    self._hosts = hosts
    self._network = network
    self._reply_count = 0

  def send(self):
    self._reply_count = 0
    for host in self._hosts.itervalues():
      send_args = host.on_echo_sent()
      try:
        self._network.send(*send_args)
      except StandardError, e:
        host.on_send_error(e)

  def receive(self):
    for reply, sockaddr in self._network.receive():
      _LOG.debug("receive type=%s address=%s sockaddr[0]=%s identifier=%s" % (reply['type'], reply['address'], sockaddr[0], reply['identifier']))
      if reply['address'] in self._hosts:
        host = self._hosts[reply['address']]
        matches_last_send = host.on_reply_received(reply, sockaddr)
        if matches_last_send:
          self._reply_count += 1
    return self._reply_count >= len(self._hosts)
