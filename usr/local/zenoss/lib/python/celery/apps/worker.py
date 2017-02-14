# -*- coding: utf-8 -*-
from __future__ import absolute_import

import atexit
import logging
import os
import socket
import sys
import warnings

from functools import partial

from billiard import cpu_count, current_process

from celery import __version__, platforms, signals
from celery.app import app_or_default
from celery.app.abstract import configurated, from_config
from celery.exceptions import ImproperlyConfigured, SystemTerminate
from celery.utils import cry, isatty
from celery.utils.imports import qualname
from celery.utils.log import LOG_LEVELS, get_logger, mlevel
from celery.utils.text import pluralize
from celery.worker import WorkController

try:
    from greenlet import GreenletExit
    IGNORE_ERRORS = (GreenletExit, )
except ImportError:
    IGNORE_ERRORS = ()

logger = get_logger(__name__)


BANNER = """
 -------------- celery@%(hostname)s v%(version)s
---- **** -----
--- * ***  * -- [Configuration]
-- * - **** ---   . broker:      %(conninfo)s
- ** ----------   . loader:      %(loader)s
- ** ----------   . logfile:     %(logfile)s@%(loglevel)s
- ** ----------   . concurrency: %(concurrency)s
- ** ----------   . events:      %(events)s
- *** --- * ---   . beat:        %(celerybeat)s
-- ******* ----
--- ***** ----- [Queues]
 --------------   %(queues)s
"""

EXTRA_INFO_FMT = """
[Tasks]
%(tasks)s
"""

UNKNOWN_QUEUE_ERROR = """\
Trying to select queue subset of %r, but queue %s is not
defined in the CELERY_QUEUES setting.

If you want to automatically declare unknown queues you can
enable the CELERY_CREATE_MISSING_QUEUES setting.
"""


class Worker(configurated):
    WorkController = WorkController

    app = None
    inherit_confopts = (WorkController, )
    loglevel = from_config("log_level")
    redirect_stdouts = from_config()
    redirect_stdouts_level = from_config()

    def __init__(self, hostname=None, discard=False, embed_clockservice=False,
            queues=None, include=None, app=None, pidfile=None,
            autoscale=None, autoreload=False, **kwargs):
        self.app = app = app_or_default(app or self.app)
        self.hostname = hostname or socket.gethostname()

        # this signal can be used to set up configuration for
        # workers by name.
        signals.celeryd_init.send(sender=self.hostname, instance=self,
                                  conf=self.app.conf)

        self.setup_defaults(kwargs, namespace="celeryd")
        if not self.concurrency:
            try:
                self.concurrency = cpu_count()
            except NotImplementedError:
                self.concurrency = 2
        self.discard = discard
        self.embed_clockservice = embed_clockservice
        if self.app.IS_WINDOWS and self.embed_clockservice:
            self.die("-B option does not work on Windows.  "
                     "Please run celerybeat as a separate service.")
        self.use_queues = [] if queues is None else queues
        self.queues = None
        self.include = [] if include is None else include
        self.pidfile = pidfile
        self.autoscale = None
        self.autoreload = autoreload
        if autoscale:
            max_c, _, min_c = autoscale.partition(",")
            self.autoscale = [int(max_c), min_c and int(min_c) or 0]
        self._isatty = isatty(sys.stdout)

        self.colored = app.log.colored(self.logfile)

        if isinstance(self.use_queues, basestring):
            self.use_queues = self.use_queues.split(",")
        if isinstance(self.include, basestring):
            self.include = self.include.split(",")

        try:
            self.loglevel = mlevel(self.loglevel)
        except KeyError:
            self.die("Unknown level %r. Please use one of %s." % (
                        self.loglevel,
                        "|".join(l for l in LOG_LEVELS.keys()
                                    if isinstance(l, basestring))))

    def run(self):
        self.init_loader()
        self.init_queues()
        self.worker_init()
        self.redirect_stdouts_to_logger()

        if getattr(os, "getuid", None) and os.getuid() == 0:
            warnings.warn(RuntimeWarning(
                "Running celeryd with superuser privileges is discouraged!"))

        if self.discard:
            self.purge_messages()

        # Dump configuration to screen so we have some basic information
        # for when users sends bug reports.
        print(str(self.colored.cyan(" \n", self.startup_info())) +
              str(self.colored.reset(self.extra_info())))
        self.set_process_status("-active-")

        try:
            self.run_worker()
        except IGNORE_ERRORS:
            pass

    def on_consumer_ready(self, consumer):
        signals.worker_ready.send(sender=consumer)
        print("celery@%s has started." % self.hostname)

    def init_queues(self):
        try:
            self.app.select_queues(self.use_queues)
        except KeyError, exc:
            raise ImproperlyConfigured(
                        UNKNOWN_QUEUE_ERROR % (self.use_queues, exc))

    def init_loader(self):
        self.loader = self.app.loader
        self.settings = self.app.conf
        for module in self.include:
            self.loader.import_task_module(module)

    def redirect_stdouts_to_logger(self):
        self.app.log.setup(self.loglevel, self.logfile,
                           self.redirect_stdouts,
                           self.redirect_stdouts_level)

    def purge_messages(self):
        count = self.app.control.discard_all()
        print("discard: Erased %d %s from the queue.\n" % (
                count, pluralize(count, "message")))

    def worker_init(self):
        # Run the worker init handler.
        # (Usually imports task modules and such.)
        self.loader.init_worker()

    def tasklist(self, include_builtins=True):
        tasklist = self.app.tasks.keys()
        if not include_builtins:
            tasklist = filter(lambda s: not s.startswith("celery."),
                              tasklist)
        return "\n".join("  . %s" % task for task in sorted(tasklist))

    def extra_info(self):
        if self.loglevel <= logging.INFO:
            include_builtins = self.loglevel <= logging.DEBUG
            tasklist = self.tasklist(include_builtins=include_builtins)
            return EXTRA_INFO_FMT % {"tasks": tasklist}
        return ""

    def startup_info(self):
        app = self.app
        concurrency = self.concurrency
        if self.autoscale:
            cmax, cmin = self.autoscale
            concurrency = "{min=%s, max=%s}" % (cmin, cmax)
        return BANNER % {
            "hostname": self.hostname,
            "version": __version__,
            "conninfo": self.app.broker_connection().as_uri(),
            "concurrency": concurrency,
            "loglevel": LOG_LEVELS[self.loglevel],
            "logfile": self.logfile or "[stderr]",
            "celerybeat": "ON" if self.embed_clockservice else "OFF",
            "events": "ON" if self.send_events else "OFF",
            "loader": qualname(self.loader),
            "queues": app.amqp.queues.format(indent=18, indent_first=False),
        }

    def run_worker(self):
        if self.pidfile:
            pidlock = platforms.create_pidlock(self.pidfile).acquire()
            atexit.register(pidlock.release)
        worker = self.WorkController(app=self.app,
                                    hostname=self.hostname,
                                    ready_callback=self.on_consumer_ready,
                                    embed_clockservice=self.embed_clockservice,
                                    autoscale=self.autoscale,
                                    autoreload=self.autoreload,
                                    **self.confopts_as_dict())
        self.install_platform_tweaks(worker)
        signals.worker_init.send(sender=worker)
        worker.start()

    def install_platform_tweaks(self, worker):
        """Install platform specific tweaks and workarounds."""
        if self.app.IS_OSX:
            self.osx_proxy_detection_workaround()

        # Install signal handler so SIGHUP restarts the worker.
        if not self._isatty:
            # only install HUP handler if detached from terminal,
            # so closing the terminal window doesn't restart celeryd
            # into the background.
            if self.app.IS_OSX:
                # OS X can't exec from a process using threads.
                # See http://github.com/ask/celery/issues#issue/152
                install_HUP_not_supported_handler(worker)
            else:
                install_worker_restart_handler(worker)
        install_worker_term_handler(worker)
        install_worker_term_hard_handler(worker)
        install_worker_int_handler(worker)
        install_cry_handler()
        install_rdb_handler()

    def osx_proxy_detection_workaround(self):
        """See http://github.com/ask/celery/issues#issue/161"""
        os.environ.setdefault("celery_dummy_proxy", "set_by_celeryd")

    def set_process_status(self, info):
        info = "%s (%s)" % (info, platforms.strargv(sys.argv))
        return platforms.set_mp_process_title("celeryd",
                                              info=info,
                                              hostname=self.hostname)

    def die(self, msg, exitcode=1):
        sys.stderr.write("Error: %s\n" % (msg, ))
        sys.exit(exitcode)


