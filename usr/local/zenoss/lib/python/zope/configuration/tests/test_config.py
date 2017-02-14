##############################################################################
#
# Copyright (c) 2003 Zope Foundation and Contributors.
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
"""Test configuration machinery.
"""

import sys
import unittest
import re
from doctest import DocTestSuite
from zope.testing import renormalizing
from zope.configuration.config import metans, ConfigurationMachine
from zope.configuration import config

def test_config_extended_example():
    """Configuration machine

    Examples:

    >>> machine = ConfigurationMachine()
    >>> ns = "http://www.zope.org/testing"

    Register some test directives:

    Start with a grouping directive that sets a package:

    >>> machine((metans, "groupingDirective"),
    ...         name="package", namespace=ns,
    ...         schema="zope.configuration.tests.directives.IPackaged",
    ...         handler="zope.configuration.tests.directives.Packaged",
    ...         )

    Now we can set the package:

    >>> machine.begin((ns, "package"),
    ...               package="zope.configuration.tests.directives",
    ...               )

    Which makes it easier to define the other directives:

    First, define some simple directives:

    >>> machine((metans, "directive"),
    ...         namespace=ns, name="simple",
    ...         schema=".ISimple", handler=".simple")

    >>> machine((metans, "directive"),
    ...         namespace=ns, name="newsimple",
    ...         schema=".ISimple", handler=".newsimple")


    and try them out:

    >>> machine((ns, "simple"), "first", a=u"aa", c=u"cc")
    >>> machine((ns, "newsimple"), "second", a=u"naa", c=u"ncc", b=u"nbb")

    >>> from pprint import PrettyPrinter
    >>> pprint=PrettyPrinter(width=50).pprint

    >>> pprint(machine.actions)
    [{'args': (u'aa', u'xxx', 'cc'),
      'callable': f,
      'discriminator': ('simple',
                        u'aa',
                        u'xxx',
                        'cc'),
      'includepath': (),
      'info': 'first',
      'kw': {},
      'order': 0},
     {'args': (u'naa', u'nbb', 'ncc'),
      'callable': f,
      'discriminator': ('newsimple',
                        u'naa',
                        u'nbb',
                        'ncc'),
      'includepath': (),
      'info': 'second',
      'kw': {},
      'order': 0}]

    Define and try a simple directive that uses a component:

    >>> machine((metans, "directive"),
    ...         namespace=ns, name="factory",
    ...         schema=".IFactory", handler=".factory")


    >>> machine((ns, "factory"), factory=u".f")
    >>> pprint(machine.actions[-1:])
    [{'args': (),
      'callable': f,
      'discriminator': ('factory', 1, 2),
      'includepath': (),
      'info': None,
      'kw': {},
      'order': 0}]

    Define and try a complex directive:

    >>> machine.begin((metans, "complexDirective"),
    ...               namespace=ns, name="testc",
    ...               schema=".ISimple", handler=".Complex")

    >>> machine((metans, "subdirective"),
    ...         name="factory", schema=".IFactory")

    >>> machine.end()

    >>> machine.begin((ns, "testc"), None, "third", a=u'ca', c='cc')
    >>> machine((ns, "factory"), "fourth", factory=".f")

    Note that we can't call a complex method unless there is a directive for
    it:

    >>> machine((ns, "factory2"), factory=".f")
    Traceback (most recent call last):
    ...
    ConfigurationError: ('Invalid directive', 'factory2')


    >>> machine.end()
    >>> pprint(machine.actions)
    [{'args': (u'aa', u'xxx', 'cc'),
      'callable': f,
      'discriminator': ('simple',
                        u'aa',
                        u'xxx',
                        'cc'),
      'includepath': (),
      'info': 'first',
      'kw': {},
      'order': 0},
     {'args': (u'naa', u'nbb', 'ncc'),
      'callable': f,
      'discriminator': ('newsimple',
                        u'naa',
                        u'nbb',
                        'ncc'),
      'includepath': (),
      'info': 'second',
      'kw': {},
      'order': 0},
     {'args': (),
      'callable': f,
      'discriminator': ('factory', 1, 2),
      'includepath': (),
      'info': None,
      'kw': {},
      'order': 0},
     {'args': (),
      'callable': None,
      'discriminator': 'Complex.__init__',
      'includepath': (),
      'info': 'third',
      'kw': {},
      'order': 0},
     {'args': (u'ca',),
      'callable': f,
      'discriminator': ('Complex.factory', 1, 2),
      'includepath': (),
      'info': 'fourth',
      'kw': {},
      'order': 0},
     {'args': (u'xxx', 'cc'),
      'callable': f,
      'discriminator': ('Complex', 1, 2),
      'includepath': (),
      'info': 'third',
      'kw': {},
      'order': 0}]

    Done with the package

    >>> machine.end()


    Verify that we can use a simple directive outside of the package:

    >>> machine((ns, "simple"), a=u"oaa", c=u"occ", b=u"obb")

    But we can't use the factory directive, because it's only valid
    inside a package directive:

    >>> machine((ns, "factory"), factory=u".F")
    Traceback (most recent call last):
    ...
    ConfigurationError: ('Invalid value for', 'factory',""" \
       """ "Can't use leading dots in dotted names, no package has been set.")

    >>> pprint(machine.actions)
    [{'args': (u'aa', u'xxx', 'cc'),
      'callable': f,
      'discriminator': ('simple',
                        u'aa',
                        u'xxx',
                        'cc'),
      'includepath': (),
      'info': 'first',
      'kw': {},
      'order': 0},
     {'args': (u'naa', u'nbb', 'ncc'),
      'callable': f,
      'discriminator': ('newsimple',
                        u'naa',
                        u'nbb',
                        'ncc'),
      'includepath': (),
      'info': 'second',
      'kw': {},
      'order': 0},
     {'args': (),
      'callable': f,
      'discriminator': ('factory', 1, 2),
      'includepath': (),
      'info': None,
      'kw': {},
      'order': 0},
     {'args': (),
      'callable': None,
      'discriminator': 'Complex.__init__',
      'includepath': (),
      'info': 'third',
      'kw': {},
      'order': 0},
     {'args': (u'ca',),
      'callable': f,
      'discriminator': ('Complex.factory', 1, 2),
      'includepath': (),
      'info': 'fourth',
      'kw': {},
      'order': 0},
     {'args': (u'xxx', 'cc'),
      'callable': f,
      'discriminator': ('Complex', 1, 2),
      'includepath': (),
      'info': 'third',
      'kw': {},
      'order': 0},
     {'args': (u'oaa', u'obb', 'occ'),
      'callable': f,
      'discriminator': ('simple',
                        u'oaa',
                        u'obb',
                        'occ'),
      'includepath': (),
      'info': None,
      'kw': {},
      'order': 0}]

    """
    #'

