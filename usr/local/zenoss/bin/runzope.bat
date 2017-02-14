@set INSTANCE_HOME=/usr/local/zenoss
@set CONFIG_FILE=%INSTANCE_HOME%\etc\zope.conf
@set ZOPE_RUN=/usr/local/zenoss/zopehome\runzope

"%ZOPE_RUN%" -C "%CONFIG_FILE%" %1 %2 %3 %4 %5 %6 %7
