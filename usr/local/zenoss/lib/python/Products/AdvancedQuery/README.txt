AdvancedQuery
=============

``AdvancedQuery`` is a Zope product aimed to overcome several limitations
and bugs of ``ZCatalog``'s native search function.

Like ``ZCatalog`` search, it supports elementary index searches.
While ``ZCatalog`` can combine such elementary searches only by "and",
``AdvancedQuery`` allows to arbitrarily combine them by ``&`` (and),
``|`` (or) and ``~`` (not). Besides, it supports an extended range
of elementary queries, such as matching, indexed queries, literal
result sets. Finally, it supports incremental filtering.

``AdvancedQuery`` also extends the sorting capabilities of
``ZCatalog``. ``ZCatalog`` supports efficient index based sorting
on one level. ``AdavancedQuery`` supports sorting on arbitrary levels
of field indexes. Furthermore, sorting is performed incrementally
-- only as far as the result is accessed.
This can drastically speed up sorting.
Finally, ``AdvancedQuery`` can sort based on query based ranks.
Unlike ``ZCatalog`` which simply ignores hits for which it does not
have a sort value, ``AdvancedQuery`` sorts such hits at the end
of the respective list.

``AdvancedQuery`` works best when used together with
``Products.ManagableIndex`` and ``dm.incrementalsearch``.
Some of its features depend on these products, e.g. matching
and incremental filtering. Furthermore, these additional
components can speed up queries by several orders of magnitude.

For more information, see ``AdvancedQuery.html`` in the ``doc`` subfolder.

Partial history
===============

3.0.3
  use the newer index sorting API (``documentToKeyMap``) if
  the older API (``keyForDocument``) is missing or obviously broken.

  The fix has been introduced for the ``nogopip`` index used in Plone 4.1.
  Unfortunately, this index version not only defines a broken
  ``keyForDocument`` but in addition uses call frame inspection targeted
  at ``ZCatalog`` sorting which fails when called by ``AdvancedQuery``,
  see https://dev.plone.org/plone/ticket/11637.
  Until this problem is resolved, you cannot use a ``nogopip`` index as
  sort index for ``AdvancedQuery``.
  
3.0.2
  Zope 2.13 compatibility

3.0.1
  fix test suite for Zope 2.12 by dropping ``ZopeTestCase.framework`` support.
  This implies that the test suite can now only be executed via the Zope
  test runner.
