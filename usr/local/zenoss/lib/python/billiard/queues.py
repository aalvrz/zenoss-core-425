#
# Module implementing queues
#
# multiprocessing/queues.py
#
# Copyright (c) 2006-2008, R Oudkerk
# All rights reserved.
#
# Redistribution and use in source and binary forms, with or without
# modification, are permitted provided that the following conditions
# are met:
#
# 1. Redistributions of source code must retain the above copyright
#    notice, this list of conditions and the following disclaimer.
# 2. Redistributions in binary form must reproduce the above copyright
#    notice, this list of conditions and the following disclaimer in the
#    documentation and/or other materials provided with the distribution.
# 3. Neither the name of author nor the names of any contributors may be
#    used to endorse or promote products derived from this software
#    without specific prior written permission.
#
# THIS SOFTWARE IS PROVIDED BY THE AUTHOR AND CONTRIBUTORS "AS IS" AND
# ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
# IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
# ARE DISCLAIMED.  IN NO EVENT SHALL THE AUTHOR OR CONTRIBUTORS BE LIABLE
# FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
# DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS
# OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
# HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
# LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY
# OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
# SUCH DAMAGE.
#
from __future__ import absolute_import
from __future__ import with_statement

__all__ = ['Queue', 'SimpleQueue', 'JoinableQueue']

import sys
import os
import threading
import collections
import time
import weakref
import errno

from Queue import Empty, Full

from . import Pipe
from ._ext import _billiard
from .synchronize import Lock, BoundedSemaphore, Semaphore, Condition
from .util import debug, error, info, Finalize, register_after_fork
from .forking import assert_spawning


class Queue(object):
    '''
    Queue type using a pipe, buffer and thread
    '''
    def __init__(self, maxsize=0):
        if maxsize <= 0:
            maxsize = _billiard.SemLock.SEM_VALUE_MAX
        self._maxsize = maxsize
        self._reader, self._writer = Pipe(duplex=False)
        self._rlock = Lock()
        self._opid = os.getpid()
        if sys.platform == 'win32':
            self._wlock = None
        else:
            self._wlock = Lock()
        self._sem = BoundedSemaphore(maxsize)
        # For use by concurrent.futures
        self._ignore_epipe = False

        self._after_fork()

        if sys.platform != 'win32':
            register_after_fork(self, Queue._after_fork)

    def __getstate__(self):
        assert_spawning(self)
        return (self._ignore_epipe, self._maxsize, self._reader, self._writer,
                self._rlock, self._wlock, self._sem, self._opid)

    def __setstate__(self, state):
        (self._ignore_epipe, self._maxsize, self._reader, self._writer,
         self._rlock, self._wlock, self._sem, self._opid) = state
        self._after_fork()

    def _after_fork(self):
        debug('Queue._after_fork()')
        self._notempty = threading.Condition(threading.Lock())
        self._buffer = collections.deque()
        self._thread = None
        self._jointhread = None
        self._joincancelled = False
        self._closed = False
        self._close = None
        self._send = self._writer.send
        self._recv = self._reader.recv
        self._poll = self._reader.poll

    def put(self, obj, block=True, timeout=None):
        assert not self._closed
        if not self._sem.acquire(block, timeout):
            raise Full

        with self._notempty:
            if self._thread is None:
                self._start_thread()
            self._buffer.append(obj)
            self._notempty.notify()

    def get(self, block=True, timeout=None):
        if block and timeout is None:
            with self._rlock:
                res = self._recv()
                self._sem.release()
                return res

        else:
            if block:
                deadline = time.time() + timeout
            if not self._rlock.acquire(block, timeout):
                raise Empty
            try:
                if block:
                    timeout = deadline - time.time()
                    if timeout < 0 or not self._poll(timeout):
                        raise Empty
                elif not self._poll():
                    raise Empty
                res = self._recv()
                self._sem.release()
                return res
            finally:
                self._rlock.release()

    def qsize(self):
        # Raises NotImplementedError on Mac OSX because
        # of broken sem_getvalue()
        return self._maxsize - self._sem._semlock._get_value()

    def empty(self):
        return not self._poll()

    def full(self):
        return self._sem._semlock._is_zero()

    def get_nowait(self):
        return self.get(False)

    def put_nowait(self, obj):
        return self.put(obj, False)

    def close(self):
        self._closed = True
        self._reader.close()
        if self._close:
            self._close()

    def join_thread(self):
        debug('Queue.join_thread()')
        assert self._closed
        if self._jointhread:
            self._jointhread()

    def cancel_join_thread(self):
        debug('Queue.cancel_join_thread()')
        self._joincancelled = True
        try:
            self._jointhread.cancel()
        except AttributeError:
            pass

    def _start_thread(self):
        debug('Queue._start_thread()')

        # Start thread which transfers data from buffer to pipe
        self._buffer.clear()
        self._thread = threading.Thread(
            target=Queue._feed,
            args=(self._buffer, self._notempty, self._send,
                  self._wlock, self._writer.close, self._ignore_epipe),
            name='QueueFeederThread'
            )
        self._thread.daemon = True

        debug('doing self._thread.start()')
        self._thread.start()
        debug('... done self._thread.start()')

        # On process exit we will wait for data to be flushed to pipe.
        #
        # However, if this process created the queue then all
        # processes which use the queue will be descendants of this
        # process.  Therefore waiting for the queue to be flushed
        # is pointless once all the child processes have been joined.
        created_by_this_process = (self._opid == os.getpid())
        if not self._joincancelled and not created_by_this_process:
            self._jointhread = Finalize(
                self._thread, Queue._finalize_join,
                [weakref.ref(self._thread)],
                exitpriority=-5
                )

        # Send sentinel to the thread queue object when garbage collected
        self._close = Finalize(
            self, Queue._finalize_close,
            [self._buffer, self._notempty],
            exitpriority=10
            )

    @staticmethod
    def _finalize_join(twr):
        debug('joining queue thread')
        thread = twr()
        if thread is not None:
            thread.join()
            debug('... queue thread joined')
        else:
            debug('... queue thread already dead')

    @staticmethod
    def _finalize_close(buffer, notempty):
        debug('telling queue thread to quit')
        with notempty:
            buffer.append(_sentinel)
            notempty.notify()

    @staticmethod
    def _feed(buffer, notempty, send, writelock, close, ignore_epipe):
        debug('starting thread to feed data to pipe')
        from .util import is_exiting

        ncond = notempty
        nwait = notempty.wait
        bpopleft = buffer.popleft
        sentinel = _sentinel
        if sys.platform != 'win32':
            wlock = writelock
        else:
            wlock = None

        try:
            while 1:
                with ncond:
                    if not buffer:
                        nwait()
                try:
                    while 1:
                        obj = bpopleft()
                        if obj is sentinel:
                            debug('feeder thread got sentinel -- exiting')
                            close()
                            return

                        if wlock is None:
                            send(obj)
                        else:
                            with wlock:
                                send(obj)
                except IndexError:
                    pass
        except Exception, e:
            if ignore_epipe and getattr(e, 'errno', 0) == errno.EPIPE:
                return
            # Since this runs in a daemon thread the resources it uses
            # may be become unusable while the process is cleaning up.
            # We ignore errors which happen after the process has
            # started to cleanup.
            try:
                if is_exiting():
                    info('error in queue thread: %r', e, exc_info=True)
                else:
                    if not error('error in queue thread: %r', e,
                                 exc_info=True):
                        import traceback
                        traceback.print_exc()
            except Exception:
                pass

