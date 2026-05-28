const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { class_code, limit = 30 } = event;
  let q = db.collection('messages').orderBy('createTime', 'desc').limit(limit);
  if (class_code) q = q.where({ class_code });
  const r = await q.get();
  return r.data;
};
