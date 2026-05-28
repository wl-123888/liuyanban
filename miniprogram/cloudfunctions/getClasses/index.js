const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const r = await db.collection('messages').field({ class_code: true }).orderBy('createTime', 'desc').limit(100).get();
  const seen = new Set(), classes = [];
  r.data.forEach(m => { if (m.class_code && !seen.has(m.class_code)) { seen.add(m.class_code); classes.push(m.class_code); } });
  return classes;
};
