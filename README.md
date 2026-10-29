# LumaLink
LumaLink Govee Light Control for Windows
====================
1. Install Node.js (LTS) from https://nodejs.org if you don't have it.
2. Double-click start-lumalink.bat. It starts the server and opens your default browser at the app.
   When Windows Firewall asks, allow Node.js on PRIVATE networks.
3. Open http://localhost:3000 on this PC (phones/tablets on your Wi-Fi: use the address shown in the window).
4. Paste your Govee API key once and press Connect. It is stored on this PC only (data.json).

Start automatically when Windows starts
---------------------------------------
Press Win+R, type  shell:startup  and press Enter. Put a shortcut to start-lumalink.bat in that folder
(right-click the shortcut > Properties > Run: Minimized). Schedules then run in the background all the time.
To stop the browser from opening every time Windows starts, add  nobrowser  to the end of the shortcut's Target
(for example:  "C:\LumaLink\start-lumalink.bat" nobrowser ).

Notes
-----
- Do not expose port 3000 to the internet. There is no login; anyone on your Wi-Fi can open the app.
- To use the local network (LAN) for faster control, turn on LAN Control for each light in the Govee Home app,
  then click the gear icon in LumaLink and tick "Use the local network".
- Songs for the playlist are played in the browser tab, so keep that tab open while a song is playing.

Scheduled music shows
---------------------
1. Music sync tab: add your song, add its light changes, then press "Save as scheduled show".
   (This uploads the song to the "songs" folder next to server.js and saves the light changes.)
2. Schedule tab: choose "Play a music show at a set time", pick the show, the time, the days of the week,
   and optionally a date range (same date in both boxes = one-time).
3. At that time this PC plays the song through its speakers (Windows Media Player engine: mp3, wav, wma, m4a)
   and runs the light changes, even with no browser open. Shows can also be started with "Play now".
- Only one show plays at a time; a new one stops the previous one.
- Saving a show again with the same name updates it.
