#!/usr/bin/env node
/* 无敌悟空 · 静态站 + 全服风云榜 + 异步 PVP（零依赖）
 *
 * 用途：替换 `python3 -m http.server 80`，在同一个 80 端口同时提供
 *   1) /opt/wukong-td 下的游戏静态文件；
 *   2) GET  /api/board?kind=daily|weekly   全服今日/本周榜（前 20）；
 *   3) POST /api/score {name,wave,kills,kind,endless}  上传本局战绩；
 *   4) GET  /api/pvp/list?name=            镇守阵列表 + 我的守成记录；
 *   5) POST /api/pvp/defense {name,wave,seed,lineup}  上传/覆盖镇守阵；
 *   6) POST /api/pvp/result {attacker,defender,win,wave}  讨伐结算。
 *
 * 榜单口径：按北京时间自然日 / ISO 周（周一为界）分桶，每人只留最佳波次
 * （同波次取击杀多者，再同则先到先排）。PVP 只存阵容快照（字/等级/星级）
 * 与原地图种子，战斗全部在讨伐方本地跑，镇守者无需在线。
 * 数据落盘到站点目录外的 /opt/wukong-td-api/data.json，避免被静态服务直接下载。
 *
 * 可调环境变量：PORT（默认 80）、HOST、WK_ROOT（静态根）、WK_DATA（数据目录）。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 80);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.resolve(process.env.WK_ROOT || __dirname);
const DATA_DIR = path.resolve(process.env.WK_DATA || path.join(__dirname, '..', 'wukong-td-api'));
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const MAX_BOARD = 20;
const MAX_NAMES_PER_PERIOD = 500;
const MAX_DEFENSES = 300;
const MAX_PVP_UNITS = 12;
const PVP_PAGE = 40;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const log = (...a) => console.log(new Date().toISOString(), ...a);

/* ---------- 时间：北京时间（无夏令时，固定 +8） ---------- */
function shanghaiNow() { return new Date(Date.now() + 8 * 3600 * 1000); }
const pad2 = n => (n < 10 ? '0' : '') + n;

function dayKey(d) {
  d = d || shanghaiNow();
  return '' + d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate());
}

/* ISO 周 key：yyyy * 100 + 周序（与前端 Weekly.key 完全一致） */
function weekKey(d) {
  d = d || shanghaiNow();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (t.getUTCDay() + 6) % 7;            // 周一=0
  t.setUTCDate(t.getUTCDate() - dayNum + 3);         // 本周四
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const fDay = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - fDay + 3);
  const wk = 1 + Math.round((t - firstThu) / (7 * 24 * 3600 * 1000));
  return t.getUTCFullYear() * 100 + wk;
}

/* ---------- 数据 ---------- */
function loadDb() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (raw && typeof raw === 'object') {
      // 镇守名册用无原型对象，避免玩家名踩到 __proto__ 之类的键
      const defenses = Object.create(null);
      const src = raw.pvp && raw.pvp.defenses;
      if (src && typeof src === 'object') {
        for (const k of Object.keys(src)) defenses[k] = src[k];
      }
      return { v: 1, daily: raw.daily || {}, weekly: raw.weekly || {}, pvp: { defenses } };
    }
  } catch (e) {
    if (e.code !== 'ENOENT') log('读取数据失败：' + e.message);
  }
  return { v: 1, daily: {}, weekly: {}, pvp: { defenses: Object.create(null) } };
}

let db = loadDb();

function saveDb() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DATA_FILE);
  } catch (e) {
    log('写入榜单数据失败：' + e.message);
  }
}

function ensurePeriod() {
  const d = dayKey(), w = String(weekKey());
  if (!db.daily[d]) db.daily[d] = {};
  if (!db.weekly[w]) db.weekly[w] = {};
  return { d, w };
}

/* 旧榜裁剪：日榜留最近 16 天，周榜留最近 8 周 */
function prunePeriods() {
  for (const [map, keep] of [[db.daily, 16], [db.weekly, 8]]) {
    const keys = Object.keys(map).sort();
    while (keys.length > keep) delete map[keys.shift()];
  }
}

