Page({
  data: { class_code: '', content: '', count: 0, canSend: false, messages: [] },
  onLoad(opts) { this.setData({ class_code: decodeURIComponent(opts.class_code || '') }); this.loadMsgs(); },
  onInput(e) {
    const v = e.detail.value;
    this.setData({ content: v, count: v.length, canSend: v.trim().length > 0 });
  },
  send() {
    const content = this.data.content.trim(), class_code = this.data.class_code;
    if (!content) return wx.showToast({ title: '请输入内容', icon: 'none' });
    this.setData({ canSend: false });
    wx.cloud.callFunction({ name: 'submitMessage', data: { content, class_code }, success: () => {
      this.setData({ content: '', count: 0, canSend: false });
      wx.showToast({ title: '已发送到教室大屏', icon: 'success' });
      this.loadMsgs();
    }, fail: () => {
      this.setData({ canSend: true });
      wx.showToast({ title: '发送失败，请重试', icon: 'none' });
    }});
  },
  loadMsgs() {
    wx.cloud.callFunction({ name: 'getMessages', data: { class_code: this.data.class_code, limit: 20 }, success: res => {
      const msgs = (res.result || []).map(m => ({
        id: m._id, content: m.content,
        time: this.fmt(m.createTime)
      }));
      this.setData({ messages: msgs });
    }});
  },
  goBack() { wx.navigateBack(); },
  fmt(d) {
    const dt = new Date(d), n = new Date(), diff = n - dt;
    if (diff < 6e4) return '刚刚';
    if (diff < 36e5) return Math.floor(diff / 6e4) + '分钟前';
    return String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
  }
});
