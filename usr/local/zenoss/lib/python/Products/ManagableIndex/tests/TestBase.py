# Copyright (C) 2003 by Dr. Dieter Maurer, Eichendorffstr. 23, D-66386 St. Ingbert, Germany
# see "LICENSE.txt" for details
#       $Id: TestBase.py,v 1.2 2010-06-12 08:49:25 dieter Exp $
'''Test infrastructure.'''



#######################################################################
# Hack to find our "INSTANCE_HOME" infrastructure.
# Note, that "testrunner.py" overrides "INSTANCE_HOME". Therefore,
# we look also for "TEST_INSTANCE_HOME"
from os import environ, path
import sys

def _updatePath(path,dir):
  if dir not in path: path.insert(0,dir)

_ih= environ.get('TEST_INSTANCE_HOME') or environ.get('INSTANCE_HOME')
if _ih:
  _updatePath(sys.path, path.join(_ih,'lib','python'))
  import Products; _updatePath(Products.__path__,path.join(_ih,'Products'))


#######################################################################
# Standard imports
from unittest import TestCase, TestSuite, makeSuite, TextTestRunner

from Acquisition import Explicit, Implicit
from OFS.Application import Application
from OFS.SimpleItem import SimpleItem
from zope.interface.verify import verifyObject
from Products.ZCatalog.ZCatalog import ZCatalog
from Products.ZCTextIndex.Lexicon import Lexicon, Splitter
from Products.PluginIndexes.interfaces import \
    IPluggableIndex, IUniqueValueIndex, ISortIndex


from Products.ManagableIndex.FieldIndex import FieldIndex
from Products.ManagableIndex.KeywordIndex import KeywordIndex
from Products.ManagableIndex.RangeIndex import RangeIndex
from Products.ManagableIndex.WordIndex import WordIndex
from Products.ManagableIndex.PathIndex import PathIndex
from Products.ManagableIndex.SimpleTextIndex import SimpleTextIndex

def genSuite(*testClasses,**kw):
  prefix= kw.get('prefix','test')
  return TestSuite([makeSuite(cl,prefix) for cl in testClasses])

def runSuite(suite):
  tester= TextTestRunner()
  tester.run(suite)

def runTests(*testClasses,**kw):
  runSuite(genSuite(*testClasses,**kw))


class Lexicon(Lexicon, SimpleItem): pass

#######################################################################
# Test base class
class TestBase(TestCase):
  '''An application with a catalog with field index 'id',
  keyword index 'ki', range index 'ri', word index 'wi', path index 'pi'
  and two objects 'obj1' and 'obj2'.
  '''
  def setUp(self):
    app= Application()
    catalog= ZCatalog('Catalog')
    app._setObject('Catalog',catalog)
    self.catalog= catalog= app._getOb('Catalog')
    install_products(app, 'ManagableIndex')
    # field
    self.fi = self._createIndex('id', FieldIndex)
    # keyword
    self.ki= self._createIndex('kw', KeywordIndex)
    # range
    self.ri = self._createIndex(
      'ri', RangeIndex,
      dict(CombineType='aggregate',
           ValueProviders=[
             dict(id='rlow', type='AttributeLookup'),
             dict(id='rhigh', type='AttributeLookup'),
             ]
           ),
      )
    # word
    lexicon = Lexicon(Splitter())
    app._setObject('lexicon', lexicon)
    self.wi = self._createIndex('wi', WordIndex, dict(Lexicon='lexicon'))
    # simple text
    self.sti = self._createIndex('sti', SimpleTextIndex, dict(Lexicon='lexicon'))
    # path
    self.pi= self._createIndex('pi', PathIndex)
    # create objects
    self.obj1= obj1= _Object()
    obj1.kw= (1,2)
    obj1.fkw= _Caller(lambda obj: obj.kw)
    obj1.fid= _Caller(lambda obj: obj.id)
    self.obj2= obj2= _Object().__of__(obj1)
    obj2.id= 'id'

  def _check(self, index, query, should):
    rs, _ = index._apply_index({index.id:query})
    self.assertEqual(''.join(map(repr, rs.keys())), should)

  def _createIndex(self, id, class_, extra=None):
    """create an index of *class_* with *id*. Verify that *extra* is passed
    and that the promissed interfaces are provided.
    """
    my_extra = extra or {'PrenormalizeTerm':''}
    self.catalog.addIndex(id, class_.meta_type, my_extra)
    index = self.catalog._catalog.getIndex(id)
    if extra is None:
      self.assert_(index.__dict__.has_key('PrenormalizeTerm'))
    for i in (IPluggableIndex, IUniqueValueIndex, ISortIndex):
      if i.providedBy(index): verifyObject(i, index)
    return index


#######################################################################
# Auxiliaries

class _Caller(Explicit):
  def __init__(self,f):
    self._f= f

  def __call__(self):
    return self._f(self.aq_parent)

class _Object(Implicit):
  __roles__ = None
  __allow_access_to_unprotected_subobjects__ = True
  def __cmp__(self,other):
    if not isinstance(other,_Object): raise TypeError('type mismatch in comparison')
    return cmp(self.__dict__,other.__dict__)


def install_products(app, *prod):
    """auxiliary function to install products *prod* (by names)."""
    from OFS.Application import get_folder_permissions, get_products, install_product

    folder_permissions = get_folder_permissions()
    meta_types=[]
    done={}
    # work around a Zope bug: "Products.__path__" may contain
    #  non existing elements
    import Products, os.path
    Products.__path__ = [p for p in Products.__path__ if os.path.exists(p)]
    products = get_products()
    for priority, product_name, index, product_dir in products:
        if product_name not in prod or product_name in done: continue
        done[product_name]=1
        install_product(app, product_dir, product_name, meta_types,
                        folder_permissions, raise_exc=True)
    
