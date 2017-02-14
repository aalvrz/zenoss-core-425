@set PYTHON=/usr/local/zenoss/bin/python
@set INSTANCE_HOME=/usr/local/zenoss
@set CONFIG_FILE=%INSTANCE_HOME%\etc\zope.conf
@set ZDCTL=/usr/local/zenoss/zopehome\zopectl

"%ZDCTL%" -C "%CONFIG_FILE%" %1 %2 %3 %4 %5 %6 %7
