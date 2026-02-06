使用说明（账号登录版）

1) 部署到 GitHub Pages
- 把本包内文件上传到仓库根目录（root）
- Settings -> Pages -> Branch: main  Folder: / (root)

2) Supabase
- 需要开启 Email/Password 登录
- 建议对 app_state 表启用 RLS，并按 user_id 隔离（你之前已做过）

3) 强制刷新
- 打开 https://你的域名/?v=1  (每次改 v 值绕过缓存)
- 如果之前装过 APK/PWA：卸载旧的，清除浏览器站点数据，再重新打包
