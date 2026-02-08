// Supabase Edge Function: admin-create-user
// IMPORTANT: Disable "Verify JWT" for this function in Supabase dashboard.
// Because some mobile WebViews strip Authorization headers, we pass access_token in JSON body and validate manually.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try{
    if(req.method !== "POST"){
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = await req.json().catch(()=>null) || {};
    const access_token = (body.access_token || "").trim();
    const admin_email = (body.admin_email || "").trim();
    const target_email = (body.target_email || "").trim();
    const target_password = (body.target_password || "").trim();

    if(!access_token) return new Response(JSON.stringify({ error: "Missing access_token" }), { status: 401 });
    if(!admin_email) return new Response(JSON.stringify({ error: "Missing admin_email" }), { status: 400 });
    if(!target_email) return new Response(JSON.stringify({ error: "Missing target_email" }), { status: 400 });
    if(!target_password || target_password.length < 8) return new Response(JSON.stringify({ error: "Password must be >= 8 chars" }), { status: 400 });

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // validate token
    const { data: userData, error: userErr } = await adminClient.auth.getUser(access_token);
    if(userErr || !userData?.user){
      return new Response(JSON.stringify({ error: "Invalid JWT" }), { status: 401 });
    }

    // check admin_users table
    const { data: admins, error: adminErr } = await adminClient
      .from("admin_users")
      .select("email")
      .eq("email", admin_email)
      .limit(1);

    if(adminErr) return new Response(JSON.stringify({ error: "admin_users check failed: " + adminErr.message }), { status: 500 });
    if(!admins || admins.length === 0) return new Response(JSON.stringify({ error: "Not admin" }), { status: 403 });

    // create user
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email: target_email,
      password: target_password,
      email_confirm: true
    });

    if(createErr) return new Response(JSON.stringify({ error: createErr.message }), { status: 400 });

    return new Response(JSON.stringify({ ok: true, user: created.user }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }catch(e){
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
  }
});
