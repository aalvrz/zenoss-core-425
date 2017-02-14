#! /usr/bin/env python
##############################################################################
#
# Copyright (C) Zenoss, Inc. 2007, 2009, 2013 all rights reserved.
#
# This content is made available according to terms specified in
# License.zenoss under the directory where your Zenoss product is installed.
#
##############################################################################


__doc__ = '''zenrestore

Restores a zenoss backup created by zenbackup.
'''

import logging
import sys
import os
import subprocess
import tarfile
import ConfigParser
import gzip
from contextlib import contextmanager

import Globals
from zope.interface import Interface, implements
from ZCmdBase import ZCmdBase
from Products.ZenUtils.Utils import zenPath, binPath, requiresDaemonShutdown

from ZenBackupBase import *


class ZenRestore(ZenBackupBase):
    def __init__(self):
        ZenBackupBase.__init__(self)
        self.log = logging.getLogger("zenrestore")
        logging.basicConfig()
        if self.options.verbose:
            self.log.setLevel(10)
        else:
            self.log.setLevel(40)

    def buildOptions(self):
        """basic options setup sub classes can add more options here"""
        ZenBackupBase.buildOptions(self)

        self.parser.add_option('--file',
                               dest="file",
                               default=None,
                               help='File from which to restore.')
        self.parser.add_option('--dir',
                               dest="dir",
                               default=None,
                               help='Path to an untarred backup file'
                                    ' from which to restore.')
        self.parser.add_option('--no-zodb',
                               dest="restoreZODB",
                               default=True,
                               action='store_false',
                               help='Do not restore the ZODB.')
        self.parser.add_option('--no-eventsdb',
                               dest="restoreEvents",
                               default=True,
                               action='store_false',
                               help='Do not restore the events database.')
        self.parser.add_option('--no-perfdata',
                               dest="noPerfdata",
                               default=False,
                               action='store_true',
                               help='Do not restore performance data.')
        self.parser.add_option('--deletePreviousPerfData',
                               dest="deletePreviousPerfData",
                               default=False,
                               action='store_true',
                               help='Delete ALL existing performance data before restoring?')
        self.parser.add_option('--zenpacks',
                               dest='zenpacks',
                               default=False,
                               action='store_true',
                               help=('Experimental: Restore any ZenPacks in '
                                     'the backup. Some ZenPacks may not work '
                                     'properly. Reinstall ZenPacks if possible'))
        self.parser.add_option('--enterprise-dbctl',
                               dest="dbctl",
                               default="/opt/zends/bin/zendsctl",
                               help='Command used to start/stop the database for restoring enterprise backups')


    def getSettings(self):
        """ Retrieve some options from settings file
        We want to take them in the following priority:
            1.  command line
            2.  settings file
            3.  defaults from build options
        """
        try:
            f = open(os.path.join(self.tempDir, CONFIG_FILE), 'r')
        except Exception:
            return
        try:
            config = ConfigParser.SafeConfigParser()
            config.readfp(f)
            for name, value in config.items(CONFIG_SECTION):
                # If we have a config, then change the default to match the config.
                if name in self.parser.defaults:
                    self.parser.defaults[name] = value
                else:
                    #we don't have that option with a default, so create it now
                    self.parser.add_option('--' + name,
                                           dest=name,
                                           default=value)
                    #now reparse the command line to bring in anything the user actually set or the new defaults we created.
            (self.options, self.args) = self.parser.parse_args(args=self.inputArgs)
        finally:
            f.close()

    def restoreZODB(self, restore):
        # Relstorage may have already loaded items into the cache in the
        # initial connection to the database. We have to expire everything
        # in the cache in order to prevent errors with overlapping
        # transactions from the backup.
        if self.options.zodb_cacheservers:
            self.flush_memcached(self.options.zodb_cacheservers.split())
        restore.restoreZODB()

    def restoreEtcFiles(self):
        self.msg('Restoring config files.')
        cmd = 'cp -p %s %s' % (os.path.join(zenPath('etc'), 'global.conf'), self.tempDir)
        if os.system(cmd):
            return -1
        cmd = 'tar Cxf %s %s' % (
            zenPath(),
            os.path.join(self.tempDir, 'etc.tar')
        )
        if os.system(cmd):
            return -1
        if not os.path.exists(os.path.join(zenPath('etc'), 'global.conf')):
            self.msg('Restoring default global.conf')
            cmd = 'mv %s %s' % (os.path.join(self.tempDir, 'global.conf'), zenPath('etc'))
            if os.system(cmd):
                return -1

    def restoreZenPacks(self):
        self.msg('Restoring ZenPacks.')
        cmd = 'rm -rf %s' % zenPath('ZenPacks')
        if os.system(cmd):
            return -1
        cmd = 'tar Cxf %s %s' % (
            zenPath(),
            os.path.join(self.tempDir, 'ZenPacks.tar'))
        if os.system(cmd):
            return -1
            # restore bin dir when restoring zenpacks
        #make sure bin dir is in tar
        tempBin = os.path.join(self.tempDir, 'bin.tar')
        if os.path.isfile(tempBin):
            self.msg('Restoring bin dir.')
            #k option prevents overwriting existing bin files
            cmd = ['tar', 'Cxfk', zenPath(),
                   os.path.join(self.tempDir, 'bin.tar')]
            runCommand(cmd)

    def restoreZenPackContents(self):
        dmd = ZCmdBase(noopts=True).dmd
        self.log.info("Restoring ZenPack contents.")
        for pack in dmd.ZenPackManager.packs():
            pack.restore(self.tempDir, self.log)
        self.log.info("ZenPack contents restored.")

    def restorePerfData(self):
        cmd = 'rm -rf %s' % os.path.join(zenPath(), 'perf')
        if os.system(cmd):
            return -1
        self.msg('Restoring performance data.')
        cmd = 'tar Cxf %s %s' % (
            zenPath(),
            os.path.join(self.tempDir, 'perf.tar'))
        if os.system(cmd):
            return -1

    def doRestore(self):
        """
        Restore from a previous backup
        """

        if self.options.file and self.options.dir:
            sys.stderr.write('You cannot specify both --file and --dir.\n')
            sys.exit(-1)
        elif not self.options.file and not self.options.dir:
            sys.stderr.write('You must specify either --file or --dir.\n')
            sys.exit(-1)

        # Maybe check to see if zeo is up and tell user to quit zenoss first
        rootTempDir = ''
        if self.options.file:
            if not os.path.isfile(self.options.file):
                sys.stderr.write('The specified backup file does not exist: %s\n' %
                                 self.options.file)
                sys.exit(-1)
                # Create temp dir and untar backup into it
            self.msg('Unpacking backup file')
            rootTempDir = self.getTempDir()
            cmd = 'tar xzfC %s %s' % (self.options.file, rootTempDir)
            if os.system(cmd):
                return -1
            self.tempDir = os.path.join(rootTempDir, BACKUP_DIR)
        else:
            self.msg('Using %s as source of restore' % self.options.dir)
            if not os.path.isdir(self.options.dir):
                sys.stderr.write('The specified backup directory does not exist:'
                                 ' %s\n' % self.options.dir)
                sys.exit(-1)
            self.tempDir = self.options.dir

        # Maybe use values from backup file as defaults for self.options.
        self.getSettings()

        # Setup defaults for db info
        if self.options.fetchArgs:
            self.log.info('Getting ZEP dbname, user, password, port from configuration files.')
            self.readZEPSettings()

        #get restore impl after settings have been read to allow for validation
        restoreFactory = CoreBackupRestoreFactory()
        restore = restoreFactory.getRestoreImpl(self.tempDir, self.options)

        if self.options.zenpacks and not restore.hasZODBBackup():
            sys.stderr.write('Archive does not contain ZODB backup; cannot'
                             'restore ZenPacks')
            sys.exit(-1)

        #Check to make sure that zenoss has been stopped
        output = subprocess.Popen(["zenoss", "status"],
                                  stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE)
        if "pid=" in output.communicate()[0]:
            sys.stderr.write("Please stop all Zenoss daemons and run zenrestore again\n")
            sys.exit(-1)

        # ZODB
        self.restoreZODB(restore)

        # Configuration
        self.restoreEtcFiles()

        # ZenPacks
        if self.options.zenpacks:
            tempPacks = os.path.join(self.tempDir, 'ZenPacks.tar')
            if os.path.isfile(tempPacks):
                self.restoreZenPacks()
            else:
                self.msg('Backup contains no ZenPacks.')

        # Allow each installed ZenPack to restore state from the backup
        self.restoreZenPackContents()

        # Performance Data
        tempPerf = os.path.join(self.tempDir, 'perf.tar')
        if os.path.isfile(tempPerf):
            self.restorePerfData()
        else:
            self.msg('Backup contains no perf data.')

        restore.restoreZEP()

        # clean up
        if self.options.file:
            self.msg('Cleaning up temporary files.')
            cmd = 'rm -r %s' % rootTempDir
            if os.system(cmd):
                return -1

        self.msg('Restore complete.')
        # TODO: Audit from command-line without zenpacks loaded.
        # audit('Shell.Backup.Restore', file=self.options.file,
        #       dir=self.options.dir, zenpacks=self.options.zenpacks)
        return 0

    def flush_memcached(self, cacheservers):
        self.msg('Flushing memcached cache.')
        import memcache

        mc = memcache.Client(cacheservers, debug=0)
        mc.flush_all()
        mc.disconnect_all()
        self.msg('Completed flushing memcached cache.')


