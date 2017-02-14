# Copyright (C) 2003 by Dr. Dieter Maurer, Eichendorffstr. 23, D-66386 St. Ingbert, Germany
# see "LICENSE.txt" for details
#       $Id: __init__.py,v 1.1.1.1 2008/06/28 16:03:50 dieter Exp $
'''Managable Indexes

see 'ManagableIndexes.html' for documentation.
'''

from FieldIndex import FieldIndex, addFieldIndexForm
from KeywordIndex import KeywordIndex, addKeywordIndexForm, \
     KeywordIndex_scalable, addKeywordIndex_scalableForm
from RangeIndex import RangeIndex, addRangeIndexForm
from WordIndex import WordIndex, addWordIndexForm
from SimpleTextIndex import SimpleTextIndex, addSimpleTextIndexForm
from PathIndex import PathIndex, addPathIndexForm
from ManagableIndex import addIndex, ManageManagableIndexes
from AccessControl import allow_module

_indexes= (
  'FieldIndex',
  'KeywordIndex',
  'KeywordIndex_scalable',
  'RangeIndex',
  'WordIndex',
  'SimpleTextIndex',
  'PathIndex',
  )

_mdict= globals()

def initialize(context):
  for idx in _indexes:
    context.registerClass(
      _mdict[idx],
      permission= ManageManagableIndexes,
      constructors= (_mdict['add%sForm' % idx], addIndex,),
      visibility= None,
      )

allow_module('Products.ManagableIndex.Utils')