function capBucket(bucket) {
  const names = Object.keys(bucket);
  if (names.length <= MAX_NAMES_PER_PERIOD) return;
  names.sort((a, b) => bucket[a].w - bucket[b].w || bucket[a].k - bucket[b].k);
  while (names.length > MAX_NAMES_PER_PERIOD) delete bucket[names.shift()];
}

function cleanName(v) {
  let s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, '').trim();
  s = Array.from(s).slice(0, 8).join('');
  return s;
}

const toInt = v => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : NaN;
};

function buildBoard(kind, name) {
  const isWeekly = kind === 'weekly';
  const key = isWeekly ? String(weekKey()) : dayKey();
  const bucket = (isWeekly ? db.weekly : db.daily)[key] || {};
  const all = Object.keys(bucket).map(n => ({
    name: n,
    wave: bucket[n].w,
    kills: bucket[n].k,
    kind: bucket[n].m || 'normal',
    endless: !!bucket[n].e,
    ts: bucket[n].t || 0,
  })).sort((a, b) => b.wave - a.wave || b.kills - a.kills || a.ts - b.ts);
  const meIdx = name ? all.findIndex(r => r.name === name) : -1;
  return {
    ok: true,
    kind,
    key,
    total: all.length,
    updated: Date.now(),
    rows: all.slice(0, MAX_BOARD).map((r, i) => Object.assign({ rank: i + 1 }, r)),
    me: meIdx >= 0 ? { rank: meIdx + 1, wave: all[meIdx].wave, kills: all[meIdx].kills } : null,
  };
}

/* ---------- PVP ---------- */
function cleanChar(v) {
  let s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, '').trim();
  return Array.from(s).slice(0, 2).join('');
}

function cleanLineup(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const u of arr) {
    if (out.length >= MAX_PVP_UNITS) break;
    if (!u || typeof u !== 'object') continue;
    const ch = cleanChar(u.ch);
    if (!ch) continue;
    const lv = toInt(u.lv);
    const star = toInt(u.star);
    out.push({
      ch,
      god: !!u.god,
      lv: lv >= 1 && lv <= 99 ? lv : 1,
      star: star >= 0 && star <= 3 ? star : 0,
    });
  }
  return out;
}

function pvpPublic(rec) {
  if (!rec) return null;
  return {
    name: rec.name,
    wave: rec.wave,
    seed: rec.seed,
    lineup: rec.lineup || [],
    wins: rec.wins || 0,
    losses: rec.losses || 0,
    ts: rec.t || 0,
    log: (rec.log || []).slice(0, 10),
  };
}

function buildPvpList(name) {
  const all = Object.keys(db.pvp.defenses)
    .filter(n => n !== name)
    .map(n => pvpPublic(db.pvp.defenses[n]))
    .filter(Boolean)
    .sort((a, b) => b.wins - a.wins || b.ts - a.ts || a.name.localeCompare(b.name));
  return {
    ok: true,
    updated: Date.now(),
    total: all.length,
    mine: pvpPublic(db.pvp.defenses[name]),
    list: all.slice(0, PVP_PAGE),
  };
}

function capDefenses() {
  const names = Object.keys(db.pvp.defenses);
  if (names.length <= MAX_DEFENSES) return;
  names.sort((a, b) => (db.pvp.defenses[a].t || 0) - (db.pvp.defenses[b].t || 0));
  while (names.length > MAX_DEFENSES) delete db.pvp.defenses[names.shift()];
}

/* ---------- HTTP 帮助 ---------- */
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/* 简易滑动窗口限流（单进程内存） */
const hits = new Map();
function allow(ip, action, max, windowMs) {
  const k = ip + '|' + action;
  const now = Date.now();
  let rec = hits.get(k);
  if (!rec || now > rec.reset) {
    rec = { n: 0, reset: now + windowMs };
    hits.set(k, rec);
  }
  rec.n++;
  if (hits.size > 2000) {
    for (const [kk, v] of hits) if (now > v.reset) hits.delete(kk);
  }
  return rec.n <= max;
}

