"""
*******
GraphML
*******
Read and write graphs in GraphML format.

This implementation does not support mixed graphs (directed and unidirected 
edges together), hyperedges, nested graphs, or ports. 

"GraphML is a comprehensive and easy-to-use file format for graphs. It
consists of a language core to describe the structural properties of a
graph and a flexible extension mechanism to add application-specific
data. Its main features include support of

    * directed, undirected, and mixed graphs,
    * hypergraphs,
    * hierarchical graphs,
    * graphical representations,
    * references to external data,
    * application-specific attribute data, and
    * light-weight parsers.

Unlike many other file formats for graphs, GraphML does not use a
custom syntax. Instead, it is based on XML and hence ideally suited as
a common denominator for all kinds of services generating, archiving,
or processing graphs."

http://graphml.graphdrawing.org/

Format
------
GraphML is an XML format.  See 
http://graphml.graphdrawing.org/specification.html for the specification and 
http://graphml.graphdrawing.org/primer/graphml-primer.html
for examples.
"""
__author__ = """\n""".join(['Salim Fadhley',
                            'Aric Hagberg (hagberg@lanl.gov)',
                            'Alexander Dutton (alexander.dutton@zoo.ox.ac.uk)',
                            ])

__all__ = ['write_graphml', 'read_graphml', 
           'GraphMLWriter', 'GraphMLReader']

import warnings
from xml.sax import make_parser
from xml.sax.handler import ContentHandler
from xml.sax.saxutils import XMLGenerator

import networkx as nx
from networkx.utils import _get_fh

# Used for coercing typed attributes to and from strings.
_types = (
    # Name,     type,    encode, decode
    ('string',  unicode, unicode, unicode),
    ('int',     int,     unicode, int),
    ('double',  float,   unicode, float),
    ('long',    long,    unicode, long),
    ('boolean', bool,    lambda x:('true' if x else 'false'), lambda x:x == 'true'),
    ('string',  object,  unicode, unicode),
)
_type_dict = dict((x[0], x[1:]) for x in _types)

def write_graphml(G, path, encoding='utf-8'):
    """Write G in GraphML XML format to path

    Parameters
    ----------
    G : graph
       A networkx graph
    path : file or string
       File or filename to write.  
       Filenames ending in .gz or .bz2 will be compressed.

    Examples
    --------
    >>> G=nx.path_graph(4)
    >>> nx.write_graphml(G, "test.graphml")

    Notes
    -----
    This implementation does not support mixed graphs (directed and unidirected 
    edges together) hyperedges, nested graphs, or ports. 
    """
    writer = GraphMLWriter(encoding)
    writer.add_graph_element(G)
    writer.dump(path)

def read_graphml(path, node_type=str):
    """Read graph in GraphML format from path.

    Parameters
    ----------
    path : file or string
       File or filename to write.  
       Filenames ending in .gz or .bz2 will be compressed.

    Returns
    -------
    graph: NetworkX graph
        If no parallel edges are found a Graph or DiGraph is returned.
        Otherwise a MultiGraph or MultiDiGraph is returned.

    Notes
    -----
    This implementation does not support mixed graphs (directed and unidirected 
    edges together), hypergraphs, nested graphs, or ports. 
    
    Files with the yEd "yfiles" extension will can be read but the graphics
    information is discarded.

    yEd compressed files ("file.graphmlz" extension) can be read by renaming
    the file to "file.graphml.gz".

    """
    fh = _get_fh(path, mode='rb')
    reader = GraphMLReader(fh, node_type)
    return reader()[0]

class GraphMLWriter(object):
    def __init__(self, encoding="utf-8"):
        self._encoding = encoding
        self._graphs = []
    def add_graph_element(self, G):
        self._graphs.append(G)
    def add_graphs(self, graph_list):
        self._graphs += list(graph_list)
    def dump(self, stream):
        writer = GraphMLGenerator(stream, self._encoding)
        writer.write(self._graphs)

class GraphMLReader(object):
    def __init__(self, fh, node_type=str):
        self._fh = fh
        self._node_type = node_type
    @property
    def multigraph(self):
        return self._multigraph
    def __call__(self):
        handler = GraphMLHandler(node_type=self._node_type) 
        parser = make_parser()
        parser.setContentHandler(handler)
        parser.parse(self._fh)
        return handler.graphs


