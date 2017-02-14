#! /usr/local/zenoss/bin/rrdcgi 

<HTML>
<HEAD>
<TITLE>RRDCGI Demo</TITLE>
</HEAD>
<BODY>
Note: This Demo will only work if have previously run
the <TT>shared-demo.pl</TT>.

<H1>This is NOT traffic</H1>


<P><RRD::GRAPH cgi-demo1.png 
	    --lower-limit 0
	    --start 'end-10h'
	    --title "Graph in Localtime <RRD::TIME::NOW %c>"
            DEF:alpha=shared-demo.rrd:a:AVERAGE
            DEF:beta=shared-demo.rrd:b:AVERAGE
            AREA:alpha#0022e9:"Trees on Mars"
            STACK:beta#00b871:"Elchs in Norway">
</P>

<P><RRD::SETENV TZ UTC>
   <RRD::GRAPH cgi-demo2.png 
	    --lower-limit 0
	    --start 'end-10h'
	    --title "Graph in UTC"
            DEF:alpha=shared-demo.rrd:a:AVERAGE
            DEF:beta=shared-demo.rrd:b:AVERAGE
            AREA:alpha#0022e9:"Trees on Mars"
            STACK:beta#00b871:"Elchs in Norway">
</P>

</BODY>
</HTML>




