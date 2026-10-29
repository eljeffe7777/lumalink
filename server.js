// LumaLink server. Run: node server.js   (Node.js 18 or newer, no installs needed)
// - serves the web app (index.html) to any device on your network
// - keeps your Govee API key and schedules on this PC and runs schedules in the background
// - sends commands over the local network (LAN) when a light supports it, otherwise via the Govee cloud
const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), path = require('path'), dgram = require('dgram'), os = require('os'), crypto = require('crypto');
const PORT = process.env.PORT || 3000;
const FILE = path.join(__dirname, 'data.json'), SONGS = path.join(__dirname, 'songs');
const GOVEE = 'https://openapi.api.govee.com', T = 'devices.capabilities.';
const today = () => new Date().toLocaleDateString('en-CA');
const freshStats = () => ({ day: today(), total: 0, lan: 0, dev: {} });

let cfg = { key: '', lan: false, schedules: [], groups: [], shows: [], stats: freshStats() };
try { Object.assign(cfg, JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch {}
let devices = [], lanDevs = [], runs = {}, saveT;

const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);
const wait = ms => new Promise(r => setTimeout(r, ms));
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => fs.writeFile(FILE, JSON.stringify(cfg, null, 1), () => {}), 500); };

/* ---------- API call counter ---------- */
function roll() { if (cfg.stats.day !== today()) cfg.stats = freshStats(); return cfg.stats; }
function count(id, lan) {
  const st = roll();
  if (lan) st.lan++; else st.total++;
  if (id && !lan) { const d = st.dev[id] || (st.dev[id] = { n: 0, ts: [] }); d.n++; d.ts = d.ts.filter(t => Date.now() - t < 60000); d.ts.push(Date.now()); }
  save();
}