def getBackupFile(workingDir, filename):
    """
    Find path to a file in backup, trying gzipped versions
    Returns path to real file, or none if nothing found
    """
    pathFile = os.path.join(workingDir, filename)
    for path in (pathFile, pathFile + '.gz'):
        if os.path.isfile(path):
            return path
    return None


class IBackupRestore(Interface):
    def hasZODBBackup(self):
        """
        does the backup of a zodb backup
        @return: boolean
        """


class CoreBackupRestoreFactory(object):
    """
    Creates an implementation of IBackupRestore
    """

    def getRestoreImpl(self, workingDir, options):
        """
        @param workingDir: director for backup files
        @param options: Options passed in via command line
        @return:
        """
        #if backup has enterprise backup files and doing db restore
        if options.restoreEvents or options.restoreZODB:
            for fileName in ("all.mbi", "zodb.mbi", "zep.mbi"):
                if getBackupFile(workingDir, fileName):
                    print("Using enterprise backup")
                    return EnterpriseRestore(workingDir, options)

        return CoreBackupRestore(workingDir, options)


class CoreBackupRestore(object):
    implements(IBackupRestore)

    def __init__(self, workingDir, options):
        self.tempDir = workingDir
        self.options = options

    def msg(self, msg):
        """
        If --verbose then send msg to stdout
        """
        if self.options.verbose:
            print(msg)

    def hasZODBBackup(self):
        """
        does the backup of a zodb backup
        @return: boolean
        """
        return self.hasZeoBackup() or self.hasSqlBackup()

    def hasZeoBackup(self):
        repozoDir = os.path.join(self.tempDir, 'repozo')
        return os.path.isdir(repozoDir)

    def hasSqlBackup(self):
        return bool(self.getSqlFile('zodb.sql'))

    def getSqlFile(self, filename):
        """
        Find path to sql file in backup, trying gzipped versions
        Returns path to real file, or none if nothing found
        """
        return getBackupFile(self.tempDir, filename)

    def restoreZODB(self):
        if self.hasSqlBackup():
            self.restoreZODBSQL()
            self.restoreZODBSessionSQL()
        elif self.hasZeoBackup():
            self.restoreZODBZEO()
        else:
            self.msg('Archive does not contain a ZODB backup')

    def restoreZODBSQL(self):
        zodbSql = self.getSqlFile('zodb.sql')
        if not zodbSql:
            self.msg('This archive does not contain a ZODB backup.')
            return
        self.msg('Restoring ZODB database.')
        self.restoreMySqlDb(self.options.zodb_host, self.options.zodb_port,
                            self.options.zodb_db, self.options.zodb_user,
                            getPassArg(self.options, 'zodb_password'), zodbSql,
                            socket=self.options.zodb_socket)
        self.msg('Done Restoring ZODB database.')

    def restoreZODBSessionSQL(self):
        zodbSessionSql = self.getSqlFile('zodb_session.sql')
        if not zodbSessionSql:
            self.msg('This archive does not contain a ZODB session backup.')
            return
        self.msg('Restoring ZODB session database.')
        self.restoreMySqlDb(self.options.zodb_host, self.options.zodb_port,
                            self.options.zodb_db + "_session",
                            self.options.zodb_user,
                            getPassArg(self.options, 'zodb_password'), zodbSessionSql,
                            socket=self.options.zodb_socket)
        self.msg('Done Restoring ZODB session database.')

    def restoreMySqlDb(self, host, port, db, user, passwd, sqlFile, socket=None):
        """
        Create MySQL database if it doesn't exist.
        """
        mysql_cmd = ['mysql', '-u%s' % user]
        mysql_cmd.extend(passwd)
        if host and host != 'localhost':
            mysql_cmd.extend(['--host', host])
            if self.options.compressTransport:
                mysql_cmd.append('--compress')
        if port and str(port) != '3306':
            mysql_cmd.extend(['--port', str(port)])
        if socket:
            mysql_cmd.extend(['--socket', socket])

        mysql_cmd = subprocess.list2cmdline(mysql_cmd)

        cmd = 'echo "create database if not exists %s" | %s' % (db, mysql_cmd)
        os.system(cmd)

        sql_path = os.path.join(self.tempDir, sqlFile)
        if sqlFile.endswith('.gz'):
            cmd_fmt = "gzip -dc {sql_path}"
        else:
            cmd_fmt = "cat {sql_path}"
        cmd_fmt += " | {mysql_cmd} {db}"
        cmd = cmd_fmt.format(**locals())
        os.system(cmd)

    def restoreZODBZEO(self):
        repozoDir = os.path.join(self.tempDir, 'repozo')
        tempFilePath = os.path.join(self.tempDir, 'Data.fs')
        tempZodbConvert = os.path.join(self.tempDir, 'convert.conf')

        self.msg('Restoring ZEO backup into MySQL.')

        # Create a Data.fs from the repozo backup
        cmd = [binPath('repozo'), '--recover', '--repository', repozoDir, '--output', tempFilePath]

        rc = subprocess.call(cmd, stdout=PIPE, stderr=PIPE)
        if rc:
            return -1

        # Now we have a Data.fs, restore into MySQL with zodbconvert
        zodbconvert_conf = open(tempZodbConvert, 'w')
        zodbconvert_conf.write('<filestorage source>\n')
        zodbconvert_conf.write('  path %s\n' % tempFilePath)
        zodbconvert_conf.write('</filestorage>\n\n')

        zodbconvert_conf.write('<relstorage destination>\n')
        zodbconvert_conf.write('  <mysql>\n')
        zodbconvert_conf.write('    host %s\n' % self.options.zodb_host)
        zodbconvert_conf.write('    port %s\n' % self.options.zodb_port)
        zodbconvert_conf.write('    db %s\n' % self.options.zodb_db)
        zodbconvert_conf.write('    user %s\n' % self.options.zodb_user)
        zodbconvert_conf.write('    passwd %s\n' % self.options.zodb_password or '')
        if self.options.zodb_socket:
            zodbconvert_conf.write('    unix_socket %s\n' % self.options.zodb_socket)
        zodbconvert_conf.write('  </mysql>\n')
        zodbconvert_conf.write('</relstorage>\n')
        zodbconvert_conf.close()

        rc = subprocess.call(['zodbconvert', '--clear', tempZodbConvert],
                             stdout=PIPE, stderr=PIPE)
        if rc:
            return -1

    def restoreZEP(self):
        """
        Restore ZEP DB and indexes
        """
        if self.options.restoreEvents:
            self._restoreZEP()
        else:
            self.msg('Skipping the events database.')

    @requiresDaemonShutdown('zeneventserver')
    def _restoreZEP(self):
        """
        Restore ZEP DB and indexes
        """
        self._restoreZEPDB()
        self._restoreZEPIndexes()

    def _restoreZEPDB(self):
        zepSql = self.getSqlFile('zep.sql')
        if not zepSql:
            self.msg('This backup does not contain a ZEP database backup.')
            return

        self.msg('Restoring ZEP database.')
        self.restoreMySqlDb(self.options.zepdbhost, self.options.zepdbport,
                            self.options.zepdbname, self.options.zepdbuser,
                            getPassArg(self.options, 'zepdbpass'), zepSql)
        self.msg('ZEP database restored.')

    def _restoreZEPIndexes(self):
        # Remove any current indexes on the system
        index_dir = zenPath('var', 'zeneventserver', 'index')
        if os.path.isdir(index_dir):
            import shutil

            self.msg('Removing existing ZEP indexes.')
            shutil.rmtree(index_dir)

        index_tar = os.path.join(self.tempDir, 'zep.tar')
        if os.path.isfile(index_tar):
            self.msg('Restoring ZEP indexes.')
            zepTar = tarfile.open(os.path.join(self.tempDir, 'zep.tar'))
            zepTar.extractall(zenPath('var'))
            self.msg('ZEP indexes restored.')
        else:
            self.msg('ZEP indexes not found in backup file - will be recreated from database.')


