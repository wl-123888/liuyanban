// 家长留言板 - 微信云开发版教室端服务
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 58080;
const isPkg = typeof process.pkg !== 'undefined';
const BASE_DIR = isPkg ? path.dirname(process.execPath) : __dirname;

// Read config
let APPID = '', SECRET = '', ENV_ID = '', CLASS_CODE = '';
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'config.json'), 'utf8'));
  APPID = cfg.appid || '';
  SECRET = cfg.secret || '';
  ENV_ID = cfg.env_id || '';
  CLASS_CODE = cfg.class_code || '';
} catch (e) { console.log('config.json missing or invalid'); }

const DATA_FILE = path.join(BASE_DIR, 'messages.json');
const CLASS_FILE = path.join(BASE_DIR, 'classes.json');
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');
if (!fs.existsSync(CLASS_FILE)) fs.writeFileSync(CLASS_FILE, '[]');

function readCache() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return []; } }
function saveCache(msgs) { fs.writeFileSync(DATA_FILE, JSON.stringify(msgs, null, 2)); }

// Access token management
let accessToken = '', tokenExpires = 0;

function getAccessToken(callback) {
  if (accessToken && Date.now() < tokenExpires) { callback(accessToken); return; }
  // Use stable_token to avoid conflicts with SCF
  const body = JSON.stringify({ grant_type: 'client_credential', appid: APPID, secret: SECRET });
  const opts = {
    hostname: 'api.weixin.qq.com', port: 443, path: '/cgi-bin/stable_token',
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  };
  const req = https.request(opts, res => {
    let data = ''; res.on('data', c => data += c);
    res.on('end', () => {
      try {
        const j = JSON.parse(data);
        if (j.access_token) {
          accessToken = j.access_token;
          tokenExpires = Date.now() + (j.expires_in - 300) * 1000;
          callback(accessToken);
        } else { console.log('Token error:', data); callback(null); }
      } catch { callback(null); }
    });
  });
  req.on('error', () => callback(null));
  req.write(body);
  req.end();
}

function callCloudFunction(name, data, callback) {
  getAccessToken(token => {
    if (!token) { callback(null); return; }
    const body = JSON.stringify(data);
    const url = new URL('https://api.weixin.qq.com/tcb/invokecloudfunction?access_token=' + token + '&env=' + ENV_ID + '&name=' + name);
    const opts = {
      hostname: url.hostname, port: 443, path: url.pathname + url.search,
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (j.errcode === 0 && j.resp_data) {
            callback(JSON.parse(j.resp_data));
          } else { console.log('Cloud function error:', d); callback(null); }
        } catch (e) { console.log('Parse error:', e.message); callback(null); }
      });
    });
    req.on('error', () => callback(null));
    req.write(body); req.end();
  });
}

// Cloud class list cache
let cachedClasses = [];
let classesCacheTime = 0;

function fetchClassesFromCloud(callback) {
  if (cachedClasses.length > 0 && Date.now() < classesCacheTime) {
    callback(cachedClasses);
    return;
  }
  callCloudFunction('parentAPI', { action: 'getClasses', data: {} }, (r) => {
    if (r && r.data && Array.isArray(r.data)) {
      cachedClasses = r.data;
      classesCacheTime = Date.now() + 300000; // 5 min cache
      callback(cachedClasses);
    } else {
      callback(cachedClasses.length > 0 ? cachedClasses : []);
    }
  });
}

// Sync from cloud
let lastFetch = null;

function fetchFromCloud(callback) {
  const data = { class_code: CLASS_CODE || '', limit: 50 };
  callCloudFunction('parentAPI', { action: 'getMessages', data: data }, (msgs) => {
    if (!msgs || !Array.isArray(msgs)) return callback([]);
    // Filter by lastFetch
    let filtered = msgs;
    if (lastFetch) {
      filtered = msgs.filter(m => new Date(m.createTime).toISOString() > lastFetch);
    }
    if (msgs.length > 0) {
      lastFetch = new Date(msgs[0].createTime).toISOString();
    }
    callback(filtered);
  });
}

