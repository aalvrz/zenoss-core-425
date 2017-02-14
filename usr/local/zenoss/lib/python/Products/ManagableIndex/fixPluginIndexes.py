#       $Id: fixPluginIndexes.py,v 1.1.1.1 2008/06/28 16:03:50 dieter Exp $
'''Fixes for broken 'PluginIndexes'.

I am sad that this is necessary.
'''
from types import InstanceType

from DateTime import DateTime
from Products.PluginIndexes.common.util import parseIndexRequest

SequenceTypes = (tuple, list,)

class parseIndexRequest(parseIndexRequest):
    def __init__(self, request, iid, options=[]):
        '''this is essentially a copy of the inherited '__init__'.
        Unfortunately, this turns empty query sequences into 'None'
        which effectively means "no restriction".
        However, an empty sequence of terms is the opposite
        on "no restriction" (for "or" searches).

        I hate that this extensive copying is necessary.
        '''
        self.id = iid

        if not request.has_key(iid):
            self.keys = None
            return

        # We keep this for backward compatility
        usage_param = iid + '_usage'
        if request.has_key(usage_param):
            # we only understand 'range' -- thus convert it here
            #self.usage = request[usage_param]
            usage = request[usage_param]
            if usage.startswith('range:'): range= usage[6:]
            else: ValueError('unrecognized usage: %s' % usage)
            self.range = range

        param = request[iid]
        keys = None
        t = type(param)

        if t is InstanceType and not isinstance(param, DateTime):
            """ query is of type record """

            record = param

            if not hasattr(record, 'query'):
                raise self.ParserException, (
                    "record for '%s' *must* contain a "
                    "'query' attribute" % self.id)
            keys = record.query

            if isinstance(keys, str):
                keys = [keys.strip()]
                self.listified = True

            for op in options:
                if op == "query": continue

                if hasattr(record, op):
                    setattr(self, op, getattr(record, op))

        elif isinstance(param, dict):
            """ query is a dictionary containing all parameters """

            query = param.get("query", ())
            if isinstance(query, SequenceTypes):
                keys = query
            else:
                keys = [ query ]
                self.listified = True

            for op in options:
                if op == "query": continue

                if param.has_key(op):
                    setattr(self, op, param[op])

        else:
            """ query is tuple, list, string, number, or something else """

            if isinstance(param, SequenceTypes):
                keys = param
            else:
                keys = [param]
                self.listified = True

            for op in options:
                field = iid + "_" + op
                if request.has_key(field):
                    setattr(self, op, request[field])

##        DM: turns empty sequences into 'None', the opposite of an empty sequence of search terms (for "or" searches).
##        if not keys:
##            keys = None

        self.keys = keys

    # fix broken inherited get
    def get(self, key, default=None):
        v = getattr(self, key, self)
        if v is self: return default
        return v
