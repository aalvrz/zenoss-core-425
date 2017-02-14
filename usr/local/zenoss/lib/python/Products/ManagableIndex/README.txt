ManagableIndex
==============

``Products.ManagableIndex`` is a framework for the easy construction of
efficient, flexible, via the ZMI fully customizable indexes for Zope
2.11 (or above). It comes with a set of predefined indexes: Field,
Keyword, Path, Range, Word and SimpleText index. Usually, they
are more flexible and more efficient than the corresponding indexes from
the Zope core.

``Products.ManagableIndex`` uses ``dm.incrementalsearch`` when it is
installed. This can speed up queries by several orders of magnitude
when used together with ``Products.AdvancedQuery``.

You find more information in the ``doc`` subdirectory.

New in version 2.1.x
====================

 * (2.1.5) the fix in 2.1.4 broke support for older ``GenericSetup`` versions.
   2.1.5 fixes the fix for this case.

 * (2.1.4) newer ``Products.GenericSetup`` versions (e.g. that used by Plone 4)
   have replaced a global ``Products`` import by a local one
   in ``Products.GenericSetup.utils.ObjectManagerHelpers._initObjects``
   and thereby broken our ``GenericSetup`` support.
   Version 2.1.4 fixes this problem.
   
 * fix test suite for Zope 2.12 (Zope puts non existing elements
   in ``Products.__path__`` and (unlike Python)
   ``OFS.Application.get_products`` cannot handle this case).

 * ``GenericSetup`` support.
