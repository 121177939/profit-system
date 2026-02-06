-- 如果你之前已经创建过 allowed_users 表，但缺少字段（比如 approved），直接跑下面这些 ALTER：
alter table if exists public.allowed_users
  add column if not exists role text default 'user',
  add column if not exists enabled boolean not null default true,
  add column if not exists approved boolean not null default false,
  add column if not exists blocked boolean not null default false,
  add column if not exists note text,
  add column if not exists created_at timestamptz not null default now();

-- 确保 email 唯一（如果之前没建过）
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and indexname='allowed_users_email_key'
  ) then
    create unique index allowed_users_email_key on public.allowed_users (email);
  end if;
end$$;

-- 把你的管理员账号设置为已通过（把邮箱改成你的）
update public.allowed_users
set approved = true, enabled = true, blocked = false, role = 'admin'
where email = '912872449@qq.com';

-- 商业订单利润管理系统 v20.0（账号登录版）数据库初始化
-- 1) app_state：每个账号一行（id = auth.uid()），存数据；以及全局开关（id='global'）
-- 2) allowed_users：白名单。approved=true 才允许使用；blocked=true 禁用

-- ===== 允许用 uuid 主键（Supabase 默认已经有） =====

create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.allowed_users (
  email text primary key,
  approved boolean not null default false,
  blocked boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);

-- 预置：把管理员加入白名单并默认通过
insert into public.allowed_users(email, approved, blocked, note)
values ('912872449@qq.com', true, false, '管理员')
on conflict (email) do update set approved=excluded.approved, blocked=excluded.blocked, note=excluded.note;

-- 全局开关：config.allow_login = true/false
insert into public.app_state(id, data)
values ('global', jsonb_build_object('config', jsonb_build_object('allow_login', true)))
on conflict (id) do nothing;

-- ===== RLS =====
alter table public.app_state enable row level security;
alter table public.allowed_users enable row level security;

-- app_state：每个用户只能读写自己的那一行；全局行 global 允许所有已登录用户读取
drop policy if exists "app_state_select" on public.app_state;
create policy "app_state_select"
on public.app_state for select
to authenticated
using (id = auth.uid()::text or id = 'global');

drop policy if exists "app_state_upsert_own" on public.app_state;
create policy "app_state_upsert_own"
on public.app_state for insert
to authenticated
with check (id = auth.uid()::text);

drop policy if exists "app_state_update_own" on public.app_state;
create policy "app_state_update_own"
on public.app_state for update
to authenticated
using (id = auth.uid()::text)
with check (id = auth.uid()::text);

-- allowed_users：每个用户只能读取“自己的那一行”（按 email）
-- 说明：auth.jwt()->>'email' 会返回登录邮箱
drop policy if exists "allowed_users_select_own" on public.allowed_users;
create policy "allowed_users_select_own"
on public.allowed_users for select
to authenticated
using ((auth.jwt() ->> 'email') = email);

-- 管理员维护白名单建议直接在 Supabase Dashboard 改（Service role 不受 RLS 限制）
