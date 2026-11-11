/**
 * 广东海洋大学校园网自动登录插件（Host 端）
 *
 * 深澜(srun) 认证协议实现，参考 zu1k/srun（GPL-3.0）与
 * 1328411791/GDOUYJ_Internet_Client 中打包的 srun 客户端行为。
 *
 * - 断网时（TCP 探测失败）自动调用 srun 登录
 * - 注册 campus_net 工具：status / login / logout
 */
import { createHash, createHmac } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const inject = ['tools', 'webServer'];

const DEFAULTS = {
  username: '',
  password: '',
  server: 'http://10.129.1.1',
  acid: 25,
  n: 200,
  type: 1,
  os: 'Windows NT',
  name: 'Windows',
  autoLogin: true,
  intervalSec: 1,
  testHost: 'baidu.com',
  testPort: 80,
  timeoutMs: 3000,
  // 选课公告来源与关键字
  noticeUrl: 'https://jwc.gdou.edu.cn/',
  noticeKeywords: ['选课', '预选', '退改选'],
  // 背景样式：blueprint（海洋蓝图）/ grid（渐变网格）/ plain（纯色）/ off（关闭）
  background: 'blueprint',
};

/** 合并用户配置与默认值，并做轻量类型规整（不依赖 schemastery）。 */
function resolveConfig(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const num = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    username: String(src.username ?? DEFAULTS.username),
    password: String(src.password ?? DEFAULTS.password),
    server: String(src.server ?? DEFAULTS.server).replace(/\/+$/, '') || DEFAULTS.server,
    acid: Math.max(0, num(src.acid, DEFAULTS.acid)),
    n: Math.max(0, num(src.n, DEFAULTS.n)),
    type: Math.max(0, num(src.type, DEFAULTS.type)),
    os: String(src.os ?? DEFAULTS.os),
    name: String(src.name ?? DEFAULTS.name),
    autoLogin: src.autoLogin !== false,
    intervalSec: Math.max(1, num(src.intervalSec, DEFAULTS.intervalSec)),
    testHost: String(src.testHost ?? DEFAULTS.testHost),
    testPort: Math.max(1, num(src.testPort, DEFAULTS.testPort)),
    timeoutMs: Math.max(500, num(src.timeoutMs, DEFAULTS.timeoutMs)),
    noticeUrl: String(src.noticeUrl ?? DEFAULTS.noticeUrl),
    noticeKeywords: Array.isArray(src.noticeKeywords) && src.noticeKeywords.length
      ? src.noticeKeywords.map(String)
      : DEFAULTS.noticeKeywords,
    background: ['blueprint', 'grid', 'plain', 'off'].includes(src.background)
      ? src.background
      : DEFAULTS.background,
  };
}

// ---------- 账号持久化（面板里保存的账号，优先于 patch 中的静态配置） ----------
function accountFile() {
  const base = process.env.DSH_PROFILE_DIR || join(homedir(), '.dsh');
  return join(base, 'gdou-campus-login', 'account.json');
}

/** 公告缓存文件：重启后不必等登录就能显示上次抓到的通知。 */
function noticesFile() {
  const base = process.env.DSH_PROFILE_DIR || join(homedir(), '.dsh');
  return join(base, 'gdou-campus-login', 'notices.json');
}

function loadNoticesCache() {
  try {
    const data = JSON.parse(readFileSync(noticesFile(), 'utf8'));
    if (data && Array.isArray(data.items)) return data;
  } catch {
    /* 没有缓存就用空值 */
  }
  return null;
}

function saveNoticesCache(notices) {
  try {
    const file = noticesFile();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(notices, null, 2), { encoding: 'utf8', mode: 0o600 });
  } catch {
    /* 缓存写失败不影响使用 */
  }
}

/** 插件设置文件（检测间隔、自动认证开关等）。 */
function settingsFile() {
  const base = process.env.DSH_PROFILE_DIR || join(homedir(), '.dsh');
  return join(base, 'gdou-campus-login', 'settings.json');
}

