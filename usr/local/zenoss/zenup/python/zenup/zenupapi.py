##############################################################################
# 
# Copyright (C) Zenoss, Inc. 2013, all rights reserved.
# 
# This content is made available according to terms specified in
# License.zenoss under the directory where your Zenoss product is installed.
# 
##############################################################################

import os
import logging

import yaml

from zenup import ZenUpException, ZenUpInternalError
from zenup import zuputils, zupproduct, zuparchive

log = logging.getLogger('zenup')


class ZenUp(object):
    """
    ZenUp API class
    """

    HOME = "/opt/zenup/var"
    STATUS_FILE = "status.yaml"

    def __init__(self, home=HOME):
        self.HOME = home
        self.products = {}

        self._loadProducts()

    def _loadProducts(self):
        status = os.path.join(self.HOME, self.STATUS_FILE)

        if not self.HOME or \
           not os.path.exists(self.HOME) or \
           not os.path.isdir(self.HOME) or \
           not zuputils.hasAccess(self.HOME):
            raise ZenUpException("Unable to access zenup home: %s" % self.HOME)
        elif not os.path.exists(status):
            return

        try:
            with open(status) as fp:
                productYaml = yaml.load_all(fp)
                if not productYaml:
                    return

                for productData in productYaml:
                    product = zupproduct.ZupProduct(**productData)
                    log.debug("Loaded product: %s", product.id_)
                    self.products[product.id_] = product

        except Exception as e:
            raise ZenUpException("Error loading products from %s: %s" % 
                                 (self.STATUS_FILE, e))

    def _saveProducts(self):
        try:
            with open(os.path.join(self.HOME, self.STATUS_FILE), "w") as fp:
                yaml.dump_all([product.__dict__ for product in \
                               self.products.itervalues()], fp,
                               default_flow_style=False, canonical=True)
        except Exception as e:
            raise ZenUpException("Error writing %s. Changes not saved: %s" %
                                 (self.STATUS_FILE, e))

    def getProduct(self, productId):
        if productId in self.products:
            return self.products.get(productId)
        else:
            return next((p for p in self.products.itervalues() \
                        if p.name == productId), None)

    def initProduct(self, source, home, name=None, displayOutput=False):
        log.info("Initializing a new product")
        if self.getProduct(name):
            raise ZenUpException("Product name already in use: %s" % name)
        else:
            product = zupproduct.ZupProduct(home, name=name)
            pgen = product.install(source, self.HOME, displayOutput=displayOutput)

            # Verify unique product id
            pgen.next()
            if self.getProduct(product.id_):
                raise ZenUpException("Product id already in use: %s" % product.id_)
            
            pgen.next()
            self.products[product.id_] = product
            self._saveProducts()

            log.info("Done adding product: %s", product.id_)

    def deleteProduct(self, productId):
        log.info("Deleting product: %s", productId)
        product = self.getProduct(productId)
        if not product:
            raise ZenUpException("Product not found: %s" % productId)
        elif product.id_ not in self.products:
            raise ZenUpInternalError("Key not found: %s" % product.id_)
        else:
            id_ = product.id_
            product.uninstall()
            del self.products[id_]
            self._saveProducts()
        log.info("Done deleting product: %s", productId)

    def patchProduct(self, productId, patchfile, message=None, options=None):
        product = self.getProduct(productId)
        if not product:
            raise ZenUpException("Product not found: %s" % productId)

        product.patch(patchfile, message=message, options=options)
        # Update time is modified
        self._saveProducts()

    def localDiff(self, productId, verbose=True):
        log.info("Generating local diff for product id: %s", productId)
        product = self.getProduct(productId)
        if not product:
            raise ZenUpException("Product not found: %s" % productId)

        ld = product.localDiff(verbose)
        log.info("Done generating local diff for product id: %s", productId)
        yield str(ld)

    def install(self, zupfile, dryRun=False, force=False, displayOutput=False):
        with zuparchive.ZupArchive(zupfile) as archive:
            product = self.getProduct(archive.product)
            if not product:
                raise ZenUpException("Product not found: %s" % archive.product)

        if dryRun:
            files_added, files_deleted, files_modified, output = \
                product.dryRun(zupfile)

            yield "\nFiles modified:"
            yield "\n".join(files_modified)
            yield "\nFiles added:"
            yield "\n".join(files_added)
            yield "\nFiles deleted:"
            yield "\n".join(files_deleted)

            if output:
                yield "\nResults:"
                yield "%s" % output
        else:
            product.upgrade(zupfile, force, displayOutput=displayOutput)
            self._saveProducts()
            yield ""
        
    def displayProductStats(self, productId=None, verbose=False):
        if productId is None:
            log.info("Displaying status for all products")
            if self.products:
                separator = ""
                for product in self.products.itervalues():
                    product.verbose = verbose
                    yield "%s%s" % (separator, str(product))
                    separator = "---\n"
            else:
                yield "No Products Installed"
        else:
            log.info("Displaying status for product %s" % productId)
            product = self.getProduct(productId)
            if product:
                product.verbose = verbose
                yield "%s" % str(product)
            else:
                raise ZenUpException("Product not found: %s" % productId)                

        log.info("Done displaying product status")

    def displayZupInfo(self, zupfile, showAll=False, showFix=None):
        with zuparchive.ZupArchive(zupfile) as archive:
            if showAll or showFix:
                yield archive.display(showFix)
            else:
                yield str(archive)
