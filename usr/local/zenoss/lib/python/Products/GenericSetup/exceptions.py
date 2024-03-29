##############################################################################
#
# Copyright (c) 2004 Zope Foundation and Contributors.
#
# This software is subject to the provisions of the Zope Public License,
# Version 2.1 (ZPL).  A copy of the ZPL should accompany this distribution.
# THIS SOFTWARE IS PROVIDED "AS IS" AND ANY AND ALL EXPRESS OR IMPLIED
# WARRANTIES ARE DISCLAIMED, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
# WARRANTIES OF TITLE, MERCHANTABILITY, AGAINST INFRINGEMENT, AND FITNESS
# FOR A PARTICULAR PURPOSE.
#
##############################################################################
""" GenericSetup product exceptions.

$Id: exceptions.py 110425 2010-04-01 17:19:14Z tseaver $
"""

from AccessControl.SecurityInfo import ModuleSecurityInfo
security = ModuleSecurityInfo('Products.GenericSetup.exceptions')

security.declarePublic('BadRequest')
from zExceptions import BadRequest