/** 读取插件设置；不存在时返回 null。 */
function loadSettings() {
  try {
    const data = JSON.parse(readFileSync(settingsFile(), 'utf8'));
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

/** 保存插件设置。 */
function persistSettings(patch) {
  const file = settingsFile();
  mkdirSync(dirname(file), { recursive: true });
  const current = loadSettings() || {};
  writeFileSync(file, JSON.stringify({ ...current, ...patch }, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
  return file;
}

/**
 * 读取账号列表。
 * 新格式：{ accounts: [{ username, password }], active: '学号' }
 * 旧格式（单账号 { username, password, acid }）会自动迁移。
 */
function loadAccounts() {
  try {
    const data = JSON.parse(readFileSync(accountFile(), 'utf8'));
    if (Array.isArray(data.accounts)) {
      const accounts = data.accounts
        .filter((a) => a && typeof a.username === 'string' && a.username)
        .map((a) => ({
          username: a.username,
          password: typeof a.password === 'string' ? a.password : '',
        }));
      const active = typeof data.active === 'string' && data.active
        ? data.active
        : (accounts[0] && accounts[0].username) || '';
      return { accounts, active, legacy: data };
    }
    // 旧版单账号
    if (typeof data.username === 'string' && data.username) {
      return {
        accounts: [{ username: data.username, password: data.password || '' }],
        active: data.username,
        legacy: data,
      };
    }
    return { accounts: [], active: '', legacy: data };
  } catch {
    return { accounts: [], active: '', legacy: null };
  }
}

/** 保存账号列表到插件私有文件（权限 0600）。 */
function persistAccounts(accounts, active) {
  const file = accountFile();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ accounts, active }, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
  return file;
}

// ---------- srun (深澜) 协议实现 ----------
const B64_CUSTOM = 'LVoJPiCN2R8G90yg+hmFHuacZ1OWMnrsSTXkYpUq/3dlbfKwv6xztjI7DeBE45QA';
const B64_STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function leU32(b, o) {
  return ((b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0);
}

function mix(buf, appendSize) {
  const res = [];
  const len = buf.length;
  const full = Math.floor(len / 4);
  for (let i = 0; i < full; i++) {
    const o = i * 4;
    res.push(leU32(buf, o));
  }
  const rem = len % 4;
  if (rem > 0) {
    const last = [0, 0, 0, 0];
    for (let j = 0; j < rem; j++) last[j] = buf[full * 4 + j];
    res.push(leU32(last, 0));
  }
  if (appendSize) res.push(len >>> 0);
  return res;
}

function split(u32s, includeSize) {
  const len = u32s.length;
  const sizeRecord = u32s[len - 1] >>> 0;
  if (includeSize) {
    const size = (len - 1) * 4;
    if (sizeRecord < size - 3 || sizeRecord > size) return Buffer.alloc(0);
  }
  const out = Buffer.alloc(len * 4);
  for (let i = 0; i < len; i++) {
    const v = u32s[i] >>> 0;
    out[i * 4] = v & 0xff;
    out[i * 4 + 1] = (v >>> 8) & 0xff;
    out[i * 4 + 2] = (v >>> 16) & 0xff;
    out[i * 4 + 3] = (v >>> 24) & 0xff;
  }
  return includeSize ? out.subarray(0, sizeRecord) : out;
}

function xEncode(msg, key) {
  const msgBuf = Buffer.from(msg, 'utf8');
  if (msgBuf.length === 0) return Buffer.alloc(0);
  const m = mix(msgBuf, true);
  const k = mix(Buffer.from(key, 'utf8'), false);

  const len = m.length;
  const last = len - 1;
  let right = m[last] >>> 0;
  const c = 0x9e3779b9;
  let d = 0;

  const count = 6 + Math.floor(52 / len);
  for (let round = 0; round < count; round++) {
    d = (d + c) >>> 0;
    const e = (d >>> 2) & 3;
    for (let p = 0; p <= last; p++) {
      const left = m[(p + 1) % len] >>> 0;
      const r = right >>> 0;
      let t = ((r >>> 5) ^ (left << 2)) >>> 0;
      t = (t + ((((left >>> 3) ^ (r << 4)) ^ (d ^ left)) >>> 0)) >>> 0;
      t = (t + ((k[(p & 3) ^ e] ^ r) >>> 0)) >>> 0;
      t = (t + (m[p] >>> 0)) >>> 0;
      right = t;
      m[p] = t;
    }
  }
  return split(m, false);
}

function srunBase64(buf) {
  const std = buf.toString('base64');
  let out = '';
  for (const ch of std) {
    const i = B64_STD.indexOf(ch);
    out += i >= 0 ? B64_CUSTOM[i] : ch;
  }
  return out;
}

function hmd5(token, password) {
  return createHmac('md5', token).update(password, 'utf8').digest('hex');
}

function buildInfo(username, password, ip, acid, token) {
  const payload = JSON.stringify({ username, password, ip, acid, enc_ver: 'srun_bx1' });
  return '{SRBX1}' + srunBase64(xEncode(payload, token));
}

function buildChksum(token, username, hmd5hex, acid, ip, n, type, info) {
  const joined = ['', username, hmd5hex, String(acid), ip, String(n), String(type), info].join(token);
  return createHash('sha1').update(joined, 'utf8').digest('hex');
}

// ---------- HTTP / 网络工具 ----------
/**
 * 本校区已知有效的接入设备（AC）编号。
 * 实测无效（Nas type not found / Unknow ac-type）的编号不在其中。
 * 各 AC 服务的地址段不同，登录时必须用对，否则认证服务器等不到接入设备响应。
 */
const KNOWN_ACIDS = [
  25, 118, 117, 116, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130,
  100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 113, 114,
];

/** 两次认证尝试之间的最小间隔：检测可以每秒一次，认证不能。 */
const LOGIN_COOLDOWN_MS = 8000;

function now() {
  return String(Math.floor(Date.now() / 1000) - 2);
}

function normalizeServer(s) {
  return (s || '').replace(/\/+$/, '');
}

function qs(params) {
  return params.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
}

function httpGet(url, timeoutMs, signal) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
    if (signal) {
      const onAbort = () => req.destroy(new Error('已取消'));
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

/** 带状态与 Location 的 GET，用于跟随门户重定向。 */
function httpGetRaw(url, timeoutMs, signal, follow = false) {
  const attempt = (target, hops) =>
    new Promise((resolve, reject) => {
      // 校园门户是 http，学校网站/镜像站是 https，按目标地址选协议。
      // agent:false 避免复用已被服务端关闭的 keep-alive 连接（会报 socket hang up）。
      const lib = String(target).startsWith('https:') ? https : http;
      const req = lib.get(target, { timeout: timeoutMs, rejectUnauthorized: false, agent: false }, (res) => {
        const status = res.statusCode || 0;
        const location = res.headers.location || '';
        if (follow && status >= 300 && status < 400 && location && hops > 0) {
          res.resume();
          const next = location.startsWith('http') ? location : new URL(location, target).toString();
          attempt(next, hops - 1).then(resolve, reject);
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status, location, finalUrl: target, body: Buffer.concat(chunks).toString('utf8') }),
        );
        res.on('error', reject);
      });
      req.on('timeout', () => req.destroy(new Error('请求超时')));
      req.on('error', reject);
      if (signal) {
        const onAbort = () => req.destroy(new Error('已取消'));
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  return attempt(url, follow ? 4 : 0);
}

function parseJsonp(text) {
  const s = text.indexOf('(');
  const e = text.lastIndexOf(')');
  if (s < 0 || e < 0 || e <= s) {
    const snippet = String(text || '').replace(/\s+/g, ' ').slice(0, 120);
    throw new Error('认证服务器返回异常' + (snippet ? '：' + snippet : '（空响应）'));
  }
  try {
    return JSON.parse(text.slice(s + 1, e));
  } catch {
    throw new Error('认证服务器返回无法解析：' + String(text).slice(0, 120));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 上网协议（网页登录前必须勾选同意） ----------
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('认证服务器返回无法解析：' + String(text).slice(0, 120));
  }
}

// 该接口只接受表单编码（application/json 会被拒为「用户名不能为空」）。
function httpPostForm(url, params, timeoutMs, signal) {
  const body = Object.entries(params ?? {})
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = http.request(
      {
        host: target.hostname,
        port: target.port || 80,
        path: target.pathname + target.search,
        method: 'POST',
        timeout: timeoutMs,
        headers: {
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'content-length': Buffer.byteLength(body),
          'x-requested-with': 'XMLHttpRequest',
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
    if (signal) {
      const onAbort = () => req.destroy(new Error('已取消'));
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    req.write(body);
    req.end();
  });
}

/** 读取最新协议与本人已同意的协议列表。 */
async function fetchAgreement(cfg, signal) {
  const server = normalizeServer(cfg.server);
  const latestRaw = await httpGet(`${server}/v1/srun_portal_agree_new?${qs([['agree_type', '1'], ['_', now()]])}`, Math.max(cfg.timeoutMs, 6000), signal);
  const latest = parseJson(latestRaw);
  const data = latest && latest.data ? latest.data : null;
  if (!data || !data.id) return { required: false, id: 0, title: '', agreed: true };

  const agreedRaw = await httpGet(
    `${server}/v1/srun_portal_agrees?${qs([['user_name', cfg.username], ['_', now()]])}`,
    Math.max(cfg.timeoutMs, 6000),
    signal,
  );
  const agreed = parseJson(agreedRaw);
  const list = agreed && Array.isArray(agreed.data) ? agreed.data : [];
  return {
    required: true,
    id: data.id,
    title: String(data.title || '').trim(),
    agreed: list.includes(data.id),
  };
}

/**
 * 查询流量用量。
 * rad_user_info 返回本次会话与账号累计的流量、时长、套餐等信息。
 */
// ---------- 选课公告 ----------
const NOTICE_DEFAULTS = {
  url: 'https://jwc.gdou.edu.cn/',
  keywords: ['选课', '预选', '退改选'],
  maxItems: 3,
};

/** 把网页转成纯文本。 */
function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 从正文里抓「X月X日 HH:mm － X月X日 HH:mm」这类时间段。 */
function parseTimeRanges(text, baseYear) {
  const ranges = [];
  const re = /((?:\d{4}年)?\d{1,2}月\d{1,2}日\s*\d{1,2}[:：]\d{2})[^0-9]{0,14}?[－—\-~～至到]{1,2}[^0-9]{0,14}?((?:\d{4}年)?\d{1,2}月\d{1,2}日\s*\d{1,2}[:：]\d{2})/g;
  let m;
  while ((m = re.exec(text)) !== null && ranges.length < 6) {
    const raw = m[0];
    const parts = raw.match(/(?:\d{4}年)?\d{1,2}月\d{1,2}日\s*\d{1,2}[:：]\d{2}/g) || [];
    if (parts.length < 2) continue;
    const toDate = (s, fallbackYear) => {
      const y = /(\d{4})年/.exec(s);
      const mo = /(\d{1,2})月/.exec(s);
      const d = /(\d{1,2})日/.exec(s);
      const t = /(\d{1,2})[:：](\d{2})/.exec(s);
      if (!mo || !d) return null;
      const dt = new Date(
        y ? Number(y[1]) : fallbackYear,
        Number(mo[1]) - 1,
        Number(d[1]),
        t ? Number(t[1]) : 0,
        t ? Number(t[2]) : 0,
        0, 0,
      );
      return Number.isNaN(dt.getTime()) ? null : dt;
    };
    let start = toDate(parts[0], baseYear);
    let end = toDate(parts[1], baseYear);
    if (!start || !end) continue;
    if (end < start && !/\d{4}年/.test(parts[1])) {
      // 跨年
      end = new Date(end.getFullYear() + 1, end.getMonth(), end.getDate(), end.getHours(), end.getMinutes());
    }
    // 取时间前面的「第一轮/第二轮」等说明
    const before = text.slice(Math.max(0, m.index - 60), m.index);
    const labelMatch = /(第[一二三四五六七八九十]+轮|补选|退选|改选|正选)[^：:]{0,6}[：:]?\s*$/.exec(before);
    ranges.push({
      label: labelMatch ? labelMatch[1] : '',
      start: start.getTime(),
      end: end.getTime(),
      raw: raw.replace(/\s+/g, ' '),
    });
  }
  return ranges;
}

/** 抓取教务部首页上的选课类通知，并解析其中的时间段。 */
async function fetchNotices(cfg, signal) {
  const url = cfg.noticeUrl || NOTICE_DEFAULTS.url;
  const keywords = (cfg.noticeKeywords && cfg.noticeKeywords.length ? cfg.noticeKeywords : NOTICE_DEFAULTS.keywords);
  const timeout = Math.max(cfg.timeoutMs, 9000);

  const listHtml = await httpGetRaw(url, timeout, signal, true);
  const html = listHtml.body || '';
  const linkRe = /<a[^>]*href="([^"]*info\/\d+\/\d+\.htm)"[^>]*>\s*([^<]{3,120}?)\s*<\/a>/g;
  const seen = new Set();
  const candidates = [];
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const title = m[2].replace(/[\u200b\u00ad]/g, '').trim();
    if (!title || title === '详细信息' || seen.has(title)) continue;
    if (!keywords.some((k) => title.includes(k))) continue;
    seen.add(title);
    candidates.push({
      title,
      url: m[1].startsWith('http') ? m[1] : new URL(m[1], url).toString(),
    });
    if (candidates.length >= NOTICE_DEFAULTS.maxItems) break;
  }

  const items = [];
  for (const c of candidates) {
    try {
      const detail = await httpGetRaw(c.url, timeout, signal, true);
      const text = htmlToText(detail.body);
      const published = /时间：\s*(\d{4}-\d{2}-\d{2})/.exec(text);
      const baseYear = published ? Number(published[1].slice(0, 4)) : new Date().getFullYear();
      const ranges = parseTimeRanges(text, baseYear);
      const excerptIdx = Math.max(0, text.indexOf('预选') >= 0 ? text.indexOf('预选') : 0);
      items.push({
        title: c.title,
        url: c.url,
        publishedAt: published ? published[1] : '',
        ranges,
        excerpt: text.slice(excerptIdx, excerptIdx + 160),
      });
    } catch (error) {
      items.push({
        title: c.title,
        url: c.url,
        ranges: [],
        excerpt: '',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { fetchedAt: Date.now(), source: url, items };
}

// ---------- 测速 ----------
/**
 * 可选测速源。
 * 高校测速站（中科大、华东师大等）只允许本校网络访问，校外不可用，已移除。
 * 现在使用云端镜像 + 微软官方下载节点（download.microsoft.com，支持 Range）。
 */
const SPEED_SOURCES = [
  { id: 'microsoft', name: '微软', url: 'https://go.microsoft.com/fwlink/?linkid=2088631', chunkMB: 16 },
  { id: 'tencent', name: '腾讯云', url: 'https://mirrors.cloud.tencent.com/ubuntu/ls-lR.gz' },
  { id: 'cloudflare', name: 'Cloudflare', url: 'https://speed.cloudflare.com/__down?bytes=30000000' },
  { id: 'huawei', name: '华为云', url: 'https://mirrors.huaweicloud.com/ubuntu/ls-lR.gz' },
  { id: 'aliyun', name: '阿里云', url: 'https://mirrors.aliyun.com/ubuntu/ls-lR.gz' },
];

/** 单条连接的下载上限与总时长上限。 */
const SPEED_CONNS = 8;
const SPEED_PER_CONN_BYTES = 24 * 1024 * 1024;
const SPEED_MAX_MS = 6000;

const SPEED_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  accept: '*/*',
  'accept-language': 'zh-CN,zh;q=0.9',
};

/**
 * 量一条连接的下载吞吐。
 * 用 Range 限住大小，并且只统计「首字节之后」的时间，避免把建连延迟算进速率。
 */
function measureDownload(url, options = {}, hop = 0) {
  const maxBytes = options.maxBytes || 15 * 1024 * 1024;
  const maxMs = options.maxMs || 8000;
  const rangeStart = options.rangeStart || 0;
  const lib = url.startsWith('https:') ? https : http;

  return new Promise((resolve) => {
    const started = Date.now();
    let firstByteAt = 0;
    let bytes = 0;
    let settled = false;
    let status = 0;

    const finish = (extra) => {
      if (settled) return;
      settled = true;
      const end = Date.now();
      const activeMs = Math.max(1, end - (firstByteAt || started));
      const mbps = bytes > 0 ? (bytes * 8) / 1e6 / (activeMs / 1000) : 0;
      // 只有真的拿到足够数据且状态正常才算成功；
      // 否则像中科大的 "not ustc" 这种 8 字节错误页会被误判成成功。
      const enough = bytes >= 16384;
      resolve({
        ok: !(extra && extra.error) && status < 400 && enough,
        status,
        bytes,
        ttfbMs: firstByteAt ? firstByteAt - started : 0,
        activeMs,
        totalMs: end - started,
        mbps,
        ...extra,
      });
    };

    const req = lib.get(url, {
      timeout: 6000,
      rejectUnauthorized: false,
      headers: { ...SPEED_HEADERS, range: `bytes=${rangeStart}-${rangeStart + maxBytes - 1}` },
    }, (res) => {
      status = res.statusCode || 0;

      if (status >= 300 && status < 400 && res.headers.location && hop < 2) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        measureDownload(next, options, hop + 1).then(resolve, () => finish({ error: '重定向失败' }));
        return;
      }

      firstByteAt = Date.now();
      res.on('data', (c) => {
        bytes += c.length;
        if (bytes >= maxBytes || Date.now() - started >= maxMs) {
          req.destroy();
          finish();
        }
      });
      res.on('end', () => finish());
      res.on('close', () => finish());
      res.on('error', () => finish({ error: '读取中断' }));
    });

    req.on('timeout', () => { req.destroy(); finish({ error: '请求超时' }); });
    req.on('error', (e) => finish({ error: e.code || String(e.message || e) }));
  });
}

/**
 * 跑一次测速。
 * 单连接会被镜像站限速，所以并发多条连接，按总量/墙钟时间计算聚合带宽。
 */
async function runSpeedTest(sourceId) {
  const source = SPEED_SOURCES.find((s) => s.id === sourceId) || SPEED_SOURCES[0];
  const started = Date.now();

  const chunk = (source.chunkMB ? source.chunkMB * 1024 * 1024 : SPEED_PER_CONN_BYTES);
  const conns = source.conns || SPEED_CONNS;
  const jobs = Array.from({ length: conns }, (_, i) =>
    measureDownload(source.url, {
      maxBytes: chunk,
      maxMs: SPEED_MAX_MS,
      rangeStart: i * chunk,
    }));

  const parts = await Promise.all(jobs);
  const elapsed = Math.max(1, Date.now() - started);
  const bytes = parts.reduce((sum, p) => sum + p.bytes, 0);
  const okParts = parts.filter((p) => p.ok).length;
  const firstStatus = (parts.find((p) => p.status) || {}).status || 0;
  const ttfb = Math.min(...parts.filter((p) => p.ttfbMs > 0).map((p) => p.ttfbMs), Infinity);

  const ok = okParts > 0 && bytes >= 65536;
  const mbps = ok ? (bytes * 8) / 1e6 / (elapsed / 1000) : 0;

  let message = '';
  if (!ok) {
    if (firstStatus === 403) message = '该站点拒绝校外访问';
    else if (firstStatus === 500) message = '该站点限制校外访问';
    else if (firstStatus === 404) message = '测速文件不存在';
    else if (parts.every((p) => p.error)) message = parts[0].error || '连接失败';
    else if (bytes > 0 && bytes < 65536) message = '返回内容不是测速数据';
    else message = '未取得数据';
  }

  return {
    ok,
    sourceId: source.id,
    sourceName: source.name,
    mbps: Number(mbps.toFixed(1)),
    bytes,
    conns,
    ttfbMs: Number.isFinite(ttfb) ? ttfb : 0,
    activeMs: elapsed,
    totalMs: Date.now() - started,
    status: firstStatus,
    message,
    measuredAt: Date.now(),
  };
}

async function fetchUsage(cfg, signal) {
  const server = normalizeServer(cfg.server);
  const raw = await httpGet(
    `${server}/cgi-bin/rad_user_info?${qs([['callback', 'sdu'], ['_', now()]])}`,
    Math.max(cfg.timeoutMs, 8000),
    signal,
  );
  const j = parseJsonp(raw);
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  if (!j || j.error !== 'ok') {
    return {
      ok: false,
      message: String((j && (j.error_msg || j.error)) || '当前未在线'),
      updatedAt: Date.now(),
    };
  }
  return {
    ok: true,
    // 账号累计总用量
    totalBytes: num(j.sum_bytes),
    totalSeconds: num(j.sum_seconds),
    // 本次在线用量
    sessionBytes: num(j.all_bytes),
    bytesIn: num(j.bytes_in),
    bytesOut: num(j.bytes_out),
    // 套餐余量（部分套餐为 0 表示不限或不适用）
    remainBytes: num(j.remain_bytes),
    remainSeconds: num(j.remain_seconds),
    product: String(j.products_name || j.billing_name || ''),
    onlineSince: num(j.add_time) * 1000 || 0,
    onlineDevices: num(j.online_device_total),
    updatedAt: Date.now(),
  };
}

/**
 * 像浏览器一样请求一个外网 HTTP 地址，看会被劫持到哪里。
 * 校园网未认证时，接入设备会把请求 302 到门户登录页，
 * 那个 Location 里就带着本次连接真实的 ac_id（以及 nas_ip）。
 * 这是拿到「当前接入设备」最可靠的方式；在线时不会有跳转，返回 null。
 */
async function probeCaptiveRedirect(cfg, signal) {
  // 混用「域名」和「IP 字面量」两类探测点：
  // 门户若劫持 DNS，域名会解析到门户；若只劫持 80 端口，IP 字面量这条能命中。
  const probes = [
    'http://connect.rom.miui.com/generate_204',
    'http://223.5.5.5/',
    'http://www.baidu.com/',
    'http://1.1.1.1/',
    'http://captive.apple.com/hotspot-detect.html',
  ];
  const timeout = Math.max(cfg.timeoutMs, 5000);

  for (const start of probes) {
    try {
      let current = start;
      // 跟几跳：有的门户先 302 到中转页，再用 meta refresh 跳到登录页
      for (let hop = 0; hop < 3; hop++) {
        const res = await httpGetRaw(current, timeout, signal, false);

        let next = '';
        if (res.status >= 300 && res.status < 400 && res.location) {
          next = res.location.startsWith('http') ? res.location : new URL(res.location, current).toString();
        } else {
          const meta = /http-equiv=["']?refresh["']?[^>]*content=["'][^"']*url=([^"'>\s]+)/i.exec(res.body || '');
          if (meta) {
            next = meta[1].replace(/&amp;/g, '&');
            if (!next.startsWith('http')) next = new URL(next, current).toString();
          }
        }
        if (!next || next === current) break;

        const lookedLikePortal = /10\.\d+\.\d+\.\d+|srun_portal|\/cgi-bin\//i.test(next);
        current = next;
        if (!lookedLikePortal) continue;

        const acId = /[?&]ac_id=(\d+)/.exec(current);
        const nasIp = /[?&]nas_ip=([^&]+)/.exec(current);
        if (acId) {
          return {
            url: current,
            acId: Number(acId[1]),
            nasIp: nasIp ? decodeURIComponent(nasIp[1]) : '',
            via: 'captive',
          };
        }
      }
    } catch {
      /* 这个探测点不通就换下一个 */
    }
  }
  return null;
}

/**
 * 抓取门户跳转链，取出本机真实登录入口。
 * ac_id / nas_ip 都在门户跳转回来的链接里，是本次连接的权威值：
 * 断网时门户会 302 到 /srun_portal_pc?ac_id=N&nas_ip=...，
 * 有时还会经一层 index_N.html 的 meta refresh 再跳一次，两种都要跟。
 */
async function probePortalEntry(cfg, signal) {
  const server = normalizeServer(cfg.server);

  // 优先用劫持跳转：它能反映本次连接真正的接入设备。
  const captive = await probeCaptiveRedirect(cfg, signal);
  if (captive && captive.acId) {
    return { ...captive, chain: [captive.url], checkedAt: Date.now() };
  }

  const visited = [];
  let current = `${server}/`;
  let error = '';

  try {
    for (let hop = 0; hop < 4; hop++) {
      visited.push(current);
      const res = await httpGetRaw(current, Math.max(cfg.timeoutMs, 6000), signal, false);

      let next = '';
      if (res.status >= 300 && res.status < 400 && res.location) {
        next = res.location.startsWith('http') ? res.location : new URL(res.location, current).toString();
      } else {
        // 有些跳转是页面里的 meta refresh
        const meta = /http-equiv=["']?refresh["']?[^>]*content=["'][^"']*url=([^"'>\s]+)/i.exec(res.body || '');
        if (meta) {
          next = meta[1].replace(/&amp;/g, '&');
          if (!next.startsWith('http')) next = new URL(next, current).toString();
        }
      }
      if (!next || next === current) break;
      current = next;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  // 从整条跳转链里取最后一个 ac_id / nas_ip（最具体的那次）
  let acId = null;
  let nasIp = '';
  for (const url of visited) {
    const a = /[?&]ac_id=(\d+)/.exec(url);
    if (a) acId = Number(a[1]);
    const n = /[?&]nas_ip=([^&]+)/.exec(url);
    if (n) nasIp = decodeURIComponent(n[1]);
  }

  return {
    url: visited[visited.length - 1] || '',
    chain: visited,
    acId,
    nasIp,
    via: 'root', // 门户根路径的通用跳转，可能是默认值，可信度低
    ...(error ? { error } : {}),
    checkedAt: Date.now(),
  };
}

/** 绑定「同意协议」，由用户在面板里勾选后才会调用。 */
async function bindAgreement(cfg, agreeId, signal) {
  const server = normalizeServer(cfg.server);
  const raw = await httpPostForm(
    `${server}/v1/srun_portal_agree_bind`,
    { agree_id: agreeId, user_name: cfg.username },
    Math.max(cfg.timeoutMs, 8000),
    signal,
  );
  const res = parseJson(raw);
  return { ok: res && res.code === 0, code: res && res.code, message: (res && res.message) || '' };
}

/**
 * 判断是否已联网。
 * 校园网在未认证时常常仍能完成 TCP 连接（被认证门户劫持），
 * 所以只做 TCP 探测会误判为「已联网」，永远不触发自动登录。
 * 这里改看 HTTP 响应：被跳转到认证门户或拿到门户页面，才算未认证。
 */
function tcpOnline(host, port, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (online) => {
      if (settled) return;
      settled = true;
      resolve(online);
    };
    const req = http.get({ host, port, path: '/', timeout: timeoutMs }, (res) => {
      const status = res.statusCode || 0;
      const location = String(res.headers.location || '').toLowerCase();
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size <= 65536) chunks.push(c);
      });
      res.on('end', () => {
        if (status >= 300 && status < 400) {
          done(!(location.includes('10.129.') || location.includes('cgi-bin') || location.includes('srun')));
          return;
        }
        const body = Buffer.concat(chunks).toString('utf8').toLowerCase();
        if (body.includes('srun_portal') || body.includes('cgi-bin/srun') || body.includes('深澜') || body.includes('校园网认证')) {
          done(false);
          return;
        }
        done(status >= 200 && status < 400);
      });
      res.on('error', () => done(false));
    });
    req.on('timeout', () => { req.destroy(); done(false); });
    req.on('error', () => done(false));
  });
}

/** 登录带重试：刚登出时认证服务器偶尔仍在收尾，直接登录会瞬时失败。 */
async function loginWithRetry(cfg, signal, attempts = 4) {
  let lastError;
  let lastResult;
  for (let i = 0; i < attempts; i++) {
    try {
      const result = await doLogin(cfg, signal);
      // 后端 BAS 超时属于瞬时故障，换个 challenge 再试通常就过了。
      const transient = result
        && String(result.error || '') === 'login_error'
        && /BAS|INFO|timeout/i.test(String(result.error_msg || ''));
      if (!transient) return result;
      lastResult = result;
    } catch (error) {
      lastError = error;
      if (signal && signal.aborted) throw error;
      if (error && error.fatal) throw error;
    }
    if (i < attempts - 1) await sleep(1200);
  }
  if (lastResult) return lastResult;
  throw lastError;
}

/**
 * 认证请求串行化。
 * 同一账号并发发起两次 srun 认证（例如后台自动登录与手动点击同时进行）
 * 会让其中一次失败，所以所有 login/logout 都必须排队执行。
 */
function createAuthQueue() {
  let tail = Promise.resolve();
  return function run(task) {
    const next = tail.then(task, task);
    tail = next.then(() => {}, () => {});
    return next;
  };
}

function isConfigured(cfg) {
  return !!(cfg && cfg.username && cfg.password);
}

async function getChallenge(cfg, signal, ip) {
  const server = normalizeServer(cfg.server);
  const url = `${server}/cgi-bin/get_challenge?${qs([
    ['callback', 'sdu'],
    ['username', cfg.username],
    ['ip', ip || ''],
    ['_', now()],
  ])}`;
  return parseJsonp(await httpGet(url, Math.max(cfg.timeoutMs, 8000), signal));
}

/**
 * 取一个与「本机 IP」绑定的 challenge。
 * 官方页面请求 token 时带的是真实 IP；不带 IP 取到的 token 在后续
 * 登录解码 info 时可能对不上，表现为 "INFO failed"。
 */
async function getBoundChallenge(cfg, signal) {
  const first = await getChallenge(cfg, signal);
  const ip = first.online_ip || first.client_ip || '';
  if (!ip) throw new Error('认证服务器未返回本机 IP');
  const second = await getChallenge(cfg, signal, ip);
  if (second && second.challenge) return { token: second.challenge, ip };
  return { token: first.challenge, ip };
}

async function doLogin(cfg, signal) {
  const server = normalizeServer(cfg.server);
  const { token, ip } = await getBoundChallenge(cfg, signal);
  if (!token) throw new Error('认证服务器未返回 challenge');

  const hm = hmd5(token, cfg.password);
  const info = buildInfo(cfg.username, cfg.password, ip, cfg.acid, token);
  const chksum = buildChksum(token, cfg.username, hm, cfg.acid, ip, cfg.n, cfg.type, info);

  const url = `${server}/cgi-bin/srun_portal?${qs([
    ['callback', 'sdu'],
    ['action', 'login'],
    ['username', cfg.username],
    ['password', '{MD5}' + hm],
    ['ip', ip],
    ['ac_id', String(cfg.acid)],
    ['n', String(cfg.n)],
    ['type', String(cfg.type)],
    ['os', cfg.os],
    ['name', cfg.name],
    ['double_stack', '0'],
    ['info', info],
    ['chksum', chksum],
    ['_', now()],
  ])}`;
  // 认证要经后端 Radius，比查 challenge 慢得多，需要更长的等待。
  const loginTimeout = Math.max(cfg.timeoutMs, 15000);
  return parseJsonp(await httpGet(url, loginTimeout, signal));
}

async function doLogout(cfg, signal) {
  const server = normalizeServer(cfg.server);
  const { token, ip } = await getBoundChallenge(cfg, signal);
  const url = `${server}/cgi-bin/srun_portal?${qs([
    ['callback', 'sdu'],
    ['action', 'logout'],
    ['username', cfg.username],
    ['ip', ip],
    ['ac_id', String(cfg.acid)],
    ['_', now()],
  ])}`;
  return parseJsonp(await httpGet(url, Math.max(cfg.timeoutMs, 15000), signal));
}

/**
 * 把 srun 的返回归类成人话。
 * srun 的成功返回里 suc_msg 可能是 `ip_already_online_error`，
 * 而真正的结论看 error/res 与 ploy_msg（例如 `E0000: Login is successful.`）。
 */
function summarize(result, action) {
  const raw = result || {};
  const code = String(raw.error || raw.res || '');
  const ploy = String(raw.ploy_msg || '');
  const ok = code === 'ok' || !!raw.access_token || ploy.startsWith('E0000');

  let msg;
  if (action === 'logout') {
    msg = ok ? '已登出' : (raw.error_msg || code || '登出失败');
  } else if (ploy.startsWith('E0000')) {
    // 本网关成功登录也会带 suc_msg=ip_already_online_error，真正的结论看 ploy_msg。
    msg = '登录成功';
  } else if (raw.suc_msg === 'ip_already_online_error') {
    msg = '当前设备已在线';
  } else if (ok) {
    msg = '登录成功';
  } else if (code === 'login_error') {
    // INFO failed/BAS 超时 与 密码错误 都可能落到这里，交给 detail 区分。
    msg = /BAS|INFO/.test(String(raw.error_msg || ''))
      ? '后端认证超时（可重试）'
      : '账号或密码错误';
  } else if (code === 'E2531' || raw.ecode === 'E2531') {
    msg = '账号不存在或密码错误';
  } else {
    msg = raw.error_msg || code || '登录失败';
  }

  // 服务端原始原因，供界面展开查看。
  const detail = String(raw.error_msg || raw.ploy_msg || '');
  return { ok, action, msg, code, detail, raw };
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

// ---------- 插件主体 ----------
export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig);

  // 面板里保存过的账号优先于 patch 中的静态配置（支持多账号）。
  const store = loadAccounts();
  const legacy = store.legacy || {};
  const posNum = (v) => (Number.isFinite(v) && v > 0 ? v : 0);

  const activeAccount = store.accounts.find((a) => a.username === store.active) || store.accounts[0] || null;
  if (activeAccount) {
    config.username = activeAccount.username;
    if (activeAccount.password) config.password = activeAccount.password;
  }

  // 旧版单账号文件自动迁移成多账号格式。
  if (store.legacy && !Array.isArray(store.legacy.accounts) && store.accounts.length > 0) {
    try { persistAccounts(store.accounts, activeAccount ? activeAccount.username : ''); } catch {}
  }

  // 面板里保存过的设置优先于 patch 中的静态配置。
  const savedSettings = loadSettings() || {};
  if (Number.isFinite(savedSettings.intervalSec) && savedSettings.intervalSec >= 1) {
    config.intervalSec = Math.floor(savedSettings.intervalSec);
  }
  if (typeof savedSettings.autoLogin === 'boolean') {
    config.autoLogin = savedSettings.autoLogin;
  }
  if (savedSettings.background && ['blueprint', 'grid', 'plain', 'off'].includes(savedSettings.background)) {
    config.background = savedSettings.background;
  }

  // ac_id 从账号文件（旧版）迁移到设置文件。
  const savedLastGood = posNum(savedSettings.lastGoodAcid) || posNum(legacy.acid);
  const savedManual = posNum(savedSettings.manualAcid) || posNum(legacy.manualAcid);
  if (!posNum(savedSettings.lastGoodAcid) && (savedLastGood || savedManual)) {
    try { persistSettings({ lastGoodAcid: savedLastGood, manualAcid: savedManual }); } catch {}
  }

  const state = {
    online: null,
    autoLogin: config.autoLogin !== false,
    lastResult: null,
    lastError: null,
    lastRunAt: 0,
    running: false,
    // 多账号
    accounts: store.accounts,
    // 当前使用的 AC：手动 > 上次成功 > 配置值。
    acid: savedManual || savedLastGood || config.acid,
    lastGoodAcid: savedLastGood,
    // 用户手填的 ac_id（高级覆盖）
    manualAcid: savedManual,
    // 断网劫持跳转里解析出的 ac_id（可信）
    captiveAcid: null,
    // 门户根路径跳转里的 ac_id（多为默认值，仅参考）
    portalAcid: null,
    discoveredAcid: null,
    portalEntry: null,
    // 流量用量缓存
    usage: { ok: false, message: '尚未查询', updatedAt: 0 },
    usageAt: 0,
    usageBusy: false,
    // 测速
    speed: { ok: false, message: '尚未测速', measuredAt: 0 },
    speedBusy: false,
    speedSource: SPEED_SOURCES[0].id,
    // 选课公告
    notices: (loadNoticesCache() || { fetchedAt: 0, items: [] }),
    noticesAt: 0,
    noticesBusy: false,
    // 命中限流后暂停认证，避免越试越糟。
    rateLimitedUntil: 0,
    // 上次真正发起认证的时间（检测可以更频繁，认证需要冷却）。
    lastLoginAttemptAt: 0,
    lastProbeAt: 0,
    // 上网协议：网页登录前必须勾选同意，这里同步服务器要求。
    agreement: { required: false, id: 0, title: '', agreed: false, checkedAt: 0 },
    // 是否处于校园网环境（网关可达）。不在校园网时不做无谓的认证尝试。
    campus: null,
    campusAt: 0,
    // 账号或密码错误后暂停自动重试，避免反复尝试触发风控。
    credentialFailed: false,
    // 运行日志（环形缓冲，最多 120 条）
    logs: [],
    // 一键诊断结果
    diag: null,
  };
  const log = ctx.logger ?? console;
  const auth = createAuthQueue();

  /** 记一条运行日志，面板里可查。 */
  const addLog = (level, text) => {
    state.logs.push({ t: Date.now(), level, text });
    if (state.logs.length > 120) state.logs.shift();
  };

  addLog('info', `插件已加载 · 账号 ${config.username || '未配置'} · ac_id=${state.acid}`);

  /** 判断当前是否连着校园网：只要能打开门户地址就是。 */
  const isOnCampus = async (signal, force) => {
    if (!force && state.campus !== null && Date.now() - state.campusAt < 30000) return state.campus;
    const server = normalizeServer(config.server);
    let ok = false;
    try {
      const res = await httpGetRaw(`${server}/`, 2000, signal, false);
      ok = res.status > 0;
    } catch {
      ok = false;
    }
    if (state.campus !== ok) {
      addLog(ok ? 'info' : 'warn', ok ? '检测到校园网环境' : '未检测到校园网环境，暂停自动登录');
    }
    state.campus = ok;
    state.campusAt = Date.now();
    return ok;
  };

  /**
   * 把失败原因归类，决定后续怎么处理。
   * password → 停手；rate_limit → 长退避；ac → 换 AC；agreement → 等用户勾选。
   */
  const classifyFailure = (sum) => {
    if (!sum) return 'other';
    const detail = String(sum.detail || '');
    const code = String(sum.code || '');
    if (code === 'need_agreement') return 'agreement';
    if (code === 'speed_limit' || /speed_limit/i.test(detail)) return 'rate_limit';
    if (/BAS|INFO|timeout|Nas type|ac-type/i.test(detail)) return 'ac';
    if (code === 'login_error' || code === 'E2531') return 'password';
    return 'other';
  };

  /** 当前生效的配置（ac_id 用当前选定值）。 */
  const activeConfig = () => ({ ...config, acid: state.acid });

  /**
   * 每次登录前向门户要一次入口地址。
   * 只有「断网被劫持」得到的 ac_id 才可信，门户根路径给的多是默认值，
   * 两者分开记录，不混用。
   */
  const resolveAcid = async (signal) => {
    const entry = await probePortalEntry(config, signal);
    state.portalEntry = entry;
    if (entry.acId) {
      if (entry.via === 'captive') {
        if (entry.acId !== state.captiveAcid) {
          log.info(`[校园网] 劫持跳转得到 ac_id=${entry.acId}` + (entry.nasIp ? `, nas_ip=${entry.nasIp}` : ''));
        }
        state.captiveAcid = entry.acId;
      } else if (entry.acId !== state.portalAcid) {
        state.portalAcid = entry.acId;
        log.info(`[校园网] 门户默认 ac_id=${entry.acId}（仅供参考，不优先使用）`);
      }
    }
    return state.acid;
  };

  /**
   * 候选顺序（可信度从高到低）：
   *   1. 断网劫持跳转里的 ac_id —— 反映本次连接的接入设备
   *   2. 手动填写的 ac_id
   *   3. 上次登录成功的值
   *   4. 门户根路径给的值
   *   5. 配置值
   *   6. 已知有效列表
   * 第一个成功的会被记住。
   */
  const acidCandidates = () =>
    [
      ...new Set(
        [state.captiveAcid, state.manualAcid, state.lastGoodAcid, state.portalAcid, config.acid, ...KNOWN_ACIDS].filter(
          (x) => Number.isFinite(x) && x > 0,
        ),
      ),
    ];

  /** 刷新流量用量；默认 15 秒内不重复查询，force 时强制刷新。 */
  const refreshUsage = async (signal, force) => {
    if (!isConfigured(config)) return state.usage;
    if (!force && Date.now() - state.usageAt < 15000) return state.usage;
    if (state.usageBusy) return state.usage;
    state.usageBusy = true;
    try {
      state.usage = await fetchUsage(config, signal);
    } catch (error) {
      state.usage = {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        updatedAt: Date.now(),
      };
    } finally {
      state.usageAt = Date.now();
      state.usageBusy = false;
    }
    return state.usage;
  };

  /** 刷新选课公告；默认 10 分钟缓存，force 时立即重抓。 */
  const refreshNotices = async (signal, force) => {
    if (!force && Date.now() - state.noticesAt < 10 * 60 * 1000) return state.notices;
    if (state.noticesBusy) return state.notices;
    state.noticesBusy = true;
    try {
      state.notices = await fetchNotices(config, signal);
      saveNoticesCache(state.notices);
      addLog('info', `选课公告已更新（${state.notices.items.length} 条）`);
    } catch (error) {
      addLog('warn', '选课公告获取失败：' + (error instanceof Error ? error.message : String(error)));
    } finally {
      state.noticesAt = Date.now();
      state.noticesBusy = false;
    }
    return state.notices;
  };

  /** 像浏览器一样打开一次认证页，让服务器把本机与接入设备关联起来。 */
  const warmUp = async (cfg, signal) => {
    try {
      const server = normalizeServer(cfg.server);
      await httpGetRaw(`${server}/srun_portal_pc?ac_id=${cfg.acid}&theme=pro`, Math.max(cfg.timeoutMs, 6000), signal, true);
    } catch {
      /* 预热失败不阻断登录 */
    }
  };

  /** 刷新协议状态（只读，不会改变任何账号状态）。 */
  const refreshAgreement = async (signal) => {
    if (!isConfigured(config)) return state.agreement;
    try {
      const info = await fetchAgreement(config, signal);
      state.agreement = { ...info, checkedAt: Date.now() };
    } catch (error) {
      state.agreement = {
        ...state.agreement,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    return state.agreement;
  };

  /** 用户勾选同意后绑定协议。 */
  const agreeNow = (signal) => auth(async () => {
    const info = await refreshAgreement(signal);
    if (!info.required) return { ok: true, already: true, agreement: state.agreement };
    if (info.agreed) return { ok: true, already: true, agreement: state.agreement };
    const res = await bindAgreement(config, info.id, signal);
    if (res.ok) {
      state.agreement = { ...info, agreed: true, checkedAt: Date.now() };
      state.lastError = null;
    }
    return { ok: res.ok, message: res.message, agreement: state.agreement };
  });

  /** 串行执行一次登录并记录结果。 */
  const loginNow = (signal) => auth(async () => {
    // 未同意上网协议时网页版会被拦截，这里同样先确认。
    const agr = await refreshAgreement(signal);
    if (agr.required && !agr.agreed) {
      state.lastResult = {
        ok: false,
        action: 'login',
        msg: '需要先勾选同意上网协议',
        code: 'need_agreement',
        detail: agr.title || '',
        raw: null,
      };
      state.lastRunAt = Date.now();
      return state.lastResult;
    }
    // 命中限流时不要继续尝试，越试越糟。
    if (Date.now() < state.rateLimitedUntil) {
      state.lastResult = {
        ok: false,
        action: 'login',
        msg: '认证请求过于频繁，已暂停',
        code: 'speed_limit',
        detail: '服务器限流，约 ' + Math.ceil((state.rateLimitedUntil - Date.now()) / 1000) + ' 秒后自动重试',
        raw: null,
      };
      state.lastRunAt = Date.now();
      return state.lastResult;
    }

    // 每次都重新取门户下发的 ac_id（它会随接入位置变化）。
    await resolveAcid(signal);
    // 按优先级取第一个候选作为本次起始 ac_id。
    state.acid = acidCandidates()[0];
    // 先像浏览器一样打开一次认证页，让服务器把本机与接入设备关联起来。
    await warmUp(activeConfig(), signal);

    const result = await loginWithRetry(activeConfig(), signal);
    state.lastResult = summarize(result, 'login');

    // 「Nas type not found」= ac_id 无效；「BAS 超时」= AC 存在但没响应。
    // 两种情况都换候选再试，但每次最多换 6 个，避免触发限流。
    const transient = () =>
      !state.lastResult.ok
      && /BAS|INFO|timeout|Nas type|ac-type/i.test(String(state.lastResult.detail || '') + String(state.lastResult.msg || ''));

    if (transient()) {
      let tried = 0;
      for (const cand of acidCandidates()) {
        if (cand === state.acid) continue;
        if (tried >= 6) break;
        tried++;
        try {
          log.info(`[校园网] ac_id=${state.acid} 失败（${state.lastResult.detail || state.lastResult.msg}），改用 ac_id=${cand}`);
          state.acid = cand;
          await warmUp(activeConfig(), signal);
          const r2 = await loginWithRetry(activeConfig(), signal);
          state.lastResult = summarize(r2, 'login');
          if (state.lastResult.ok) break;
          if (/speed_limit/i.test(String(state.lastResult.detail || ''))) {
            state.rateLimitedUntil = Date.now() + 180000;
            break;
          }
        } catch (error) {
          log.warn('[校园网] 切换 ac_id 失败：' + (error instanceof Error ? error.message : String(error)));
        }
      }
    }

    // 登录成功就记住这个 AC，下次优先用它。
    if (state.lastResult.ok && !/ip_already_online/.test(String(state.lastResult.msg || ''))) {
      try {
        state.lastGoodAcid = state.acid;
        persistSettings({ lastGoodAcid: state.acid });
        log.info(`[校园网] 已记住可用的 ac_id=${state.acid}`);
      } catch {
        /* 记不住不影响本次登录 */
      }
    }

    // 服务端说「已在线」，但本机其实没网 —— 多半是残留的旧会话（例如手机上那台）
    // 锁着这个账号。先踢掉旧会话，再重新认证一次。
    if (state.lastResult.ok && state.online === false && state.lastResult.code !== 'ok') {
      try {
        log.info('[校园网] 检测到残留会话，先登出再重新认证');
        await doLogout(activeConfig(), signal);
        await sleep(800);
        const retry = await loginWithRetry(activeConfig(), signal);
        state.lastResult = summarize(retry, 'login');
      } catch (error) {
        log.warn('[校园网] 强制重新认证失败：' + (error instanceof Error ? error.message : String(error)));
      }
    }

    state.lastRunAt = Date.now();
    if (state.lastResult.ok) {
      state.online = true;
      state.lastError = null;
      state.credentialFailed = false;
      addLog('info', `登录成功（ac_id=${state.acid}，${state.lastResult.msg || 'ok'}）`);
      // 登录成功后抓一次选课公告（不阻塞登录结果）
      refreshNotices(undefined, true).catch(() => {});
    } else {
      const kind = classifyFailure(state.lastResult);
      if (kind === 'password') {
        state.credentialFailed = true;
        addLog('error', `账号或密码错误，已暂停自动重试：${state.lastResult.detail || state.lastResult.msg}`);
      } else if (kind === 'rate_limit') {
        state.rateLimitedUntil = Date.now() + 180000;
        addLog('warn', '认证请求被限流，暂停 3 分钟');
      } else if (kind === 'agreement') {
        addLog('warn', '需要同意上网协议后才能登录');
      } else {
        addLog('warn', `登录失败：${state.lastResult.detail || state.lastResult.msg}`);
      }
    }
    return state.lastResult;
  });

  /** 串行执行一次登出并记录结果。 */
  const logoutNow = (signal) => auth(async () => {
    await resolveAcid(signal);
    const result = await doLogout(activeConfig(), signal);
    state.lastResult = summarize(result, 'logout');
    state.lastRunAt = Date.now();
    if (state.lastResult.ok) { state.online = false; addLog('info', '已登出'); }
    return state.lastResult;
  });

  const statusPayload = () => ({
    ok: true,
    online: state.online,
    autoLogin: state.autoLogin,
    configured: isConfigured(config),
    username: config.username,
    hasPassword: !!config.password,
    // 多账号：只回显学号，不回传密码
    accounts: state.accounts.map((a) => ({
      username: a.username,
      active: a.username === config.username,
    })),
    server: normalizeServer(config.server),
    acid: state.acid,
    manualAcid: state.manualAcid || null,
    captiveAcid: state.captiveAcid || null,
    portalAcid: state.portalAcid || null,
    lastGoodAcid: state.lastGoodAcid || null,
    portalEntry: state.portalEntry || null,
    usage: state.usage,
    speed: state.speed,
    speedBusy: state.speedBusy,
    speedSource: state.speedSource,
    speedSources: SPEED_SOURCES.map((s) => ({ id: s.id, name: s.name })),
    notices: state.notices,
    noticesBusy: state.noticesBusy,
    noticesAt: state.noticesAt || 0,
    background: config.background,
    intervalSec: config.intervalSec,
    campus: state.campus,
    credentialFailed: state.credentialFailed,
    agreement: state.agreement,
    lastLogin: state.lastResult,
    lastError: state.lastError,
    lastRunAt: state.lastRunAt ? new Date(state.lastRunAt).toISOString() : null,
  });

  const runCheck = async () => {
    if (state.running) return;
    state.running = true;
    try {
      const online = await tcpOnline(config.testHost, config.testPort, config.timeoutMs);
      state.online = online;
      state.lastProbeAt = Date.now();
      if (online) {
        // 在线时顺带刷新流量用量（内部有 15 秒节流）
        await refreshUsage(undefined, false).catch(() => {});
        return;
      }
      if (!state.autoLogin || !isConfigured(config)) return;

      // 不在校园网环境时不做无谓的认证尝试（例如在家用宽带）。
      if (!(await isOnCampus())) return;

      // 账号密码错误后停手，等用户改账号或手动登录，避免触发风控。
      if (state.credentialFailed) return;

      // 检测可以很频繁，但不能每次检测都去认证：
      // 认证有冷却，失败后隔一段时间再试，否则会被服务器限流。
      const now = Date.now();
      if (now - (state.lastLoginAttemptAt || 0) < LOGIN_COOLDOWN_MS) return;
      if (now < state.rateLimitedUntil) return;
      state.lastLoginAttemptAt = now;

      const result = await loginNow();
      log.info(`[校园网] 自动登录：${result.msg || 'ok'}`);
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : String(error);
      state.lastRunAt = Date.now();
      if (isConfigured(config)) log.warn(`[校园网] 检测/登录失败：${state.lastError}`);
    } finally {
      state.running = false;
    }
  };

  /** 一键诊断：把「能不能上网」拆成可检查的几步。 */
  const runDiagnose = async (signal) => {
    const server = normalizeServer(config.server);
    const steps = [];
    const push = (name, ok, detail) => steps.push({ name, ok, detail: String(detail || '') });

    // 1. 校园网关
    try {
      const t0 = Date.now();
      const r = await httpGetRaw(`${server}/`, 3000, signal, false);
      push('校园网关可达', r.status > 0, `HTTP ${r.status} · ${Date.now() - t0}ms`);
    } catch (error) {
      push('校园网关可达', false, error instanceof Error ? error.message : String(error));
    }

    // 2. 门户认证页
    try {
      const r = await httpGetRaw(`${server}/srun_portal_pc?ac_id=${state.acid}&theme=pro`, 4000, signal, false);
      push('门户认证页', r.status >= 200 && r.status < 400, `HTTP ${r.status} · ac_id=${state.acid}`);
    } catch (error) {
      push('门户认证页', false, error instanceof Error ? error.message : String(error));
    }

    // 3. challenge 接口
    let challengeOk = false;
    try {
      const { token, ip } = await getBoundChallenge(config, signal);
      challengeOk = !!token;
      push('认证接口 / get_challenge', challengeOk, `token ${token ? '已获取' : '缺失'} · 本机 IP ${ip}`);
    } catch (error) {
      push('认证接口 / get_challenge', false, error instanceof Error ? error.message : String(error));
    }

    // 4. 上网协议
    const agr = await refreshAgreement(signal);
    push('上网协议', !agr.required || agr.agreed,
      agr.required ? (agr.agreed ? '已同意' : '尚未同意，需在设置里勾选') : '无需同意');

    // 5. ac_id
    push('接入设备 ac_id', Number.isFinite(state.acid) && state.acid > 0,
      `${state.acid}（${state.captiveAcid ? '重定向获取' : state.manualAcid ? '手动覆盖' : state.lastGoodAcid ? '上次成功' : '配置值'}）`);

    // 6. 账号
    push('账号配置', isConfigured(config), isConfigured(config) ? config.username : '未填写账号或密码');

    // 7. 联网状态
    push('当前联网', state.online === true,
      state.online === true ? '已联网' : state.online === false ? '未联网' : '未检测');

    state.diag = { at: Date.now(), steps, ok: steps.every((s) => s.ok) };
    addLog(state.diag.ok ? 'info' : 'warn', `诊断完成：${steps.filter((s) => s.ok).length}/${steps.length} 项正常`);
    return state.diag;
  };

  ctx.tools.register({
    name: 'campus_net',
    description:
      '查询或控制广东海洋大学校园网（深澜 srun 认证）登录状态。action=status 查看配置与最近结果；action=login 立即登录；action=logout 登出。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['status', 'login', 'logout'],
          description: '要执行的操作',
        },
      },
      required: ['action'],
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
    },
    async execute(args, exec) {
      if (args.action === 'status') {
        return JSON.stringify(statusPayload());
      }
      if (!isConfigured(config)) {
        return JSON.stringify({
          ok: false,
          error: '尚未配置校园网账号密码，请在「校园网」面板的账号配置中填写',
        });
      }
      try {
        exec.signal?.throwIfAborted?.();
        const summary = args.action === 'login'
          ? await loginNow(exec.signal)
          : await logoutNow(exec.signal);
        return JSON.stringify(summary);
      } catch (error) {
        return JSON.stringify({
          ok: false,
          action: args.action,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/gdou-campus-net/v1',
    handler: async (req, res) => {
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (isConfigured(config) && !state.agreement.checkedAt) {
          await refreshAgreement();
        }
        json(res, 200, statusPayload());
        return;
      }
      if (req.method === 'POST') {
        let input = {};
        try {
          input = JSON.parse((await readBody(req, 1024 * 1024)) || '{}');
        } catch {}
        try {
          if (input.action === 'setAutoLogin') {
            state.autoLogin = !!input.value;
            try { persistSettings({ autoLogin: state.autoLogin }); } catch {}
            if (state.autoLogin) runCheck().catch(() => {});
            json(res, 200, statusPayload());
          } else if (input.action === 'setInterval') {
            const v = Number(String(input.value ?? '').trim());
            if (!Number.isInteger(v) || v < 1 || v > 3600) {
              json(res, 400, { ok: false, error: '检测间隔必须是 1~3600 之间的整数（秒）' });
              return;
            }
            config.intervalSec = v;
            try {
              persistSettings({ intervalSec: v });
            } catch (error) {
              json(res, 500, { ok: false, error: '保存失败：' + (error instanceof Error ? error.message : String(error)) });
              return;
            }
            // 立即按新间隔重排一次巡检
            runCheck().catch(() => {});
            json(res, 200, statusPayload());
          } else if (input.action === 'setAcid') {
            const raw = String(input.value ?? '').trim();
            // 留空表示清除手填值，恢复「按重定向自动获取」
            if (raw === '') {
              state.manualAcid = 0;
              try { persistSettings({ manualAcid: 0 }); } catch {}
              state.acid = state.captiveAcid || state.lastGoodAcid || config.acid;
              json(res, 200, statusPayload());
              return;
            }
            const v = Number(raw);
            if (!Number.isInteger(v) || v <= 0 || v > 100000) {
              json(res, 400, { ok: false, error: 'ac_id 必须是正整数' });
              return;
            }
            state.manualAcid = v;
            state.acid = v;
            try {
              persistSettings({ manualAcid: v });
            } catch (error) {
              json(res, 500, { ok: false, error: '保存失败：' + (error instanceof Error ? error.message : String(error)) });
              return;
            }
            json(res, 200, statusPayload());
          } else if (input.action === 'refreshUsage') {
            await refreshUsage(undefined, true);
            json(res, 200, statusPayload());
          } else if (input.action === 'logs') {
            json(res, 200, { ok: true, logs: state.logs.slice(-120) });
          } else if (input.action === 'diagnose') {
            try {
              const diag = await runDiagnose();
              json(res, 200, { ok: true, diag });
            } catch (error) {
              json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
            }
          } else if (input.action === 'refreshNotices') {
            await refreshNotices(undefined, true);
            json(res, 200, statusPayload());
          } else if (input.action === 'setBackground') {
            const v = String(input.value ?? '').trim();
            if (!['blueprint', 'grid', 'plain', 'off'].includes(v)) {
              json(res, 400, { ok: false, error: '未知的背景样式' });
              return;
            }
            config.background = v;
            try { persistSettings({ background: v }); } catch {}
            json(res, 200, statusPayload());
          } else if (input.action === 'speedtest') {
            const src = String(input.value ?? '').trim();
            if (src && SPEED_SOURCES.some((s) => s.id === src)) state.speedSource = src;
            if (state.speedBusy) {
              json(res, 409, { ok: false, error: '测速进行中，请稍候' });
              return;
            }
            state.speedBusy = true;
            // 先返回状态，让界面立刻显示「测速中」
            json(res, 202, statusPayload());
            try {
              state.speed = await runSpeedTest(state.speedSource);
            } catch (error) {
              state.speed = {
                ok: false,
                sourceId: state.speedSource,
                sourceName: state.speedSource,
                message: error instanceof Error ? error.message : String(error),
                measuredAt: Date.now(),
              };
            } finally {
              state.speedBusy = false;
            }
          } else if (input.action === 'saveAccount') {
            const username = String(input.username ?? '').trim();
            const password = String(input.password ?? '');
            if (!username) { json(res, 400, { ok: false, error: '账号不能为空' }); return; }
            const existing = state.accounts.find((a) => a.username === username);
            const effectivePassword = password || (existing && existing.password) || (username === config.username && config.password) || '';
            if (!effectivePassword) { json(res, 400, { ok: false, error: '密码不能为空' }); return; }
            try {
              if (existing) {
                existing.password = effectivePassword;
              } else {
                state.accounts.push({ username, password: effectivePassword });
              }
              persistAccounts(state.accounts, username);
              config.username = username;
              config.password = effectivePassword;
              state.lastError = null;
              state.usageAt = 0; // 换账号后流量缓存作废
              state.credentialFailed = false; // 账号变了，允许重新尝试
              state.agreement = { required: false, id: 0, title: '', agreed: false, checkedAt: 0 };
              addLog('info', `已保存账号 ${username}`);
              runCheck().catch(() => {});
              json(res, 200, statusPayload());
            } catch (error) {
              json(res, 500, { ok: false, error: '保存失败：' + (error instanceof Error ? error.message : String(error)) });
            }
          } else if (input.action === 'switchAccount') {
            const username = String(input.username ?? '').trim();
            const target = state.accounts.find((a) => a.username === username);
            if (!target) { json(res, 404, { ok: false, error: '账号不存在' }); return; }
            try {
              persistAccounts(state.accounts, username);
            } catch (error) {
              json(res, 500, { ok: false, error: '切换失败：' + (error instanceof Error ? error.message : String(error)) });
              return;
            }
            config.username = target.username;
            config.password = target.password;
            state.lastError = null;
            state.lastResult = null;
            state.credentialFailed = false;
            state.usage = { ok: false, message: '尚未查询', updatedAt: 0 };
            state.usageAt = 0;
            state.agreement = { required: false, id: 0, title: '', agreed: false, checkedAt: 0 };
            addLog('info', `已切换到账号 ${username}`);
            runCheck().catch(() => {});
            json(res, 200, statusPayload());
          } else if (input.action === 'deleteAccount') {
            const username = String(input.username ?? '').trim();
            const idx = state.accounts.findIndex((a) => a.username === username);
            if (idx < 0) { json(res, 404, { ok: false, error: '账号不存在' }); return; }
            state.accounts.splice(idx, 1);
            const nextActive = state.accounts[0] ? state.accounts[0].username : '';
            try {
              persistAccounts(state.accounts, nextActive);
            } catch (error) {
              json(res, 500, { ok: false, error: '删除失败：' + (error instanceof Error ? error.message : String(error)) });
              return;
            }
            if (config.username === username) {
              config.username = nextActive;
              config.password = state.accounts[0] ? state.accounts[0].password : '';
              state.usage = { ok: false, message: '尚未查询', updatedAt: 0 };
              state.usageAt = 0;
            }
            json(res, 200, statusPayload());
          } else if (input.action === 'clearAccount') {
            state.accounts = [];
            try { persistAccounts([], ''); } catch {}
            config.username = '';
            config.password = '';
            state.manualAcid = 0;
            try { persistSettings({ manualAcid: 0 }); } catch {}
            state.usage = { ok: false, message: '尚未查询', updatedAt: 0 };
            state.usageAt = 0;
            state.agreement = { required: false, id: 0, title: '', agreed: false, checkedAt: 0 };
            json(res, 200, statusPayload());
          } else if (input.action === 'agree') {
            if (!isConfigured(config)) { json(res, 400, { ok: false, error: '未配置账号密码' }); return; }
            try {
              const res2 = await agreeNow();
              if (!res2.ok) {
                state.lastError = '同意协议失败' + (res2.message ? '：' + res2.message : '');
              }
            } catch (error) {
              state.lastError = error instanceof Error ? error.message : String(error);
            }
            json(res, 200, statusPayload());
          } else if (input.action === 'login') {
            if (!isConfigured(config)) { json(res, 400, { ok: false, error: '未配置账号密码' }); return; }
            try {
              await loginNow();
            } catch (error) {
              state.lastError = error instanceof Error ? error.message : String(error);
              state.lastRunAt = Date.now();
            }
            json(res, 200, statusPayload());
          } else if (input.action === 'logout') {
            if (!isConfigured(config)) { json(res, 400, { ok: false, error: '未配置账号密码' }); return; }
            try {
              await logoutNow();
            } catch (error) {
              state.lastError = error instanceof Error ? error.message : String(error);
              state.lastRunAt = Date.now();
            }
            json(res, 200, statusPayload());
          } else if (input.action === 'refresh') {
            await runCheck();
            json(res, 200, statusPayload());
          } else {
            json(res, 200, statusPayload());
          }
        } catch (error) {
          json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }
      json(res, 405, { ok: false, error: '不支持的方法' });
    },
  }));


  // 后台状态巡检循环：每次调度都重新读取间隔，改设置后立刻生效。
  ctx.effect(() => {
    let timer = null;
    let stopped = false;

    const schedule = (ms) => {
      if (stopped) return;
      timer = setTimeout(async () => {
        await runCheck().catch(() => {});
        if (stopped) return;
        schedule(Math.max(1000, config.intervalSec * 1000));
      }, ms);
    };

    schedule(500);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  });

  // 选课公告：每天中午 12:00 抓取一次（登录成功后另有一次）。
  ctx.effect(() => {
    let timer = null;
    let stopped = false;

    const scheduleNext = () => {
      if (stopped) return;
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
      if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
      timer = setTimeout(() => {
        refreshNotices(undefined, true).catch(() => {});
        addLog('info', '每日 12:00 抓取选课公告');
        scheduleNext();
      }, Math.max(1000, next.getTime() - now.getTime()));
    };

    scheduleNext();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  });

  // 启动时若没有缓存或缓存超过一天，补抓一次（仅一次，不轮询）。
  ctx.effect(() => {
    const cached = state.notices;
    const hasFresh = cached
      && Array.isArray(cached.items)
      && cached.items.length > 0
      && cached.fetchedAt
      && Date.now() - cached.fetchedAt < 24 * 3600 * 1000;
    if (hasFresh) return () => {};
    const t = setTimeout(() => { refreshNotices(undefined, true).catch(() => {}); }, 2500);
    return () => clearTimeout(t);
  });
}