/* ---------- API ---------- */
function handleBoard(req, res, url, ip) {
  if (!allow(ip, 'board', 120, 60 * 1000)) return json(res, 429, { ok: false, error: '请求太频繁' });
  const kind = url.searchParams.get('kind') === 'weekly' ? 'weekly' : 'daily';
  const name = cleanName(url.searchParams.get('name') || '');
  ensurePeriod();
  return json(res, 200, buildBoard(kind, name));
}

async function handleScore(req, res, ip) {
  if (!allow(ip, 'score', 30, 10 * 60 * 1000)) {
    return json(res, 429, { ok: false, error: '上传太频繁，稍后再试' });
  }
  let body;
  try {
    body = JSON.parse(await readBody(req, 4096));
  } catch (e) {
    return json(res, 400, { ok: false, error: '请求体无效' });
  }
  if (!body || typeof body !== 'object') return json(res, 400, { ok: false, error: '请求体无效' });

  const name = cleanName(body.name);
  if (!name) return json(res, 400, { ok: false, error: '名号无效' });
  const wave = toInt(body.wave);
  if (!(wave >= 1 && wave <= 999)) return json(res, 400, { ok: false, error: '波次无效' });
  const kills = toInt(body.kills);
  if (!(kills >= 0 && kills <= 1000000)) return json(res, 400, { ok: false, error: '击杀数无效' });
  const kind = ['normal', 'daily', 'weekly'].indexOf(body.kind) >= 0 ? body.kind : 'normal';
  const rec = { w: wave, k: kills, m: kind, e: !!body.endless, t: Date.now() };

  const period = ensurePeriod();
  const dayBucket = db.daily[period.d];
  const weekBucket = db.weekly[period.w];
  const better = prev => !prev || wave > prev.w || (wave === prev.w && kills > prev.k);
  if (better(dayBucket[name])) dayBucket[name] = rec;
  if (better(weekBucket[name])) weekBucket[name] = rec;
  capBucket(dayBucket);
  capBucket(weekBucket);
  prunePeriods();
  saveDb();

  const day = buildBoard('daily', name);
  const week = buildBoard('weekly', name);
  return json(res, 200, {
    ok: true,
    dayKey: period.d,
    weekKey: period.w,
    dayRank: day.me ? day.me.rank : null,
    weekRank: week.me ? week.me.rank : null,
  });
}

/* ---------- PVP API ---------- */
function handlePvpList(req, res, url, ip) {
  if (!allow(ip, 'pvpList', 120, 60 * 1000)) return json(res, 429, { ok: false, error: '请求太频繁' });
  const name = cleanName(url.searchParams.get('name') || '');
  return json(res, 200, buildPvpList(name));
}

async function handlePvpDefense(req, res, ip) {
  if (!allow(ip, 'pvpDef', 12, 10 * 60 * 1000)) {
    return json(res, 429, { ok: false, error: '上传太频繁，稍后再试' });
  }
  let body;
  try {
    body = JSON.parse(await readBody(req, 8192));
  } catch (e) {
    return json(res, 400, { ok: false, error: '请求体无效' });
  }
  if (!body || typeof body !== 'object') return json(res, 400, { ok: false, error: '请求体无效' });

  const name = cleanName(body.name);
  if (!name) return json(res, 400, { ok: false, error: '名号无效' });
  const wave = toInt(body.wave);
  if (!(wave >= 1 && wave <= 999)) return json(res, 400, { ok: false, error: '波次无效' });
  const seed = toInt(body.seed);
  if (!(seed >= 0 && seed <= 4294967295)) return json(res, 400, { ok: false, error: '地图种子无效' });
  const lineup = cleanLineup(body.lineup);
  if (!lineup.length) return json(res, 400, { ok: false, error: '镇守阵容为空' });

  const prev = db.pvp.defenses[name] || {};
  db.pvp.defenses[name] = {
    name, wave, seed, lineup,
    wins: prev.wins || 0,
    losses: prev.losses || 0,
    log: (prev.log || []).slice(0, 10),
    t: Date.now(),
  };
  capDefenses();
  saveDb();
  return json(res, 200, { ok: true, mine: pvpPublic(db.pvp.defenses[name]) });
}

