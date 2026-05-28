Page({
  data: { classes: [], saved: '' },
  onLoad() {
    this.setData({ saved: wx.getStorageSync('class_code') || '' });
    this.loadClasses();
  },
  onShow() { this.loadClasses(); },
  loadClasses() {
    wx.cloud.callFunction({ name: 'getClasses', success: res => {
      const classes = res.result || [];
      const saved = this.data.saved;
      if (saved && classes.indexOf(saved) === -1) classes.unshift(saved);
      this.setData({ classes });
    }, fail: () => {} });
  },
  selectClass(e) {
    const cls = e.currentTarget.dataset.class;
    wx.setStorageSync('class_code', cls);
    wx.navigateTo({ url: '/pages/message/message?class_code=' + encodeURIComponent(cls) });
  },
  addNewClass() {
    wx.showModal({ title: '添加班级', editable: true, placeholderText: '如：三(1)班', success: res => {
      if (res.confirm && res.content.trim()) this.selectClass({ currentTarget: { dataset: { class: res.content.trim() } } });
    }});
  }
});
