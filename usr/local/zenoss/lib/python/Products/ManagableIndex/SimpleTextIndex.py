# Copyright (C) 2003-2008 by Dr. Dieter Maurer, Illtalstr. 25, D-66571 Bubach, Germany
# see "LICENSE.txt" for details
#       $Id: SimpleTextIndex.py,v 1.1.1.1 2008/06/28 16:03:50 dieter Exp $
'''Managable simple TextIndex.

A simple text index can perform word or phrase queries.

It uses a 'ZCLexicon' like lexicon to parse text into a word
sequence.

Unlike almost all Zope text indexes, it does not have a built
in query parser. If you need more complex queries use
something like 'AdvancedQuery' to specify your complex queries.
Moreover, 'SimpleTextIndex' does not support ranking.

Search terms are either a text or a sequence of ints.
A text is converted via the lexicon into a sequence of ints.
If an int sequence is passed in, then it is assumed that
the text -> wordid conversion was performed outside.
The query is either interpreted as an and query of
the given words or as a phrase query, dependent on the
'phrase' option.

For phrase queries, the use of 'dm.incrementalsearch' is strongly
recommended as it drastically speeds up phrase queries.
'''
from types import StringTypes

from BTrees.IIBTree import IITreeSet, IISet, intersection, difference

from WordIndex import WordIndex
from ManagableIndex import ManagableIndex, addForm
from fixPluginIndexes import parseIndexRequest
from utf8 import ints2utf8, utf82ints

class SimpleTextIndex(WordIndex):
  '''a managable 'SimpleTextIndex'.'''
  meta_type = 'Managable SimpleTextIndex'

  query_options = ('phrase', 'isearch')
  TermType = 'integer'

  _properties = ManagableIndex._properties[:1] + (
    {'id':'Lexicon', 'type':'string', 'mode':'w',
     'label':'Lexicon id of a ZCTextIndex like lexicon (resolved with respect to the catalog) -- clear+reindex after change',},
    )
  Lexicon = ''

  # override for better readability
  def getEntryForObject(self,documentId, default= None):
    '''Information for *documentId*.'''
    info= self._unindex.get(documentId)
    if info is None: return default
    lexicon = self._getLexicon()
    return ' '.join((lexicon.get_word(wid) for wid in self._unindexVal2Val(info)))

  _val2UnindexVal = staticmethod(ints2utf8)
  _unindexVal2Val = staticmethod(utf82ints)

  # set conversion for values
  def _update(self, documentId, val, oldval, threshold):
    val = IITreeSet(val); oldval = IITreeSet(self._unindexVal2Val(oldval))
    add= difference(val,oldval)
    rem= difference(oldval,val)
    if add: self._indexValue(documentId,add,threshold)
    if rem: self._unindexValue(documentId,rem)
    return len(add)

  def _indexValue(self, documentId, val, threshold):
    return super(SimpleTextIndex, self)._indexValue(
      documentId, IITreeSet(val), threshold
      )

  def _unindexValue(self, documentId, val):
    return super(SimpleTextIndex, self)._unindexValue(
      documentId, IITreeSet(val)
      )

  def _apply_index(self, request, cid= ''):
    '''see 'PluggableIndex'.

    What is *cid* for???
    '''
    __traceback_info__ = self.id

    record = parseIndexRequest(request, self.id, self.query_options)
    terms = record.keys
    if not terms: return

    __traceback_info__ = self.id, terms

    if len(terms) == 1:
      if isinstance(terms[0], StringTypes):
        terms = self._getLexicon().termToWordIds(terms[0])
        if not terms: return None, self.id

    r = self._search(IITreeSet(terms), intersection, record)
    
    if record.get('phrase'):
      phrase = self._val2UnindexVal(terms)
      filter = lambda did, idx=self._unindex: phrase in idx[did]
      if record.get('isearch'):
        # maybe, we want to do something different when 'dm.incrementalsearch'
        #  is not available.
        #  On the other hand, 'isearch' should not be called for then.
        from dm.incrementalsearch import IFilter_int, IAnd_int
        r = IAnd_int(r, IFilter_int(filter))
        r.complete()
      else:
        r = IISet((did for did in r.keys() if filter(did)))

    return r, self.id

  def _standardizeValue(self, value, object):
    '''convert to a sequence of word its.'''
    if not value: return
    value = self._getLexicon().sourceToWordIds(value)
    return value or None

  def _combine_union(self, values, object):
    if not values: return
    l = None
    for v in values:
      sv= self._standardizeValue(v, object)
      if not sv: continue
      if l is None: l = sv
      else:
        # separate to prevent phase searches crossing fields
        #  maybe, we want this to be controlled by an option?
        l.append(0x7fffffff)
        l.extend(sv)
    return l

  # to get rid of the special implementation for 'KeywordIndex'.
  _equalValues = None


def addSimpleTextIndexForm(self):
  '''add SimpleTextIndex form.'''
  return addForm.__of__(self)(
    type= SimpleTextIndex.meta_type,
    description= '''A SimpleTextIndex indexes an object under a set of word ids determined via a 'ZCTextIndex' like lexicon. It efficiently supports word and phrase queries''',
    action= 'addIndex',
    )
    
