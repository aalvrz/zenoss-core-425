##############################################################################
# 
# Copyright (C) Zenoss, Inc. 2011, all rights reserved.
# 
# This content is made available according to terms specified in
# License.zenoss under the directory where your Zenoss product is installed.
# 
##############################################################################


"""Class that schedules the sending and receiving of ICMP echo and echo-reply
packets using a twisted reactor."""

from twisted.internet import reactor
from twisted.internet.task import LoopingCall

_RECEIVE_INTERVAL = .0001

class Scheduler(object):
  """Sends an echo to each host every interval. Count determines the number
  of echoes sent to each host. Waits for all hosts to reply and then ."""

  def __init__(self, ping, count, send_interval, receive_timeout, stop_callback):
    self._ping = ping
    self._count = count
    self._send_interval = send_interval
    self._receive_timeout = receive_timeout
    self._stop_callback = stop_callback
    self._send_loop = LoopingCall(self._send)
    self._receive_loop = LoopingCall(self._receive)
    self._num_sent = 0
    self._sigint_handled = False

  def start(self):
    if not self._send_loop.running:
      self._send_loop.start(self._send_interval)
    if not self._receive_loop.running:
      self._receive_loop.start(_RECEIVE_INTERVAL)

  def on_sigint(self, signal, frame):
    "This method can be set to handle SIGINT (Ctrl-C)."
    if self._sigint_handled:
      self._stop_receiving()
    else:
      self._sigint_handled = True
      self._stop_sending()

  def _stop_sending(self):
    if self._send_loop.running:
      self._send_loop.stop()
    reactor.callLater(self._receive_timeout, self._stop_receiving)

  def _stop_receiving(self):
    if self._receive_loop.running:
      self._receive_loop.stop()
    self._stop_callback()

  def _send(self):
    self._ping.send()
    self._num_sent += 1
    if self._count is not None and self._num_sent >= self._count:
      self._stop_sending()

  def _receive(self):
    received_all = self._ping.receive()
    if not self._send_loop.running and received_all:
      self._stop_receiving()
