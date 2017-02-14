##############################################################################
#
# Copyright (c) 2001, 2002 Zope Foundation and Contributors.
# All Rights Reserved.
#
# This software is subject to the provisions of the Zope Public License,
# Version 2.1 (ZPL).  A copy of the ZPL should accompany this distribution.
# THIS SOFTWARE IS PROVIDED "AS IS" AND ANY AND ALL EXPRESS OR IMPLIED
# WARRANTIES ARE DISCLAIMED, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
# WARRANTIES OF TITLE, MERCHANTABILITY, AGAINST INFRINGEMENT, AND FITNESS
# FOR A PARTICULAR PURPOSE.
#
##############################################################################
"""Traverser Adapter tests.
"""
import unittest

import zope.component
from zope.component.testing import PlacelessSetup
from zope.interface import directlyProvides, implementedBy
from zope.interface.verify import verifyClass
from zope.location.traversing \
    import LocationPhysicallyLocatable, RootPhysicallyLocatable
from zope.location.interfaces \
    import ILocationInfo, IRoot, LocationError
from zope.security.interfaces import Unauthorized
from zope.security.checker \
    import ProxyFactory, defineChecker, CheckerPublic, Checker
from zope.security.management import newInteraction, endInteraction

from zope.traversing.adapters import Traverser, DefaultTraversable
from zope.traversing.interfaces import ITraversable, ITraverser

from zope.container.contained import Contained, contained


class ParticipationStub(object):

    def __init__(self, principal):
        self.principal = principal
        self.interaction = None

class C(Contained):
    def __init__(self, name):
        self.name = name

class TraverserTests(PlacelessSetup, unittest.TestCase):

    def setUp(self):
        PlacelessSetup.setUp(self)
        # Build up a wrapper chain
        self.root =   C('root')
        self.folder = contained(C('folder'), self.root,   name='folder')
        self.item =   contained(C('item'),   self.folder, name='item')
        self.tr = Traverser(self.item)

    def testImplementsITraverser(self):
        self.failUnless(ITraverser.providedBy(self.tr))

    def testVerifyInterfaces(self):
        for interface in implementedBy(Traverser):
            verifyClass(interface, Traverser)

class UnrestrictedNoTraverseTests(unittest.TestCase):
    def setUp(self):
        self.root = root = C('root')
        directlyProvides(self.root, IRoot)
        self.folder = folder = C('folder')
        self.item = item = C('item')

        root.folder = folder
        folder.item = item

        self.tr = Traverser(root)

    def testNoTraversable(self):
        self.assertRaises(LocationError, self.tr.traverse,
                          'folder')

class UnrestrictedTraverseTests(PlacelessSetup, unittest.TestCase):
    def setUp(self):
        PlacelessSetup.setUp(self)

        zope.component.provideAdapter(DefaultTraversable, (None,), ITraversable)
        zope.component.provideAdapter(LocationPhysicallyLocatable, (None,),
                                      ILocationInfo)
        zope.component.provideAdapter(RootPhysicallyLocatable,
                                      (IRoot,), ILocationInfo)

        # Build up a wrapper chain
        self.root = root = C('root')
        directlyProvides(self.root, IRoot)
        self.folder = folder = contained(C('folder'), root, 'folder')
        self.item = item = contained(C('item'), folder, 'item')

        root.folder = folder
        folder.item = item

        self.tr = Traverser(root)

    def testSimplePathString(self):
        tr = self.tr
        item = self.item

        self.assertEquals(tr.traverse('/folder/item'), item)
        self.assertEquals(tr.traverse('folder/item'), item)
        self.assertEquals(tr.traverse('/folder/item/'), item)

    def testSimplePathUnicode(self):
        tr = self.tr
        item = self.item

        self.assertEquals(tr.traverse(u'/folder/item'), item)
        self.assertEquals(tr.traverse(u'folder/item'), item)
        self.assertEquals(tr.traverse(u'/folder/item/'), item)

    def testSimplePathTuple(self):
        tr = self.tr
        item = self.item

        self.assertEquals(tr.traverse(('', 'folder', 'item')),
                          item)
        self.assertEquals(tr.traverse(('folder', 'item')), item)

    def testComplexPathString(self):
        tr = self.tr
        item = self.item

        self.assertEquals(tr.traverse('/folder/../folder/./item'),
            item)

    def testNotFoundDefault(self):
        self.assertEquals(self.tr.traverse('foo', 'notFound'),
            'notFound')

    def testNotFoundNoDefault(self):
        self.assertRaises(LocationError, self.tr.traverse, 'foo')

    def testTraverseOldStyleClass(self):
        class AnOldStyleClass:
            x = object()
        container = {}
        container['theclass'] = AnOldStyleClass

        tr = Traverser(container)
        self.assert_(tr.traverse('theclass/x') is AnOldStyleClass.x)

    def testTraversingDictSeesDictAPI(self):
        adict = {
            'foo': 'bar',
            'anotherdict': {'bar': 'foo'},
            'items': '123',
            }
        tr = Traverser(adict)
        self.assertEqual(tr.traverse('items'), adict.items)
        self.assertEqual(tr.traverse('anotherdict/bar'), 'foo')
        self.assertEqual(tr.traverse('anotherdict/items'),
                         adict['anotherdict'].items)

    def testTraversingDoesntFailOnStrings(self):
        adict = {'foo': 'bar'}
        tr = Traverser(adict)
        # This used to raise type error before
        self.assertRaises(LocationError, tr.traverse, 'foo/baz')


