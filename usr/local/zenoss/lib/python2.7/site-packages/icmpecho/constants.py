##############################################################################
# 
# Copyright (C) Zenoss, Inc. 2011, all rights reserved.
# 
# This content is made available according to terms specified in
# License.zenoss under the directory where your Zenoss product is installed.
# 
##############################################################################


class ICMPv4_TYPE(object):
  ECHO_REQUEST = 0x08
  ECHO_REPLY = 0x00
  DESTINATION_UNREACHABLE = 0x03
  TIME_EXCEEDED = 0x0b

class ICMPv6_TYPE(object):
  ECHO_REQUEST = 0x80
  ECHO_REPLY = 0x81
  DESTINATION_UNREACHABLE = 0x01
  TIME_EXCEEDED = 0x03
