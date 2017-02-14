import OFolder


def initialize(context):

    context.registerClass(
        OFolder.OFolder,
        constructors=(OFolder.manage_addOFolderForm,
                      OFolder.manage_addOFolder),
        icon='www/Folder_icon.gif'
        )
    
    # Zope 2.12 compatibility
    if hasattr(context, 'registerBaseClass'):
        context.registerBaseClass(OFolder.OFolder)