def test_keyword_handling():
    """
    >>> machine = ConfigurationMachine()
    >>> ns = "http://www.zope.org/testing"

    Register some test directives:

    Start with a grouping directive that sets a package:

    >>> machine((metans, "groupingDirective"),
    ...         name="package", namespace=ns,
    ...         schema="zope.configuration.tests.directives.IPackaged",
    ...         handler="zope.configuration.tests.directives.Packaged",
    ...         )

    Now we can set the package:

    >>> machine.begin((ns, "package"),
    ...               package="zope.configuration.tests.directives",
    ...               )

    Which makes it easier to define the other directives:

    >>> machine((metans, "directive"),
    ...         namespace=ns, name="k",
    ...         schema=".Ik", handler=".k")


    >>> machine((ns, "k"), "yee ha", **{"for": u"f", "class": u"c", "x": u"x"})

    >>> from pprint import PrettyPrinter
    >>> pprint=PrettyPrinter(width=60).pprint
    >>> pprint(machine.actions)
    [{'args': ('f', 'c', 'x'),
      'callable': f,
      'discriminator': ('k', 'f'),
      'includepath': (),
      'info': 'yee ha',
      'kw': {},
      'order': 0}]
    """

def test_basepath_absolute():
    """Path must always return an absolute path.

    >>> import os
    >>> class stub:
    ...     __file__ = os.path.join('relative', 'path')
    >>> c = config.ConfigurationContext()
    >>> c.package = stub()

    >>> os.path.isabs(c.path('y/z'))
    True
    """

def test_basepath_uses_dunder_path():
    """Determine package path using __path__ if __file__ isn't available.
    (i.e. namespace package installed with --single-version-externally-managed)

    >>> import os
    >>> class stub:
    ...     __path__ = [os.path.join('relative', 'path')]
    >>> c = config.ConfigurationContext()
    >>> c.package = stub()

    >>> os.path.isabs(c.path('y/z'))
    True
    """

def test_trailing_dot_in_resolve():
    """Dotted names are no longer allowed to end in dots

    >>> c = config.ConfigurationContext()

    >>> c.resolve('zope.')
    Traceback (most recent call last):
    ...
    ValueError: Trailing dots are no longer supported in dotted names

    >>> c.resolve('  ')
    Traceback (most recent call last):
    ...
    ValueError: The given name is blank
    """

def test_bad_dotted_last_import():
    """
    >>> c = config.ConfigurationContext()

    Import error caused by a bad last component in the dotted name.

    >>> c.resolve('zope.configuration.tests.nosuch')
    Traceback (most recent call last):
    ...
    ConfigurationError: ImportError: Module zope.configuration.tests""" \
                                               """ has no global nosuch
    """

def test_bad_dotted_import():
    """
    >>> c = config.ConfigurationContext()

    Import error caused by a totally wrong dotted name.

    >>> c.resolve('zope.configuration.nosuch.noreally')
    Traceback (most recent call last):
    ...
    ConfigurationError: ImportError: Couldn't import""" \
                   """ zope.configuration.nosuch, No module named nosuch
    """

def test_bad_sub_last_import():
    """
    >>> c = config.ConfigurationContext()

    Import error caused by a bad sub import inside the referenced
    dotted name. Here we keep the standard traceback.

    >>> c.resolve('zope.configuration.tests.victim')
    Traceback (most recent call last):
    ...
      File "...bad.py", line 3 in ?
       import bad_to_the_bone
    ImportError: No module named bad_to_the_bone

    Cleanup:

    >>> for name in ('zope.configuration.tests.victim',
    ...              'zope.configuration.tests.bad'):
    ...    if name in sys.modules:
    ...        del sys.modules[name]
    """

def test_bad_sub_import():
    """
    >>> c = config.ConfigurationContext()

    Import error caused by a bad sub import inside part of the referenced
    dotted name. Here we keep the standard traceback.

    >>> c.resolve('zope.configuration.tests.victim.nosuch')
    Traceback (most recent call last):
    ...
      File "...bad.py", line 3 in ?
       import bad_to_the_bone
    ImportError: No module named bad_to_the_bone

    Cleanup:

    >>> for name in ('zope.configuration.tests.victim',
    ...              'zope.configuration.tests.bad'):
    ...    if name in sys.modules:
    ...        del sys.modules[name]
    """

def test_suite():
    checker = renormalizing.RENormalizing([
        (re.compile(r"<type 'exceptions.(\w+)Error'>:"),
                    r'exceptions.\1Error:'),
        ])
    return unittest.TestSuite((
        DocTestSuite('zope.configuration.fields'),
        DocTestSuite('zope.configuration.config',checker=checker),
        DocTestSuite(),
        ))

if __name__ == '__main__': unittest.main()