/* ---------- Govee cloud ---------- */
async function govee(p, method = 'GET', body) {
  if (!cfg.key) throw new Error('No API key set');
  count(body && body.payload && body.payload.device);
  const r = await fetch(GOVEE + p, { method, headers: { 'Content-Type': 'application/json', 'Govee-API-Key': cfg.key }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { message: t }; }
  if (!r.ok || (j.code && j.code !== 200)) throw new Error(j.message || j.msg || 'Govee error ' + r.status);
  return j;
}
let q = Promise.resolve(); // spaces cloud commands out a little
function cloudControl(d, type, instance, value) {
  const run = q.then(() => govee('/router/api/v1/device/control', 'POST', { requestId: crypto.randomUUID(), payload: { sku: d.sku, device: d.device, capability: { type, instance, value } } }));
  q = run.catch(() => {}).then(() => wait(250));
  return run;
}
// Govee's own groups (SameModeGroup etc.) are hidden; LumaLink uses your own groups instead
const normDevs = l => l.filter(d => !/Group$/.test(d.sku || ''));
async function refreshDevices() {
  try { devices = normDevs((await govee('/router/api/v1/user/devices')).data || []); log(`Loaded ${devices.length} device(s) from your Govee account`); }
  catch (e) { log('Could not load devices:', e.message); }
}

/* ---------- Local network (LAN) ---------- */
const out = dgram.createSocket('udp4'); out.on('error', () => {});
const ifaces = () => Object.values(os.networkInterfaces()).flat().filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address);
// Lights answer scans at random and UDP can drop replies, so the scan listens longer and asks several times.
// Lights found earlier are kept, so each scan can only add lights or refresh their addresses.
function scan(ms = 7000) {
  return new Promise(resolve => {
    const found = [], s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      try { s.close(); } catch {}
      let added = 0;
      for (const f of found) {
        const i = lanDevs.findIndex(x => x.device === f.device);
        if (i >= 0) lanDevs[i] = f; else { lanDevs.push(f); added++; }
      }
      log(`LAN scan: ${found.length} light(s) answered, ${added} new, ${lanDevs.length} known in total`);
      resolve(lanDevs);
    };
    s.on('message', m => { try { const d = JSON.parse(m).msg.data; if (d.ip && !found.find(x => x.ip === d.ip)) found.push(d); } catch {} });
    s.on('error', finish);
    s.bind(4002, async () => {
      const msg = Buffer.from(JSON.stringify({ msg: { cmd: 'scan', data: { account_topic: 'reserved' } } }));
      for (const a of ifaces()) { try { s.addMembership('239.255.255.250', a); } catch {} } // listen on every network adapter (Windows often has several)
      const probe = async () => {
        for (const a of ifaces()) {
          try { s.setMulticastInterface(a); await new Promise(r => s.send(msg, 4001, '239.255.255.250', r)); } catch {}
        }
      };
      await probe();
      setTimeout(probe, 1500); setTimeout(probe, 3500); setTimeout(probe, 5500);
      setTimeout(finish, ms);
    });
  });
}
function toLan(inst, v) {
  if (inst === 'powerSwitch') return { cmd: 'turn', data: { value: v } };
  if (inst === 'brightness') return { cmd: 'brightness', data: { value: +v } };
  if (inst === 'colorRgb') return { cmd: 'colorwc', data: { color: { r: v >> 16 & 255, g: v >> 8 & 255, b: v & 255 }, colorTemInKelvin: 0 } };
  if (inst === 'colorTemperatureK') return { cmd: 'colorwc', data: { color: { r: 0, g: 0, b: 0 }, colorTemInKelvin: +v } };
  return null; // scenes, segments, music mode etc. need the cloud
}
function logCmd(d, instance, val, via) {
  const what = { powerSwitch: val ? 'turned on' : 'turned off', brightness: `brightness ${val}%`, colorRgb: 'color #' + (val >>> 0).toString(16).padStart(6, '0'), colorTemperatureK: `white ${val}K`, lightScene: 'scene changed' }[instance] || instance;
  log(`${(devices.find(x => x.device === d.device) || {}).deviceName || d.sku || d.device}: ${what} (${via})`);
}
async function control(d, type, instance, value) {
  const l = cfg.lan && lanDevs.find(x => x.device === d.device), m = l && toLan(instance, value);
  if (m) { out.send(JSON.stringify({ msg: { cmd: m.cmd, data: m.data } }), 4003, l.ip); count(null, true); logCmd(d, instance, value, 'local network'); return 'lan'; }
  await cloudControl(d, type, instance, value); logCmd(d, instance, value, 'internet'); return 'cloud';
}

/* ---------- Schedules ---------- */
function stepCmd(st) {
  switch (st.type) {
    case 'color': return [T + 'color_setting', 'colorRgb', parseInt(String(st.val).slice(1), 16)];
    case 'scene': return [T + 'dynamic_scene', 'lightScene', st.val];
    case 'brightness': return [T + 'range', 'brightness', +st.val];
    case 'temp': return [T + 'color_setting', 'colorTemperatureK', +st.val];
    case 'power': return [T + 'on_off', 'powerSwitch', st.val === 'on' ? 1 : 0];
  }
}
function fireCue(c) { // one light change: color, scene, brightness, temp or power, for a light, a group or all lights
  const grp = (cfg.groups || []).find(g => g.id === c.dev);
  const targets = c.dev === 'all' ? devices : grp ? devices.filter(d => grp.members.includes(d.device)) : devices.filter(d => d.device === c.dev);
  targets.forEach(d => {
    let val = c.val;
    if (c.type === 'scene' && val && val.byDevice) { val = val.byDevice[d.device]; if (val === undefined) return; } // group scene: each light's own scene
    const cmd = stepCmd({ type: c.type, val });
    if (!cmd || !(d.capabilities || []).some(x => x.instance === cmd[1])) return;
    control(d, ...cmd).catch(e => log(`Light change failed on ${d.deviceName}:`, e.message));
  });
}
function runSteps(sc, idx) {
  idx.forEach((si, k) => setTimeout(() => fireCue({ dev: sc.dev, type: sc.steps[si].type, val: sc.steps[si].val }), k * (sc.gap || 0) * 1000));
}
const runSchedule = sc => { if (sc.mode === 'show') { playShow(sc.show, sc.id, !!sc.loop); setStop(sc); } else { runSteps(sc, sc.steps.map((_, k) => k)); setStop(sc); } };
function nextAt(hhmm) { // the next time the clock shows hh:mm (tomorrow if it has already passed today)
  const n = new Date(), e = mins(hhmm), t = new Date(n.getFullYear(), n.getMonth(), n.getDate(), Math.floor(e / 60), e % 60, 0);
  if (t <= n) t.setDate(t.getDate() + 1);
  return t.getTime();
}
function setStop(sc) { // work out when this schedule ends: a show stops, other schedules turn their lights off
  const r = runs[sc.id] || (runs[sc.id] = {}); r.stopAt = 0; r.offAt = 0;
  if (!sc.end) return;
  if (sc.mode === 'show') r.stopAt = nextAt(sc.end); else r.offAt = nextAt(sc.end);
}