class EnterpriseRestore(CoreBackupRestore):
    implements(IBackupRestore)

    def __init__(self, workingDir, options):
        super(EnterpriseRestore, self).__init__(workingDir, options)
        self._hasAllBackup = getBackupFile(workingDir, "all.mbi")
        self._hasZepBackup = getBackupFile(workingDir, "zep.mbi")
        self._hasZodbBackup = getBackupFile(workingDir, "zodb.mbi")
        if self._hasAllBackup:
            if self.options.restoreEvents != self.options.restoreZODB:
                sys.stderr.write('Backup contains single archive of events and zodb, cannot restore separately.\n')
                sys.exit(-1)
        elif self._hasZepBackup and self._hasZodbBackup:
            zepHost = self.options.zepdbhost.lower().strip()
            zodbHost = self.options.zodb_host.lower().strip()
            if self.options.restoreEvents and self.options.restoreZODB and zepHost == zodbHost:
                sys.stderr.write(
                    'Backup was from separately running zodb and events database, cannot recombine to same database.\n')
                sys.exit(-1)

    def hasZODBBackup(self):
        """
        does the backup of a zodb backup
        @return: boolean
        """
        return self._hasAllBackup or self._hasZodbBackup

    def restoreZODB(self):
        #do meb restore
        mbi = "zodb.mbi"
        if self._hasAllBackup:
            mbi = "all.mbi"
        self._restoreDB(mbi, self.options.zodb_host, self.options.zodb_port)

    def _restoreZEPDB(self):
        """
        Restore ZEP DB
        """
        #if all backkup it was already done
        if not self._hasAllBackup:
            mbi = "zep.mbi"
            self._restoreDB(mbi, self.options.zepdbhost, self.options.zepdbport)

    def _restoreDB(self, imageFile, host, port):
        mbi = getBackupFile(self.tempDir, imageFile)

        with gzip.open(os.path.join(self.tempDir, mbi), 'r') as gf:
            command = [self._mebCmd] + self._opts + ["copy-back-and-apply-log"]
            remoteHost = None
            if is_db_remote(host):
                prefix = ["ssh", "zenoss@" + host]
                command = prefix + command
                remoteHost = host
                #create a tmp dir on remote machine
                runCommand(prefix + [ "mkdir", "-p", self.tempDir])
                self.msg("Remote enterprise restore of %s" % (host,))
            else:
                self.msg("Running enterprise restore:")

            self.msg(" ".join(command))
            with zendsoff(self.options.dbctl, remoteHost):
                data = subprocess.Popen(command, stdin=subprocess.PIPE)
                for line in gf:
                    data.stdin.write(line)
                returnCode = data.wait()
            if returnCode:
                sys.stderr.write("Restore had errors\n")
                sys.exit(1)

    @property
    def _opts(self):
        return [self._defaultsFile, "-uroot", self._backupDir, "--backup-image=-", "--innodb-log-files-in-group=2"]

    @property
    def _backupDir(self):
        return "--backup-dir=%s" % (self.tempDir,)

    @property
    def _defaultsFile(self):
        return "--defaults-file=/opt/zends/etc/zends.cnf"

    @property
    def _mebCmd(self):
        return getEnterpriseToolPath(self.options)


@contextmanager
def zendsoff(dbctl, host=None):
    """

    @param host: host to run on if remote
    @return:
    """
    print "Shutting down zends"
    prefix = []
    if host:
        prefix = ["ssh", "zenoss@" + host]
    output, warnings, returncode = runCommand(prefix + [dbctl, "stop"])
    if returncode:
        print(output)
        sys.stderr.write(warnings)
        sys.exit(1)
    try:
        yield
    finally:
        print "starting  zends"
        output, warnings, returncode = runCommand(prefix + [dbctl, "start"])
        if returncode:
            print(output)
            sys.stderr.write(warnings)
            sys.exit(1)


if __name__ == '__main__':
    zb = ZenRestore()
    if zb.doRestore():
        sys.exit(-1)
