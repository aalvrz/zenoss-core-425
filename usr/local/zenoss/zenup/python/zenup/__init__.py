##############################################################################
# 
# Copyright (C) Zenoss, Inc. 2013, all rights reserved.
# 
# This content is made available according to terms specified in
# License.zenoss under the directory where your Zenoss product is installed.
# 
##############################################################################

import logging.config
from logging import FileHandler
from logging.handlers import RotatingFileHandler
from logging.handlers import TimedRotatingFileHandler
import os

######################### Exceptions #########################

class ZenUpException(Exception):
    """
    Exceptions that occur on part of bad user input.  These exceptions will 
    print back to the user.
    """
    pass

class ZenUpInternalError(Exception):
    """
    Errors that occur due to some unexpected system error--like a source.tgz 
    with with contents that have file permission issues, or a zup that is 
    missing some critical information for it to work properly.  These errors 
    should display in the log.
    """
    pass

class ZupArchiveException(ZenUpException):
    pass

class ZenUpProductException(ZenUpException):
    pass


######################### Loggers #########################

def _relativeToZENUPHOME(filename):
    """Returns the filename relative to $ZENUPHOME"""
    return filename if filename.startswith('/') else os.path.join(ZENUPHOME, filename)

class ZenUpFileHandler(FileHandler):
    """Like python's FileHandler but relative to $ZENUPHOME"""
    def __init__(self, filename, mode='a', encoding=None, delay=0):
        filename = _relativeToZENUPHOME(filename)
        FileHandler.__init__(self, filename, mode, encoding, delay)

class ZenUpRotatingFileHandler(RotatingFileHandler):
    """Like python's RotatingFileHandler but relative to $ZENUPHOME"""
    def __init__(self, filename, mode='a', maxBytes=0, backupCount=0, encoding=None, delay=0):
        filename = _relativeToZENUPHOME(filename)
        RotatingFileHandler.__init__(self, filename, mode, maxBytes, backupCount, encoding, delay)

class ZenUpTimedRotatingFileHandler(TimedRotatingFileHandler):
    """Like python's TimedFileHandler but relative to $ZENUPHOME"""
    def __init__(self, filename, when='h', interval=1, backupCount=0, encoding=None, delay=False, utc=False):
        filename = _relativeToZENUPHOME(filename)
        TimedRotatingFileHandler.__init__(self, filename, when, interval, backupCount, encoding, delay, utc)


######################### Initialization #########################

SAFE_EXCEPTIONS = (ZenUpException, ZenUpInternalError)

ZENUPHOME = os.environ.get("ZENUPHOME")
if not ZENUPHOME:
    raise ZenUpException("Environment variable $ZENUPHOME not set")

ZENUPVAR = os.path.join(ZENUPHOME, "var")
ZENUPETC = os.path.join(ZENUPHOME, "etc")

LOG_CONFIG = os.path.join(ZENUPETC, "log.conf")
if not os.path.isfile(LOG_CONFIG):
    raise ZenUpException("Log config file not found: %s" % LOG_CONFIG)
logging.config.fileConfig(LOG_CONFIG)
