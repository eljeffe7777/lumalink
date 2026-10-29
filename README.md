# LumaLink Quick Start Guide

## What it is

LumaLink controls your Govee lights from a web page. You can set colors and scenes, sync lights to music, and run schedules in the background. It runs on a Windows PC at home.

## Set up

1. Install **Node.js** (LTS) from nodejs.org.
2. Put the LumaLink files in one folder and double-click **start-lumalink.bat**.
3. If Windows Firewall asks, allow Node.js on **private** networks.
4. Your browser opens the app. From a phone or tablet on your Wi-Fi, use the address shown in the server window.
5. Get your API key in the Govee Home app: **Profile > Settings > Apply for API Key**.
6. Paste the key in the app and press **Connect**. You only do this once.

**Tip:** To start LumaLink with Windows, put a shortcut to the batch file in the startup folder (Win+R, type `shell:startup`). Add `nobrowser` to the end of the shortcut's Target so a browser doesn't open each time.

**No lights yet?** Press **Try demo** to explore with pretend lights.

## The screen

- **Top bar:** the tabs (**Control**, **Music sync**, **Schedule**), the **API calls** counter, the settings gear, and the key box.
- **Left list:** your lights and your own groups.
- **Main area:** the controls for whatever you select.

## Control tab

Pick a light on the left. You only see the controls that light supports.

- **Power, Brightness, Color, White temperature:** use the buttons, sliders and color swatches.
- **Scenes:** press **Load scenes**, then search and tap one. **Load my DIY scenes** shows scenes you made in the Govee app.
- **Segments** (light strips): choose a color, then tap a segment.
- **Built-in music mode:** the light listens through its own microphone.
- **Load all scenes** (first card): loads scenes for every light at once.

## Groups

A group lets you control several lights as one.

1. Press **+ New group** under *Your groups*.
2. Name it and tick the lights.
3. Select the group like any light.

Group scene lists only show scenes that **every** light in the group has. Press **Load scenes** on the group first.

## Music sync tab

Play a song in the browser and change the lights at set moments.

1. **Add songs.** Pick one or more audio files. Click a song to play it.
2. **Add a light change.** Set the time (or press **Use current time** while playing), pick a light, a change and a value, then press **Add**.
3. **Review the timeline.** Each change has **Jump**, **Test**, **Edit** and delete buttons.

**Player buttons**

- **Start from the beginning:** restarts the song and plays it.
- **Go to beginning (don't play):** rewinds and stays paused.
- **When a song ends:** repeat the playlist, repeat the song, or stop after the last song.

**Export and Import:** type a file name and press **Export** to back up a song's light changes. **Import** loads them again.

Each song keeps its own light changes. After a refresh, add the same song file again to get its changes back.

## Schedule tab

Schedules run on the PC, even when the browser is closed.

1. Give it a name and choose a light, group, or all lights.
2. Choose **When**:
   - **At a set time:** runs your steps at that time. Add an optional **Ends at** time to turn the lights off.
   - **Repeat every...:** cycles through your steps every few minutes inside a time window. Tick **Turn the lights off at the end** if you want.
   - **Play a music show:** plays a saved show (see below).
3. Tick the days of the week. Optionally set **Active from** and **Until** dates. Use the same date in both for a one-time schedule.
4. Add steps (colors, scenes, brightness, white temperature or power), then press **Save schedule**.

In the list, use **On/Off**, **Run now**, **Edit** and delete. You can **Export schedules** and **Import** them too.

### Music shows

A show is a song plus its light changes, played by the PC through its speakers.

1. In **Music sync**, add the song and its light changes.
2. Press **Save as scheduled show**.
3. In **Schedule**, choose *Play a music show*, then pick the show, time and days.
4. Optional: set **Stop at**, and tick **Repeat the show until then** to loop until the end time.

The *Music shows* card has **Play now** and **Stop**.

## Local network control

This sends power, brightness and color straight to your lights over Wi-Fi, with no internet limits.

1. In the Govee Home app, turn on **LAN Control** for each light (not every model has it).
2. Click the gear icon in LumaLink and tick **Use the local network**.
3. Press **Find lights on my network** and wait about 7 seconds.
4. Press **Save**.

Scenes and other advanced features still use the internet.

## Good to know

- Govee allows about **10 commands per minute per light** and about **10,000 per day**. Click the API calls box to see usage.
- Scenes must be **loaded** before you can pick them in Music sync or Schedule.
- The PC must stay on and awake for schedules to run.
- There is no login. Keep the app on your home network and never expose it to the internet.
- The server window shows a short log of what the app is doing.

## Troubleshooting

| Problem | Try this |
|---|---|
| Page won't load | Make sure the server window is still open. |
| No lights listed | Check the API key and press **Connect** again. |
| Local scan finds nothing | Turn on LAN Control in the Govee Home app, use the same Wi-Fi, allow Node.js in the firewall. |
| No scenes to pick | Press **Load scenes** (or **Load all scenes**) first. |
| Show plays no sound | Check the PC volume and that the song is an mp3, wav, wma or m4a file. |
| A light ignores commands | You may have hit the per-minute limit. Wait a minute. |
