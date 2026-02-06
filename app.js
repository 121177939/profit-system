控制台.日志("app.js 加载成功");

// 设备码生成（最基础）
函数 获取或创建设备令牌() {
  常量 键 = "设备令牌_v1";
  让 t = localStorage.getItem(KEY);
  如果 (!是) {
    t = 加密.生成随机UUID();
    localStorage.setItem(键, 值);
  }
  返回 真;
}

文档.主体.插入相邻HTML(
  "结束前",
  "<p>设备令牌: <b>" + getOrCreateDeviceToken() + "</b></p>"
);
