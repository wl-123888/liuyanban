'use strict';
var https = require('https');

var APPID = 'wx5ab2d20a064cacec';
var SECRET = 'ae3ff142ac4566907cf6fdc0f0a1f163';
var ENV_ID = 'cloudbase-d6gv4z1nu9fafe6f9';

var cachedToken = null;
var tokenExpiry = 0;

function httpPost(host, path, body) {
  return new Promise(function (resolve, reject) {
    var r = https.request({ hostname: host, port: 443, path: path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, function (res) {
      var d = ''; res.on('data', function (c) { d += c; });
      res.on('end', function () {
        try { resolve(JSON.parse(d)); } catch (e) { reject(new Error(d)); }
      });
    });
    r.on('error', reject); r.write(body); r.end();
  });
}

function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return Promise.resolve(cachedToken);
  return httpPost('api.weixin.qq.com', '/cgi-bin/stable_token',
    JSON.stringify({ grant_type: 'client_credential', appid: APPID, secret: SECRET })
  ).then(function (j) {
    if (j.access_token) { cachedToken = j.access_token; tokenExpiry = Date.now() + (j.expires_in - 300) * 1000; return cachedToken; }
    throw new Error('token fail: ' + JSON.stringify(j));
  });
}

function callCloudFunction(name, data) {
  return getAccessToken().then(function (token) {
    return httpPost('api.weixin.qq.com', '/tcb/invokecloudfunction?access_token=' + token + '&env=' + ENV_ID + '&name=' + name, JSON.stringify(data));
  }).then(function (j) {
    if (j.errcode === 0 && j.resp_data) return JSON.parse(j.resp_data);
    throw new Error('cloud fn fail: ' + JSON.stringify(j));
  });
}

// DB HTTP API — use double-quoted syntax
function dbQuery(queryStr) {
  return getAccessToken().then(function (token) {
    return httpPost('api.weixin.qq.com', '/tcb/databasequery?access_token=' + token, JSON.stringify({ env: ENV_ID, query: queryStr }));
  }).then(function (j) {
    if (j.errcode === 0) return j;
    throw new Error('db query fail: ' + JSON.stringify(j));
  });
}

function dbDelete(queryStr) {
  return getAccessToken().then(function (token) {
    return httpPost('api.weixin.qq.com', '/tcb/databasedelete?access_token=' + token, JSON.stringify({ env: ENV_ID, query: queryStr }));
  }).then(function (j) {
    if (j.errcode === 0) return j;
    throw new Error('db delete fail: ' + JSON.stringify(j));
  });
}

function escDQ(s) { return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function jsonReply(body, code) {
  return {
    isBase64Encoded: false,
    statusCode: code || 200,
    headers: Object.assign({ 'Content-Type': 'application/json;charset=utf-8' }, corsHeaders()),
    body: JSON.stringify(body)
  };
}

function htmlReply(html) {
  return {
    isBase64Encoded: false,
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html;charset=utf-8',
      'Content-Disposition': 'inline',
      'Access-Control-Allow-Origin': '*'
    },
    body: html
  };
}