async function handlePvpResult(req, res, ip) {
  if (!allow(ip, 'pvpResult', 40, 10 * 60 * 1000)) {
    return json(res, 429, { ok: false, error: '上报太频繁，稍后再试' });
  }
  let body;
  try {
    body = JSON.parse(await readBody(req, 4096));
  } catch (e) {
    return json(res, 400, { ok: false, error: '请求体无效' });
  }
  if (!body || typeof body !== 'object') return json(res, 400, { ok: false, error: '请求体无效' });

  const attacker = cleanName(body.attacker);
  const defender = cleanName(body.defender);
  if (!attacker || !defender) return json(res, 400, { ok: false, error: '名号无效' });
  if (attacker === defender) return json(res, 400, { ok: false, error: '不能讨伐自己' });
  const rec = db.pvp.defenses[defender];
  if (!rec) return json(res, 404, { ok: false, error: '该镇守阵已下线' });

  const win = !!body.win;   // 讨伐方是否破阵成功
  const wave = toInt(body.wave);
  if (win) rec.losses = (rec.losses || 0) + 1;   // 攻方胜 → 守方被破
  else rec.wins = (rec.wins || 0) + 1;           // 攻方败 → 守方守成
  rec.log = [{
    a: attacker,
    w: win,
    n: wave >= 1 && wave <= 999 ? wave : 0,
    t: Date.now(),
  }].concat(rec.log || []).slice(0, 10);
  saveDb();
  return json(res, 200, { ok: true, wins: rec.wins, losses: rec.losses });
}

/* ---------- 静态文件 ---------- */
function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch (e) {
    return json(res, 400, { ok: false, error: '路径无效' });
  }
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel.indexOf('\0') >= 0) return json(res, 404, { ok: false, error: 'not found' });
  const abs = path.resolve(ROOT, '.' + rel);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) {
    return json(res, 403, { ok: false, error: 'forbidden' });
  }
  const base = path.basename(abs);
  if (base === 'server.js' || base.charAt(0) === '.') {
    return json(res, 404, { ok: false, error: 'not found' });
  }
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) return json(res, 404, { ok: false, error: 'not found' });
    const ext = path.extname(abs).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(abs);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
}

/* ---------- 路由 ---------- */
const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch (e) {
    return json(res, 400, { ok: false, error: 'bad url' });
  }
  const ip = (req.socket && req.socket.remoteAddress) || '?';
  if (url.pathname === '/api/board') {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method not allowed' });
    return handleBoard(req, res, url, ip);
  }
  if (url.pathname === '/api/score') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method not allowed' });
    handleScore(req, res, ip).catch(e => {
      log('上传处理异常：' + e.message);
      if (!res.headersSent) json(res, 500, { ok: false, error: 'server error' });
    });
    return;
  }
  if (url.pathname === '/api/pvp/list') {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method not allowed' });
    return handlePvpList(req, res, url, ip);
  }
  if (url.pathname === '/api/pvp/defense') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method not allowed' });
    handlePvpDefense(req, res, ip).catch(e => {
      log('镇守上传异常：' + e.message);
      if (!res.headersSent) json(res, 500, { ok: false, error: 'server error' });
    });
    return;
  }
  if (url.pathname === '/api/pvp/result') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method not allowed' });
    handlePvpResult(req, res, ip).catch(e => {
      log('讨伐上报异常：' + e.message);
      if (!res.headersSent) json(res, 500, { ok: false, error: 'server error' });
    });
    return;
  }
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, url.pathname);
  return json(res, 405, { ok: false, error: 'method not allowed' });
});

ensurePeriod();
prunePeriods();
server.listen(PORT, HOST, () => {
  log(`wukong-td 服务已启动：${HOST}:${PORT} · 静态 ${ROOT} · 数据 ${DATA_FILE}`);
});

function shutdown(sig) {
  log('收到 ' + sig + '，准备退出');
  saveDb();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
