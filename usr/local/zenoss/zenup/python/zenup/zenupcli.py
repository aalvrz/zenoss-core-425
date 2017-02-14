##############################################################################
# 
# Copyright (C) Zenoss, Inc. 2013, all rights reserved.
# 
# This content is made available according to terms specified in
# License.zenoss under the directory where your Zenoss product is installed.
# 
##############################################################################

import os
import sys
import argparse
import tarfile
import logging

from zenup import ZENUPVAR
from zenup import ZenUpException
from zenup import zenupapi

log = logging.getLogger('zenup')


class ZenUpCLI(object):
    """
    ZenUp Client-side tool.
    """

    APP = "zenup"
    DESCRIPTION = "Tool for implementing Zenoss software updates and " \
                  "customer patches."

    def __init__(self, *args):
        self.products = {}
        self.parser = argparse.ArgumentParser(prog=self.APP,
                                              description=self.DESCRIPTION)
        self._setup()

        if not args:
            args = ['-h']

        try:
            self.api = zenupapi.ZenUp(ZENUPVAR)
            self.args = self.parser.parse_args(args)

            run = getattr(self, "_%s" % self.args.command)
            log.debug("Running CLI command: %s", ' '.join(args))
        except Exception:
            log.exception("Error initializing the command-line interface.")
            raise

        try:
            run()
        except Exception:
            log.exception("Unexpected error running command: %s", self.args.command)
            raise

    # -- Setup --

    def _setup(self):
        p = self.parser.add_subparsers(dest="command", metavar="<command>")
        self._initcmd(p)
        self._deletecmd(p)
        self._statuscmd(p)
        self._infocmd(p)
        self._diffcmd(p)
        self._patchcmd(p)
        self._installcmd(p)

    def _statuscmd(self, parser):
        """ usage: zenup status [PRODUCT] [--verbose] """
        HELP = "View status on all installed products or a particular " \
               "installed product."

        p = parser.add_parser("status", description=HELP, help=HELP)
        p.add_argument("product", nargs="?",
                       help="Displays information about a product.")
        p.add_argument("--verbose", action="store_true",
                       help="Increases the verbosity of the output")

    def _infocmd(self, parser):
        """ usage: zenup info source [--showfix FIX | --showall] """
        HELP = "View information about a zup"

        p = parser.add_parser("info", description=HELP, help=HELP)
        p.add_argument("source",
                       help="Full path of the zup.")

        group = p.add_mutually_exclusive_group(required=False)
        group.add_argument("--showfix",
                           help="View details of a specific fix.")
        group.add_argument("--showall", action="store_true", default=False,
                           help="View the details of all fixes on the zup "
                                "file.")

    def _initcmd(self, parser):
        """ usage: zenup init source home [--name NAME] """
        HELP = "Initializes a new product for the zenup tool"

        p = parser.add_parser("init", description=HELP, help=HELP)
        p.add_argument("source",
                       help="Product's source code")
        p.add_argument("home",
                       help="Product's home directory")
        p.add_argument("--name", default="",
                       help="Product's display name")

    def _deletecmd(self, parser):
        """ usage: zenup delete product --force """
        HELP = "Deletes a registered product from the zenup tool"

        p = parser.add_parser("delete", description=HELP, add_help=False)
        p.add_argument("product",
                       help="Product Id")
        group = p.add_mutually_exclusive_group(required=True)
        group.add_argument("--force", action="store_true",
                           help="Required option when deleting a " \
                                "registered product")

    def _patchcmd(self, parser):
        """ usage: zenup patch patchfile [PRODUCT] [-m MESSAGE] [--options OPTIONS]"""
        HELP="Applies a local patch to a registered zenup product and " \
             "records optional user comments as well. Attempts a dry run " \
             "before applying the patch."

        p = parser.add_parser("patch", description=HELP, help=HELP)
        p.add_argument("patchfile",
                       help="path to the patch file")
        p.add_argument(dest="product", nargs="?",
                       help="Product Id")
        p.add_argument("-m", dest="message",
                       help="User comment associated with patch")
        p.add_argument("--options",
                       help=argparse.SUPPRESS)

    def _diffcmd(self, parser):
        """ usage: zenup diff [PRODUCT] [--summarize] """
        HELP = "Performs a local diff on a registered zenup product"

        p = parser.add_parser("diff", description=HELP, help=HELP)
        p.add_argument("product", nargs="?",
                       help="Product Id")
        p.add_argument("--summarize", dest="verbose", action="store_false",
                       default=True,
                       help="Option to summarize results")

    def _installcmd(self, parser):
        """ usage: zenup install zupfile [--force | --dry-run]"""
        HELP = "Applies a zup to a registered zenup product. This action " \
               "cannot be undone."

        p = parser.add_parser("install", description=HELP, help=HELP)
        p.add_argument("zupfile",
                       help="ZUP File")
        group = p.add_mutually_exclusive_group(required=False)
        group.add_argument("--dry-run", action="store_true", dest="dryrun",
                           help="Do not actually change any files; just " \
                                "print what would happen.")
        group.add_argument("--force", action="store_true",
                           help="Apply zup while reverting ALL local changes")

    # -- Execution --

    def _status(self):
        try:
            out = list(self.api.displayProductStats(self.args.product, self.args.verbose))
            print "\n".join(out)
        except ZenUpException as e:
            log.exception("Error displaying status.")
            self._error(e)

    def _info(self):
        try:
            out = ""
            if os.path.exists(self.args.source):
                if not os.access(self.args.source, os.R_OK):
                    self._error("Insufficient Permissions: %s" % self.args.source)
                elif not tarfile.is_tarfile(self.args.source):
                    self._error("File is not a ZUP: %s" % self.args.source)
                else:
                    out = list(self.api.displayZupInfo(self.args.source, 
                                                       showAll=self.args.showall,
                                                       showFix=self.args.showfix))
            else:
                self._error("File does not exist: %s" % self.args.source)

            print "\n".join(out)

        except ZenUpException as e:
            log.error("Error getting info.")
            self._error(e)

    def _init(self):
        try:
            if not os.path.exists(self.args.home):
                self._error("Path not found: %s" % self.args.home)
            elif not os.path.exists(self.args.source) or \
                 not os.access(self.args.source, os.R_OK):
                self._error("Cannot access source archive: %s" %
                                  self.args.source)
            elif not tarfile.is_tarfile(self.args.source):
                self._error("Source is not an archive: %s" %
                                  self.args.source)
            else:
                self.api.initProduct(os.path.abspath(self.args.source),
                                     os.path.abspath(self.args.home),
                                     self.args.name, displayOutput=True)
        except ZenUpException as e:
            log.error("Error initializing product.")
            self._error(e)
        else:
            print "Success!"

    def _delete(self):
        try:
            self.api.deleteProduct(self.args.product)
        except ZenUpException as e:
            log.error("Error deleting product.")
            self._error(e)
        else:
            print "Success!"

    def _patch(self):
        if self.args.product is None:
            # Assume which product if there's only one.
            if len(self.api.products) == 1:
                self.args.product = self.api.products.keys()[0]
            else:
                self._error("Product must be specified")

        try:
            self.api.patchProduct(self.args.product,
                                  os.path.abspath(self.args.patchfile),
                                  self.args.message, self.args.options)
        except ZenUpException as e:
            log.error("Error applying patch.")
            self._error(e)
        else:
            print "Success!"

    def _diff(self):
        if self.args.product is None:
            # Assume which product if there's only one.
            if len(self.api.products) == 1:
                self.args.product = self.api.products.keys()[0]
            else:
                self._error("Product must be specified")

        try:
            print "Calculating diff...\n"
            out = self.api.localDiff(self.args.product, self.args.verbose)
            print "\n".join(out)
        except ZenUpException as e:
            log.error("Error performing local diff.")
            self._error(e)
        except IOError as e:
            pass

    def _install(self):
        try:
            if self.args.dryrun:
                print "Performing a dry run..."
            else:
                if self.args.force:
                    try:
                        raw_input("WARNING: ALL custom patches and "
                                  "edits will be reverted! Press "
                                  "ENTER to continue or <CTRL+C> to "
                                  "quit.")
                    except KeyboardInterrupt:
                        raise ZenUpException("User cancelled operation")

                print "Installing..."
            out = self.api.install(self.args.zupfile, self.args.dryrun,
                                   self.args.force, displayOutput=True)
            print "\n".join(out)
        except ZenUpException as e:
            log.error("Error performing install.")
            self._error(e)
        else:
            print "Success!"
        finally:
            if self.args.dryrun:
                print "No changes have been applied to your system" 

    def _error(self, msg):
        log.error(msg)
        print "ERROR:", msg
        sys.exit(1)        

if __name__ == '__main__':
    ZenUpCLI(*sys.argv[1:])
