-- RM SELECT one-time SUPER_ADMIN bootstrap
-- The browser may expose the setup screen, but promotion is impossible without
-- the one-time secret stored in this table. The secret is never committed to Git.

create table if not exists public.super_admin_bootstrap (
  id boolean primary key default true check (id = true),
  secret_hash text not null,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.super_admin_bootstrap enable row level security;

revoke all on public.super_admin_bootstrap from anon, authenticated;

create or replace function public.bootstrap_super_admin(
  p_user_id uuid,
  p_secret text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bootstrap public.super_admin_bootstrap%rowtype;
  v_super_admin_exists boolean;
begin
  if p_user_id is null or nullif(trim(p_secret), '') is null then
    raise exception 'Invalid bootstrap request';
  end if;

  -- Serialize the one-time operation. This prevents two first visitors from
  -- both becoming SUPER_ADMIN during a race.
  select * into v_bootstrap
  from public.super_admin_bootstrap
  where id = true
  for update;

  if not found or v_bootstrap.used_at is not null then
    raise exception 'SUPER_ADMIN bootstrap is already used or not configured';
  end if;

  select exists (
    select 1 from public.profiles where role = 'SUPER_ADMIN'
  ) into v_super_admin_exists;

  if v_super_admin_exists then
    update public.super_admin_bootstrap
    set used_at = coalesce(used_at, now())
    where id = true;
    raise exception 'SUPER_ADMIN already exists';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User does not exist';
  end if;

  if not (v_bootstrap.secret_hash = encode(digest(p_secret, 'sha256'), 'hex')) then
    raise exception 'Invalid bootstrap secret';
  end if;

  update public.profiles
  set role = 'SUPER_ADMIN',
      updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'User profile was not created';
  end if;

  update public.super_admin_bootstrap
  set used_at = now(),
      used_by = p_user_id
  where id = true;

  insert into public.system_activity (activity_type, actor_id, metadata)
  values (
    'SUPER_ADMIN_BOOTSTRAPPED',
    p_user_id,
    jsonb_build_object('one_time', true)
  );

  return true;
end;
$$;

revoke all on function public.bootstrap_super_admin(uuid, text) from public, anon, authenticated;
grant execute on function public.bootstrap_super_admin(uuid, text) to anon, authenticated;

-- IMPORTANT: after running this migration, configure the one-time secret manually
-- in Supabase SQL Editor. Do NOT commit the secret to GitHub.
-- Example:
-- insert into public.super_admin_bootstrap (secret_hash)
-- values (encode(digest('YOUR-PRIVATE-ONE-TIME-SECRET', 'sha256'), 'hex'));
