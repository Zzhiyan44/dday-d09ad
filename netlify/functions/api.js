// 专转本 ZHIYAN · 账号同步（Netlify Function + Blobs）
const crypto = require('crypto');
let getStore, connectLambda;
try { const b = require('@netlify/blobs'); getStore = b.getStore; connectLambda = b.connectLambda; } catch (e) { getStore = null; }

const ADMIN_PASS = process.env.ADMIN_PASS || 'zhiyan2026';
function loginPage(err) {
  return `<meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui;background:#0e1116;color:#e8edf4;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.b{width:280px}input,button{width:100%;height:42px;margin-top:10px;border-radius:10px;border:1px solid #263140;background:#151c25;color:#e8edf4;font-size:14px;padding:0 12px}
button{background:#35d39a;color:#08110d;border:0;font-weight:600}.e{color:#ff7a7a;font-size:12px;margin-top:8px}</style>
<div class=b><h3 style="font-size:15px;margin:0 0 4px">后台登录</h3><div style="color:#8b94a6;font-size:12px">仅作者可用</div>
<form method=post action="/admin/login"><input type=password name=pass placeholder=管理密码 autofocus><button>进入</button></form>
<div class=e>${err || ''}</div></div>`;
}
const KEY_USERS = 'users.json';

function h(pass, salt) { return crypto.createHash('sha256').update(salt + ':' + pass).digest('hex'); }
function tok() { return crypto.randomBytes(24).toString('hex'); }
function adminSig() { return crypto.createHmac('sha256', ADMIN_PASS).update('zd-v1').digest('hex'); }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

async function readDB(store) {
  try { const v = await store.get(KEY_USERS, { type: 'json' }); return v || { users: {} }; }
  catch (e) { return { users: {} }; }
}
async function writeDB(store, db) { await store.setJSON(KEY_USERS, db); }

