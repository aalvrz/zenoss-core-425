##############################################################################
# 
# Copyright (C) Zenoss, Inc. 2011, all rights reserved.
# 
# This content is made available according to terms specified in
# License.zenoss under the directory where your Zenoss product is installed.
# 
##############################################################################


import sys
import socket
import math
import logging
from itertools import *
from zope import component, interface
from icmpecho.constants import ICMPv4_TYPE, ICMPv6_TYPE
from icmpecho.hostAndPing import IHost, IOutput

_LOG = logging.getLogger("icmpecho")

def write(msg):
    print msg
    sys.stdout.flush()

def _variance(data):
  n = len(data)
  sum_ = sum(data)
  sum_sqr = reduce(lambda x, y: x + y * y, data)
  mean = sum_ / n
  return abs((sum_sqr - sum_ * mean) / (n - 1))

def _standard_deviation(data):
  return math.sqrt(_variance(data))

class Stdout(object):
  component.adapts(IHost)
  interface.implements(IOutput)

  def __init__(self, host):
    self._host = host
    self._sent_count = 0
    self._receive_count = 0
    self._latencies = []
    args = (self._host.hostname, self._host.address, self._host.data_size)
    write("PING %s (%s) %s bytes of data." % args)

  def on_echo_sent(self):
    "part of the IOutput interface"
    self._sent_count += 1

  def on_send_error(self, error):
    write("For %s %s: %s" % (self._host.address, error.__class__.__name__, error))

  def on_reply_received(self, reply, sockaddr, latency):
    "part of the IOutput interface"
    if (self._host.family==socket.AF_INET and reply['type']==ICMPv4_TYPE.ECHO_REPLY) or \
       (self._host.family==socket.AF_INET6 and reply['type']==ICMPv6_TYPE.ECHO_REPLY):
      self._latencies.append(latency)
      format = "%u bytes from %s: icmp_seq=%u "
      args = (reply['data_size'], reply['address'], reply['sequence'],)
      if reply['ttl'] is not None:
        format += "ttl=%u "
        args += (reply['ttl'],)
      if reply.get('qos', 0) != 0 and self._host.qos != 0:
        format += "qos=%u "
        args += (reply['qos'],)
      format += "time=%0.1f ms"
      args += (latency,)
    elif (self._host.family==socket.AF_INET and reply['type']==ICMPv4_TYPE.TIME_EXCEEDED) or \
         (self._host.family==socket.AF_INET6 and reply['type']==ICMPv6_TYPE.TIME_EXCEEDED):
      format = "For %s from %s icmp_seq=%s Time to live exceeded"
      args = (self._host.address, sockaddr[0], reply['sequence'])
    elif (self._host.family==socket.AF_INET and reply['type']==ICMPv4_TYPE.DESTINATION_UNREACHABLE) or \
         (self._host.family==socket.AF_INET6 and reply['type']==ICMPv6_TYPE.DESTINATION_UNREACHABLE):
      format = "For %s from %s icmp_seq=%s Destination unreachable"
      args = (self._host.address, sockaddr[0], reply['sequence'])
    write(format % args)

  def write_statistics(self):
    write("")
    write("--- %s ping statistics ---" % self._host.hostname)
    write("%i packets transmitted, %i received, %.2f%% packet loss, time %.1fms" %
          (self._sent_count, self._received_count, self._packet_loss, self._latency_total))
    if self._received_count != 0:
      write("rtt min/avg/max/sdev = %.3f/%.3f/%.3f/%.3f ms" % 
            (self._latency_min, self._latency_mean, self._latency_max, self._latency_stddev))

  @property
  def _received_count(self):
    return len(self._latencies)

  @property
  def _packet_loss(self):
    if self._sent_count == 0:
      return 0.0
    return 100.0 * (self._sent_count - self._received_count) / self._sent_count

  @property
  def _latency_total(self):
    return sum(self._latencies)

  @property
  def _latency_min(self):
    return min(self._latencies)

  @property
  def _latency_mean(self):
    return sum(self._latencies) / len(self._latencies)

  @property
  def _latency_max(self):
    return max(self._latencies)

  @property
  def _latency_stddev(self):
    if self._received_count == 1:
      return 0.0
    return _standard_deviation(self._latencies)
