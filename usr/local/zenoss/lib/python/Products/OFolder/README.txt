OFolder
=======

  An ``OFolder`` contains an ordered sequence of objects much like ``OrderedFolder``.

  In addition, you can reorder the objects by assigning new order numbers (these
  are float values) and then press 'reorder'.

History
=======

 2.0
   * ``OFolder`` now derives from ``OrderedFolder`` (instead of ``Folder``)
   * ``OFolder`` now uses ``Manage properties`` to protect its ``manage_reorder``
     (to be more in line with ``OrderedFolder``)
   
 1.0.1
   * Zope 2.12 dropped ``ZClasses`` -- make ``ZClass`` base class registration conditional
   * Zope 2.12 stupidly deprecated import of ``InitializeClass`` and ``DTMLFile`` from ``Globals`` -- avoid deprecation messages
