#! /usr/bin/env python
##############################################################################
#
# Copyright (C) Zenoss, Inc. 2007, 2009, 2013 all rights reserved.
#
# This content is made available according to terms specified in
# License.zenoss under the directory where your Zenoss product is installed.
#
##############################################################################


__doc__ = '''zenbackup

Creates backup of Zope data files, Zenoss conf files and the events database.
'''

import sys
import os
from datetime import date, datetime
import time
import logging
import ConfigParser
import subprocess
import tarfile
import re
import gzip
from itertools import imap

from zope.interface import Interface, implements

import Globals
from ZCmdBase import ZCmdBase
from Products.ZenUtils.Utils import zenPath, readable_time, unused
from ZenBackupBase import *
from Products.Zuul.interfaces import IPreBackupEvent, IPostBackupEvent
from zope.event import notify


unused(Globals)

MAX_UNIQUE_NAME_ATTEMPTS = 1000

DEFINER_PATTERN = re.compile(r'/\*((?!/\*).)*DEFINER.*?\*/')


def strip_definer(mysqldump_line):
    """Strips DEFINER statements from mysqldump lines. See ZEN-326."""
    if not mysqldump_line.startswith("/*") or len(mysqldump_line) > 500:
        # speed things up, lines with DEFINER in them
        #    (1) start with '/*'
        #    (2) are shorter than 500 characters.
        return mysqldump_line
    return DEFINER_PATTERN.sub('', mysqldump_line)


class PreBackupEvent(object):
    implements(IPreBackupEvent)

    def __init__(self, zen_backup_object):
        self._zen_backup_object = zen_backup_object


class PostBackupEvent(object):
    implements(IPostBackupEvent)

    def __init__(self, zen_backup_object):
        self._zen_backup_object = zen_backup_object


class ZenBackupException(Exception):
    def __init__(self, value="", critical=False):
        self.value = value
        self.critical = critical

    def __str__(self):
        return repr(self.value)

    def isCritical(self):
        return self.critical


class Duration:
    _start = None

    def start(self):
        self._start = datetime.now()
        return self

    def elapsed(self):
        return datetime.now() - self._start