function syncCloud() {
  if (!APPID || !SECRET) return;
  fetchFromCloud(newMsgs => {
    if (!newMsgs.length) return;
    const local = readCache();
    const ids = new Set(local.map(m => m._id || m.id));
    let added = false;
    newMsgs.forEach(m => {
      const mid = m._id || m.id;
      if (!ids.has(mid)) { local.push(m); ids.add(mid); added = true; }
    });
    if (added) saveCache(local);
  });
}

// Display page
function displayPage() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>家长留言板</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:#12121a;color:#fff;overflow:hidden;height:100vh;user-select:none;-webkit-user-select:none;font-family:'Microsoft YaHei','PingFang SC',sans-serif}
.wrap{display:flex;flex-direction:column;height:100vh}
.bar{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 10px;flex-shrink:0}
.bar-l{display:flex;align-items:center;gap:8px}
.bar-icon{font-size:16px}
.bar-title{font-size:13px;font-weight:600;color:rgba(255,255,255,.85)}
.bar-r{font-size:10px;color:rgba(255,255,255,.3);display:flex;align-items:center;gap:5px}
.bar-dot{width:5px;height:5px;border-radius:50%;background:#52C41A;box-shadow:0 0 5px #52C41A;display:inline-block}
.bar-line{height:1px;background:rgba(255,255,255,.05);margin:0 12px;flex-shrink:0}
.msgs{flex:1;overflow:hidden;padding:8px 14px;position:relative}
.msgs::before,.msgs::after{content:'';position:absolute;left:0;right:0;height:20px;z-index:2;pointer-events:none}
.msgs::before{top:0;background:linear-gradient(to bottom,#12121a,transparent)}
.msgs::after{bottom:0;background:linear-gradient(to top,#12121a,transparent)}
.scroll{animation:scroll 60s linear infinite}
.scroll.paused{animation-play-state:paused}
@keyframes scroll{0%{transform:translateY(0)}100%{transform:translateY(-50%)}}
.empty{color:rgba(255,255,255,.15);text-align:center;padding:50px 16px;font-size:13px;line-height:2}
.item{background:rgba(255,255,255,.035);border-radius:8px;padding:9px 12px;margin-bottom:6px}
.item:hover{background:rgba(255,255,255,.06)}
.item .txt{color:rgba(255,255,255,.8);font-size:14px;line-height:1.55;word-break:break-all}
.item .time{font-size:10px;color:rgba(255,255,255,.2);margin-top:6px;text-align:right}
.foot{flex-shrink:0;text-align:center;padding:6px;font-size:10px;color:rgba(255,255,255,.1)}
</style>
</head>
<body>
<div class="wrap">
  <div class="bar">
    <div class="bar-l"><span class="bar-icon">💬</span><span class="bar-title">家长留言板</span></div>
    <div class="bar-r"><span id="date"></span><span class="bar-dot"></span>在线</div>
  </div>
  <div class="bar-line"></div>
  <div class="msgs"><div id="wrap"></div></div>
  <div class="foot" id="count"></div>
</div>
<script>
var wrap=document.getElementById('wrap'),dateEl=document.getElementById('date'),countEl=document.getElementById('count');
var today=new Date().toDateString(),msgIds=[];
dateEl.textContent=new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'short'});
function isToday(d){return new Date(d).toDateString()===today}
function esc(t){var d=document.createElement('div');d.textContent=t;return d.innerHTML}
function fmt(d){var dt=new Date(d),h=dt.getHours().toString().padStart(2,'0'),m=dt.getMinutes().toString().padStart(2,'0');return h+':'+m}
function buildScroll(ms){
  if(!ms.length){wrap.innerHTML='<div class="empty">📭<br>暂无留言</div>';countEl.textContent='';return}
  var html=ms.map(function(m){return'<div class="item"><div class="txt">'+esc(m.content)+'</div><div class="time">'+fmt(m.createTime||m.time)+'</div></div>'}).join('');
  if(ms.length>3){wrap.innerHTML='<div class="scroll" id="sc">'+html+html+'</div>'}else{wrap.innerHTML=html}
  countEl.textContent='今日 '+ms.length+' 条';
  var sc=document.getElementById('sc');
  if(sc){sc.addEventListener('mouseenter',function(){sc.classList.add('paused')});sc.addEventListener('mouseleave',function(){sc.classList.remove('paused')})}
}
async function poll(){
  try{
    var r=await fetch('/api/messages?limit=200');
    var all=await r.json();
    var td=all.filter(function(m){return isToday(m.createTime||m.time)});
    var ids=td.map(function(m){return m._id||m.id}).join(',');
    if(ids===msgIds.join(','))return;msgIds=td.map(function(m){return m._id||m.id});buildScroll(td);
  }catch(e){}
}
setInterval(function(){
  var nt=new Date().toDateString();
  if(nt!==today){today=nt;msgIds=[];dateEl.textContent=new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'short'})}
},6e4);
poll();setInterval(poll,5000);
</script></body></html>`;
}

// Parent submission page
function parentPage() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>家长留言板</title>
<style>
:root{--p:#4A90D9;--bg:#F5F7FA;--c:#fff;--t:#333;--t2:#888;--b:#E8ECF1;--r:14px}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;background:var(--bg);color:var(--t);min-height:100vh;display:flex;flex-direction:column;align-items:center}
.ct{width:100%;max-width:480px;padding:24px 20px 40px}
.hd{text-align:center;margin-bottom:24px;padding-top:16px}
.ic{font-size:56px;margin-bottom:10px}
.tl{font-size:26px;font-weight:700;color:var(--p);margin-bottom:4px}
.sub{font-size:14px;color:var(--t2)}
.clist{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}
.citem{background:var(--c);border-radius:var(--r);padding:16px 20px;box-shadow:0 2px 8px rgba(0,0,0,.06);cursor:pointer;text-align:center;min-width:100px;transition:all .15s;font-size:16px;font-weight:500}
.citem:active{transform:scale(.95);background:#EEF4FB}
.cadd{background:none;border:2px dashed #ccc;box-shadow:none;color:var(--t2);font-size:14px}
.cback{display:block;text-align:center;color:var(--p);font-size:14px;margin-top:18px;cursor:pointer}
.icd{background:var(--c);border-radius:var(--r);padding:20px;box-shadow:0 2px 12px rgba(0,0,0,.06)}
.cod{font-size:13px;color:var(--p);margin-bottom:12px;font-weight:500}
.txt{width:100%;height:120px;border:none;outline:none;font-size:17px;line-height:1.7;resize:none;font-family:inherit}
.txt::placeholder{color:#c0c0c0}
.ft{display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:1px solid var(--b)}
.ctr{font-size:13px;color:var(--t2)}.ctr.full{color:#E74C3C}
.btn{width:100%;margin-top:20px;height:52px;background:linear-gradient(135deg,#4A90D9,#357ABD);color:#fff;font-size:18px;font-weight:600;border:none;border-radius:26px;cursor:pointer;box-shadow:0 4px 14px rgba(74,144,217,.3);transition:all .2s}
.btn:active{transform:scale(.97)}.btn:disabled{background:#CCD5E0;box-shadow:none;cursor:not-allowed}
.toast{position:fixed;top:20px;left:50%;transform:translateX(-50%);padding:12px 28px;border-radius:24px;font-size:15px;z-index:999;opacity:0;pointer-events:none;transition:opacity .3s;color:#fff}
.toast.show{opacity:1}.toast.success{background:#52C41A}.toast.error{background:#E74C3C}
.rec{margin-top:32px}.rtl{font-size:15px;font-weight:600;color:#666;margin-bottom:12px}
.lst{display:flex;flex-direction:column;gap:10px}
.itm{background:var(--c);border-radius:var(--r);padding:14px 16px;box-shadow:0 1px 6px rgba(0,0,0,.04);animation:slide .35s ease}
.ctt{font-size:16px;color:#333;line-height:1.6;word-break:break-all}
.tme{font-size:12px;color:#bbb;margin-top:6px}
@keyframes slide{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.emp{text-align:center;color:#ccc;font-size:14px;padding:24px 0}
.note{text-align:center;margin-top:24px;font-size:12px;color:#bbb}
.hide{display:none}
</style>
</head>
<body>
<div class="toast" id="toast"></div>

<div class="ct" id="page1">
  <div class="hd"><div class="ic">💬</div><div class="tl">家长留言板</div><div class="sub">选择孩子所在班级</div></div>
  <div class="clist" id="clist"></div>
  <div class="note">留言实时显示在教室大屏上</div>
  <div class="note" style="font-size:11px;color:#aaa;max-width:420px;margin:16px auto 0;line-height:1.6">本留言板仅用于班级接送、物品领取通知，仅留存学生姓名及留言内容，数据存储于境内微信云服务。留言内容仅本班家长、老师可见，闲置数据会定期清理。请勿发布无关、违规言论。</div>
</div>

<div class="ct hide" id="page2">
  <div class="hd"><div class="ic">💬</div><div class="tl">家长留言板</div><div class="sub" id="clsTitle"></div></div>
  <div class="icd">
    <div class="cod" id="cod"></div>
    <textarea class="txt" id="ipt" placeholder="输入留言，如：小明放学在校门口等你…" maxlength="200"></textarea>
    <div class="ft"><span class="ctr" id="ctr">0/200</span><a class="cback" onclick="goBack()">&#8592; 切换班级</a></div>
  </div>
  <button class="btn" id="btn" disabled>发送到教室大屏</button>
  <div class="rec"><div class="rtl">📋 我的留言</div>
    <div class="lst" id="lst"><div class="emp">暂无留言</div></div>
  </div>
  <div class="note">请勿发送孩子全名，建议用称呼</div>
  <div class="note" style="font-size:11px;color:#aaa;max-width:420px;margin:16px auto 0;line-height:1.6">本留言板仅用于班级接送、物品领取通知，仅留存学生姓名及留言内容，数据存储于境内微信云服务。留言内容仅本班家长、老师可见，闲置数据会定期清理。请勿发布无关、违规言论。</div>
</div>

<script>
var page1=document.getElementById('page1'),page2=document.getElementById('page2');
var clist=document.getElementById('clist'),clsTitle=document.getElementById('clsTitle');
var cod=document.getElementById('cod'),ipt=document.getElementById('ipt');
var ctr=document.getElementById('ctr'),btn=document.getElementById('btn');
var lst=document.getElementById('lst'),toast=document.getElementById('toast');
var currentClass='';
var parentId = localStorage.getItem('parent_id');
if (!parentId) { parentId = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10); localStorage.setItem('parent_id', parentId); }

async function loadClasses(){
  try{
    var r=await fetch('/api/classes');
    var data=await r.json();
    var classes=data.classes||[];
    var saved=localStorage.getItem('class_code');
    if(saved&&classes.indexOf(saved)===-1)classes.unshift(saved);
    var html='';
    classes.forEach(function(c){html+='<div class="citem" onclick="selectClass(\\''+escAttr(c)+'\\')">'+esc(c)+(c===saved?' <span style="font-size:11px;color:#999">上次</span>':'')+'</div>'});
    clist.innerHTML=html||'<div class="emp">暂无可选班级</div>';
  }catch(e){clist.innerHTML='<div class="emp">加载失败，请刷新重试</div>'}
}

function selectClass(cls){
  currentClass=cls;
  localStorage.setItem('class_code',cls);
  clsTitle.textContent=cls;
  cod.textContent='当前班级：'+cls;
  page1.classList.add('hide');
  page2.classList.remove('hide');
  loadMsgs();
}

function goBack(){
  page2.classList.add('hide');
  page1.classList.remove('hide');
  ipt.value='';ctr.textContent='0/200';btn.disabled=true;
  loadClasses();
}

ipt.addEventListener('input',function(){var l=ipt.value.length;ctr.textContent=l+'/200';ctr.className='ctr'+(l>=200?' full':'');btn.disabled=ipt.value.trim().length===0});

btn.addEventListener('click',async function(){
  var c=ipt.value.trim();if(!c||!currentClass)return;
  btn.disabled=true;btn.textContent='发送中...';
  try{
    var r=await fetch('/api/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:c,class_code:currentClass,parent_id:parentId})});
    var j=await r.json();
    if(j.ok){
      ipt.value='';ctr.textContent='0/200';btn.textContent='发送到教室大屏';btn.disabled=true;
      showToast('已发送到教室大屏','success');loadMsgs();
    }else{throw new Error(j.msg||'fail')}
  }catch(e){btn.disabled=false;btn.textContent='发送到教室大屏';showToast('发送失败，请重试','error')}
});

async function loadMsgs(){
  try{
    var r=await fetch('/api/messages?limit=20&class_code='+encodeURIComponent(currentClass)+'&parent_id='+parentId);
    var data=await r.json();
    data=data.filter(function(m){return m.class_code===currentClass});
    if(!data.length){lst.innerHTML='<div class="emp">暂无留言</div>';return}
    lst.innerHTML=data.reverse().map(function(m){return'<div class="itm"><div class="ctt">'+esc(m.content)+'</div><div class="tme">'+fmt(m.createTime||m.time)+'</div></div>'}).join('');
  }catch(e){}
}

function showToast(m,t){toast.textContent=m;toast.className='toast '+t+' show';setTimeout(function(){toast.className='toast'},2000)}
function esc(t){var d=document.createElement('div');d.textContent=t;return d.innerHTML}
function escAttr(t){return t.replace(/'/g,"\\\\'").replace(/"/g,'&quot;')}
function fmt(d){var dt=new Date(d),n=new Date(),diff=n-dt;if(diff<6e4)return'刚刚';if(diff<36e5)return Math.floor(diff/6e4)+'分钟前';return dt.getHours().toString().padStart(2,'0')+':'+dt.getMinutes().toString().padStart(2,'0')}

loadClasses();
</script></body></html>`;
}