def _shutdown_handler(worker, sig="TERM", how="stop", exc=SystemExit,
        callback=None):
    types = {"terminate": "Cold", "stop": "Warm"}

    def _handle_request(signum, frame):
        process_name = current_process()._name
        if not process_name or process_name == "MainProcess":
            if callback:
                callback(worker)
            print("celeryd: %s shutdown (%s)" % (types[how], process_name, ))
            getattr(worker, how)(in_sighandler=True)
        raise exc()
    _handle_request.__name__ = "worker_" + how
    platforms.signals[sig] = _handle_request
install_worker_term_handler = partial(
    _shutdown_handler, sig="SIGTERM", how="stop", exc=SystemExit,
)
install_worker_term_hard_handler = partial(
    _shutdown_handler, sig="SIGQUIT", how="terminate", exc=SystemTerminate,
)


def on_SIGINT(worker):
    print("celeryd: Hitting Ctrl+C again will terminate all running tasks!")
    install_worker_term_hard_handler(worker, sig="SIGINT")
install_worker_int_handler = partial(
    _shutdown_handler, sig="SIGINT", callback=on_SIGINT
)


def install_worker_restart_handler(worker, sig="SIGHUP"):

    def restart_worker_sig_handler(signum, frame):
        """Signal handler restarting the current python program."""
        print("Restarting celeryd (%s)" % (" ".join(sys.argv), ))
        worker.stop(in_sighandler=True)
        os.execv(sys.executable, [sys.executable] + sys.argv)
    platforms.signals[sig] = restart_worker_sig_handler


def install_cry_handler():
    # Jython/PyPy does not have sys._current_frames
    is_jython = sys.platform.startswith("java")
    is_pypy = hasattr(sys, "pypy_version_info")
    if not (is_jython or is_pypy):

        def cry_handler(signum, frame):
            """Signal handler logging the stacktrace of all active threads."""
            logger.error("\n" + cry())
        platforms.signals["SIGUSR1"] = cry_handler


def install_rdb_handler(envvar="CELERY_RDBSIG", sig="SIGUSR2"):

    def rdb_handler(signum, frame):
        """Signal handler setting a rdb breakpoint at the current frame."""
        from celery.contrib import rdb
        rdb.set_trace(frame)
    if os.environ.get(envvar):
        platforms.signals[sig] = rdb_handler


def install_HUP_not_supported_handler(worker, sig="SIGHUP"):

    def warn_on_HUP_handler(signum, frame):
        logger.error("%(sig)s not supported: Restarting with %(sig)s is "
            "unstable on this platform!" % {"sig": sig})
    platforms.signals[sig] = warn_on_HUP_handler