_sentinel = object()


class JoinableQueue(Queue):
    '''
    A queue type which also supports join() and task_done() methods

    Note that if you do not call task_done() for each finished task then
    eventually the counter's semaphore may overflow causing Bad Things
    to happen.
    '''

    def __init__(self, maxsize=0):
        Queue.__init__(self, maxsize)
        self._unfinished_tasks = Semaphore(0)
        self._cond = Condition()

    def __getstate__(self):
        return Queue.__getstate__(self) + (self._cond, self._unfinished_tasks)

    def __setstate__(self, state):
        Queue.__setstate__(self, state[:-2])
        self._cond, self._unfinished_tasks = state[-2:]

    def put(self, obj, block=True, timeout=None):
        assert not self._closed
        if not self._sem.acquire(block, timeout):
            raise Full

        with self._notempty:
            with self._cond:
                if self._thread is None:
                    self._start_thread()
                self._buffer.append(obj)
                self._unfinished_tasks.release()
                self._notempty.notify()

    def task_done(self):
        with self._cond:
            if not self._unfinished_tasks.acquire(False):
                raise ValueError('task_done() called too many times')
            if self._unfinished_tasks._semlock._is_zero():
                self._cond.notify_all()

    def join(self):
        with self._cond:
            if not self._unfinished_tasks._semlock._is_zero():
                self._cond.wait()


class SimpleQueue(object):
    '''
    Simplified Queue type -- really just a locked pipe
    '''

    def __init__(self):
        self._reader, self._writer = Pipe(duplex=False)
        self._rlock = Lock()
        self._poll = self._reader.poll
        if sys.platform == 'win32':
            self._wlock = None
        else:
            self._wlock = Lock()
        self._make_methods()

    def empty(self):
        return not self._poll()

    def __getstate__(self):
        assert_spawning(self)
        return (self._reader, self._writer, self._rlock, self._wlock)

    def __setstate__(self, state):
        (self._reader, self._writer, self._rlock, self._wlock) = state
        self._make_methods()

    def _make_methods(self):
        recv = self._reader.recv
        rlock = self._rlock

        def get():
            with rlock:
                return recv()
        self.get = get

        if self._wlock is None:
            # writes to a message oriented win32 pipe are atomic
            self.put = self._writer.send
        else:
            send = self._writer.send
            wlock = self._wlock

            def put(obj):
                with wlock:
                    return send(obj)
            self.put = put
