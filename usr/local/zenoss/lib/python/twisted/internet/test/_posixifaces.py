# Copyright (c) Twisted Matrix Laboratories.
# See LICENSE for details.

"""
POSIX implementation of local network interface enumeration.
"""

import sys, socket

from socket import AF_INET, AF_INET6, inet_ntop
from ctypes import (
    CDLL, POINTER, Structure, c_char_p, c_ushort, c_int,
    c_uint32, c_uint8, c_void_p, c_ubyte, pointer, cast)
from ctypes.util import find_library

libc = CDLL(find_library("c"))

if sys.platform == 'darwin':
    _sockaddrCommon = [
        ("sin_len", c_uint8),
        ("sin_family", c_uint8),
        ]
else:
    _sockaddrCommon = [
        ("sin_family", c_ushort),
        ]

class in_addr(Structure):
    _fields_ = [
        ("in_addr", c_ubyte * 4),
        ]

class in6_addr(Structure):
    _fields_ = [
        ("in_addr", c_ubyte * 16),
        ]

class sockaddr(Structure):
    _fields_ = _sockaddrCommon + [
        ("sin_port", c_ushort),
        ]


class sockaddr_in(Structure):
    _fields_ = _sockaddrCommon + [
        ("sin_port", c_ushort),
        ("sin_addr", in_addr),
        ]

class sockaddr_in6(Structure):
    _fields_ = _sockaddrCommon + [
        ("sin_port", c_ushort),
        ("sin_flowinfo", c_uint32),
        ("sin_addr", in6_addr),
        ]

class ifaddrs(Structure):
    pass
ifaddrs_p = POINTER(ifaddrs)
ifaddrs._fields_ = [
    ('ifa_next', ifaddrs_p),
    ('ifa_name', c_char_p),
    ('ifa_flags', c_uint32),
    ('ifa_addr', POINTER(sockaddr)),
    ('ifa_netmask', POINTER(sockaddr)),
    ('ifa_dstaddr', POINTER(sockaddr)),
    ('ifa_data', c_void_p)]

getifaddrs = libc.getifaddrs
getifaddrs.argtypes = [POINTER(ifaddrs_p)]
getifaddrs.restype = c_int

freeifaddrs = libc.freeifaddrs
freeifaddrs.argtypes = [ifaddrs_p]

def _interfaces():
    """
    Call C{getifaddrs(3)} and return a list of tuples of interface name, address
    family, and human-readable address representing its results.
    """
    ifaddrs = ifaddrs_p()
    if getifaddrs(pointer(ifaddrs)) < 0:
        raise OSError()
    results = []
    try:
        while ifaddrs:
            if ifaddrs[0].ifa_addr:
                family = ifaddrs[0].ifa_addr[0].sin_family
                if family == AF_INET:
                    addr = cast(ifaddrs[0].ifa_addr, POINTER(sockaddr_in))
                elif family == AF_INET6:
                    addr = cast(ifaddrs[0].ifa_addr, POINTER(sockaddr_in6))
                else:
                    addr = None

                if addr:
                    packed = ''.join(map(chr, addr[0].sin_addr.in_addr[:]))
                    results.append((
                            ifaddrs[0].ifa_name,
                            family,
                            inet_ntop(family, packed)))

            ifaddrs = ifaddrs[0].ifa_next
    finally:
        freeifaddrs(ifaddrs)
    return results


def posixGetLinkLocalIPv6Addresses():
    """
    Return a list of strings in colon-hex format representing all the link local
    IPv6 addresses available on the system, as reported by I{getifaddrs(3)}.
    """
    retList = []
    for (interface, family, address) in _interfaces():
        if family == socket.AF_INET6 and address.startswith('fe80:'):
            retList.append('%s%%%s' % (address, interface))
    return retList