class ZenBackup(ZenBackupBase):
    def __init__(self, argv):
        # Store sys.argv so we can restore it for ZCmdBase.
        self.argv = argv

        self._backupFactory = BackupFactory()
        #get backup impl after options are parsed
        self._backup = None

        ZenBackupBase.__init__(self)
        self.log = logging.getLogger("zenbackup")
        logging.basicConfig()
        self.log.setLevel(self.options.logseverity)

        self.hasCriticalErrors = False
        self.messages = []

    def getDefaultBackupFile(self):
        """
        Return a name for the backup file or die trying.

        @return: unique name for a backup
        @rtype: string
        """

        def getName(index=0):
            """
            Try to create an unique backup file name.

            @return: tar file name
            @rtype: string
            """
            return 'zenbackup_%s%s.tgz' % (date.today().strftime('%Y%m%d'),
                                           (index and '_%s' % index) or '')

        backupDir = zenPath('backups')
        if not os.path.exists(backupDir):
            os.mkdir(backupDir, 0750)
        for i in range(MAX_UNIQUE_NAME_ATTEMPTS):
            name = os.path.join(backupDir, getName(i))
            if not os.path.exists(name):
                break
        else:
            self.log.critical('Cannot determine an unique file name to use'
                              ' in the backup directory (%s).' % backupDir +
                              ' Use --outfile to specify location for the backup'
                              ' file.\n')
            sys.exit(-1)
        return name

    def buildOptions(self):
        """
        Basic options setup
        """
        # pychecker can't handle strings made of multiple tokens
        __pychecker__ = 'no-noeffect no-constCond'
        ZenBackupBase.buildOptions(self)
        self.parser.add_option('--file',
                               dest="file",
                               default=None,
                               help='Name of file in which the backup will be stored.'
                                    ' Backups will by default be placed'
                                    ' in $ZENHOME/backups/')
        self.parser.add_option('--no-eventsdb',
                               dest="backupEventsDb",
                               default=True,
                               action='store_false',
                               help='Do not include the events database'
                                    ' in the backup.')
        self.parser.add_option('--no-zodb',
                               dest="backupZopeDb",
                               default=True,
                               action='store_false',
                               help='Do not include the ZODB'
                                    ' in the backup.')
        self.parser.add_option('--no-perfdata',
                               dest="backupPerfData",
                               default=True,
                               action='store_false',
                               help='Do not include performance data'
                                    ' in the backup.')
        self.parser.add_option('--no-zepindexes',
                               dest='backupZepIndexes',
                               default=True,
                               action='store_false',
                               help='Do not include zep indexes in the backup')
        self.parser.add_option('--no-zenpacks',
                               dest="backupZenPacks",
                               default=True,
                               action='store_false',
                               help='Do not include ZenPack data'
                                    ' in the backup.')
        self.parser.add_option('--stdout',
                               dest="stdout",
                               default=False,
                               action='store_true',
                               help='Send backup to stdout instead of to a file.')
        self.parser.add_option('--no-save-mysql-access',
                               dest='saveSettings',
                               default=True,
                               action='store_false',
                               help='Do not include zodb and zep credentials'
                                    ' in the backup file for use during restore.')
        self.parser.add_option('--collector',
                               dest="collector",
                               default=False,
                               action='store_true',
                               help='include only data relevant to collector'
                                    ' in the backup.')
        self.parser.add_option('--enterprise-tools',
                               dest="useEnterpriseBackup",
                               default=False,
                               action='store_true',
                               help='Use enterprise backup tools.')
        self.parser.remove_option('-v')
        self.parser.add_option('-v', '--logseverity',
                               dest='logseverity',
                               default=20,
                               type='int',
                               help='Logging severity threshold')
        self.parser.set_defaults(configfile=zenPath('etc/zenbackup.conf'))

    def backupZenPacks(self):
        duration = Duration().start()
        if self.options.backupZenPacks:

            if self.options.backupZopeDb:
                self._backup.backupZenPackFiles()
            self._backup.backupZenPackDelegate()

            self.log.info("Backup of ZenPacks completed in %s.", readable_time(duration.elapsed().total_seconds()))
        else:
            self.log.info('Skipping backup of ZenPack data.')

    def backupZODB(self):
        """
        Backup the Zope database.
        """

        timer = Duration().start()
        self._backup.backupZodb()
        self._backup.backupZodbSession()
        self.log.info("Backup of ZODB database completed in %s.", readable_time(timer.elapsed().total_seconds()))

    def backupPerfData(self):
        """
        Back up the RRD files storing performance data.
        """
        duration = Duration().start()
        if self.options.backupPerfData:
            try:
                if self._backup.backupPerf():
                    subtotalTime = readable_time(duration.elapsed().totalSeconds())
                    self.log.info("Backup of performance data completed in %s.",
                                  subtotalTime)
            except ZenBackupException as e:
                self.hasCriticalErrors = self.hasCriticalErrors or e.isCritical()
                self.messages.append(str(e))
        else:
            self.log.info('Skipping backup of performance data.')

    def packageStagingBackups(self):
        """
        Gather all of the other data into one nice, neat file for easy
        tracking. Returns the filename created.
        """
        try:
            self.log.info('Packaging backup file.')
            if self.options.file:
                outfile = self.options.file
            else:
                outfile = self.getDefaultBackupFile()
            tempHead, tempTail = os.path.split(self.tempDir)
            tarFile = outfile
            if self.options.stdout:
                tarFile = '-'
            cmd = ['tar', 'czfC', tarFile, tempHead, tempTail]
            (output, warnings, returncode) = runCommand(cmd)
            if returncode:
                raise ZenBackupException("Backup packaging failed.", True)
            self.log.info('Backup written to %s' % outfile)
            return outfile
        except ZenBackupException as e:
            self.hasCriticalErrors = self.hasCriticalErrors or e.isCritical()
            self.messages.append(str(e))

    def cleanupTempDir(self):
        """
        Remove temporary files in staging directory.
        """
        self.log.info('Cleaning up staging directory %s' % self.rootTempDir)
        cmd = ['rm', '-r', self.rootTempDir]
        (output, warnings, returncode) = runCommand(cmd)
        if returncode:
            self.messages.append("Cleanup failed.")

    def backupZep(self):

        # Do a full backup of zep if option set, otherwise only back
        # up a small subset of tables to capture the event triggers.
        try:
            timer = Duration().start()
            if self.options.backupEventsDb:
                self._backup.backupZepDb()
                if self.options.backupZepIndexes:
                    self._backup.backupZepIndexFiles()
            elif self.options.backupZopeDb:
                #This backups the triggers, actions etc, that are need to be consistent between zep and zodb
                self._backup.backupZepDb(full=False)
            else:
                self.log.info('Skipping backup of the events database.')

            self.log.info("Backup of events database completed in %s.", readable_time(timer.elapsed().total_seconds()))

        except ZenBackupException as e:
            self.hasCriticalErrors = self.hasCriticalErrors or e.isCritical()
            self.messages.append(str(e))

    def doBackup(self):
        """
        Create a backup of the data and configuration for a Zenoss install.
        """
        backupBeginTime = time.time()

        # Create temp backup dir
        self.rootTempDir = self.getTempDir()
        self.tempDir = os.path.join(self.rootTempDir, BACKUP_DIR)
        self.log.debug("Use %s as a staging directory for the backup", self.tempDir)
        os.mkdir(self.tempDir, 0750)

        if self.options.fetchArgs:
            self.log.info('Getting ZEP dbname, user, password, port from configuration files.')
            self.readZEPSettings()

        if self.options.collector:
            self.options.backupEventsDb = False
            self.options.backupZopeDb = False
            self.options.backupZepIndexes = False
            self.options.backupZenPacks = False

        # now that settings are read, initialize backup impl
        self._backup = self._backupFactory.getBackupImpl(self.tempDir, self.options)

        if self.options.saveSettings:
            self._backup.backupSettings()

        self.backupZep()

        # Copy /etc to backup dir (except for sockets)
        self._backup.backupConfFiles()

        if self.options.backupZopeDb:
            notify(PreBackupEvent(self))
            self.backupZODB()
        else:
            self.log.info('Skipping backup of ZODB.')

        self.backupZenPacks()
        notify(PostBackupEvent(self))

        self.backupPerfData()

        # tar, gzip and send to outfile
        self.packageStagingBackups()

        self.cleanupTempDir()

        if not self.hasCriticalErrors:
            backupEndTime = time.time()
            totalBackupTime = readable_time(backupEndTime - backupBeginTime)
            if len(self.messages) == 0:
                self.log.info('Backup completed successfully in %s.',
                              totalBackupTime)
            else:
                self.log.info('Backup completed successfully in %s, but the \
                           following errors occurred:', totalBackupTime)
                for msg in self.messages:
                    self.log.error(msg)
            return 0
        else:
            for msg in self.messages:
                self.log.critical(msg)
            return -1


