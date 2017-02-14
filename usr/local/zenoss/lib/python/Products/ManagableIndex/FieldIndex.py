# Copyright (C) 2003-2008 by Dr. Dieter Maurer, Illtalstr. 25, D-66571 Bubach, Germany
# see "LICENSE.txt" for details
#       $Id: FieldIndex.py,v 1.1.1.1 2008/06/28 16:03:50 dieter Exp $
'''Managable FieldIndex.'''
from Products.PluginIndexes.interfaces import IUniqueValueIndex, ISortIndex

from zope.interface import implements

from ManagableIndex import ManagableIndex, addForm

class FieldIndex(ManagableIndex):
  '''a managable 'FieldIndex'.'''
  meta_type= 'Managable FieldIndex'

  implements(IUniqueValueIndex, ISortIndex)

  _properties = (
    ManagableIndex._properties
    + (
    {'id':'ReverseOrder',
     'label':'Maintain reverse order (used by AdvancedQuery to efficiently support descending order). Remember to clear the index when you change this value!',
     'type':'boolean', 'mode':'rw',},
    )
    )

  def _indexValue(self,documentId,val,threshold):
    self._insert(val,documentId)
    return 1

  def _unindexValue(self,documentId,val):
    self._remove(val,documentId)

  # newly required for Zope 2.7
  def documentToKeyMap(self):
    '''must return a map from document ids to object value.'''
    return self._unindex

  # filtering support
  supportFiltering = True


def addFieldIndexForm(self):
  '''add FieldIndex form.'''
  return addForm.__of__(self)(
    type= FieldIndex.meta_type,
    description= '''A FieldIndex indexes an object under a single (atomic) value.''',
    action= 'addIndex',
    )
