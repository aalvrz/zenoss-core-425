from OFS.interfaces import ISimpleItem, IPropertyManager
from Products.PluginIndexes.interfaces import IPluggableIndex

class IManagableIndex(IPluggableIndex):
  """just a marker for now."""

class IPropertyManager(ISimpleItem, IPropertyManager):
  """auxiliary for 'GenericSetup' support."""



