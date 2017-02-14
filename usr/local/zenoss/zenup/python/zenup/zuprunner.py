##############################################################################
# 
# Copyright (C) Zenoss, Inc. 2013, all rights reserved.
# 
# This content is made available according to terms specified in
# License.zenoss under the directory where your Zenoss product is installed.
# 
##############################################################################

import os
import shutil
import tempfile
import tarfile

from zenup import SAFE_EXCEPTIONS
from zenup import ZenUpInternalError
from zenup import zuparchive


class ZupRunner(object):
    """
    INTERNAL: Initializes a sandbox for a product for performing local diffs 
    and product upgrades.
    """

    SOURCE = "source"

    ZUP_WORKING_DIR = 'ZUP_WORKING_DIR'
    ZUP_PRODUCT_DIR = 'ZUP_PRODUCT_DIR'
    ZUP_SOURCE_DIR = 'ZUP_SOURCE_DIR'

    def __init__(self, name):
        self._name = name

        self.path = None
        self.source = None
        self.copies = {}
        self.archives = {}

    def __enter__(self):
        self.path = tempfile.mkdtemp(prefix="%s_" % self._name)
        return self

    def __exit__(self, type, value, traceback):
        try:
            if getattr(self, "archives", None):
                for archive in self.archives.itervalues():
                    archive.close()
        finally:
            if hasattr(self, "path"):
                # Leave temp dir around if hit traceback for easier diagnosis
                isSafe = any(isinstance(value, ex) for ex in SAFE_EXCEPTIONS)
                
                if not traceback or isSafe:
                    shutil.rmtree(self.path)
                else:
                    print "Not erasing ZupRunner temp directory:", self.path

                delattr(self, "path")
                delattr(self, "source")
                delattr(self, "copies")
                delattr(self, "archives")

            if self.ZUP_SOURCE_DIR in os.environ:
                del os.environ[self.ZUP_SOURCE_DIR]
            if self.ZUP_WORKING_DIR in os.environ:
                del os.environ[self.ZUP_WORKING_DIR]
            if self.ZUP_PRODUCT_DIR in os.environ:
                del os.environ[self.ZUP_PRODUCT_DIR]

    def set_zup_working_dir(self, working_dir):
        os.environ[self.ZUP_WORKING_DIR] = working_dir

    def set_zup_product_dir(self, product_dir):
        os.environ[self.ZUP_PRODUCT_DIR] = product_dir

    def add_source(self, source):
        if hasattr(self, "source") and not self.source:
            self.source = os.path.join(self.path, self.SOURCE)
            try:
                os.mkdir(self.source)
                with tarfile.open(source) as tar:
                    tar.extractall(path=self.source)
                os.environ[self.ZUP_SOURCE_DIR] = self.source
            except Exception as e:
                raise ZenUpInternalError("Not enough space to expand the " \
                                         "source into SYSTEMP")
        elif hasattr(self, "source"):
            raise ZenUpInternalError("Source already initialized: %s" % self.source)
        else:
            raise ZenUpInternalError("Cannot instantiate source on a closed " \
                                     "object")

    def copy_source(self, subdir):
        if hasattr(self, "source"):
            if self.source:
                copy = os.path.join(self.path, subdir)
                if not os.path.exists(copy):
                    try:
                        shutil.copytree(self.source, copy)
                    except Exception as e:
                        raise ZenUpInternalError("Not enough space to copy " \
                                                 "the source into SYSTEMP")
                    self.copies[subdir] = copy
                    return copy
                else:
                    raise ZenUpInternalError("Subdirectory already exists: %s" \
                                         % copy)
            else:
                raise ZenUpInternalError("No source initialized")
        else:
            raise ZenUpInternalError("Cannot instantiate source copies on a " \
                                     "closed object")

    def add_archive(self, zupfile, subdir):

        if subdir == self.SOURCE:
            raise ZenUpInternalError("Cannot name archive directory %s" % self.SOURCE)

        path = os.path.join(self.path, subdir)
        if not os.path.exists(path):
            archive = zuparchive.open(zupfile, os.path.join(self.path, subdir))
            self.archives[subdir] = archive
            return archive
        else:
            raise ZenUpInternalError("Subdirectory already exists: %s" % path)
