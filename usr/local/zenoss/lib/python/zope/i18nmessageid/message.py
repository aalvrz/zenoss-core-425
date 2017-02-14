##############################################################################
#
# Copyright (c) 2004 Zope Foundation and Contributors.
# All Rights Reserved.
#
# This software is subject to the provisions of the Zope Public License,
# Version 2.1 (ZPL).  A copy of the ZPL should accompany this distribution.
# THIS SOFTWARE IS PROVIDED "AS IS" AND ANY AND ALL EXPRESS OR IMPLIED
# WARRANTIES ARE DISCLAIMED, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
# WARRANTIES OF TITLE, MERCHANTABILITY, AGAINST INFRINGEMENT, AND FITNESS
# FOR A PARTICULAR PURPOSE.
#
##############################################################################
"""I18n Messages
"""
__docformat__ = "reStructuredText"

class Message(unicode):
    """Message (Python implementation)

    This is a string used as a message.  It has a domain attribute that is
    its source domain, and a default attribute that is its default text to
    display when there is no translation.  domain may be None meaning there is
    no translation domain.  default may also be None, in which case the
    message id itself implicitly serves as the default text.

    These are the doc tests from message.txt. Note that we have to create the
    message manually since MessageFactory would return the C implementation.

    >>> from zope.i18nmessageid.message import Message
    >>> robot = Message(u"robot-message", 'futurama', u"${name} is a robot.")

    >>> robot == u'robot-message'
    True
    >>> isinstance(robot, unicode)
    True

    >>> robot.default == u'${name} is a robot.'
    True
    >>> robot.mapping

    >>> robot.domain = "planetexpress"
    Traceback (most recent call last):
    ...
    TypeError: readonly attribute

    >>> robot.default = u"${name} is not a robot."
    Traceback (most recent call last):
    ...
    TypeError: readonly attribute

    >>> robot.mapping = {u'name': u'Bender'}
    Traceback (most recent call last):
    ...
    TypeError: readonly attribute

    >>> new_robot = Message(robot, mapping={u'name': u'Bender'})
    >>> new_robot == u'robot-message'
    True
    >>> new_robot.domain == 'futurama'
    True
    >>> new_robot.default == u'${name} is a robot.'
    True
    >>> new_robot.mapping == {u'name': u'Bender'}
    True

    >>> callable, args = new_robot.__reduce__()
    >>> callable is Message
    True
    >>> args == (u'robot-message', 'futurama', u'${name} is a robot.', {u'name': u'Bender'})
    True

    >>> fembot = Message(u'fembot')
    >>> callable, args = fembot.__reduce__()
    >>> callable is Message
    True
    >>> args == (u'fembot', None, None, None)
    True

    Check if pickling and unpickling works
    >>> from pickle import dumps, loads
    >>> pystate = dumps(new_robot)
    >>> pickle_bot = loads(pystate)
    >>> (pickle_bot, pickle_bot.domain, pickle_bot.default, pickle_bot.mapping) == (u'robot-message', 'futurama', u'${name} is a robot.', {u'name': u'Bender'})
    True
    >>> pickle_bot.__reduce__()[0] is Message
    True
    """

    __slots__ = ('domain', 'default', 'mapping', '_readonly')

    def __new__(cls, ustr, domain=None, default=None, mapping=None):
        self = unicode.__new__(cls, ustr)
        if isinstance(ustr, self.__class__):
            domain = ustr.domain and ustr.domain[:] or domain
            default = ustr.default and ustr.default[:] or default
            mapping = ustr.mapping and ustr.mapping.copy() or mapping
            ustr = unicode(ustr)
        self.domain = domain
        if default is None:
            # MessageID does: self.default = ustr
            self.default = default
        else:
            self.default = unicode(default)
        self.mapping = mapping
        self._readonly = True
        return self

    def __setattr__(self, key, value):
        """Message is immutable

        It cannot be changed once the message id is created.
        """
        if getattr(self, '_readonly', False):
            raise TypeError('readonly attribute')
        else:
            return unicode.__setattr__(self, key, value)

    def __reduce__(self):
        return self.__class__, self.__getstate__()

    def __getstate__(self):
        return unicode(self), self.domain, self.default, self.mapping

# save a copy for the unit tests
pyMessage = Message

try:
    from _zope_i18nmessageid_message import Message
except ImportError: # pragma: no cover
    pass

class MessageFactory(object):
    """Factory for creating i18n messages."""

    def __init__(self, domain):
        self._domain = domain

    def __call__(self, ustr, default=None, mapping=None):
        return Message(ustr, self._domain, default, mapping)