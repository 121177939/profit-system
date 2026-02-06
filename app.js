控制台.日志("app.js 加载");

// 创建或读取设备令牌 (安全 JS, 无中文关键字)
getOrCreateDeviceToken getOrCreateDeviceToken 函数 () {
  钥匙钥匙    =   "device_token_v1";
  tt    =   localStorage.getItem(钥匙);
  如果 (!t) {
    t   =   (加密货币   &&   加密货币.随机 UUID UUID)   ?   加密货币.随机 Uuid Uuid()   :   弦乐(日期.现在())   +   "_"   +   数学.随机();
    localStorage.setItem(钥匙,  t);
  }
  返回 t;
}

// 简单的渲染 (避免任何翻译问题)
文件.addEventListener(“DOMContentLoaded” ,   ()   =>   {
  pp    =   文件.createElement("p");
  p.textContent   =   “设备令牌:”:”   +   getOrCreateDeviceToken();
  文件.身体.appendChild(p);
});
