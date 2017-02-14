##############################################################################
# 
# Copyright (C) Zenoss, Inc. 2013, all rights reserved.
# 
# This content is made available according to terms specified in
# License.zenoss under the directory where your Zenoss product is installed.
# 
##############################################################################


__doc__ = '''

Check for and remove invalid zenrrdcached.conf file and
create a valid one via `zenrrdcached genconf`

$Id:$
'''

import Migrate 
import logging, os, subprocess

from Products.ZenUtils.Utils import atomicWrite, zenPath

log = logging.getLogger('zen.migrate')

class FixZenrrdcachedConf(Migrate.Step):
    version = Migrate.Version(4, 2, 0)

    cfname = zenPath("etc/zenrrdcached.conf")

    def cutover(self, dmd):
        if os.path.exists(self.cfname) and "genconf: command not found" in open(self.cfname).read():
            log.info("creating new zenrrdcached.conf via genconf")
            try:
                atomicWrite(self.cfname, subprocess.check_output([zenPath("bin/zenrrdcached"), "genconf"]),)
            except subprocess.CalledProcessError as e:
                log.error("zenrrdcached.conf migration failed ({0}): {1}".format(e.errno, e.strerror))
                raise e

FixZenrrdcachedConf()