function json(code, obj, extra) {
  return {
    statusCode: code,
    headers: Object.assign({
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Cache-Control': 'no-store'
    }, extra || {}),
    body: JSON.stringify(obj)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }, body: '' };
  if (!getStore) return json(500, { error: '服务端缺少 @netlify/blobs' });
  try { if (typeof connectLambda === 'function') connectLambda(event); } catch (e) {}
  const store = getStore({ name: 'zhiyan' });
  const qs = event.queryStringParameters || {};
  const path = (event.path || '').replace(/\/+$/, '');
  let body = {};
  const raw = event.body || '';
  const ct = String(event.headers['content-type'] || event.headers['Content-Type'] || '');
  try {
    if (ct.indexOf('application/x-www-form-urlencoded') >= 0) {
      const qsObj = new URLSearchParams(raw);
      qsObj.forEach((v, k) => { body[k] = v; });
    } else {
      body = JSON.parse(raw || '{}');
    }
  } catch (e) { body = {}; }

  const isAdminRoute = path.endsWith('/admin') || path.endsWith('/admin/login') || path.endsWith('/admin/logout') || qs.admin;

  // ---------- 后台（仅作者，密码登录）----------
  if (isAdminRoute) {
    const cookie = (event.headers.cookie || event.headers.Cookie || '');
    const authed = cookie.indexOf('zd=' + adminSig()) >= 0;
    if (path.endsWith('/admin/login')) {
      if (String(body.pass || '') !== ADMIN_PASS) {
        return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' },
          body: loginPage('密码不对，再试一次') };
      }
      return { statusCode: 302, headers: {
          'Set-Cookie': 'zd=' + adminSig() + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400',
          'Location': '/admin' }, body: '' };
    }
    if (path.endsWith('/admin/logout')) return { statusCode: 302, headers: { 'Set-Cookie': 'zd=; Path=/; Max-Age=0', Location: '/admin' }, body: '' };
    if (!authed) {
      return {
        statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: `<meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui;background:#0e1116;color:#e8edf4;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.b{width:280px}input,button{width:100%;height:42px;margin-top:10px;border-radius:10px;border:1px solid #263140;background:#151c25;color:#e8edf4;font-size:14px;padding:0 12px}
button{background:#35d39a;color:#08110d;border:0;font-weight:600}</style>
<div class=b><h3 style="font-size:15px;margin:0 0 4px">后台登录</h3><div style="color:#8b94a6;font-size:12px">仅作者可用</div>
<form method=post action="/admin/login"><input type=password name=pass placeholder=管理密码 autofocus><button>进入</button></form></div>`
      };
    }
    const db = await readDB(store);
    const rows = Object.keys(db.users).map(k => {
      const x = db.users[k];
      return `<tr><td><b>${esc(k)}</b></td><td>${new Date(x.created).toLocaleString('zh-CN')}</td><td>${x.lastSync ? new Date(x.lastSync).toLocaleString('zh-CN') : '—'}</td><td>${x.data ? Math.round(JSON.stringify(x.data).length / 1024) + ' KB' : '未同步'}</td></tr>`;
    }).join('');
    return {
      statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: `<meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui;margin:16px;background:#0e1116;color:#e8edf4}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid #263140;padding:8px;text-align:left}h2{font-size:16px}.k{color:#8b94a6;font-size:12px}a{color:#35d39a}</style>
<h2>专转本 ZHIYAN · 后台</h2><div class=k>注册用户 <b>${Object.keys(db.users).length}</b> 个　<a href="/admin/logout">退出</a></div>
<table><tr><th>ID</th><th>注册时间</th><th>最近同步</th><th>数据量</th></tr>${rows || '<tr><td colspan=4 class=k>还没有人注册</td></tr>'}</table>`
    };
  }

  // ---------- 版本检查（服务器去取 GitHub，客户端只连本服务）----------
  if (path.endsWith('/update')) {
    try {
      const r = await fetch('https://api.github.com/repos/Zzhiyan44/dday/releases/latest', {
        headers: { 'User-Agent': 'zhiyan-sync', 'Accept': 'application/vnd.github+json' }
      });
      if (!r.ok) return json(502, { error: 'github ' + r.status });
      const rel = await r.json();
      const tag = String(rel.tag_name || '');
      const m = tag.match(/(\d+)\.(\d+)/);
      const vc = m ? (+m[1]) * 1000 + (+m[2]) : 0;
      const asset = (rel.assets || []).find(a => /\.apk$/i.test(a.name || ''));
      const gh = asset ? asset.browser_download_url : '';
      const list = gh ? ['https://ghfast.top/' + gh, 'https://ghproxy.net/' + gh, gh] : [];
      list.push('https://cdn.jsdelivr.net/gh/Zzhiyan44/dday@latest/dist/app.apk');
      return json(200, {
        versionCode: vc,
        versionName: tag.replace(/^v/i, ''),
        notes: String(rel.body || '').slice(0, 200),
        publishedAt: rel.published_at || '',
        apk: list
      }, { 'Cache-Control': 'public, max-age=300' });
    } catch (e) {
      return json(502, { error: 'fetch failed: ' + String(e.message).slice(0, 60) });
    }
  }

  // ---------- 用户接口 ----------
  if (path.endsWith('/register')) {
    const name = String(body.id || '').trim(), pw = String(body.pass || '');
    if (name.length < 2 || name.length > 20) return json(400, { error: 'ID 需 2–20 个字' });
    if (pw.length < 4) return json(400, { error: '密码至少 4 位' });
    const db = await readDB(store);
    if (db.users[name]) return json(409, { error: '这个 ID 已被注册' });
    const salt = crypto.randomBytes(8).toString('hex');
    db.users[name] = { salt, hash: h(pw, salt), token: tok(), created: Date.now(), lastSync: 0, data: null };
    await writeDB(store, db);
    return json(200, { ok: true, id: name, token: db.users[name].token });
  }
  if (path.endsWith('/login')) {
    const name = String(body.id || '').trim();
    const db = await readDB(store);
    const u = db.users[name];
    if (!u) return json(404, { error: '没有这个 ID，先注册' });
    if (u.hash !== h(String(body.pass || ''), u.salt)) return json(403, { error: '密码不对' });
    u.token = tok(); u.lastSync = Date.now();
    await writeDB(store, db);
    return json(200, { ok: true, id: name, token: u.token, hasData: !!u.data });
  }
  if (path.endsWith('/sync')) {
    const db = await readDB(store);
    const name = Object.keys(db.users).find(k => db.users[k].token === body.token);
    if (!name) return json(401, { error: '登录已失效，重新登录' });
    db.users[name].data = body.data; db.users[name].lastSync = Date.now();
    await writeDB(store, db);
    return json(200, { ok: true, at: db.users[name].lastSync });
  }
  if (path.endsWith('/load')) {
    const db = await readDB(store);
    const name = Object.keys(db.users).find(k => db.users[k].token === qs.token);
    if (!name) return json(401, { error: '登录已失效' });
    db.users[name].lastSync = Date.now();
    await writeDB(store, db);
    return json(200, { ok: true, id: name, data: db.users[name].data });
  }
  return json(404, { error: 'not found', path });
};
