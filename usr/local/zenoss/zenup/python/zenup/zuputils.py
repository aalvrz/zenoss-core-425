##############################################################################
# 
# Copyright (C) Zenoss, Inc. 2013, all rights reserved.
# 
# This content is made available according to terms specified in
# License.zenoss under the directory where your Zenoss product is installed.
# 
##############################################################################

import re
import os
from functools import partial
import subprocess
import logging

log = logging.getLogger('zenup')

from zenup import ZenUpException, ZenUpInternalError

def hasReadAccess(path):
    access = partial(os.access, path)

    if os.path.islink(path):
        return False
    elif os.path.isdir(path):
        return access(os.R_OK) and access(os.X_OK)
    elif os.path.isfile(path):
        return access(os.R_OK)
    else:
        return False


def hasAccess(path):
    access = partial(os.access, path)

    if os.path.islink(path):
        return False
    elif os.path.isdir(path):
        return access(os.R_OK) and access(os.W_OK) and access(os.X_OK)
    elif os.path.isfile(path):
        return access(os.R_OK) and access(os.W_OK)
    else:
        return False


def isSamePathType(left, right):
    return (os.path.isdir(left) and os.path.isdir(right)) or \
           (os.path.isfile(left) and os.path.isfile(right))

def applyPatch(patchfp, *options):

    cmd = ["patch"]
    if options:
        cmd.extend(options)

    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stdin=patchfp, 
                         stderr=subprocess.PIPE)
    stdout, stderr = p.communicate()

    # Non-critical error when applying the patch, like conflicting changes
    # when trying to apply a patch (results reported in stderr)
    if p.returncode == 1:
        raise ZenUpException(stdout)

    # Critical error when applying the patch (results reported in stderr)
    elif p.returncode == 2:
        raise ZenUpInternalError(stderr)

def runScript(script):
    """
    Runs a script located in the source.tgz or zup
    """
    if not os.path.exists(script):
        return
    elif not os.path.isfile(script) or \
         not (os.access(script, os.X_OK) and os.access(script, os.R_OK)):
        raise ZenUpException("Could not run script: %s" % script)

    log.info("Running script: %s", script)
    root_log = logging.getLogger()

    p = subprocess.Popen(script, stdout=subprocess.PIPE,
                         stderr=subprocess.STDOUT, shell=True)
    # ZEN-6550: Stream output to the log and console until finished
    while True:
        line = p.stdout.readline()
        if not line:
            break
        line = line.strip('\n')
        root_log.debug(line)
        log.debug("OUTPUT: %s", line)

    p.wait()  # set p.returncode
    if p.returncode:
        raise ZenUpException("%s returned a non-zero exit code: %s." %
                             (script, p.returncode))
