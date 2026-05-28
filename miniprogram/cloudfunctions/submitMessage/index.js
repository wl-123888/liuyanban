const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { content, class_code } = event;
  if (!content || !content.trim()) return { ok: false, msg: 'empty' };
  const r = await db.collection('messages').add({
    data: { content: content.trim(), class_code: class_code || '', createTime: new Date() }
  });
  return { ok: true, id: r._id };
};