class GraphMLHandler(ContentHandler):
    def __init__(self, node_type):
        self._node_type = node_type
        ContentHandler.__init__(self)

    def startDocument(self):
        self._context = []
        self._graph, self._graphs = None, []
        self._default_directed = None
        self._keys = {}

        self._id = None
        self._source, self._target = None, None
        self._directed = None
        self._data = None
        self._data_key = None
        self._data_type = None
        self._multigraph = False
        self._characters = None
        self._defaults = {'node': {}, 'edge': {}}

    def startElement(self, name, attrs):
        context = self._context
        attrs = dict(attrs)

        context.append(name)
        if len(context) == 1:
            if name != 'graphml':
                raise nx.GraphFormatError('Unrecognized outer tag "%s" in GraphML' % name)
        elif len(context) == 2 and name == 'graph':
            if 'edgedefault' not in attrs:
                attrs['edgedefault'] = 'undirected'

            self._default_directed = {'directed': True, 'undirected': False}.get(attrs['edgedefault'])
            if self._default_directed is True:
                self._graph = nx.MultiDiGraph()
            elif self._default_directed is False:
                self._graph = nx.MultiGraph()
            else:
                self._graph = nx.MultiGraph()
                raise nx.NetworkXError("Attribute edgedefault not 'directed' or 'undirected'")
            self._graph.graph['node_default'] = self._defaults['node']
            self._graph.graph['edge_default'] = self._defaults['edge']

        elif len(context) == 2 and name == 'key':
            self._keys[(attrs['for'], attrs['id'])] = (attrs['attr.name'], _type_dict[attrs['attr.type']][2])
            self._current_key = (attrs['for'], attrs['id'])
        elif context == ['graphml', 'key', 'default']:
            self._characters = []
            

        elif len(context) == 3 and context[1] == 'graph' and name in ('node', 'edge'):
            self._id, self._source, self._target = map(lambda x:(self._node_type(attrs[x]) if x in attrs else None), ['id', 'source', 'target'])

            self._directed = {'true':True, 'false':False}.get(attrs.get('directed'))
            # raise error if we find mixed directed and undirected edges
            if self._directed is not None and self._directed != self._default_directed:
                raise nx.NetworkXError("Mixed directed and undirected edges in graph.")
            self._data = {}

        elif len(context) == 4 and context[1] == 'graph' and name == 'data':
            self._data_key = attrs['key']
            self._characters = []
            if not (context[2], attrs['key']) in self._keys:
                raise nx.NetworkXError("Bad GraphML data: no key %r for %s" % (attrs['key'], context[2])) 
            self._key = self._keys[(context[2], attrs['key'])]

        # warn on finding unsupported ports or hyperedge tags
        elif name == 'port':
            warnings.warn("GraphML port tag not supported.")
        elif name == 'hyperedge':
            raise nx.NetworkXError("GraphML reader does not support hyperedges.")

    def characters(self, content):
        if isinstance(self._characters, list):
             self._characters.append(content)

    def endElement(self, name):
        if name == 'data':
            key_name, key_type = self._key
            value = ''.join(self._characters).strip()
            self._characters = None
            self._data[key_name] = key_type(value)
            self._data_key = None

        elif self._context == ['graphml', 'key', 'default']:
            self._defaults[self._current_key[0]][self._current_key[1]] = self._keys[self._current_key][1](''.join(self._characters).strip())
            self._characters = None

        if name == 'node':
            if self._id is None:
                raise nx.GraphFormatError('Required attribute edgedefault missing in GraphML')
            self._graph.add_node(self._id, attr_dict=self._data)
        if name == 'edge':
            if self._source is None:
                raise GraphFormatError('Edge without source in GraphML')
            if self._target is None:
                raise GraphFormatError('Edge without target in GraphML')

            if self._graph.has_edge(self._source, self._target):
                self._multigraph = True
            if self._id:
                self._data['id'] = self._id
            self._graph.add_edge(self._source, self._target, attr_dict=self._data, key=self._id)

        if name == 'graph':
            if not self._multigraph and self._default_directed:
                self._graph = nx.DiGraph(self._graph)
            elif not self._multigraph:
                self._graph = nx.Graph(self._graph)
            self._graphs.append(self._graph)
            self._graph = None

        if name in ('node', 'edge'):
            self._id, self._source, self._target, self._data, self._directed = [None for i in range(5)]

        self._context.pop()

    @property
    def graphs(self):
        return self._graphs[:]

class GraphMLGenerator(XMLGenerator):
    def __init__(self, path, encoding='utf-8'):
        fh = _get_fh(path, mode='wb')
        XMLGenerator.__init__(self, fh, encoding)
        self._data_types = {}

    def write(self, graphs):
        self.startDocument()
        self.startElement('graphml', attrs={'xmlns': 'http://graphml.graphdrawing.org/xmlns'})

        self._write_keys(graphs)
        for graph in graphs:
            self._write_graph(graph)

        self.endElement('graphml')
        self.endDocument()

    def _write_graph(self, graph):
        self.startElement('graph', attrs={'id': graph.name or '',
                                               'edgedefault': 'directed' if graph.is_directed() else 'undirected'})

        for node in graph:
            self._write_node(node, graph.node[node])

        for source, target, data in graph.edges(data=True):
            if source is None or target is None:
                continue
            self._write_edge(source, target, data)
        
        self.endElement('graph')

    def _write_keys(self, graphs):
        seen = set()
        def write_keys(name, specimens, default):
            keys = {}
            keys.update(default)
            for specimen in specimens:
                keys.update(specimen)
            for key, value in keys.items():
                if (name, key) in seen:
                    continue
                seen.add((name, key))
                for type_name, type_, encode, decode in _types:
                    if isinstance(value, type_):
                        break
                self._data_types[(name, key)] = encode
                self.startElement('key', attrs={'for': name,
                                                'id': key,
                                                'attr.name': key,
                                                'attr.type': type_name})

                # add subelement for data default value if present
                if key in default:
                    self.startElement('default', {})
                    self.characters(encode(default[key]))
                    self.endElement('default')
            
                self.endElement('key')

        for graph in graphs:
            write_keys('node', (graph.node[n] for n in graph.nodes()), graph.graph.get('node_default', {}))
            write_keys('edge', (e[2] for e in graph.edges(data=True)), graph.graph.get('edge_default', {}))

    def _write_node(self, node, data):
        self.startElement('node', attrs={'id': unicode(node)})
        self._write_data('node', data)
        self.endElement('node')

    def _write_edge(self, source, target, data):
        self.startElement('edge', attrs={'source': unicode(source),
                                         'target': unicode(target)})
        self._write_data('edge', data)
        self.endElement('edge')

    def _write_data(self, name, data):
        for key, value in data.items():
            self.startElement('data', attrs={'key': key})
            self.characters(self._data_types.get((name, key), unicode)(value))
            self.endElement('data')





