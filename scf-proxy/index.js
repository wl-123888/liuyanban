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

  // Clean invalid class names on every request
  managedClasses = managedClasses.filter(isValidClassName);

  // GET /api/classes
  if (epath === '/api/classes') {
    var forceReset = query.reset === '1';
    if (forceReset) {
      managedClasses = [];
      classesRecovered = false;
    }
    if (classesRecovered && !forceReset) {
      return Promise.resolve(jsonReply({ ok: true, data: managedClasses.slice(), ver: 5 }));
    }
    // Recover managedClasses from __CLASS__ / __UNCLASS__ marker messages
    return callCloudFunction('parentAPI', { action: 'getMessages', data: { limit: 500 } }).then(function (r) {
      classesRecovered = true;
      managedClasses = [];
      if (r && r.data) {
        var clsCount = {}, unclassCount = {};
        r.data.forEach(function (m) {
          var cc = m.class_code;
          if (!cc || !isValidClassName(cc)) return;
          if (m.content === '__CLASS__') clsCount[cc] = (clsCount[cc] || 0) + 1;
          if (m.content === '__UNCLASS__') unclassCount[cc] = (unclassCount[cc] || 0) + 1;
        });
        Object.keys(clsCount).forEach(function (c) {
          if ((clsCount[c] || 0) > (unclassCount[c] || 0)) managedClasses.push(c);
        });
      }
      return jsonReply({ ok: true, data: managedClasses.slice(), ver: 5 });
    }).catch(function () {
      classesRecovered = true;
      return jsonReply({ ok: true, data: managedClasses.slice(), ver: 5 });
    });
  }

  // GET /api/messages
  if (epath === '/api/messages') {
    return callCloudFunction('parentAPI', {
      action: 'getMessages',
      data: { class_code: query.class_code || '', limit: parseInt(query.limit) || 30 }
    }).then(function (r) {
      if (r && r.data) {
        // Filter out class marker messages from display
        r.data = r.data.filter(function (m) { return !m.content || m.content.indexOf('__CLASS__') !== 0; });
        // Parent privacy filter
        if (query.parent_id) {
          r.data = r.data.filter(function (m) { return m.parent_id === query.parent_id; });
        }
      }
      return jsonReply(r);
    }).catch(function (e) { return jsonReply({ ok: false, msg: e.message }, 500); });
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

  return jsonReply({ ok: false, msg: 'not found' }, 404);
};