class IBackup(Interface):

    def backupSettings(self):
        """

        @return:
        """

    def backupZepDb(self, full=True):
        """

        @param full: do a full zep backup
        @return:
        """

    def backupZepIndexFiles(self):
        """

        @return:
        """

    def backupZodb(self):
        """

        @return:
        """

    def backupZodbSession(self):
        """

        @return:
        """

    def backupConfFiles(self):
        """

        @return:
        """

    def backupPerf(self):
        """

        @return:
        """

    def backupZenPackFiles(self):
        """
        backup the zenpack directory and $ZENHOME/bin
        @return:
        """

    def backupZenpackDelegate(self):
        """
        Call backup method on all installed zenpacks
        @return:
        """


class BackupFactory(object):
    """
    Creates an implementation of IBackup
    """

    def getBackupImpl(self, workingDir, options):
        """
        @param workingDir: tmp directory to use for creating backup files
        @param options: Options passed in via command line
        @return:
        """
        if options.useEnterpriseBackup:
            return EnterpriseBackup(workingDir, options)
        else:
            return CoreBackup(workingDir, options)


class CoreBackup(object):
    implements(IBackup)

    def __init__(self, workingDir, options):
        """

        @param workingDir:
        @param options:
        @return:
        """
        self.tempDir = workingDir
        self.options = options
        self.log = logging.getLogger("CoreBackup")
        self.log.setLevel(self.options.logseverity)

    def backupSettings(self):
        """
        Save the database credentials to a file for use during restore.
        """
        config = self._getConfigParser()
        config.add_section(CONFIG_SECTION)

        config.set(CONFIG_SECTION, 'zodb_host', self.options.zodb_host)
        config.set(CONFIG_SECTION, 'zodb_port', str(self.options.zodb_port))
        config.set(CONFIG_SECTION, 'zodb_db', self.options.zodb_db)
        config.set(CONFIG_SECTION, 'zodb_user', self.options.zodb_user)
        config.set(CONFIG_SECTION, 'zodb_password', self.options.zodb_password)
        if self.options.zodb_socket:
            config.set(CONFIG_SECTION, 'zodb_socket', self.options.zodb_socket)

        config.set(CONFIG_SECTION, 'zepdbhost', self.options.zepdbhost)
        config.set(CONFIG_SECTION, 'zepdbport', self.options.zepdbport)
        config.set(CONFIG_SECTION, 'zepdbname', self.options.zepdbname)
        config.set(CONFIG_SECTION, 'zepdbuser', self.options.zepdbuser)
        config.set(CONFIG_SECTION, 'zepdbpass', self.options.zepdbpass)

        self._writeConfigParser(config)

    def _getConfigParser(self):
        return ConfigParser.SafeConfigParser()

    def _writeConfigParser(self, config):
        creds_file = os.path.join(self.tempDir, CONFIG_FILE)
        self.log.debug("Writing MySQL credentials to %s", creds_file)
        f = open(creds_file, 'w')
        try:
            config.write(f)
        finally:
            f.close()

    def backupZepDb(self, full=True):
        """

        @param full:
        @return:
        """
        if full:
            self.log.info('Backing up the events database.')
            tables = None
        else:
            self.log.info('Doing a partial backup of the events database.')
            tables = ['config', 'event_detail_index_config', 'event_trigger', 'event_trigger_subscription',
                      'schema_version']

        self._backupMySqlDb(self.options.zepdbhost, self.options.zepdbport,
                            self.options.zepdbname, self.options.zepdbuser,
                            'zepdbpass', 'zep.sql.gz', tables=tables)

    def backupZepIndexFiles(self):
        """

        @return:
        """
        zeneventserver_dir = zenPath('var', 'zeneventserver')
        if self._zepRunning():
            self.log.info('Not backing up event indexes - it is currently running.')
        elif os.path.isdir(zeneventserver_dir):
            self.log.info('Backing up event indexes.')
            zepTar = tarfile.open(os.path.join(self.tempDir, 'zep.tar'), 'w')
            zepTar.add(zeneventserver_dir, 'zeneventserver')
            zepTar.close()
            self.log.info('Backing up event indexes completed.')

    def backupZodb(self):
        """

        @return:
        """
        self.log.info('Backing up the ZODB.')
        self._backupMySqlDb(self.options.zodb_host, self.options.zodb_port,
                            self.options.zodb_db, self.options.zodb_user,
                            'zodb_password', 'zodb.sql.gz',
                            socket=self.options.zodb_socket)

    def backupZodbSession(self):
        """

        @return:
        """
        # Back up the zodb_session database schema

        self._backupMySqlDb(self.options.zodb_host, self.options.zodb_port,
                            self.options.zodb_db + '_session', self.options.zodb_user,
                            'zodb_password', 'zodb_session.sql.gz',
                            socket=self.options.zodb_socket, tables=[])

    def backupConfFiles(self):
        """

        @return:
        """
        self.log.info('Backing up config files.')
        etcTar = tarfile.open(os.path.join(self.tempDir, 'etc.tar'), 'w')
        etcTar.dereference = True
        etcTar.add(zenPath('etc'), 'etc')
        etcTar.close()
        self.log.info("Backup of config files completed.")

    def backupPerf(self):
        """
        Back up the RRD files storing performance data.
       """

        perfDir = zenPath('perf')
        if not os.path.isdir(perfDir):
            self.log.warning('%s does not exist, skipping.', perfDir)
            return False

        self.log.info('Backing up performance data (RRDs).')
        tarFile = os.path.join(self.tempDir, 'perf.tar')
        #will change dir to ZENHOME so that tar dir structure is relative
        cmd = ['tar', 'chfC', tarFile, zenPath(), 'perf']
        (output, warnings, returncode) = runCommand(cmd)
        if returncode:
            raise ZenBackupException("Performance Data backup failed.", True)

    def backupZenPackFiles(self):
        """

        @return:
        """
        if os.path.isdir(zenPath('ZenPacks')):
            # Copy /ZenPacks to backup dir
            self.log.info('Backing up ZenPacks.')
            etcTar = tarfile.open(os.path.join(self.tempDir, 'ZenPacks.tar'), 'w')
            etcTar.dereference = True
            etcTar.add(zenPath('ZenPacks'), 'ZenPacks')
            etcTar.close()
            self.log.info("Backup of ZenPacks completed.")
            # add /bin dir if backing up zenpacks
            # Copy /bin to backup dir
            self.log.info('Backing up bin dir.')
            etcTar = tarfile.open(os.path.join(self.tempDir, 'bin.tar'), 'w')
            etcTar.dereference = True
            etcTar.add(zenPath('bin'), 'bin')
            etcTar.close()
            self.log.info("Backup of bin completed.")

    def backupZenPackDelegate(self):
        """
        Call backup method on all installed zenpacks
        @return:
        """
        dmd = ZCmdBase(noopts=True).dmd
        self.log.info("Backing up ZenPack contents.")
        for pack in dmd.ZenPackManager.packs():
            pack.backup(self.tempDir, self.log)
        self.log.info("Backup of ZenPack contents complete.")

    def _zepRunning(self):
        """
        Returns True if ZEP is running on the system (by invoking
        zeneventserver status).
        """
        zeneventserver_cmd = zenPath('bin', 'zeneventserver')
        with open(os.devnull, 'w') as devnull:
            return not subprocess.call([zeneventserver_cmd, 'status'], stdout=devnull, stderr=devnull)

    def _backupMySqlDb(self, host, port, db, user, passwdType, sqlFile, socket=None, tables=None):
        command = ['mysqldump', '-u%s' % user, '--single-transaction', '--routines']
        credential = getPassArg(self.options, passwdType)
        database = [db]

        if host and host != 'localhost':
            command.append('-h%s' % host)
            if self.options.compressTransport:
                command.append('--compress')
        if port and str(port) != '3306':
            command.append('--port=%s' % port)
        if socket:
            command.append('--socket=%s' % socket)

        with gzip.open(os.path.join(self.tempDir, sqlFile), 'wb') as gf:
            # If tables are specified, backup db schema and data from selected tables.
            if tables is not None:
                self.log.debug(' '.join(command + ['*' * 8] + ['--no-data'] + database))
                schema = subprocess.Popen(command + credential + ['--no-data'] + database,
                                          stdout=subprocess.PIPE)
                gf.writelines(imap(strip_definer, schema.stdout))
                schema_rc = schema.wait()
                data_rc = 0
                if tables:
                    self.log.debug(' '.join(command + ['*' * 8] + ['--no-create-info'] + database + tables))
                    data = subprocess.Popen(command + credential + ['--no-create-info'] + database + tables,
                                            stdout=subprocess.PIPE)
                    gf.writelines(imap(strip_definer, data.stdout))
                    data_rc = data.wait()
            else:
                self.log.debug(' '.join(command + ['*' * 8] + database))
                schema = subprocess.Popen(command + credential + database,
                                          stdout=subprocess.PIPE)
                gf.writelines(imap(strip_definer, schema.stdout))
                schema_rc = schema.wait()

                data_rc = 0

            if schema_rc or data_rc:
                raise ZenBackupException("Backup of (%s) terminated failed." % sqlFile, True)


