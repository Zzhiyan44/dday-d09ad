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
const KEY_NOTICE = 'notice.json';
const KEY_REL = 'release.json';
const KEY_APK = 'app.apk';
const KEY_WALL = 'wall.json';
const KEY_ROOM = 'room.json';
const KEY_RANK = 'rank.json';

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

  const isAdminRoute = path.indexOf('/admin') >= 0 || qs.admin;

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
    if (path.endsWith('/admin/notice')) {
      if (String(body.text || '').trim().length > 500) return json(400, { error: '最多 500 字' });
      const cur = (await store.get(KEY_NOTICE, { type: 'json' })) || {};
      const n = {
        id: String(Date.now()),
        title: String(body.title || '').slice(0, 40),
        text: String(body.text || '').slice(0, 500),
        active: !!body.active,
        at: Date.now()
      };
      await store.setJSON(KEY_NOTICE, n);
      return json(200, { ok: true, notice: n });
    }
    if (path.endsWith('/admin/release')) {
      try {
        const vc = parseInt(body.versionCode, 10);
        if (!vc) return json(400, { error: 'versionCode 必须是数字' });
        if (!body.apkBase64) return json(400, { error: '缺少 APK 数据' });
        const buf = Buffer.from(String(body.apkBase64), 'base64');
        if (buf.length < 20000) return json(400, { error: 'APK 太小，可能不完整' });
        await store.set(KEY_APK, buf);
        const rel = {
          versionCode: vc,
          versionName: String(body.versionName || ''),
          notes: String(body.notes || '').slice(0, 300),
          size: buf.length,
          at: Date.now()
        };
        await store.setJSON(KEY_REL, rel);
        return json(200, { ok: true, release: rel });
      } catch (e) { return json(500, { error: String(e.message).slice(0, 100) }); }
    }
    const db = await readDB(store);
    let notice = null;
    try { notice = await store.get(KEY_NOTICE, { type: 'json' }); } catch (e) {}
    const rows = Object.keys(db.users).map(k => {
      const x = db.users[k];
      return `<tr><td><b>${esc(k)}</b></td><td>${new Date(x.created).toLocaleString('zh-CN')}</td><td>${x.lastSync ? new Date(x.lastSync).toLocaleString('zh-CN') : '—'}</td><td>${x.data ? Math.round(JSON.stringify(x.data).length / 1024) + ' KB' : '未同步'}</td></tr>`;
    }).join('');
    return {
      statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: `<meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui;margin:16px;background:#0e1116;color:#e8edf4}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid #263140;padding:8px;text-align:left}h2{font-size:16px}.k{color:#8b94a6;font-size:12px}a{color:#35d39a}</style>
<h2>专转本 ZHIYAN · 后台</h2><div class=k>注册用户 <b>${Object.keys(db.users).length}</b> 个　<a href="/admin/logout">退出</a></div>
<table><tr><th>ID</th><th>注册时间</th><th>最近同步</th><th>数据量</th></tr>${rows || '<tr><td colspan=4 class=k>还没有人注册</td></tr>'}</table>
<h2 style="margin-top:22px">发公告</h2>
<div class=k>用户下次打开 App 会看到。当前：${notice ? (notice.active ? ('已发布 · ' + (notice.text || '').slice(0, 40)) : ('已停用 · ' + (notice.text || '').slice(0, 40))) : '没有公告'}</div>
<form method=post action="/admin/notice" style="margin-top:10px">
  <input name=title placeholder="标题（可空）" value="${notice ? esc(notice.title || '') : ''}" style="width:100%;height:40px;border-radius:10px;border:1px solid #263140;background:#151c25;color:#e8edf4;padding:0 12px;margin-bottom:8px">
  <textarea name=text placeholder="公告内容，最多 500 字" style="width:100%;height:110px;border-radius:10px;border:1px solid #263140;background:#151c25;color:#e8edf4;padding:10px 12px">${notice ? esc(notice.text || '') : ''}</textarea>
  <div style="display:flex;gap:8px;margin-top:10px">
    <button name=active value=1 style="flex:1;height:42px;border:0;border-radius:10px;background:#35d39a;color:#08110d;font-weight:600">发布</button>
    <button name=active value=0 style="flex:1;height:42px;border:1px solid #263140;border-radius:10px;background:#151c25;color:#e8edf4">停用</button>
  </div>
</form>
<h2 style="margin-top:22px">发布新版本</h2>
<div class=k id="relInfo">上传 APK 后，用户打开 App 点「检查更新」就能拿到</div>
<div style="margin-top:10px">
  <input id="relVer" placeholder="版本号，如 2.41" style="width:48%;height:40px;border-radius:10px;border:1px solid #263140;background:#151c25;color:#e8edf4;padding:0 12px">
  <input id="relCode" placeholder="版本码，如 2041" style="width:48%;height:40px;margin-left:2%;border-radius:10px;border:1px solid #263140;background:#151c25;color:#e8edf4;padding:0 12px">
  <input id="relNotes" placeholder="更新说明（可空）" style="width:100%;height:40px;margin-top:8px;border-radius:10px;border:1px solid #263140;background:#151c25;color:#e8edf4;padding:0 12px">
  <input id="relFile" type="file" accept=".apk" style="width:100%;margin-top:8px;color:#8b94a6">
  <button id="relGo" style="width:100%;height:44px;margin-top:10px;border:0;border-radius:10px;background:#35d39a;color:#08110d;font-weight:600">上传并发布</button>
</div>
<script>
document.getElementById('relGo').onclick=function(){
  var f=document.getElementById('relFile').files[0];
  var vName=document.getElementById('relVer').value.trim();
  var vCode=document.getElementById('relCode').value.trim();
  if(!f||!vCode){ alert('选 APK 并填版本码'); return; }
  var info=document.getElementById('relInfo');
  info.textContent='读取文件…';
  var fr=new FileReader();
  fr.onload=function(){
    var b64=String(fr.result).split(',')[1];
    info.textContent='上传中（'+Math.round(f.length/1024)+' KB）…';
    fetch('/admin/release',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({versionCode:vCode,versionName:vName,notes:document.getElementById('relNotes').value,apkBase64:b64})})
    .then(function(r){return r.json();})
    .then(function(j){
      info.textContent=j.ok?('已发布 v'+(j.release.versionName||j.release.versionCode)+'（'+Math.round(j.release.size/1024)+' KB）'):('失败：'+(j.error||''));
    }).catch(function(e){ info.textContent='失败：'+e; });
  };
  fr.readAsDataURL(f);
};
</script>`
    };
  }

  // ---------- 公告 ----------
  if (path.endsWith('/notice') && !path.endsWith('/admin/notice')) {
    let n = null;
    try { n = await store.get(KEY_NOTICE, { type: 'json' }); } catch (e) {}
    const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };
    if (!n || !n.active) return json(200, { active: false }, NO_STORE);
    return json(200, { active: true, id: n.id, title: n.title || '', text: n.text || '', at: n.at || 0 }, NO_STORE);
  }

  // ---------- 版本检查（服务器去取 GitHub，客户端只连本服务）----------
  if (path.endsWith('/download')) {
    try {
      const buf = await store.get(KEY_APK, { type: 'arrayBuffer' });
      if (!buf) return json(404, { error: '还没有发布包' });
      const rel = (await store.get(KEY_REL, { type: 'json' })) || {};
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/vnd.android.package-archive',
          'Content-Disposition': 'attachment; filename="zhiyan' + (rel.versionName ? '-v' + rel.versionName : '') + '.apk"',
          'Cache-Control': 'public, max-age=60',
          'Access-Control-Allow-Origin': '*'
        },
        isBase64Encoded: true,
        body: Buffer.from(buf).toString('base64')
      };
    } catch (e) { return json(500, { error: String(e.message).slice(0, 80) }); }
  }

  if (path.endsWith('/update')) {
    const self = 'https://' + String(event.headers.host || 'endearing-cucurucho-4c2845.netlify.app');
    // A. 自家发布的包优先（不需要 GitHub）
    try {
      const rel = await store.get(KEY_REL, { type: 'json' });
      if (rel && rel.versionCode) {
        return json(200, {
          versionCode: rel.versionCode,
          versionName: rel.versionName,
          notes: rel.notes || '',
          publishedAt: rel.at ? new Date(rel.at).toISOString() : '',
          apk: [self + '/api/download',
                'https://cdn.jsdelivr.net/gh/Zzhiyan44/dday@latest/dist/app.apk']
        }, { 'Cache-Control': 'public, max-age=60' });
      }
    } catch (e) {}
    // B. 回退到 GitHub Release
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
      return json(200, { versionCode: vc, versionName: tag.replace(/^v/i, ''), notes: String(rel.body || '').slice(0, 200), apk: list }, { 'Cache-Control': 'public, max-age=300' });
    } catch (e) {
      return json(502, { error: 'fetch failed' });
    }
  }

  // ---------- 公告 ----------

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
  // ---------- 留言墙 / 自习室 / 排行榜 ----------
  const who = async () => {
    const db = await readDB(store);
    const n = Object.keys(db.users).find(k => db.users[k].token === (body.token || qs.token));
    return n || null;
  };
  const arr = (v, n) => Array.isArray(v) ? v.slice(-n) : [];

  if (path.endsWith('/wall')) {
    if (event.httpMethod === 'POST') {
      const name = await who();
      if (!name) return json(401, { error: '先登录' });
      const text = String(body.text || '').trim().slice(0, 200);
      if (!text) return json(400, { error: '写点什么' });
      let list = [];
      try { list = arr(await store.get(KEY_WALL, { type: 'json' }), 300); } catch (e) {}
      const last = list.filter(x => x.id === name).pop();
      if (last && Date.now() - last.at < 20000) return json(429, { error: '慢点，20 秒才能发一条' });
      list.push({ id: name, t: text, at: Date.now() });
      await store.setJSON(KEY_WALL, arr(list, 300));
      return json(200, { ok: true });
    }
    let list = [];
    try { list = arr(await store.get(KEY_WALL, { type: 'json' }), 300); } catch (e) {}
    return json(200, { list: list.reverse() }, { 'Cache-Control': 'no-store' });
  }

  if (path.endsWith('/room')) {
    let room = { msgs: [], online: {} };
    try { room = (await store.get(KEY_ROOM, { type: 'json' })) || room; } catch (e) {}
    if (event.httpMethod === 'POST') {
      const name = await who();
      if (!name) return json(401, { error: '先登录' });
      const now = Date.now();
      room.online = room.online || {};
      room.online[name] = { at: now, focus: String(body.focus || '').slice(0, 20) };
      const text = String(body.msg || '').trim().slice(0, 200);
      if (text) {
        room.msgs = arr(room.msgs, 120);
        const mine = room.msgs.filter(x => x.id === name).pop();
        if (mine && now - mine.at < 3000) return json(429, { error: '慢点' });
        room.msgs.push({ id: name, t: text, at: now });
        room.msgs = arr(room.msgs, 120);
      }
      await store.setJSON(KEY_ROOM, room);
    }
    const now = Date.now();
    const online = Object.keys(room.online || {})
      .filter(k => now - (room.online[k].at || 0) < 180000)
      .map(k => ({ n: k, focus: room.online[k].focus || '' }));
    return json(200, { online, msgs: arr(room.msgs, 60) }, { 'Cache-Control': 'no-store' });
  }

  if (path.endsWith('/rank')) {
    let rk = { users: {} };
    try { rk = (await store.get(KEY_RANK, { type: 'json' })) || rk; } catch (e) {}
    if (event.httpMethod === 'POST') {
      const name = await who();
      if (!name) return json(401, { error: '先登录' });
      rk.users = rk.users || {};
      rk.users[name] = {
        today: Math.max(0, Math.min(1440, +body.today || 0)),
        week: Math.max(0, Math.min(10080, +body.week || 0)),
        total: Math.max(0, Math.min(200000, +body.total || 0)),
        at: Date.now()
      };
      await store.setJSON(KEY_RANK, rk);
      return json(200, { ok: true });
    }
    const list = Object.keys(rk.users || {}).map(k => ({ n: k, ...rk.users[k] }))
      .sort((a, b) => (b.week || 0) - (a.week || 0)).slice(0, 30);
    return json(200, { list }, { 'Cache-Control': 'no-store' });
  }

  return json(404, { error: 'not found', path });
};