// HTTP server
const server = http.createServer((req, res) => {
  const cth = { 'Content-Type': 'text/html;charset=utf-8' };
  const cj = { 'Content-Type': 'application/json;charset=utf-8' };
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }

  if (req.url === '/' || req.url === '/display') {
    res.writeHead(200, cth); res.end(displayPage());
  } else if (req.url === '/admin') {
    res.writeHead(200, cth); res.end(fs.readFileSync(path.join(BASE_DIR, 'admin.html'), 'utf8'));
  } else if (req.url === '/teacher') {
    res.writeHead(200, cth); res.end(fs.readFileSync(path.join(BASE_DIR, 'teacher.html'), 'utf8'));
  } else if (req.url === '/parent') {
    res.writeHead(200, cth); res.end(parentPage());
  } else if (req.url === '/api/classes') {
    const local = readCache();
    fetchClassesFromCloud((cloudClasses) => {
      const seen = new Set(cloudClasses);
      local.forEach(m => { if (m.class_code) seen.add(m.class_code); });
      // Include local admin-added classes
      try {
        const localClasses = JSON.parse(fs.readFileSync(CLASS_FILE, 'utf8'));
        localClasses.forEach(c => seen.add(c));
      } catch (e) {}
      res.writeHead(200, { ...cj, ...cors });
      res.end(JSON.stringify({ classes: Array.from(seen) }));
    });
  } else if (req.url === '/api/submit' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { content, class_code, parent_id } = JSON.parse(body);
        if (!content || !content.trim()) { res.writeHead(400, { ...cj, ...cors }); res.end(JSON.stringify({ ok: false, msg: 'empty content' })); return; }
        const msg = { content: content.trim(), class_code: class_code || '', parent_id: parent_id || '', time: new Date().toISOString(), createTime: new Date().toISOString(), _id: 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) };
        const local = readCache();
        local.push(msg);
        saveCache(local);
        // Sync to cloud
        if (APPID && SECRET) {
          callCloudFunction('parentAPI', { action: 'submitMessage', data: { content: content.trim(), class_code: class_code || '', parent_id: parent_id || '' } }, () => {});
        }
        res.writeHead(200, { ...cj, ...cors });
        res.end(JSON.stringify({ ok: true, id: msg._id }));
      } catch (e) { res.writeHead(400, { ...cj, ...cors }); res.end(JSON.stringify({ ok: false, msg: e.message })); }
    });
  } else if (req.url.startsWith('/api/messages')) {
    const local = readCache();
    const url = new URL(req.url, 'http://localhost');
    const limit = parseInt(url.searchParams.get('limit')) || 50;
    const classCode = url.searchParams.get('class_code') || '';
    const parentId = url.searchParams.get('parent_id') || '';
    let msgs = classCode ? local.filter(m => m.class_code === classCode) : local;
    if (parentId) msgs = msgs.filter(m => m.parent_id === parentId);
    res.writeHead(200, { ...cj, ...cors });
    res.end(JSON.stringify(msgs.slice(-limit).reverse()));
  } else if (req.url === '/api/admin/add-class' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { name } = JSON.parse(body);
        if (!name || !name.trim()) { res.writeHead(400, { ...cj, ...cors }); res.end(JSON.stringify({ ok: false, msg: 'empty name' })); return; }
        const cn = name.trim();
        // Local storage
        let classes = JSON.parse(fs.readFileSync(CLASS_FILE, 'utf8'));
        if (classes.indexOf(cn) === -1) {
          classes.push(cn);
          fs.writeFileSync(CLASS_FILE, JSON.stringify(classes));
        }
        // Sync to cloud
        if (APPID && SECRET) {
          callCloudFunction('parentAPI', { action: 'addClass', data: { name: cn } }, () => {});
        }
        res.writeHead(200, { ...cj, ...cors });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) { res.writeHead(400, { ...cj, ...cors }); res.end(JSON.stringify({ ok: false, msg: e.message })); }
    });
  } else if (req.url === '/api/admin/remove-class' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { name } = JSON.parse(body);
        if (!name || !name.trim()) { res.writeHead(400, { ...cj, ...cors }); res.end(JSON.stringify({ ok: false, msg: 'empty name' })); return; }
        const cn = name.trim();
        // Local storage
        let classes = JSON.parse(fs.readFileSync(CLASS_FILE, 'utf8'));
        classes = classes.filter(c => c !== cn);
        fs.writeFileSync(CLASS_FILE, JSON.stringify(classes));
        // Sync to cloud
        if (APPID && SECRET) {
          callCloudFunction('parentAPI', { action: 'removeClass', data: { name: cn } }, () => {});
        }
        res.writeHead(200, { ...cj, ...cors });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) { res.writeHead(400, { ...cj, ...cors }); res.end(JSON.stringify({ ok: false, msg: e.message })); }
    });
  } else if (req.url === '/api/admin/delete-message' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { id, class_code } = JSON.parse(body);
        if (!id) { res.writeHead(400, { ...cj, ...cors }); res.end(JSON.stringify({ ok: false, msg: 'empty id' })); return; }
        // Remove from local cache
        const local = readCache();
        const newLocal = local.filter(m => (m._id || m.id) !== id);
        saveCache(newLocal);
        // Sync to cloud
        if (APPID && SECRET) {
          callCloudFunction('parentAPI', { action: 'deleteMessage', data: { id: id } }, () => {});
        }
        // Also support local-only messages (generated offline)
        if (id.startsWith('local_')) {
          res.writeHead(200, { ...cj, ...cors });
          res.end(JSON.stringify({ ok: true, local: true }));
        } else {
          res.writeHead(200, { ...cj, ...cors });
          res.end(JSON.stringify({ ok: true }));
        }
      } catch (e) { res.writeHead(400, { ...cj, ...cors }); res.end(JSON.stringify({ ok: false, msg: e.message })); }
    });
  } else {
    res.writeHead(404); res.end('404');
  }
});

function startServer() {
  server.listen(PORT, () => {
    console.log('Server: http://localhost:' + PORT);
    if (APPID && SECRET) { syncCloud(); setInterval(syncCloud, 10000); }

    setTimeout(() => {
      const vbs = path.join(BASE_DIR, 'launch-widget.vbs');
      const ps1 = path.join(BASE_DIR, 'widget.ps1');
      if (fs.existsSync(vbs) && fs.existsSync(ps1)) {
        exec('wscript //B "' + vbs + '"', { shell: true });
      }
    }, 1500);
    process.stdin.resume();
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      exec('netstat -ano | findstr :' + PORT + ' | findstr LISTENING', (e, out) => {
        const m = out.match(/(\d+)\s*$/m);
        if (m) { try { process.kill(parseInt(m[1])); } catch {} }
        setTimeout(() => { server.close(); server.listen(PORT); }, 1000);
      });
    }
  });
}

startServer();
