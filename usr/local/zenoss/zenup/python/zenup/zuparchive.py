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
import subprocess
import tarfile
import tempfile
import logging
from itertools import ifilter

import yaml

from zenup import SAFE_EXCEPTIONS
from zenup import ZupArchiveException, ZenUpInternalError, ZenUpException
from zenup import zuputils

log = logging.getLogger('zenup')


fileopen = open


class ZupArchiveReadError(ZupArchiveException):
    pass


def open(zupfile, path=None):
    return ZupArchive(zupfile, path).open()


class ZupArchive(object):
    """
    Loads and processes zup files.
    """

    MANIFEST = "manifest.yaml"
    CONFIG = "config.yaml"
    PATCHES_DIR = "patches/"
    TYPE = "archive"

    CHECK_SCRIPT = "check"
    PRE_SCRIPT = "pre"
    POST_SCRIPT = "post"

    CONFIG_KEYS = set(("type", "product", "revision", "created", ))
    MANIFEST_KEYS = set(("fixes", ))

    def __init__(self, zupfile, path=None):
        """
        Initialize the zuparchive object.

        zupfile:    path to the zup.
        path:       path where the contents of the zup will be extracted.  If 
                    path is None, the default is to store the contents in a 
                    temporary directory.
        """
        self.product = ""
        self.revision = ""
        self.created = ""
        self.fixes = []
        self.patches = []
        self.changes = {}

        self.zupfile = zupfile
        self.path = path

    def __enter__(self):
        return self.open()

    def open(self):
        try:
            with tarfile.open(self.zupfile) as tar:
                if hasattr(self, "path"):
                    if not self.path:
                        self.path = tempfile.mkdtemp(
                            prefix="%s_" % os.path.basename(self.zupfile))
                    elif not zuputils.hasAccess(os.path.dirname(self.path)):
                        raise ZupArchiveException("Cannot load zup at " \
                                                  "path: %s" % self.path)
                    elif not os.path.exists(self.path):
                        os.mkdir(self.path)
                    else:
                        path = self.path
                        delattr(self, "path")
                        raise ZupArchiveException("Path already exists: %s" % path)

                    tar.extractall(self.path)

                    self.product, self.revision, self.created = \
                        self._check_archive()
                    self.fixes, self.patches, self.changes = \
                        self._check_manifest()
                else:
                    raise ZenUpInternalError("ZupArchive object not initialized")
        except tarfile.TarError as e:
            raise ZupArchiveException("Errors while accessing archive: %s" % self.zupfile)
        except OSError as e:
            raise ZupArchiveException("Unable to export archive at path: %s" % self.path)
        except IOError as e:
            raise ZupArchiveException("Archive not accessible: %s" % self.zupfile)
        except ZupArchiveReadError as e:
            self.close()
            raise
        return self

    def __exit__(self, type, value, traceback):
        # Leave temp dir around if hit traceback for easier diagnosis
        isSafe = any(isinstance(value, ex) for ex in SAFE_EXCEPTIONS)
        self.close(not traceback or isSafe)        

    def __str__(self):
        ret = []
        ret.append("File: %s" % self.zupfile)
        ret.append("Product: %s" % self.product)
        ret.append("Revision: %s" % self.revision)
        ret.append("Created: %s" % self.created)
        ret.append("")
        ret.append("Fixes:")
        if self.fixes:
            for fix in self.fixes:
                ret.append(str(fix))
        else:
            ret.append("No fixes found for this install")
        ret.append("")
        return "\n".join(ret)

    def display(self, showFix=None):
        ret = []

        if showFix:
            fixgen = ifilter(lambda x: x.id.upper() == showFix.upper(), self.fixes)
            try:
                ret.extend(self._print_patch(fixgen.next()))
            except StopIteration:
                raise ZenUpException("Fix not found: %s" % showFix)
        else:
            for fix in self.fixes:
                ret.extend(["*"*79, "*"*79])
                ret.extend(self._print_patch(fix))

        return "\n".join(ret)

    def _print_patch(self, fix):
        ret = []
        ret.append(str(fix))
        ret.append("")

        if fix.patch:
            for i in xrange(len(fix.patch)):
                patch = fix.patch[i]
                ret.append("patch file: %s" % patch)
                with fileopen(os.path.join(self.getPatchesDirPath(), patch)) as fp:
                    ret.append(fp.read())

                if i < len(fix.patch) - 1:
                    ret.extend(["",""])
                    ret.append("=" * 79)
        else:
            ret.append("Binary changes only")
        ret.append("")
        return ret

    def _check_archive(self):

        exception = ZupArchiveReadError(
            "Archive has invalid config file: %s" % self.zupfile)

        path = os.path.join(self.path, self.CONFIG)
        if not os.path.isfile(path) or not os.access(path, os.R_OK):
            raise exception

        with fileopen(path) as fp:
            configData = yaml.load(fp)

            if not isinstance(configData, dict):
                raise exception
            elif self.CONFIG_KEYS.difference(configData.iterkeys()):
                raise exception
            elif configData.get('type') != self.TYPE:
                raise exception

            product = configData.get("product", "")
            revision = configData.get("revision", "")
            created = configData.get("created", "")

        return product, revision, created

    def _check_manifest(self):
        exception = ZupArchiveReadError(
            "Archive has invalid manifest: %s" % self.zupfile)

        path = os.path.join(self.path, self.MANIFEST)
        if not os.path.isfile(path) or not os.access(path, os.R_OK):
            raise exception

        with fileopen(path) as fp:
            configData = yaml.load(fp)

            if not isinstance(configData, dict):
                raise exception
            elif self.MANIFEST_KEYS.difference(configData.iterkeys()):
                raise exception

            fixes = []
            raw_fixes = configData.get("fixes") or []
            if isinstance(raw_fixes, dict):
                raw_fixes = [raw_fixes]

            for f in raw_fixes:
                if isinstance(f, dict):
                    fixes.append(Fix(**f))
                else:
                    raise exception

            fixes.sort(key=lambda f: f.id)

            patches = configData.get("patches") or []
            if not isinstance(patches, list):
                patches = [patches]

            changes = configData.get("changes") or {}

        return fixes, patches, changes
            
    def getPatchesDirPath(self):
        return os.path.join(self.path, self.PATCHES_DIR)

    def _run_script(self, script):
        path = os.path.join(self.path, script)
        zuputils.runScript(path)

    def check(self):
        self._run_script(self.CHECK_SCRIPT)

    def pre(self):
        self._run_script(self.PRE_SCRIPT)

    def post(self):
        self._run_script(self.POST_SCRIPT)

    def apply(self, path):
        """
        Applies all of the patches that exist on the archive.
        """

        pwd = os.getcwd()
        try:
            os.chdir(path)
            for patch in self.patches:
                patchfile = os.path.join(self.getPatchesDirPath(), patch)

                if not os.path.isfile(patchfile) or \
                   not os.access(patchfile, os.R_OK):
                    raise ZenUpInternalError("Unable to access patch: %s" % patch)

                with fileopen(patchfile) as fp:
                    try:
                        zuputils.applyPatch(fp, '-p0')
                    except (ZenUpException, ZenUpInternalError) as e:
                        raise ZenUpInternalError("Unable to apply patch: %s" \
                                                 % (patch))

                if patch not in self.changes:
                    raise ZenUpInternalError("Cannot calculate file " \
                                             "changes from patch: %s" % patch)
                deletes = self.changes[patch].get("deletes") or []
                if not isinstance(deletes, list):
                    deletes = [deletes]
                deletes.sort(reverse=True)

                for deletepath in deletes:
                    dpath = os.path.join(path, deletepath)

                    if os.path.isfile(dpath):
                        os.remove(dpath)
                    elif os.path.isdir(dpath):
                        shutil.rmtree(dpath)
                    else:
                        raise ZenUpInternalError("Path not found: %s" % dpath)
                yield
        finally:
            os.chdir(pwd)

    def close(self, eraseTempDir=True):
        if getattr(self, "path"):
            if eraseTempDir:
                shutil.rmtree(self.path)
            else:
                print "Not erasing ZupArchive temp directory:", self.path
            delattr(self, "path")


class Fix(object):

    def __init__(self, **kwargs):
        self.id = kwargs.get("id") or ""
        self.description = kwargs.get("description") or ""
        patch = kwargs.get("patches") or []

        if not isinstance(patch, list):
            self.patch = [patch]
        else:
            self.patch = patch

    def __eq__(self, other):
        return self.id == other.id and \
               self.description == other.description and \
               set(self.patch) == set(other.patch)

    def __str__(self):
        return "[%s] %s" % (self.id, self.description)
