from __future__ import absolute_import
from __future__ import with_statement

import errno
import select
import sys

from mock import Mock, patch
from time import time

from celery.worker import autoreload
from celery.worker.autoreload import (
    WorkerComponent,
    file_hash,
    BaseMonitor,
    StatMonitor,
    KQueueMonitor,
    InotifyMonitor,
    default_implementation,
    Autoreloader,
)

from celery.tests.utils import AppCase, Case, mock_open


class test_WorkerComponent(AppCase):

    def test_create(self):
        w = Mock()
        x = WorkerComponent(w)
        x.instantiate = Mock()
        r = x.create(w)
        x.instantiate.assert_called_with(w.autoreloader_cls,
                                         controller=w)
        self.assertIs(r, w.autoreloader)


class test_file_hash(Case):

    def test_hash(self):
        with mock_open() as a:
            a.write("the quick brown fox\n")
            a.seek(0)
            A = file_hash("foo")
        with mock_open() as b:
            b.write("the quick brown bar\n")
            b.seek(0)
            B = file_hash("bar")
        self.assertNotEqual(A, B)


class test_BaseMonitor(Case):

    def test_start_stop_on_change(self):
        x = BaseMonitor(["a", "b"])

        with self.assertRaises(NotImplementedError):
            x.start()
        x.stop()
        x.on_change([])
        x._on_change = Mock()
        x.on_change("foo")
        x._on_change.assert_called_with("foo")


class test_StatMonitor(Case):

    @patch("os.stat")
    def test_start(self, stat):

        class st(object):
            st_mtime = time()
        stat.return_value = st()
        x = StatMonitor(["a", "b"])
        calls = [0]

        def on_is_set():
            calls[0] += 1
            if calls[0] > 2:
                return True
            return False
        x.shutdown_event = Mock()
        x.shutdown_event.is_set.side_effect = on_is_set

        x.start()
        calls[0] = 0
        stat.side_effect = OSError()
        x.start()


class test_KQueueMontior(Case):

    @patch("select.kqueue", create=True)
    @patch("os.close")
    def test_stop(self, close, kqueue):
        x = KQueueMonitor(["a", "b"])
        x._kq = Mock()
        x.filemap["a"] = 10
        x.stop()
        x._kq.close.assert_called_with()
        close.assert_called_with(10)

        close.side_effect = OSError()
        close.side_effect.errno = errno.EBADF
        x.stop()

    @patch("select.kqueue", create=True)
    @patch("select.kevent", create=True)
    @patch("os.open")
    def test_start(self, osopen, kevent, kqueue):
        prev = {}
        flags = ["KQ_FILTER_VNODE", "KQ_EV_ADD", "KQ_EV_ENABLE",
                 "KQ_EV_CLEAR", "KW_NOTE_WRITE", "KQ_NOTE_EXTEND"]
        for i, flag in enumerate(flags):
            prev[flag] = getattr(select, flag, None)
            if not prev[flag]:
                setattr(select, flag, i)
        try:
            kq = kqueue.return_value = Mock()

            class ev(object):
                ident = 10
            kq.control.return_value = [ev()]
            x = KQueueMonitor(["a"])
            osopen.return_value = 10
            calls = [0]

            def on_is_set():
                calls[0] += 1
                if calls[0] > 2:
                    return True
                return False
            x.shutdown_event = Mock()
            x.shutdown_event.is_set.side_effect = on_is_set
            x.start()
        finally:
            for flag in flags:
                if not prev[flag]:
                    delattr(select, flag)


class test_InotifyMonitor(Case):

    @patch("celery.worker.autoreload.pyinotify")
    def test_start(self, inotify):
            x = InotifyMonitor(["a"])
            inotify.IN_MODIFY = 1
            inotify.IN_ATTRIB = 2
            x.start()

            inotify.WatchManager.side_effect = ValueError()
            with self.assertRaises(ValueError):
                x.start()
            x.stop()

            x._on_change = None
            x.process_(Mock())
            x._on_change = Mock()
            x.process_(Mock())
            self.assertTrue(x._on_change.called)


class test_default_implementation(Case):

    @patch("select.kqueue", create=True)
    def test_kqueue(self, kqueue):
        self.assertEqual(default_implementation(), "kqueue")

    @patch("celery.worker.autoreload.pyinotify")
    def test_inotify(self, pyinotify):
        kq = getattr(select, "kqueue", None)
        delattr(select, "kqueue")
        platform, sys.platform = sys.platform, "linux"
        try:
            self.assertEqual(default_implementation(), "inotify")
            ino, autoreload.pyinotify = autoreload.pyinotify, None
            try:
                self.assertEqual(default_implementation(), "stat")
            finally:
                autoreload.pyinotify = ino
        finally:
            if kq:
                select.kqueue = kq
            sys.platform = platform


class test_Autoreloader(AppCase):

    @patch("celery.worker.autoreload.file_hash")
    def test_start(self, fhash):
        x = Autoreloader(Mock(), modules=[__name__])
        x.Monitor = Mock()
        mon = x.Monitor.return_value = Mock()
        mon.start.side_effect = OSError()
        mon.start.side_effect.errno = errno.EINTR
        x.body()
        mon.start.side_effect.errno = errno.ENOENT
        with self.assertRaises(OSError):
            x.body()
        mon.start.side_effect = None
        x.body()

    @patch("celery.worker.autoreload.file_hash")
    def test_maybe_modified(self, fhash):
        fhash.return_value = "abcd"
        x = Autoreloader(Mock(), modules=[__name__])
        x._hashes = {}
        x._hashes[__name__] = "dcba"
        self.assertTrue(x._maybe_modified(__name__))
        x._hashes[__name__] = "abcd"
        self.assertFalse(x._maybe_modified(__name__))

    def test_on_change(self):
        x = Autoreloader(Mock(), modules=[__name__])
        mm = x._maybe_modified = Mock(0)
        mm.return_value = True
        x._reload = Mock()
        x._module_name = Mock()
        x.on_change([__name__])
        self.assertTrue(x._reload.called)
        mm.return_value = False
        x.on_change([__name__])

    def test_reload(self):
        x = Autoreloader(Mock(), modules=[__name__])
        x._reload([__name__])
        x.controller.reload.assert_called_with([__name__], reload=True)

    def test_stop(self):
        x = Autoreloader(Mock(), modules=[__name__])
        x._monitor = None
        x.stop()
        x._monitor = Mock()
        x.stop()
        x._monitor.stop.assert_called_with()

    def test_module_name(self):
        x = Autoreloader(Mock(), modules=[__name__])
        self.assertEqual(x._module_name("foo/bar/baz.py"), "baz")