/* ---------- Music shows: a song plus its light changes, played by this PC ---------- */
const PS_SCRIPT = `param($f)
Add-Type -AssemblyName presentationCore
$p = New-Object System.Windows.Media.MediaPlayer
$p.Open([Uri]$f)
$t = 0
while (-not $p.NaturalDuration.HasTimeSpan -and $t -lt 50) { Start-Sleep -Milliseconds 100; $t++ }
if (-not $p.NaturalDuration.HasTimeSpan) { Write-Output 'ERROR'; exit 1 }
$p.Play()
Write-Output 'STARTED'
while ($p.Position -lt $p.NaturalDuration.TimeSpan) { Start-Sleep -Milliseconds 250 }
Start-Sleep -Milliseconds 500
`;
let showRun = null;
function stopShow() {
  if (!showRun) return;
  showRun.timers.forEach(clearTimeout);
  try { showRun.proc && showRun.proc.kill(); } catch {}
  log('Show stopped:', showRun.name); showRun = null;
}
function finishShow(run, sh) {
  if (showRun !== run) return;
  run.timers.forEach(clearTimeout); showRun = null;
  const stopAt = run.by && (runs[run.by] || {}).stopAt;
  if (run.loop && stopAt && Date.now() < stopAt - 1000) { log('Repeating show until the end time:', sh.name); playShow(sh.id, run.by, true); }
  else log('Show finished:', sh.name);
}
function playShow(id, by, loop) {
  const sh = (cfg.shows || []).find(x => x.id === id);
  if (!sh) return log('Scheduled show not found');
  stopShow();
  const run = showRun = { id: sh.id, name: sh.name, by, loop, timers: [], proc: null };
  log('Starting show:', sh.name);
  const startLights = () => (sh.cues || []).forEach(c => run.timers.push(setTimeout(() => showRun === run && fireCue(c), Math.max(0, c.t) * 1000)));
  const file = path.join(SONGS, path.basename(sh.file || ''));
  if (process.platform === 'win32' && fs.existsSync(file)) {
    const ps = path.join(os.tmpdir(), 'lumalink-play.ps1'); fs.writeFileSync(ps, PS_SCRIPT);
    run.proc = spawn('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', ps, file], { windowsHide: true });
    let started = false;
    run.proc.stdout.on('data', d => { const t = String(d); if (!started && t.includes('STARTED')) { started = true; startLights(); } if (t.includes('ERROR')) log('Windows could not play this song:', sh.file); });
    run.proc.on('exit', () => finishShow(run, sh));
    run.timers.push(setTimeout(() => { if (!started && showRun === run) { started = true; startLights(); } }, 7000));
  } else {
    log(process.platform === 'win32' ? 'Song file missing, running lights only' : 'Audio playback needs Windows, running lights only');
    startLights();
    const last = Math.max(0, ...(sh.cues || []).map(c => c.t));
    run.timers.push(setTimeout(() => finishShow(run, sh), (last + 2) * 1000));
  }
}
const mins = t => { const p = String(t || '0:0').split(':'); return +p[0] * 60 + +p[1]; };
function tick() {
  for (const sc of cfg.schedules) { // end times: stop a show that this schedule started
    const r = runs[sc.id];
    if (r && r.offAt && Date.now() >= r.offAt) { r.offAt = 0; log('End time reached, turning the lights off:', sc.name); fireCue({ dev: sc.dev, type: 'power', val: 'off' }); }
    if (r && r.stopAt && Date.now() >= r.stopAt) { r.stopAt = 0; if (showRun && showRun.by === sc.id) { log('End time reached:', sc.name); stopShow(); } }
  }
  if (cfg.key && !devices.length) return;
  const n = new Date(), nm = n.getHours() * 60 + n.getMinutes(), dk = n.toDateString();
  for (const sc of cfg.schedules) {
    if (!sc.on || (sc.mode !== 'show' && (!sc.steps || !sc.steps.length)) || !sc.days.includes(n.getDay())) continue;
    const ymd = n.toLocaleDateString('en-CA');
    if ((sc.dFrom && ymd < sc.dFrom) || (sc.dTo && ymd > sc.dTo)) continue; // outside the chosen dates
    const r = runs[sc.id] || (runs[sc.id] = {});
    if (sc.mode === 'at' || sc.mode === 'show') {
      const t = mins(sc.time);
      if (nm >= t && nm < t + 2 && r.day !== dk) { r.day = dk; r.last = Date.now(); log('Running schedule:', sc.name); runSchedule(sc); }
    } else {
      const f = mins(sc.from), u = mins(sc.to), inWin = f <= u ? (nm >= f && nm <= u) : (nm >= f || nm <= u);
      if (!inWin) { if (r.next && sc.offAtEnd) { log('End of time window, turning the lights off:', sc.name); fireCue({ dev: sc.dev, type: 'power', val: 'off' }); } r.next = 0; continue; }
      if (!r.next || Date.now() >= r.next) {
        const i = (r.i || 0) % sc.steps.length; r.i = i + 1; r.next = Date.now() + sc.every * 60000; r.last = Date.now();
        log('Running schedule:', sc.name, `(step ${i + 1})`); runSteps(sc, [i]);
      }
    }
  }
}

