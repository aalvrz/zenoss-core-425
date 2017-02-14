zenoss start
ls
./02_zo425_install-zenpacks.sh 
vi 02_zo425_install-zenpacks.sh 
cd /tmp/opt/zenoss/packs/
ls
whoami
zenoss start
zenpack --install /tmp/opt/zenoss/packs/ZenPacks.zenoss.MySqlMonitor-3.0.0-py2.7.egg
cd /home/cnc-admin/
cd /home/treyh/
ls
cd zenoss/core-autodeploy/
ls
cd 4.2.5
zenoss stop
exit