class RestrictedTraverseTests(PlacelessSetup, unittest.TestCase):
    _oldPolicy = None
    _deniedNames = ()

    def setUp(self):
        PlacelessSetup.setUp(self)

        zope.component.provideAdapter(DefaultTraversable, (None,), ITraversable)
        zope.component.provideAdapter(LocationPhysicallyLocatable, (None,),
                                      ILocationInfo)
        zope.component.provideAdapter(RootPhysicallyLocatable,
                                      (IRoot,), ILocationInfo)

        self.root = root = C('root')
        directlyProvides(root, IRoot)
        self.folder = folder = contained(C('folder'), root, 'folder')
        self.item = item = contained(C('item'), folder, 'item')

        root.folder = folder
        folder.item = item

        self.tr = Traverser(ProxyFactory(root))

    def testAllAllowed(self):
        defineChecker(C, Checker({'folder': CheckerPublic,
                                  'item': CheckerPublic,
                                  }))
        tr = Traverser(ProxyFactory(self.root))
        item = self.item

        self.assertEquals(tr.traverse(('', 'folder', 'item')), item)
        self.assertEquals(tr.traverse(('folder', 'item')), item)

    def testItemDenied(self):
        endInteraction()
        newInteraction(ParticipationStub('no one'))
        defineChecker(C, Checker({'item': 'Waaaa', 'folder': CheckerPublic}))
        tr = Traverser(ProxyFactory(self.root))
        folder = self.folder

        self.assertRaises(Unauthorized, tr.traverse,
            ('', 'folder', 'item'))
        self.assertRaises(Unauthorized, tr.traverse,
            ('folder', 'item'))
        self.assertEquals(tr.traverse(('', 'folder')), folder)
        self.assertEquals(tr.traverse(('folder', '..', 'folder')),
                          folder)
        self.assertEquals(tr.traverse(('folder',)), folder)

class DefaultTraversableTests(unittest.TestCase):
    def testImplementsITraversable(self):
        self.failUnless(ITraversable.providedBy(DefaultTraversable(None)))

    def testVerifyInterfaces(self):
        for interface in implementedBy(DefaultTraversable):
            verifyClass(interface, DefaultTraversable)

    def testAttributeTraverse(self):
        root = C('root')
        item = C('item')
        root.item = item
        df = DefaultTraversable(root)

        further = []
        next = df.traverse('item', further)
        self.failUnless(next is item)
        self.assertEquals(further, [])

    def testDictionaryTraverse(self):
        dict = {}
        foo = C('foo')
        dict['foo'] = foo
        df = DefaultTraversable(dict)

        further = []
        next = df.traverse('foo', further)
        self.failUnless(next is foo)
        self.assertEquals(further, [])

    def testNotFound(self):
        df = DefaultTraversable(C('dummy'))

        self.assertRaises(LocationError, df.traverse, 'bar', [])

def test_suite():
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromTestCase(TraverserTests)
    suite.addTest(loader.loadTestsFromTestCase(DefaultTraversableTests))
    suite.addTest(loader.loadTestsFromTestCase(UnrestrictedNoTraverseTests))
    suite.addTest(loader.loadTestsFromTestCase(UnrestrictedTraverseTests))
    suite.addTest(loader.loadTestsFromTestCase(RestrictedTraverseTests))
    return suite

if __name__=='__main__':
    unittest.TextTestRunner().run(test_suite())
