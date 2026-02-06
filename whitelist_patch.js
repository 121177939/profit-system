// 白名单账号控制：不在 allowed_accounts 的邮箱自动退出
async function enforceWhitelist() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const email = user.email;

  const { data, error } = await supabase
    .from("allowed_accounts")
    .select("*")
    .eq("email", email)
    .eq("enabled", true)
    .single();

  if (error || !data) {
    alert("❌你没有权限使用本系统，请联系管理员");
    await supabase.auth.signOut();
    location.reload();
  }
}

// 页面加载后自动执行
window.addEventListener("load", enforceWhitelist);
