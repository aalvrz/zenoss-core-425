import manuel
import manuel.capture
import manuel.codeblock
import manuel.doctest
import manuel.ignore
import manuel.testcase
import manuel.testing
import os.path
import re
import unittest

doctest = manuel.absolute_import('doctest')

here = os.path.dirname(os.path.abspath(__file__))

def test_suite():
    tests = ['../index.txt', 'table-example.txt', 'README.txt', 'bugs.txt',
        'capture.txt']

    optionflags = doctest.NORMALIZE_WHITESPACE | doctest.ELLIPSIS

    m = manuel.ignore.Manuel()
    m += manuel.doctest.Manuel(optionflags=optionflags)
    m += manuel.codeblock.Manuel()
    m += manuel.capture.Manuel()
    # The apparently redundant "**dict()" is to make this code compatible with
    # Python 2.5 -- it would generate a SyntaxError otherwise.
    return manuel.testing.TestSuite(m, *tests, **dict(
        globs={'path_to_test': os.path.join(here, 'bugs.txt')}))


if __name__ == '__main__':
    unittest.TextTestRunner().run(test_suite())