function parentPageHtml() {
  return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta http-equiv="Cache-Control" content="no-cache">\n<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">\n<title>家长留言板</title>\n<style>\n:root{--p:#4A90D9;--bg:#F5F7FA;--c:#fff;--t:#333;--t2:#888;--b:#E8ECF1;--r:14px}\n*{margin:0;padding:0;box-sizing:border-box}\nbody{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--t);min-height:100vh;display:flex;flex-direction:column;align-items:center}\n.ct{width:100%;max-width:480px;padding:24px 20px 40px}\n.hd{text-align:center;margin-bottom:24px;padding-top:16px}\n.ic{font-size:56px;margin-bottom:10px}\n.tl{font-size:26px;font-weight:700;color:var(--p);margin-bottom:4px}\n.sub{font-size:14px;color:var(--t2)}\n.clist{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}\n.citem{background:var(--c);border-radius:var(--r);padding:16px 20px;box-shadow:0 2px 8px rgba(0,0,0,.06);cursor:pointer;text-align:center;min-width:100px;transition:all .15s;font-size:16px;font-weight:500;user-select:none}\n.citem:active{transform:scale(.95);background:#EEF4FB}\n.cback{display:block;text-align:center;color:var(--p);font-size:14px;margin-top:18px;cursor:pointer}\n.icd{background:var(--c);border-radius:var(--r);padding:20px;box-shadow:0 2px 12px rgba(0,0,0,.06)}\n.cod{font-size:13px;color:var(--p);margin-bottom:12px;font-weight:500}\n.txt{width:100%;height:120px;border:none;outline:none;font-size:17px;line-height:1.7;resize:none;font-family:inherit}\n.txt::placeholder{color:#c0c0c0}\n.ft{display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:1px solid var(--b)}\n.ctr{font-size:13px;color:var(--t2)}.ctr.full{color:#E74C3C}\n.btn{width:100%;margin-top:20px;height:52px;background:linear-gradient(135deg,#4A90D9,#357ABD);color:#fff;font-size:18px;font-weight:600;border:none;border-radius:26px;cursor:pointer;box-shadow:0 4px 14px rgba(74,144,217,.3);transition:all .2s}\n.btn:active{transform:scale(.97)}.btn:disabled{background:#CCD5E0;box-shadow:none;cursor:not-allowed}\n.toast{position:fixed;top:20px;left:50%;transform:translateX(-50%);padding:12px 28px;border-radius:24px;font-size:15px;z-index:999;opacity:0;pointer-events:none;transition:opacity .3s;color:#fff}\n.toast.show{opacity:1}.toast.success{background:#52C41A}.toast.error{background:#E74C3C}\n.rec{margin-top:32px}.rtl{font-size:15px;font-weight:600;color:#666;margin-bottom:12px}\n.lst{display:flex;flex-direction:column;gap:10px}\n.itm{background:var(--c);border-radius:var(--r);padding:14px 16px;box-shadow:0 1px 6px rgba(0,0,0,.04);animation:slide .35s ease}\n.ctt{font-size:16px;color:#333;line-height:1.6;word-break:break-all}\n.tme{font-size:12px;color:#bbb;margin-top:6px}\n@keyframes slide{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}\n.emp{text-align:center;color:#ccc;font-size:14px;padding:24px 0}\n.note{text-align:center;margin-top:24px;font-size:12px;color:#bbb}\n.hide{display:none}</style>\n</head>\n<body>\n<div class="toast" id="toast"></div>\n<div class="ct" id="page1">\n<div class="hd"><div class="ic">💬</div><div class="tl">家长留言板</div><div class="sub">选择孩子所在班级</div></div>\n<div class="clist" id="clist"></div>\n<div class="note">留言实时显示在教室大屏上</div>\n<div class="note" style="font-size:11px;color:#aaa;max-width:420px;margin:16px auto 0;line-height:1.6">本留言板仅用于班级接送、物品领取通知，仅留存学生姓名及留言内容，数据存储于境内微信云服务。留言内容仅本班家长、老师可见，闲置数据会定期清理。请勿发布无关、违规言论。</div>\n</div>\n<div class="ct hide" id="page2">\n<div class="hd"><div class="ic">💬</div><div class="tl">家长留言板</div><div class="sub" id="clsTitle"></div></div>\n<div class="icd">\n<div class="cod" id="cod"></div>\n<textarea class="txt" id="ipt" placeholder="输入留言，如：小明放学在校门口等你…" maxlength="200"></textarea>\n<div class="ft"><span class="ctr" id="ctr">0/200</span><a class="cback" onclick="goBack()">← 切换班级</a></div>\n</div>\n<button class="btn" id="btn" disabled>发送到教室大屏</button>\n<div class="rec"><div class="rtl">📋 我的留言</div>\n<div class="lst" id="lst"><div class="emp">暂无留言</div></div>\n</div>\n<div class="note">请勿发送孩子全名，建议用称呼</div>\n<div class="note" style="font-size:11px;color:#aaa;max-width:420px;margin:16px auto 0;line-height:1.6">本留言板仅用于班级接送、物品领取通知，仅留存学生姓名及留言内容，数据存储于境内微信云服务。留言内容仅本班家长、老师可见，闲置数据会定期清理。请勿发布无关、违规言论。</div>\n</div>\n<script>\nvar API_BASE=location.origin;\nvar page1=document.getElementById("page1"),page2=document.getElementById("page2");\nvar clist=document.getElementById("clist"),clsTitle=document.getElementById("clsTitle");\nvar cod=document.getElementById("cod"),ipt=document.getElementById("ipt");\nvar ctr=document.getElementById("ctr"),btn=document.getElementById("btn");\nvar lst=document.getElementById("lst"),toast=document.getElementById("toast");\nvar currentClass="";\nvar parentId=localStorage.getItem("parent_id");\nif(!parentId){parentId="p_"+Date.now()+"_"+Math.random().toString(36).slice(2,10);localStorage.setItem("parent_id",parentId)}\nfunction api(p,o){return fetch(API_BASE+p,o).then(function(r){return r.json()})}\nfunction loadClasses(){api("/api/classes").then(function(r){var cs=(r&&r.data)?r.data:[];var sv=localStorage.getItem("class_code");var h="";cs.forEach(function(c){h+=\'<div class="citem" onclick="selectClass(\\\'\'+escAttr(c)+\'\\\')">\'+esc(c)+(c===sv?\' <span style="font-size:11px;color:#999">上次</span>\':"")+"</div>"});clist.innerHTML=h||\'<div class="emp">暂无可选班级</div>\'}).catch(function(){clist.innerHTML=\'<div class="emp">加载失败，请刷新重试</div>\'})}\nfunction selectClass(c){currentClass=c;localStorage.setItem("class_code",c);clsTitle.textContent=c;cod.textContent="当前班级："+c;page1.classList.add("hide");page2.classList.remove("hide");ipt.value="";ctr.textContent="0/200";btn.disabled=true;loadMsgs()}\nfunction goBack(){page2.classList.add("hide");page1.classList.remove("hide");ipt.value="";ctr.textContent="0/200";btn.disabled=true;loadClasses()}\nipt.addEventListener("input",function(){var l=ipt.value.length;ctr.textContent=l+"/200";ctr.className="ctr"+(l>=200?" full":"");btn.disabled=ipt.value.trim().length===0});\nbtn.addEventListener("click",function(){var c=ipt.value.trim();if(!c||!currentClass)return;btn.disabled=true;btn.textContent="发送中...";api("/api/submit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content:c,class_code:currentClass,parent_id:parentId})}).then(function(r){if(r.ok){ipt.value="";ctr.textContent="0/200";btn.textContent="发送到教室大屏";btn.disabled=true;showToast("已发送到教室大屏","success");loadMsgs()}else{throw new Error(r.msg||"fail")}}).catch(function(){btn.disabled=false;btn.textContent="发送到教室大屏";showToast("发送失败，请重试","error")})});\nfunction loadMsgs(){if(!currentClass)return;api("/api/messages?limit=30&class_code="+encodeURIComponent(currentClass)+"&parent_id="+parentId).then(function(r){var data=(r&&r.data)?r.data.filter(function(m){return m.class_code===currentClass&&m.parent_id===parentId}):[];if(!data.length){lst.innerHTML=\'<div class="emp">暂无留言</div>\';return}lst.innerHTML=data.reverse().map(function(m){return\'<div class="itm"><div class="ctt">\'+esc(m.content)+"</div><div class=\\\'tme\\\'>"+fmt(m.createTime||m.time)+"</div></div>"}).join("")}).catch(function(){})}\nfunction showToast(m,t){toast.textContent=m;toast.className="toast "+t+" show";setTimeout(function(){toast.className="toast"},2000)}\nfunction esc(t){var d=document.createElement("div");d.textContent=t;return d.innerHTML}\nfunction escAttr(t){return t.replace(/\'/g,"\\\\\'").replace(/"/g,"&quot;")}\nfunction fmt(d){var dt=new Date(d),n=new Date(),df=n-dt;if(df<60000)return"刚刚";if(df<3600000)return Math.floor(df/60000)+"分钟前";return dt.getHours().toString().padStart(2,"0")+":"+dt.getMinutes().toString().padStart(2,"0")}\n(function(){var m=location.search.match(/class=([^&]+)/);if(m){var c=decodeURIComponent(m[1]);selectClass(c)}})();\nloadClasses();\n</script>\n</body>\n</html>';
}

