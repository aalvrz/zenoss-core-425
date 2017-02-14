##############################################################################
# 
# Copyright (C) Zenoss, Inc. 2013, all rights reserved.
# 
# This content is made available according to terms specified in
# License.zenoss under the directory where your Zenoss product is installed.
# 
##############################################################################

import StringIO
import os
import re
import shutil
import tarfile
from datetime import datetime
from itertools import chain
import yaml
import logging

from zenup import ZenUpProductException, ZupArchiveException, \
                  ZenUpException, ZenUpInternalError
from zenup import zuparchive, zuprunner, zuputils, localdiff

log = logging.getLogger('zenup')

WHITELIST = re.compile(r"^[\w\-\.]+$")
BLACKLIST = ('.', '..','status.yaml','log')


class ZupProduct(object):
    """
    Object that registers zenup products.  Contains information about a 
    product, performs installation and uninstallation procedures, executes
    local diffs against a designated pristine source, and upgrades the product
    from patches as well as compatible zups.
    """

    MESSAGE_FILE = "message.log"
    SOURCE_ARCH = "source.tgz"
    SOURCE_ARCH_SOURCE = "src/"
    PACKS_DIR = "packs/"
    PATCHES_DIR = "local-patches/"
    INSTALL_SCRIPT = "install"
    CONFIG = "config.yaml"
    TYPE = "product"
    KEYS = set(("type", "product", ))

    _HEAD_ZUP = "head_zup"  # Directory name for extracted current zup
    _NEW_ZUP = "new_zup"    # Directory name for extracted new zup to upgrade to
    _LOCAL_DIFF_FILE = "local.diff"
    _REJECT_FILE = "local.diff.rej"
        
    def __init__(self, home, id_=None, path=None, name=None, zupfile=None, 
                 revision=None, created=None, lastupdate=None, **kwargs):

        self.path = path or ""
        self.home = home or ""
        self.id_ = id_ or ""
        self.name = name
        self.zupfile = zupfile or ""
        self.revision = revision or ""
        self.created = created or ""
        self.lastupdate = lastupdate or ""

        self.verbose = False

    def __eq__(self, other):
        return self.id_ == other.id_ and \
               self.path == other.path and \
               self.home == other.home and \
               self.name == other.name and \
               self.zupfile == other.zupfile and \
               self.revision == other.revision and \
               self.created == other.created and \
               self.lastupdate == other.lastupdate

    def __str__(self):
        ret = []
        ret.append("Product: %s (id = %s)" % (self.name, self.id_))
        ret.append("Home: %s" % self.home)
        ret.append("Revision: %s" % (self.revision or "0"))
        ret.append("Updated On: %s" % self.lastupdate)

        if self.verbose:
            ret.append("\nFixes:")
            
            zupfile = os.path.join(self.getPacksDirPath(), self.zupfile)
            if os.path.isfile(zupfile):
                with zuparchive.ZupArchive(zupfile) as archive:
                    for fix in archive.fixes:
                        ret.append("%s" % fix)
            else:
                ret.append("No ZUPs installed")
            ret.append("")

            ret.extend(self._local_patches())

        ret.append("")
        return "\n".join(ret)

    def getPacksDirPath(self):
        return os.path.join(self.path, self.PACKS_DIR)

    def getMessageFilePath(self):
        return os.path.join(self.path, self.MESSAGE_FILE)

    def getPatchesDirPath(self):
        return os.path.join(self.path, self.PATCHES_DIR)

    def getSourceArchPath(self):
        return os.path.join(self.path, self.SOURCE_ARCH)

    def _local_patches(self):
        ret = []
        ret.append("Local Patches:")

        message_path = self.getMessageFilePath()
        if os.path.exists(message_path):
            try:
                with open(message_path) as fp:
                    fpdata = fp.read().strip()

                    if fpdata:
                        ret.extend(fpdata.splitlines())
            except IOError:
                raise ZenUpProductException("Error reading from message log")

        if len(ret) <= 1:
            ret.append("No local patches installed")
        return ret

    def _check_compatibility(self, archive):
        log.debug("Checking archive compatibility with product: %s", self.id_)
        if not self.id_ == archive.product or \
           int(archive.revision) <= int(self.revision or 0):
            raise ZenUpProductException("ZUP not compatible with the " \
                                        "current installation: %s" \
                                        % archive.zupfile)

    def check_source(self, source):
        """ Returns the product id from a source archive """
        log.debug("Checking validity of source: %s", source)

        def ex(msg):
            return ZenUpProductException("Invalid source: %s. Reason: %s" % (source, msg))

        if not (os.path.exists(source) and \
                zuputils.hasReadAccess(source) and \
                tarfile.is_tarfile(source)):
            raise ex("Path doesn't exist, no access, or not correct file type.")

        with tarfile.open(source) as tar:
            if self.CONFIG not in tar.getnames():
                raise ex("Config file missing.")

            fp = tar.extractfile(self.CONFIG)
            configData = yaml.load(fp)
            fp.close()
            
            if not isinstance(configData, dict):
                raise ex("Invalid config data.")
            elif configData.get('type') != self.TYPE:
                raise ex("Invalid product type: %s vs. %s" % (configData.get('type'), self.TYPE))
            else: 
                config_difference = self.KEYS.difference(configData.iterkeys())
                if config_difference:
                    raise ex("Missing required config data: %r" % config_difference)

            id_ = configData.get('product', "")
            if not WHITELIST.match(id_) or id_ in BLACKLIST:
                raise ex("Invalid product.")

            log.debug("Done checking source.")
            return id_

    def install(self, source, path, displayOutput=False):
        # Validation
        log.debug("Performing validation to initialize product")
        if displayOutput:
            print "Validating..."
        if self.id_ or os.path.exists(self.path):
            raise ZenUpProductException("Product already exists: %s" \
                                        % self.id_)

        if not os.path.exists(path) or \
           not zuputils.hasAccess(path):
            raise ZenUpInternalError("Cannot create product at path: %s" \
                                     % self.path)

        if not os.path.exists(self.home):
            raise ZenUpProductException("Cannot find product's home " \
                                        "directory: %s" % self.home)

        self.id_ = self.check_source(source)
        self.name = self.name or self.id_
        self.path = os.path.join(path, self.id_)
        
        if os.path.exists(self.path):
            raise ZenUpProductException("Product already exists: %s" \
                                        % self.id_)

        yield

        # Installation
        log.info("Initializing product: %s", self.id_)
        if displayOutput:
            print "Initializing..."
        try:
            # Create the zenup product installation path
            os.mkdir(self.path)

            with zuprunner.ZupRunner(self.id_) as runner:

                # Unzip the pristine source into a temp directory
                runner.add_source(source)

                # Run the install script
                install_script = os.path.join(runner.source, 
                                              self.INSTALL_SCRIPT)
                zuputils.runScript(install_script)

                # Write the contents of the pristine source into product's
                # source archive file
                with tarfile.open(self.getSourceArchPath(), "w:gz") as tar:
                    path_list = os.listdir(runner.source)
                    for path in path_list:
                        tar.add(os.path.join(runner.source, path), path)

            # If the product is being initialized with a zup file...
            if self.zupfile:
                # Verify compatibility with the product and set the revision 
                # on the product
                with zuparchive.ZupArchive(self.zupfile) as archive:
                    self._check_compatibility(archive)
                    self.revision = archive.revision

                # Upload the pack to the product's pack directory
                packname = "%s-SP%s.zup" % (self.id_, self.revision)
                path = os.path.join(self.path, self.PACKS_DIR)
                zupfile_orig = self.zupfile
                self.zupfile = os.path.join(path, packname)

                os.mkdir(path)
                shutil.copy(zupfile_orig, self.zupfile)
            else:
                self.revision = ""

            self.created = datetime.now().strftime("%c")
            self.lastupdate = self.created

        except OSError:
            msg = "Error installing product: %s (%s)" % (self.id_, self.name)
            log.exception(msg)
            self.uninstall()
            raise ZenUpProductException(msg)
        except ZenUpException:
            # ZEN-6864: QA didn't want an exception in the log when there isn't one in output.
            log.error("Error installing product: %s" % self.id_)
            self.uninstall()
            raise
        except Exception:
            log.exception("Error installing product: %s" % self.id_)
            self.uninstall()
            raise

        yield

    def uninstall(self):
        log.info("Uninstalling product: %s" % self.id_)
        try:
            if os.path.exists(self.path):
                shutil.rmtree(self.path)
                self.id_ = None
        except OSError as e:
            raise ZenUpProductException("Unable to uninstall product: %s" \
                                        % self.id_)

    def patch(self, patchfile, message=None, options=None):
        """
        Applies a single patch directly onto the product's home directory
        while allowing the user to add their own individualized comments.
        """

        message = message or ""
        pwd = os.getcwd()
        patchfile = os.path.join(pwd, patchfile)

        if not zuputils.hasAccess(patchfile):
            raise ZenUpException("Cannot access patch file %s" % patchfile)
        if not zuputils.hasAccess(self.home):
            raise ZenUpInternalError("Cannot access product home %s (%s)" % 
                                     (self.home, self.id_))
        
        isStrip = False

        if options:
            ops = options.split()
            for op in ops:
                if op.startswith(("-p", "--strip")):
                    isStrip = True
                    break
        else:
            ops = []

        if not isStrip:
            ops.append("-p0")

        try:
            os.chdir(self.home)
            with open(patchfile) as fp:
                zuputils.applyPatch(fp, "--dry-run", *ops)
                fp.seek(0)

                filename = os.path.basename(patchfile)
                directory = self.getPatchesDirPath()
                fname, ext = os.path.splitext(filename)  # "hello_world", ".txt"
                i = 1

                while os.path.exists(os.path.join(directory, filename)):
                    i += 1
                    filename = "%s%s.%d" % (fname, ext, i)

                if not os.path.exists(directory):
                    os.mkdir(directory)

                path = os.path.join(directory, filename)
                shutil.copyfile(patchfile, path)
                zuputils.applyPatch(fp, *ops)
        except ZenUpInternalError as e:
            raise ZenUpException(e)
        finally:
            os.chdir(pwd)

        with open(self.getMessageFilePath(), "a") as fp:
            timestamp = datetime.now().strftime("%c")

            if options:
                fp.write('%s [%s "%s"] %s\n' %
                         (timestamp, filename, options, message))
            else:
                fp.write('%s [%s] %s\n' %
                         (timestamp, filename, message))

            self.lastupdate = timestamp
            
    def _get_config(self, runner):
        if self.zupfile:
            zup = runner.archives.get(self._HEAD_ZUP)
            path = os.path.join(zup.path, zup.CONFIG)
        else:
            path = os.path.join(runner.source, self.CONFIG)

        with open(path) as fp:
            return yaml.load(fp)

    def localDiff(self, verbose=True):
        log.info("Finding local diff for product: %s" % self.id_)
        with zuprunner.ZupRunner(self.id_) as runner:
            runner.add_source(self.getSourceArchPath())
            source = os.path.join(runner.source, self.SOURCE_ARCH_SOURCE)

            if self.zupfile:
                zupfile = os.path.join(self.getPacksDirPath(), self.zupfile)
                zup = runner.add_archive(zupfile, self._HEAD_ZUP)
                list(zup.apply(source))

            diff = localdiff.LocalDiff(source, self.home)
            diff.verbose = verbose
            diff.run(**self._get_config(runner))
            return diff

    def dryRun(self, zupfile):
        with zuprunner.ZupRunner(self.id_) as runner:
            added, deleted, modified, output = \
                self._dry_run(zupfile, runner)

            files_added = sorted(added)
            files_deleted = sorted(deleted)
            files_modified = sorted(modified)

            return files_added, files_deleted, files_modified, output

    def _dry_run(self, zupfile, runner, force=False):

        log.debug("Initializing environment (product=%s, zupfile=%s)" %
                  (self.id_, zupfile))
        output = None

        # Extract the new zup and verify usability/compatibility
        zup = runner.add_archive(zupfile, self._NEW_ZUP)
        self._check_compatibility(zup)

        runner.set_zup_product_dir(self.home)
        runner.set_zup_working_dir(zup.path)
        zup.check()

        # Extract the pristine source
        runner.add_source(self.getSourceArchPath())
        source = os.path.join(runner.source, self.SOURCE_ARCH_SOURCE)
        gen_patch_apply = zup.apply(source)

        # Apply patches from the currently installed zup onto the pristine
        if self.zupfile:
            path = os.path.join(self.getPacksDirPath(), self.zupfile)
            if not zuputils.hasAccess(path):
                raise ZenUpInternalError("Unable to access product zup: %s" %
                                         self.zupfile)
            head_zup = runner.add_archive(path, self._HEAD_ZUP)
            patch_count = len(head_zup.patches)
            for i in xrange(patch_count): gen_patch_apply.next()
        else:
            patch_count = 0

        # Compile list of files affected by the new zup excluding files
        # affected by the current zup
        log.debug("Computing files affected by installing zup %s (%s)" %
                  (zupfile, self.id_))

        affected_files = set()

        for patch_file in zup.patches[patch_count:]:
            if patch_file not in zup.changes:
                raise ZenUpInternalError("Missing metadata for patch: %s" %
                                         patch_file)

            file_list = zup.changes[patch_file]

            added = file_list.get("adds") or []
            if isinstance(added, basestring):
                affected_files.add(added)
            else:
                affected_files.update(added)

            deleted = file_list.get("deletes") or []
            if isinstance(deleted, basestring):
                affected_files.add(deleted)
            else:
                affected_files.update(deleted)

            modified = file_list.get("modifies") or []
            if isinstance(modified, basestring):
                affected_files.add(modified)
            else:
                affected_files.update(modified)

        # Local diff
        ld = localdiff.LocalDiff(source, self.home)

        config = self._get_config(runner)
        if not force:
            _config = {
                ld.INCLUDE_DIR: set(os.path.dirname(f) for f in affected_files),
                ld.INCLUDE_FILE: affected_files
            }
            # update our constructed config with the actual config from file.
            _config.update(config)
            config = _config

        ld.run(**config)

        # Files/Dirs should not be unknown
        if ld.unknown:
            errmsg = []
            errmsg.append("Cannot patch the following path(s):")
            errmsg.extend(["\t%s" % filename for filename in ld.unknown])
            raise ZenUpProductException("\n".join(errmsg))

        # Apply the remaining patches from the new zup onto the source
        for i in gen_patch_apply: pass

        # Merge local changes
        log.debug("Merging local diff (product=%s, zupfile=%s)" %
                  (self.id_, zupfile))

        if force:
            affected_files.update(ld.added)
            affected_files.update(ld.deleted)
            affected_files.update(ld.modified)

        # Files/Directories that are deleted locally and are affected by the 
        # zup cannot be merged.
        elif ld.deleted:
            errmsg = []        
            errmsg.append("The following path(s) have been deleted and cannot "
                          "be patched:")
            errmsg.extend(["\t%s" % filename for filename in ld.deleted])
            raise ZenUpProductException("\n".join(errmsg))

        # Try to merge any other local diffs
        elif ld.changeset:
            pwd = os.getcwd()
            local_diff_file = os.path.join(runner.path, self._LOCAL_DIFF_FILE)
            reject_file = os.path.join(runner.path, self._REJECT_FILE)
            
            try:
                os.chdir(source)
                with open(local_diff_file, "w+") as fp:
                    fp.write(str(ld))
                    fp.seek(0)

                    options = ["-N", "-r%s" % reject_file, "-p0"]
                    try:
                        zuputils.applyPatch(fp, *options)
                    except ZenUpException as e:
                        FORWARD_PATCH_MESSAGE = "Reversed (or previously " \
                            "applied) patch detected!  Skipping patch."
                        NEW_FILE_MESSAGE = "patching file"

                        if os.path.exists(reject_file):
                            with open(reject_file) as fp:
                                log.info("Merge Conflicts:")
                                [log.info(line.rstrip('\n')) for line in fp.readlines()]

                        ignore = False
                        for line in str(e).splitlines():
                            if line.startswith(NEW_FILE_MESSAGE):
                                ignore = False
                            elif line == FORWARD_PATCH_MESSAGE:
                                ignore = True
                            elif line.rfind(reject_file) > 0:
                                if not ignore:
                                    raise ZenUpProductException(
                                        "Conflict(s) merging local diff:\n%s" %
                                        str(e).replace(reject_file, "zenup log file"))

                        output = str(e).replace(reject_file, "zenup log file")
            finally:
                os.chdir(pwd)

        # Calculate the state of all files affected by the ZUP
        files_added = []
        files_deleted = []
        files_modified = []

        for filename in affected_files:
            in_pristine = os.path.exists(os.path.join(source, filename))
            in_installed = os.path.exists(os.path.join(self.home, filename))
            is_dir = os.path.isdir(os.path.join(source, filename))

            is_added = in_pristine and not in_installed
            is_deleted = not in_pristine and in_installed
            is_modified = in_pristine and in_installed and not is_dir

            if is_added:
                files_added.append(filename)
            elif is_deleted:
                files_deleted.append(filename)
            elif is_modified:
                files_modified.append(filename)
            
        return files_added, files_deleted, files_modified, output

    def upgrade(self, zupfile, force=False, displayOutput=False):

        with zuprunner.ZupRunner(self.id_) as runner:

            try:
                files_added, files_deleted, files_modified, output = \
                    self._dry_run(zupfile, runner, force=force)
            except KeyboardInterrupt as e:
                raise ZenUpException("User cancelled operation")

            zup = runner.archives.get(self._NEW_ZUP)

            # Run pre script
            if displayOutput:
                print "Running pre-copy steps..."
            zup.pre()

            # Copy all of the patched files
            if displayOutput:
                print "Copying files..."
            copy_files = sorted(chain(files_added, files_modified))

            for filename in copy_files:
                src = os.path.join(runner.source,
                                   self.SOURCE_ARCH_SOURCE,
                                   filename)
                dest = os.path.join(self.home, filename)

                if os.path.isdir(src):
                    os.makedirs(dest)
                else:
                    destdir = os.path.dirname(dest)
                    if not os.path.exists(destdir):
                        os.makedirs(destdir)
                    shutil.copyfile(src, dest)

            # Delete all of the applicable files
            delete_files = sorted(files_deleted, reverse=True)

            for filename in delete_files:
                dest = os.path.join(self.home, filename)
                if os.path.isdir(dest):
                    shutil.rmtree(dest)
                else:
                    os.remove(dest)
     
            # Run post script
            if displayOutput:
                print "Running post-copy steps..."
            zup.post()

            # Update the product
            lastUpdate = datetime.now()

            if displayOutput:
                print "Finishing up..."
            new_zup = "%s-SP%s.zup" % (self.id_, zup.revision)

            directory = self.getPacksDirPath()
            if not os.path.exists(directory):
                os.mkdir(directory)

            shutil.copyfile(zupfile, os.path.join(directory, new_zup))
            self.zupfile = new_zup
            self.revision = zup.revision
            self.lastupdate = lastUpdate.strftime("%c")

            # If force, clear the message file 
            if force and os.path.exists(self.getMessageFilePath()):
                with open(self.getMessageFilePath(), "a") as fp:
                    fp.write("%s Installed ZUP revision %s %s" % 
                             ("="*10, self.revision, "="*10))
                
                destfile = "%s.%s" % (self.getMessageFilePath(), 
                                      lastUpdate.strftime("%Y%m%d%H%M"))
                shutil.move(self.getMessageFilePath(), destfile)
