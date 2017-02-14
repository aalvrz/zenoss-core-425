#       $Id: utf8.py,v 1.1.1.1 2008/06/28 16:03:50 dieter Exp $
'''utf8 utilities.'''

def int2utf8(i):
  l = []; a = l.append
  if i < 0x80: a(i)
  elif i < 0x800:
    a(0xc0 | (i >> 6));
    a(0x80 | (i & 0x3f))
  elif i < 0x10000:
    a(0xe0 | (i >> 12))
    a(0x80 | ((i >> 6) & 0x3f))
    a(0x80 | (i & 0x3f))
  elif i < 0x200000:
    a(0xf0 | (i >> 18))
    a(0x80 | ((i >> 12) & 0x3f))
    a(0x80 | ((i >> 6) & 0x3f))
    a(0x80 | (i & 0x3f))
  elif i < 0x4000000:
    a(0xf8 | (i >> 24))
    a(0x80 | ((i >> 18) & 0x3f))
    a(0x80 | ((i >> 12) & 0x3f))
    a(0x80 | ((i >> 6) & 0x3f))
    a(0x80 | (i & 0x3f))
  elif i < 0x80000000:
    a(0xfc | (i >> 30))
    a(0x80 | ((i >> 24) & 0x3f))
    a(0x80 | ((i >> 18) & 0x3f))
    a(0x80 | ((i >> 12) & 0x3f))
    a(0x80 | ((i >> 6) & 0x3f))
    a(0x80 | (i & 0x3f))
  else: raise ValueError('to large for UTF-8 conversion')
  return  ''.join(map(chr, l))

def ints2utf8(ints):
  '''convert the integer sequence *ints* into an utf8 string.'''
  return ''.join(map(int2utf8, ints))

def utf82ints(s):
  '''convert the utf8 string *s* into a sequence of ints.'''
  l = []; a = l.append
  i = 0; n = len(s)
  while i < n:
    c = ord(s[i]); i += 1
    # count the number of 1 bits in front of c
    cv = 0x80; mv = 0x7f; cl = 0
    while c & cv: cv >>= 1; mv >>= 1; cl +=1
    v = c & mv
    for _ in range(1, cl):
      c = ord(s[i]); i += 1
      if c & 0xc0 != 0x80:
        raise ValueError('bad utf8 continuation byte at %d' % (i-1))
      v <<= 6; v |= c & 0x3f
    l.append(v)
  return l