// In-memory class list (survives warm invocations)
var managedClasses = [];
var classesRecovered = false;

function isValidClassName(c) {
  if (!c || c.trim().length === 0) return false;
  if (c.indexOf('�') !== -1) return false;
  // Only allow Chinese chars, ASCII letters/digits, parentheses, spaces
  for (var i = 0; i < c.length; i++) {
    var code = c.charCodeAt(i);
    // ASCII: 0-9, A-Z, a-z, space, (), （）
    if (code >= 0x30 && code <= 0x39) continue;
    if (code >= 0x41 && code <= 0x5a) continue;
    if (code >= 0x61 && code <= 0x7a) continue;
    if (code === 0x20 || code === 0x28 || code === 0x29) continue;
    if (code === 0xff08 || code === 0xff09) continue; // fullwidth ()
    // Chinese characters range
    if (code >= 0x4e00 && code <= 0x9fff) continue;
    if (code >= 0x3400 && code <= 0x4dbf) continue;
    // Invalid char
    return false;
  }
  return true;
}

exports.main_handler = function (event, context) {
  var method = (event.httpMethod || 'GET').toUpperCase();
  var epath = event.path || '/';
  var query = event.queryStringParameters || event.queryString || {};
  if (typeof query === 'string') {
    var tmp = {}; query.split('&').forEach(function (p) {
      var parts = p.split('=');
      if (parts[0]) tmp[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1] || '');
    });
    query = tmp;
  }

  if (method === 'OPTIONS') {
    return { isBase64Encoded: false, statusCode: 204, headers: corsHeaders(), body: '' };
  }

  // Serve parent page HTML directly from SCF (bypasses GitHub Pages CDN)
  if (epath === '/' || epath === '/parent') {
    return htmlReply(parentPageHtml());
  }

  // Clean invalid class names on every request
  managedClasses = managedClasses.filter(isValidClassName);

  // GET /api/classes
  if (epath === '/api/classes') {
    // Query DB directly for __CLASS__ and __UNCLASS__ markers (bypasses cloud fn limits)
    return dbQuery('db.collection("messages").where({content:db.command.in(["__CLASS__","__UNCLASS__"])}).limit(100).get()').then(function (r) {
      var classes = [];
      if (r && r.data) {
        var clsCount = {}, unclassCount = {};
        r.data.forEach(function (raw) {
          try {
            var m = typeof raw === 'string' ? JSON.parse(raw) : raw;
            var cc = m.class_code;
            if (!cc || !isValidClassName(cc)) return;
            if (m.content === '__CLASS__') clsCount[cc] = (clsCount[cc] || 0) + 1;
            if (m.content === '__UNCLASS__') unclassCount[cc] = (unclassCount[cc] || 0) + 1;
          } catch (e) {}
        });
        Object.keys(clsCount).forEach(function (c) {
          if ((clsCount[c] || 0) > (unclassCount[c] || 0)) classes.push(c);
        });
      }
      managedClasses = classes;
      return jsonReply({ ok: true, data: classes, ver: 5 });
    }).catch(function () {
      return jsonReply({ ok: true, data: managedClasses.slice(), ver: 5 });
    });
  }

  // GET /api/messages
  if (epath === '/api/messages') {
    return callCloudFunction('parentAPI', {
      action: 'getMessages',
      data: { limit: 200 }
    }).then(function (r) {
      if (r && r.data) {
        // Filter out system marker messages from display
        r.data = r.data.filter(function (m) { return !m.content || (m.content.indexOf('__CLASS__') !== 0 && m.content.indexOf('__UNCLASS__') !== 0); });
        // Filter by class_code on SCF side (cloud fn where may be ignored due to missing index)
        var qcc = query.class_code;
        if (qcc) {
          r.data = r.data.filter(function (m) { return m.class_code === qcc; });
        }
        // Parent privacy filter
        if (query.parent_id) {
          r.data = r.data.filter(function (m) { return m.parent_id === query.parent_id; });
        }
      }
      return jsonReply(r);
    }).catch(function (e) { return jsonReply({ ok: false, msg: e.message }, 500); });
  }

  // GET /api/echo — debug endpoint to verify SCF deployment version
  if (epath === '/api/echo') {
    return jsonReply({ ver: '2026-05-28-filter', query: query });
  }

  // POST /api/submit
  if (epath === '/api/submit' && method === 'POST') {
    try {
      var body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
      if (!body.content || !body.content.trim()) return jsonReply({ ok: false, msg: 'empty content' }, 400);
      return callCloudFunction('parentAPI', {
        action: 'submitMessage',
        data: { content: body.content.trim(), class_code: body.class_code || '', parent_id: body.parent_id || '' }
      }).then(function (r) { return jsonReply(r); })
        .catch(function (e) { return jsonReply({ ok: false, msg: e.message }, 500); });
    } catch (e) { return jsonReply({ ok: false, msg: e.message }, 400); }
  }

  // ===== Admin =====

  // POST /api/admin/add-class
  if (epath === '/api/admin/add-class' && method === 'POST') {
    try {
      var ab = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
      if (!ab.name || !ab.name.trim()) return jsonReply({ ok: false, msg: 'empty name' }, 400);
      var cn = ab.name.trim();
      if (managedClasses.indexOf(cn) === -1) managedClasses.push(cn);
      // Also persist via a marker message (hidden from UI)
      return callCloudFunction('parentAPI', {
        action: 'submitMessage',
        data: { content: '__CLASS__', class_code: cn, parent_id: '__system__' }
      }).then(function (r) { return jsonReply({ ok: true, id: r.id }); })
        .catch(function (e) { return jsonReply({ ok: false, msg: 'cloud fn fail: ' + e.message }, 500); });
    } catch (e) { return jsonReply({ ok: false, msg: e.message }, 400); }
  }

  // POST /api/admin/remove-class
  if (epath === '/api/admin/remove-class' && method === 'POST') {
    try {
      var rb = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
      if (!rb.name || !rb.name.trim()) return jsonReply({ ok: false, msg: 'empty name' }, 400);
      var rn = rb.name.trim();
      managedClasses = managedClasses.filter(function (c) { return c !== rn; });
      // Submit __UNCLASS__ tombstone marker to negate __CLASS__ during recovery
      return callCloudFunction('parentAPI', {
        action: 'submitMessage',
        data: { content: '__UNCLASS__', class_code: rn, parent_id: '__system__' }
      }).then(function (r) { return jsonReply({ ok: true }); })
        .catch(function (e) { return jsonReply({ ok: false, msg: 'cloud fn fail: ' + e.message }, 500); });
    } catch (e) { return jsonReply({ ok: false, msg: e.message }, 400); }
  }

  // POST /api/admin/delete-message
  if (epath === '/api/admin/delete-message' && method === 'POST') {
    try {
      var delBody = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
      if (!delBody.id) return jsonReply({ ok: false, msg: 'empty id' }, 400);
      var mid = escDQ(delBody.id);
      return dbDelete('db.collection("messages").doc("' + mid + '").remove()').then(function () {
        return jsonReply({ ok: true });
      }).catch(function (e) {
        return jsonReply({ ok: true, local: true });
      });
    } catch (e) { return jsonReply({ ok: false, msg: e.message }, 400); }
  }

  // GET /api/debug-markers (shows raw __CLASS__/__UNCLASS__ markers in DB)
  if (epath === '/api/debug-markers') {
    return callCloudFunction('parentAPI', { action: 'getMessages', data: { limit: 500 } }).then(function (r) {
      var markers = [];
      if (r && r.data) {
        r.data.forEach(function (m) {
          if (m.content === '__CLASS__' || m.content === '__UNCLASS__') {
            markers.push({ content: m.content, class_code: m.class_code, createTime: m.createTime });
          }
        });
      }
      return jsonReply({ ok: true, totalMessages: r.data ? r.data.length : 0, markers: markers, ver: 5 });
    }).catch(function (e) {
      return jsonReply({ ok: false, msg: e.message }, 500);
    });
  }

  return jsonReply({ ok: false, msg: 'not found' }, 404);
};
