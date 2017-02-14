##############################################################################
# 
# Copyright (C) Zenoss, Inc. 2013, all rights reserved.
# 
# This content is made available according to terms specified in
# License.zenoss under the directory where your Zenoss product is installed.
# 
##############################################################################

import os
import difflib
from fnmatch import fnmatch
from itertools import ifilter
import subprocess
import tarfile
import logging

from zenup import zuputils
from zenup import ZenUpInternalError

log = logging.getLogger('zenup')

class LocalDiff(object):
    """
    Given two absolute path strings and a filter, calculate the diff, while
    noting (but still ignoring) inaccessible files and folders.
    """

    INCLUDE_DIR = "local_diff_directory_whitelist"
    EXCLUDE_DIR = "local_diff_directory_blacklist"
    INCLUDE_FILE = "local_diff_file_pattern_whitelist"
    EXCLUDE_FILE = "local_diff_file_pattern_blacklist"

    def __init__(self, pristinepath, installedpath):
        """
        pristinepath: path to the pristine source (AKA the left side of the
            diff)
        installedpath: path to the installed source (AKA the right side of the
            diff)
        """

        if zuputils.hasAccess(pristinepath):
            self.pristinepath = pristinepath
            self.installedpath = installedpath
        else:
            raise ZenUpInternalError("Cannot access pristine: %s" \
                                     % pristinepath)

        self.changeset = {}
        self.modified = []
        self.added = []
        self.deleted = []
        self.unknown = []

        self.verbose = True

    def __str__(self):

        count_add = len(self.added)
        count_del = len(self.deleted)
        count_mod = len(self.modified)
        count_unk = len(self.unknown)

        max_digits = max([len(str(count_add)), len(str(count_del)),
                          len(str(count_mod)), len(str(count_unk))])

        display_count = "".join(["%", "%d" % max_digits, "d", " file%s %s"])
        display_add = display_count % (count_add, "" if count_add == 1 else "s", "added")
        display_del = display_count % (count_del, "" if count_del == 1 else "s", "deleted")
        display_mod = display_count % (count_mod, "" if count_mod == 1 else "s", "modified")
        display_unk = display_count % (count_unk, "" if count_unk == 1 else "s", "unknown")

        ret = [display_add, display_del, display_mod, display_unk, "\n"]

        if self.verbose:
            files = self.changeset.keys()
            files.sort()
            for filename in files:
                ret.append("Index: %s" % filename)
                ret.append("=" * 79)
                ret.extend([line.rstrip("\n") for line in self.changeset[filename]])
                ret.append("")
        else:
            ret.extend(["A %s" % filename for filename in self.added])
            ret.extend(["D %s" % filename for filename in self.deleted])
            ret.extend(["M %s" % filename for filename in self.modified])
            ret.extend(["? %s" % filename for filename in self.unknown])

        return "\n".join(ret)

    def run(self, **config):
        """
        Calculates the local diff statistics and stores it in the object.
        config: (optional) whitelist and blacklist of files and folders to
            filter by.
            KEY LocalDiff.INCLUDE_DIR: list of included directories
            KEY LocalDiff.INCLUDE_FILE: list of included files
            KEY LocalDiff.EXCLUDE_DIR: list of excluded directories
            KEY LocalDiff.EXCLUDE_FILE: list of excluded files
        """
        log.debug("Calculating local diffs.")

        config = config or dict()

        incd = (os.path.join(dirname, "*") for dirname in config.get(self.INCLUDE_DIR) or [])
        includes_dir = sorted(incd) or ["*"]
        excd = (os.path.join(dirname, "*") for dirname in config.get(self.EXCLUDE_DIR) or [])
        excludes_dir = sorted(excd)

        includes_file = sorted(config.get(self.INCLUDE_FILE, [])) or ["*"]
        excludes_file = sorted(config.get(self.EXCLUDE_FILE, [])) or []

        filtered_paths = lambda path: self._filtered_paths(path, includes_dir, 
            excludes_dir, includes_file, excludes_file)

        dirlist, filelist = filtered_paths(self.pristinepath)
        ltdirs, ltfiles = set(dirlist), set(filelist)

        dirlist, filelist = filtered_paths(self.installedpath)
        rtdirs, rtfiles = set(dirlist), set(filelist)

        modfiles = (ltdirs & rtdirs) | (ltfiles & rtfiles)
        self._set_modified_files(list(modfiles))
        self.modified.sort()

        addfiles = (rtdirs - ltdirs) | (rtfiles - ltfiles)
        self._set_added_files(list(addfiles))
        self.added.sort()

        delfiles = (ltdirs - rtdirs) | (ltfiles - rtfiles)
        self._set_deleted_files(list(delfiles))
        self.deleted.sort()

        self.unknown.sort()

    def unified_diff(self, filename, pristinedata, installeddata):
        return list(difflib.unified_diff(pristinedata,
                                         installeddata,
                                         fromfile=" %s (pristine)" % filename,
                                         tofile=" %s (installed)" % filename))

    def _is_binary(self, path):
        """
        Determines if a file is binary using file -b command.
        Exceptions:
          * symlinks are binary
          * directorys (that are not symlinks) are NOT binary
          * files with no read access are NOT binary
          * empty output from file -b: NOT binary
        """

        # Symlinks are considered binary
        if os.path.islink(path.rstrip('/')):
            return True

        # Directories and files with no read permission should not be treated 
        # as binary
        if os.path.isdir(path) or not os.access(path, os.R_OK):
            return False

        # Text and empty files are not considered binary
        cmd = ["file", "-b", path]
        output = subprocess.check_output(cmd).lower().strip()

        return output and not any(o in ("text", "empty") for o in output.split())

    def _filtered_paths(self, rootdir, includes_dir, excludes_dir, 
                        includes_file, excludes_file):
        """
        Walks root directory and returns a list of files and directories based 
        upon given file and directory filters.
        """

        filtered_dirs = []
        filtered_files = []

        validate_dir = lambda path: self._validate(rootdir, path + '/', 
            includes_dir, excludes_dir) 

        validate_file = lambda path: self._validate(rootdir, path, 
            includes_file, excludes_file)

        for root, dirs, files in os.walk(rootdir):

            relroot = os.path.relpath(root, rootdir)
            if validate_dir(relroot):
                if relroot == ".":
                    relroot = ""
                    filtered_dirs.append(relroot)

                if os.access(root, os.X_OK):
                    reldirs = (os.path.join(relroot, d) for d in dirs)
                    filtered_dirs.extend(ifilter(validate_dir, reldirs))
                    relfiles = (os.path.join(relroot, f) for f in files)
                    filtered_files.extend(ifilter(validate_file, relfiles))

        return filtered_dirs, filtered_files

    def _validate(self, root, rpath, filter_true, filter_false):
        """
        Determines if the path needs to be evaluated by local diff.
          - root: path to pristine path or installed path
          - rpath: relative path from root (i.e. Products/...)
          - filter_true: path whitelist
          - filter_false: path blacklist
        """

        in_filter = lambda filters: any(fnmatch(rpath, f) for f in filters)
        apath = os.path.join(root, rpath)

        return in_filter(filter_true) and \
               not in_filter(filter_false) and \
               not self._is_binary(apath)

    def _parent_path(self, parent, path):
        """
        Traverse the path and find the first existing parent directory. 
        """

        path = os.path.dirname(path)

        while path and not os.path.exists(os.path.join(parent, path)):
            path = os.path.dirname(path)

            # Corner case where the parent path COULD be a file, in which case
            # look at the grandparent.  The grandparent will ALWAYS be a
            # directory.
            if os.path.isfile(os.path.join(parent, path)):
                path = os.path.dirname(path)

        return path

    def _adjusted_file(self, fp):
        """
        Given a file stream return the file contents.  If the file is empty
        return a list with an empty string.
        """

        return fp.readlines() or [""]

    def _set_modified_files(self, filelist):
        """
        Populates self.modified with a list of all modified files, and stores
        the file diff in self.changeset dictionary.
        """
        log.debug("Finding modified files.")
        for filename in filelist:
            ltpath = os.path.join(self.pristinepath, filename)
            rtpath = os.path.join(self.installedpath, filename)

            # System should always have access to the pristine
            if not zuputils.hasAccess(ltpath):
                raise ZenUpInternalError("Error accessing: %s" % ltpath)

            # Check the diff if the right side path is accessible, otherwise
            # store the path in the unknown list
            if zuputils.hasAccess(rtpath):
                if os.path.isfile(rtpath):
                    with open(ltpath) as fp:
                        ltdata = self._adjusted_file(fp)
                    with open(rtpath) as fp:
                        rtdata = self._adjusted_file(fp)

                    diff = self.unified_diff(filename, ltdata, rtdata)
                    if diff:
                        log.debug("Found diff for file: %s", filename)
                        self.modified.append(filename)
                        self.changeset[filename] = diff
            else:
                log.debug("Found UNKNOWN file: %s", filename)
                self.unknown.append(filename)

    def _set_added_files(self, filelist):
        """
        Populates self.added with a list of all added files that are
        accessible (added files are files that exist on the installed path,
        but not on the pristine path)
        """

        for filename in filelist:
            ltpath = os.path.join(self.pristinepath, filename)
            rtpath = os.path.join(self.installedpath, filename)

            # Open the file if the right side path is accessible, otherwise
            # store the path in the unknown list
            if zuputils.isSamePathType(ltpath, rtpath):
                raise ZenUpInternalError("Error accessing: %s" % ltpath)
            elif zuputils.hasAccess(rtpath):
                if os.path.isfile(rtpath):
                    with open(rtpath) as fp:
                        self.changeset[filename] = self.unified_diff(
                            filename, [], self._adjusted_file(fp))
                log.debug("Found added file: %s", filename)
                self.added.append(filename)
            else:
                log.debug("Found UNKNOWN file: %s", filename)
                self.unknown.append(filename)

    def _set_deleted_files(self, filelist):
        """
        Populates self.deleted with a list of all deleted files that are
        accessible (deleted files are files that exist on the pristine path,
        but not on the installed path)
        """

        opcodes = CHECK, DELETE, UNKNOWN = 0, 1, 2

        # Filelist is sorted, so parent paths will always directly precede its
        # children
        filelist.sort()

        i = 0
        op = CHECK
        
        while i < len(filelist):

            # If the path is confirmed for deletion, mark the proceeding 
            # children as deleted
            if DELETE == op:
                if filelist[i].startswith(path):
                    ltpath = os.path.join(self.pristinepath, filelist[i])
                    self.deleted.append(filelist[i])
                    if os.path.isfile(ltpath):
                        with open(ltpath) as fp:
                            self.changeset[filelist[i]] = self.unified_diff(
                                filelist[i], self._adjusted_file(fp), [])
                    i+=1
                else:
                    op = CHECK
            # If the path is unknown, mark the proceeding children as unknown
            elif UNKNOWN == op:
                if filelist[i].startswith(parentpath):
                    self.unknown.append(filelist[i])
                    i+=1
                else:
                    op = CHECK

            # Determines if the path was deleted
            if CHECK == op:
                path = filelist[i]
                parentpath = self._parent_path(self.installedpath, path)
                rtpath = os.path.join(self.installedpath, path)

                if self._is_binary(rtpath):
                    self.unknown.append(filelist[i])
                    i+=1
                elif zuputils.hasAccess(os.path.join(self.installedpath, parentpath)):
                    op = DELETE
                else:
                    op = UNKNOWN
            elif op not in opcodes:
                raise ZenUpInternalError("Unknown opcode: %s" % op)
