/**
 * 白名单 + 账号登录补丁（v20.0 最终修复版）
 * - 用 Supabase Auth（邮箱+密码）登录
 * - 登录后按 allowed_users 白名单控制（approved=true 才能用）
 * - 数据读写到 app_state 表：id = auth.uid()
 * - 全局开关：app_state 表 id='global' 的 config.allow_login (true/false)
 *
 * 使用前：先在 Supabase SQL Editor 运行 INTERNAL_SETUP.sql
 */
(function () {
  // ====== 1) 你的白名单管理员邮箱（至少 1 个）======
  const ADMIN_EMAILS = ["912872449@qq.com"]; // 你说的“才对”的邮箱

  // ====== 2) 从页面里读取 SUPABASE_URL / SUPABASE_KEY（原页面已有）======
  const SUPABASE_URL = window.SUPABASE_URL || (typeof SUPABASE_URL !== "undefined" ? SUPABASE_URL : "");
  const SUPABASE_KEY = window.SUPABASE_KEY || (typeof SUPABASE_KEY !== "undefined" ? SUPABASE_KEY : "");
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn("未找到 SUPABASE_URL / SUPABASE_KEY，无法启用账号登录补丁");
    return;
  }

  // ====== 3) Auth REST endpoints ======
  const AUTH_TOKEN_URL = SUPABASE_URL.replace(/\/$/, "") + "/auth/v1/token?grant_type=password";
  const AUTH_REFRESH_URL = SUPABASE_URL.replace(/\/$/, "") + "/auth/v1/token?grant_type=refresh_token";
  const AUTH_SIGNUP_URL = SUPABASE_URL.replace(/\/$/, "") + "/auth/v1/signup";
  const REST_URL = SUPABASE_URL.replace(/\/$/, "") + "/rest/v1";

  const LS = {
    session: "sb_session_v1"
  };

  function _headers(extra) {
    return Object.assign({
      "apikey": SUPABASE_KEY,
      "Content-Type": "application/json"
    }, extra || {});
  }

  function saveSession(sess) {
    localStorage.setItem(LS.session, JSON.stringify(sess));
  }
  function loadSession() {
    try { return JSON.parse(localStorage.getItem(LS.session) || "null"); } catch(e){ return null; }
  }
  function clearSession() {
    localStorage.removeItem(LS.session);
  }

  async function refreshIfNeeded() {
    const sess = loadSession();
    if (!sess || !sess.refresh_token) return null;
    // 简单判断：快过期就刷新
    const now = Math.floor(Date.now() / 1000);
    if (sess.expires_at && sess.expires_at - now > 60) return sess;
    const resp = await fetch(AUTH_REFRESH_URL, {
      method: "POST",
      headers: _headers(),
      body: JSON.stringify({ refresh_token: sess.refresh_token })
    });
    if (!resp.ok) {
      clearSession();
      return null;
    }
    const data = await resp.json();
    // Supabase 返回 expires_in（秒）
    const expires_at = Math.floor(Date.now() / 1000) + (data.expires_in || 3600);
    const newSess = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || sess.refresh_token,
      token_type: data.token_type || "bearer",
      user: data.user,
      expires_at
    };
    saveSession(newSess);
    return newSess;
  }

  function authBearer() {
    const sess = loadSession();
    return sess && sess.access_token ? ("Bearer " + sess.access_token) : ("Bearer " + SUPABASE_KEY);
  }

  // ====== 4) 覆盖原页面的 _supabaseHeaders，让 REST 调用带上登录 token ======
  if (typeof window._supabaseHeaders === "function") {
    const _old = window._supabaseHeaders;
    window._supabaseHeaders = function (extra) {
      const base = _old(extra || {});
      base.Authorization = authBearer();
      return base;
    };
  }

  // ====== 5) 白名单检查 ======
  async function fetchJson(url, opts) {
    const resp = await fetch(url, opts);
    const text = await resp.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch(e) {}
    if (!resp.ok) {
      const msg = (data && (data.message || data.error_description || data.error)) || text || ("HTTP " + resp.status);
      throw new Error(msg);
    }
    return data;
  }

  async function checkGlobalAllowLogin() {
    // 读取 app_state 中 id='global' 的 config.allow_login
    // 如果没有这一行，就默认允许
    const url = REST_URL + "/app_state?id=eq.global&select=data";
    try {
      const rows = await fetchJson(url, { headers: Object.assign(_headers({}), { Authorization: authBearer() }) });
      if (!rows || !rows[0] || !rows[0].data) return true;
      const cfg = rows[0].data.config || {};
      if (cfg.allow_login === false) return false;
      return true;
    } catch (e) {
      // 读不到就不阻断
      return true;
    }
  }

  async function checkWhitelist(email) {
    const url = REST_URL + "/allowed_users?email=eq." + encodeURIComponent(email) + "&select=approved,blocked";
    const rows = await fetchJson(url, { headers: Object.assign(_headers({}), { Authorization: authBearer() }) });
    if (!rows || !rows[0]) return { ok: false, reason: "不在白名单" };
    const r = rows[0];
    if (r.blocked) return { ok: false, reason: "已被禁用" };
    if (!r.approved) return { ok: false, reason: "未审批" };
    return { ok: true };
  }

  async function signOut() {
    clearSession();
    // 尝试触发页面已有的退出逻辑（如果有）
    try { if (typeof window.doLogout === "function") window.doLogout(); } catch(e){}
  }

  // ====== 6) 登录 UI（简单覆盖层，不改原页面结构）======
  function el(tag, attrs, children) {
    const x = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(k => x.setAttribute(k, attrs[k]));
    (children || []).forEach(c => x.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return x;
  }

  function showLoginOverlay(msg) {
    let overlay = document.getElementById("accountLoginOverlay");
    if (overlay) overlay.remove();

    overlay = el("div", { id: "accountLoginOverlay" });
    overlay.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;";
    const card = el("div");
    card.style.cssText = "max-width:520px;width:100%;background:#fff;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.2);padding:18px 18px 14px;font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial;";
    const title = el("div", null, ["账号登录"]);
    title.style.cssText = "font-size:20px;font-weight:700;margin-bottom:8px;color:#111;";
    const tip = el("div", null, [msg || "请输入邮箱和密码登录。"]);
    tip.style.cssText = "font-size:13px;color:#555;line-height:1.4;margin-bottom:10px;";

    const email = el("input", { type: "email", placeholder: "邮箱（例如 912872449@qq.com）" });
    email.style.cssText = "width:100%;padding:12px 12px;border:1px solid #ddd;border-radius:12px;outline:none;margin:8px 0;font-size:14px;";
    const pwd = el("input", { type: "password", placeholder: "密码" });
    pwd.style.cssText = email.style.cssText;

    const btnRow = el("div");
    btnRow.style.cssText = "display:flex;gap:10px;margin-top:10px;";

    const btnLogin = el("button", null, ["登录"]);
    btnLogin.style.cssText = "flex:1;padding:12px;border-radius:12px;border:0;background:#2563eb;color:#fff;font-weight:700;";
    const btnSignup = el("button", null, ["注册"]);
    btnSignup.style.cssText = "flex:1;padding:12px;border-radius:12px;border:1px solid #ddd;background:#fff;color:#111;font-weight:700;";
    const btnLogout = el("button", null, ["退出当前账号"]);
    btnLogout.style.cssText = "margin-top:10px;width:100%;padding:10px;border-radius:12px;border:1px solid #ddd;background:#fff;color:#b91c1c;font-weight:700;";

    const small = el("div", null, ["提示：如果提示“没有验证/未确认邮箱”，需要去 Supabase 控制台关闭 Email Confirm，或去邮箱点确认链接。"]);
    small.style.cssText = "margin-top:10px;font-size:12px;color:#666;line-height:1.4;";

    const err = el("div", { id: "loginErr" }, []);
    err.style.cssText = "margin-top:8px;font-size:13px;color:#b91c1c;min-height:18px;";

    btnRow.appendChild(btnLogin);
    btnRow.appendChild(btnSignup);

    card.appendChild(title);
    card.appendChild(tip);
    card.appendChild(email);
    card.appendChild(pwd);
    card.appendChild(btnRow);
    card.appendChild(btnLogout);
    card.appendChild(err);
    card.appendChild(small);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    function setErr(t){ err.textContent = t || ""; }

    btnLogout.onclick = async () => {
      await signOut();
      setErr("已退出。");
    };

    btnLogin.onclick = async () => {
      setErr("");
      try {
        await doLogin(email.value.trim(), pwd.value);
        overlay.remove();
      } catch(e){
        setErr(String(e.message || e));
      }
    };

    btnSignup.onclick = async () => {
      setErr("");
      try {
        await doSignup(email.value.trim(), pwd.value);
        setErr("注册请求已发送。如果开启了邮箱验证，需要去邮箱点确认后再登录。");
      } catch(e){
        setErr(String(e.message || e));
      }
    };
  }

  async function doLogin(email, password) {
    if (!email || !password) throw new Error("请输入邮箱和密码");
    const data = await fetchJson(AUTH_TOKEN_URL, {
      method: "POST",
      headers: _headers(),
      body: JSON.stringify({ email, password })
    });
    const expires_at = Math.floor(Date.now() / 1000) + (data.expires_in || 3600);
    const sess = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_type: data.token_type || "bearer",
      user: data.user,
      expires_at
    };
    saveSession(sess);

    // 登录开关
    const allowLogin = await checkGlobalAllowLogin();
    const isAdmin = ADMIN_EMAILS.includes(email);
    if (!allowLogin && !isAdmin) {
      await signOut();
      throw new Error("当前已关闭登录（管理员开关）。");
    }

    // 白名单检查
    const wl = await checkWhitelist(email);
    if (!wl.ok && !isAdmin) {
      await signOut();
      throw new Error("登录被拒绝：" + wl.reason + "（请让管理员在 allowed_users 表把 approved=true）");
    }

    // 绑定云端行 ID = uid，并触发一次云端加载
    const uid = (data.user && data.user.id) ? data.user.id : null;
    if (uid) localStorage.setItem("cloudId", uid);
    try { if (typeof window.cloudLoad === "function") await window.cloudLoad(); } catch(e){}
  }

  async function doSignup(email, password) {
    if (!email || !password) throw new Error("请输入邮箱和密码");
    // 先检查是否允许注册：只有白名单用户或管理员才建议注册
    // （如果没在白名单也能注册，但后续无法登录）
    await fetchJson(AUTH_SIGNUP_URL, {
      method: "POST",
      headers: _headers(),
      body: JSON.stringify({ email, password })
    });
  }

  // ====== 7) 页面启动时：尝试恢复会话 ======
  (async function boot() {
    await refreshIfNeeded();

    const sess = loadSession();
    if (!sess || !sess.user || !sess.user.email) {
      showLoginOverlay();
      return;
    }
    // 已有会话：仍要做一次白名单与开关检查
    const email = sess.user.email;
    const allowLogin = await checkGlobalAllowLogin();
    const isAdmin = ADMIN_EMAILS.includes(email);
    if (!allowLogin && !isAdmin) {
      await signOut();
      showLoginOverlay("管理员已关闭登录，请联系管理员开启。");
      return;
    }
    try {
      const wl = await checkWhitelist(email);
      if (!wl.ok && !isAdmin) {
        await signOut();
        showLoginOverlay("你不在白名单/未审批，请联系管理员。");
        return;
      }
    } catch (e) {
      // 白名单表未创建也给提示
      showLoginOverlay("白名单表未就绪：请先在 Supabase 执行 INTERNAL_SETUP.sql。");
      return;
    }

    // 设置 cloudId 并自动加载
    if (sess.user.id) localStorage.setItem("cloudId", sess.user.id);
    try { if (typeof window.cloudLoad === "function") await window.cloudLoad(); } catch(e){}
  })();

})();
