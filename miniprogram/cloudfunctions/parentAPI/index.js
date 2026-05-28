const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { action, data } = event;
  try {
    if (action === 'getClasses') {
      // Read from dedicated classes collection, fallback to extracting from messages
      let classes = [];
      try {
        const r = await db.collection('classes').orderBy('createdAt', 'asc').get();
        classes = r.data.map(c => c.name).filter(Boolean);
      } catch (e) {
        // Collection may not exist yet, fallback to messages
        const r = await db.collection('messages').field({ class_code: true }).orderBy('createTime', 'desc').limit(200).get();
        const seen = new Set();
        r.data.forEach(m => { if (m.class_code && !seen.has(m.class_code)) { seen.add(m.class_code); classes.push(m.class_code); } });
      }
      return { ok: true, data: classes };
    }

    if (action === 'getMessages') {
      let q = db.collection('messages').orderBy('createTime', 'desc').limit(data.limit || 30);
      if (data.class_code) q = q.where({ class_code: data.class_code });
      return { ok: true, data: (await q.get()).data };
    }

    if (action === 'submitMessage') {
      if (!data.content || !data.content.trim()) return { ok: false, msg: 'empty content' };
      const r = await db.collection('messages').add({
        data: {
          content: data.content.trim(),
          class_code: data.class_code || '',
          parent_id: data.parent_id || '',
          createTime: new Date()
        }
      });
      return { ok: true, id: r._id };
    }

    if (action === 'addClass') {
      if (!data.name || !data.name.trim()) return { ok: false, msg: 'empty name' };
      const name = data.name.trim();
      // Check duplicate
      const exist = await db.collection('classes').where({ name }).count();
      if (exist.total > 0) return { ok: true, msg: 'already exists' };
      await db.collection('classes').add({ data: { name, createdAt: new Date() } });
      return { ok: true };
    }

    if (action === 'removeClass') {
      if (!data.name || !data.name.trim()) return { ok: false, msg: 'empty name' };
      const name = data.name.trim();
      const r = await db.collection('classes').where({ name }).get();
      if (r.data.length > 0) {
        await db.collection('classes').doc(r.data[0]._id).remove();
      }
      return { ok: true };
    }

    if (action === 'deleteMessage') {
      if (!data.id) return { ok: false, msg: 'empty id' };
      await db.collection('messages').doc(data.id).remove();
      return { ok: true };
    }

    return { ok: false, msg: 'unknown action' };
  } catch (e) { return { ok: false, msg: e.message }; }
};