class EnterpriseBackup(CoreBackup):
    implements(IBackup)

    def __init__(self, workingDir, options):
        super(EnterpriseBackup, self).__init__(workingDir, options)
        #verify options mix
        self._zepHost = self.options.zepdbhost.lower().strip()
        self._zodbHost = self.options.zodb_host.lower().strip()
        #check to see if trying to do a partial backup when zep and zodb are on the same instance
        if (self._zepHost == self._zodbHost) and (self.options.backupZopeDb != self.options.backupEventsDb):
            self.log.error("Cannot exclude zep or zodb from backup when both are running on the same instance and using"
                           " enterprise backup option")
            raise ZenBackupException("Cannot exclude zep or zodb when using enterprise backup", True)

    def backupZodb(self):
        """
        Overrides to use enterprise backup tools if available
        @return:
        """

        self.log.info('Backing up the ZODB.')
        #do enterprise backup
        fileName = "zodb.mbi.gz"
        if self._zodbHost == self._zepHost:
            fileName = "all.mbi.gz"

        self._eBackupMySqlDb(fileName, self.options.zodb_host, self.options.zodb_port)

    def backupZepDb(self, full=True):
        # Only do enterprise backup if host is different than ZODB host, otherwise the ZODB MEB backup has zep tables
        if self._zodbHost != self._zepHost:
            if full:
                self.log.info('Backing up ZEP.')
                #do enterprise backup
                self._eBackupMySqlDb("zep.mbi.gz", self.options.zepdbhost, self.options.zepdbport)
            else:
                #allow partials when zodb not the same as zepdb
                super(EnterpriseBackup, self).backupZepDb(full=False)

    def backupZodbSession(self):
        """
        """
        #the enterprise backup took care of session backup, so don't do anything
        pass

    def _eBackupMySqlDb(self, mbiFile, host, port):
        cmd = [self._mebCmd, self._defaultsFile, self._backupDir] + self._opts + ["backup-to-image"]

        if is_db_remote(host):
            self.log.info("Remote enterprise backup of %s", host)
            cmd = ["ssh", "zenoss@" + host] + cmd

        with gzip.open(os.path.join(self.tempDir, mbiFile), 'wb') as gf:
            self.log.debug(' '.join(cmd))
            meb = subprocess.Popen(cmd, stdout=subprocess.PIPE)
            gf.writelines(meb.stdout)
            meb_rc = meb.wait()
            if meb_rc:
                raise ZenBackupException("Backup of (%s) failed." % mbiFile, True)
                # /opt/mysql/meb-3.8/bin/mysqlbackup --defaults-file=/opt/zends/etc/zends.cnf --user=root --no-locking
                # --backup-dir=/tmp/meb --backup-image=- --with-timestamp backup-to-image | gzip > blam.gz

    @property
    def _opts(self):
        return ["--user=root", "--no-locking", "--backup-image=-", "--with-timestamp"]

    @property
    def _backupDir(self):
        """working directory"""
        return "--backup-dir=/tmp/meb"

    @property
    def _mebCmd(self):
        return getEnterpriseToolPath(self.options)

    @property
    def _defaultsFile(self):
        return "--defaults-file=/opt/zends/etc/zends.cnf"


if __name__ == '__main__':
    zb = ZenBackup(sys.argv)
    if zb.doBackup():
        sys.exit(-1)
