#
# pyip is a Python package offering assembling/disassembling of raw ip packet
# including ip, udp, and icmp. Also it includes 2 utilities based on raw ip,
# traceroute and ping.
# 
# pyip is released under PYTHON SOFTWARE FOUNDATION LICENSE VERSION 2, and is
# a project inspired by 'ping' written by Jeremy Hylton.
#
# Author: Kenneth Jiang, kenneth.jiang@gmail.com
#


"""Internet packet basic

Simple operations like performing checksums and swapping byte orders.
"""

#from _ip import *
import array
import struct
from socket import htons, ntohs as _ntohs

def ntohs(x):
    return _ntohs(x) & 0xffff

def cksum(s):
    if len(s) & 1:
        s = s + '\0'
    words = array.array('h', s)
    sum = 0
    for word in words:
        sum = sum + (word & 0xffff)
    hi = sum >> 16
    lo = sum & 0xffff
    sum = hi + lo
    sum = sum + (sum >> 16)
    return (~sum) & 0xffff

# Should generalize from the *h2net patterns

# This python code is suboptimal because it is based on C code where
# it doesn't cost much to take a raw buffer and treat a section of it
# as a u_short.

def gets(s):
    return struct.unpack('H', s)[0] & 0xffff

def mks(h):
    return struct.pack('H', h)

def iph2net(s):
    len = htons(gets(s[2:4]))
    id = htons(gets(s[4:6]))
    off = htons(gets(s[6:8]))
    return s[:2] + mks(len) + mks(id) + mks(off) + s[8:]

def net2iph(s):
    len = ntohs(gets(s[2:4]))
    id = ntohs(gets(s[4:6]))
    off = ntohs(gets(s[6:8]))
    return s[:2] + mks(len) + mks(id) + mks(off) + s[8:]

def udph2net(s):
    sp = htons(gets(s[0:2]))
    dp = htons(gets(s[2:4]))
    len = htons(gets(s[4:6]))
    return mks(sp) + mks(dp) + mks(len) + s[6:]

def net2updh(s):
    sp = ntohs(gets(s[0:2]))
    dp = ntohs(gets(s[2:4]))
    len = ntohs(gets(s[4:6]))
    return mks(sp) + mks(dp) + mks(len) + s[6:]