/* ---------- HTTP ---------- */
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
http.createServer(async (req, res) => {
  try {
    const chunks = []; for await (const c of req) chunks.push(c);
    const buf = Buffer.concat(chunks), url = req.url.split('?')[0], raw = url.startsWith('/api/songs/') ? '' : buf.toString();
    const body = () => { try { return JSON.parse(raw || '{}'); } catch { return {}; } };

    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
    }
    if (url.startsWith('/g/')) { // pass-through to Govee using the stored key
      if (!cfg.key) return json(res, 400, { message: 'No API key set on the server yet' });
      const b = raw ? body() : undefined;
      count(b && b.payload && b.payload.device);
      const r = await fetch(GOVEE + req.url.slice(2), { method: req.method, headers: { 'Content-Type': 'application/json', 'Govee-API-Key': cfg.key }, body: raw ? raw : undefined });
      if (!r.ok) log('Govee request failed:', req.url.slice(2).split('?')[0], '(status ' + r.status + ')');
      res.writeHead(r.status, { 'Content-Type': 'application/json' }); return res.end(await r.text());
    }
    if (url.startsWith('/api/songs/') && req.method === 'PUT') { // song upload for scheduled shows
      const name = path.basename(decodeURIComponent(url.slice(11))).replace(/[\\/:*?"<>|]/g, '_');
      fs.mkdirSync(SONGS, { recursive: true }); fs.writeFileSync(path.join(SONGS, name), buf); log(`Song uploaded: ${name} (${(buf.length / 1048576).toFixed(1)} MB)`);
      return json(res, 200, { file: name });
    }
    if (url === '/api/shows/play' && req.method === 'POST') { playShow(body().id); return json(res, 200, { ok: true }); }
    if (url === '/api/shows/stop' && req.method === 'POST') { stopShow(); return json(res, 200, { ok: true }); }
    if (url === '/api/config' && req.method === 'GET') return json(res, 200, { hasKey: !!cfg.key, lan: cfg.lan, schedules: cfg.schedules, groups: cfg.groups, shows: cfg.shows || [], playing: showRun ? { id: showRun.id, name: showRun.name } : null, runs });
    if (url === '/api/config' && req.method === 'POST') {
      const b = body();
      if (typeof b.key === 'string' && b.key.trim()) { cfg.key = b.key.trim(); log('Govee API key saved'); refreshDevices(); }
      if (typeof b.lan === 'boolean') { if (cfg.lan !== b.lan) log(`Local network control turned ${b.lan ? 'on' : 'off'}`); cfg.lan = b.lan; if (b.lan && !lanDevs.length) scan(); }
      if (Array.isArray(b.groups)) { cfg.groups = b.groups; log(`Groups saved (${b.groups.length} total)`); }
      if (Array.isArray(b.shows)) {
        const keep = new Set(b.shows.map(x => x.file));
        (cfg.shows || []).forEach(x => { if (!keep.has(x.file)) { fs.unlink(path.join(SONGS, path.basename(x.file || '')), () => {}); log('Removed unused song:', x.file); } }); // remove songs no show uses
        cfg.shows = b.shows; log(`Shows saved (${b.shows.length} total)`);
      }
      if (Array.isArray(b.schedules)) {
        const old = Object.fromEntries(cfg.schedules.map(s => [s.id, JSON.stringify(s)]));
        cfg.schedules = b.schedules; log(`Schedules saved (${b.schedules.length} total, ${b.schedules.filter(s => s.on).length} on)`); cfg.schedules.forEach(s => { if (old[s.id] !== JSON.stringify(s)) delete runs[s.id]; });
      }
      save(); return json(res, 200, { ok: true });
    }
    if (url === '/api/stats') {
      const st = roll(), now = Date.now();
      return json(res, 200, { total: st.total, lan: st.lan, devices: Object.keys(st.dev).map(id => ({ name: (devices.find(d => d.device === id) || {}).deviceName || id, recent: st.dev[id].ts.filter(t => now - t < 60000).length, today: st.dev[id].n })) });
    }
    if (url === '/api/stats/reset') { log('API call counters reset'); cfg.stats = freshStats(); save(); return json(res, 200, { ok: true }); }
    if (url === '/api/lan/scan') return json(res, 200, await scan());
    if (url === '/api/control' && req.method === 'POST') {
      const b = body(); const via = await control({ sku: b.sku, device: b.device }, b.type, b.instance, b.value);
      return json(res, 200, { via });
    }
    if (url === '/api/schedules/run' && req.method === 'POST') {
      const sc = cfg.schedules.find(s => String(s.id) === String(body().id));
      if (!sc) return json(res, 404, { error: 'Schedule not found' });
      (runs[sc.id] || (runs[sc.id] = {})).last = Date.now(); log('Run now:', sc.name); runSchedule(sc); return json(res, 200, { ok: true });
    }
    json(res, 404, { error: 'Not found' });
  } catch (e) { log('Request failed:', req.url.split('?')[0], '-', e.message); json(res, 500, { error: e.message }); }
}).listen(PORT, '0.0.0.0', () => {
  log(`LumaLink is running. Open  http://localhost:${PORT}  on this PC`);
  ifaces().forEach(a => log(`From a phone or other device on your Wi-Fi:  http://${a}:${PORT}`));
  log(`Loaded saved settings: ${cfg.schedules.length} schedule(s), ${(cfg.groups || []).length} group(s), ${(cfg.shows || []).length} show(s)`);
  log(cfg.key ? 'Govee API key found, loading your lights...' : 'No Govee API key yet. Open the app and enter it.');
  if (cfg.key) refreshDevices();
  if (cfg.lan) scan();
  setInterval(() => cfg.key && refreshDevices(), 30 * 60000);
  setInterval(() => cfg.lan && scan(), 10 * 60000);
  setInterval(tick, 1000);
});
