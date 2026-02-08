// Supabase Edge Function: delete-user
// 管理员删除账号：同时删除 auth.users + user_profiles（以及其他业务表可按需扩展）
// 说明：请在 Supabase 控制台将本函数的 "Verify JWT" 设为 OFF（因为我们用 body.access_token 手动校验）
//
// 请求 JSON：{ access_token, admin_email, target_email }
// 返回：{ ok: true, deleted_user_id, cleaned: { user_profiles: n } }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = (await req.json().catch(() => null)) || {};
    const access_token = String(body.access_token || "").trim();
    const admin_email = String(body.admin_email || "").trim();
    const target_email = String(body.target_email || "").trim();

    if (!access_token) {
      return new Response(JSON.stringify({ error: "Missing access_token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!admin_email) {
      return new Response(JSON.stringify({ error: "Missing admin_email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!target_email) {
      return new Response(JSON.stringify({ error: "Missing target_email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 1) 校验 access_token（确保是有效 JWT）
    const { data: userData, error: userErr } = await adminClient.auth.getUser(access_token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid JWT" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) 校验管理员权限：admin_users 表里必须存在
    const { data: admins, error: adminErr } = await adminClient
      .from("admin_users")
      .select("email")
      .eq("email", admin_email)
      .limit(1);

    if (adminErr) {
      return new Response(JSON.stringify({ error: "admin_users check failed: " + adminErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!admins || admins.length === 0) {
      return new Response(JSON.stringify({ error: "Not admin" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) 找到要删除的用户 id
    const { data: list, error: listErr } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listErr) {
      return new Response(JSON.stringify({ error: listErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const target = (list?.users || []).find((u) => (u.email || "").toLowerCase() === target_email.toLowerCase());
    if (!target) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4) 删除 auth.users
    const { error: delErr } = await adminClient.auth.admin.deleteUser(target.id);
    if (delErr) {
      return new Response(JSON.stringify({ error: delErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5) 同步清理业务表（这里至少清理 user_profiles，避免前端列表残留）
    //    备注：如果你的库里还有 allowed_users 等表，可以在这里继续追加 delete。
    let cleanedProfiles = 0;
    const { error: profErr, count } = await adminClient
      .from("user_profiles")
      .delete({ count: "exact" })
      .or(`id.eq.${target.id},email.eq.${target_email}`);

    if (profErr) {
      // 不阻断主流程，但把错误返回给前端，方便你排查表名/权限/是否存在
      return new Response(JSON.stringify({ ok: true, deleted_user_id: target.id, warn: "user_profiles cleanup failed: " + profErr.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      cleanedProfiles = Number(count || 0);
    }

    return new Response(JSON.stringify({ ok: true, deleted_user_id: target.id, cleaned: { user_profiles: cleanedProfiles } }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
