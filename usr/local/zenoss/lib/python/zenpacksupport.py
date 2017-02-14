###########################################################################
#
# This program is part of Zenoss Core, an open source monitoring platform.
# Copyright (C) 2008, Zenoss Inc.
#
# This program is free software; you can redistribute it and/or modify it
# under the terms of the GNU General Public License version 2 as published by
# the Free Software Foundation.
#
# For complete information please visit: http://www.zenoss.com/oss/
#
###########################################################################

import pkg_resources
from distutils.errors import DistutilsSetupError

# This is the list of metadata fields specific to zenpacks
metaDataKeywords = [
            'compatZenossVers', # The spec for the required version of Zenoss
            'prevZenPackName', # Previous name of this zenpack
            ]


def AssertNonEmptyString(dist, attr, value):
    """
    Verify that the value is a non-empty sting
    """
    if not isinstance(value, basestring) or not value:
        raise DistutilsSetupError('%s must be a non-empty string' % attr)


def AssertString(dist, attr, value):
    """
    Verify that the value is a sting
    """
    if not isinstance(value, basestring):
        raise DistutilsSetupError('%s must be a string' % attr)


def WriteZenPackInfo(cmd, basename, filename):
    """
    Write the zenpack-specific metadata fields to the ZENPACK_INFO file
    """
    lines = []
    for key in metaDataKeywords:
        value = getattr(cmd.distribution, key, None)
        if value:
            lines.append('%s: %s' % (key, value))
    data = '\n'.join(lines)
    cmd.write_or_delete_file('zenpack_info', filename, data)

