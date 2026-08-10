-- Protect role escalation and enforce RM SELECT administrator limits.

-- The initial broad staff policy is replaced with explicit role-aware policies.
drop policy if exists profiles_staff_all on public.profiles;
drop policy if exists profiles_update_self on public.profiles;

drop policy if exists profiles_super_admin_manage on public.profiles;
drop policy if exists profiles_admin_manage_non_privileged on public.profiles;

create policy profiles_update_self_safe on public.profiles
for update using (id = auth.uid())
with check (
  id = auth.uid()
  and role = (select p.role from public.profiles p where p.id = auth.uid())
);

create policy profiles_super_admin_manage on public.profiles
for all using (public.has_role('SUPER_ADMIN'))
with check (public.has_role('SUPER_ADMIN'));

create policy profiles_admin_manage_non_privileged on public.profiles
for select using (public.is_staff());

create unique index if not exists one_super_admin_idx
on public.profiles ((role)) where role = 'SUPER_ADMIN';

create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_count integer;
  bootstrap_mode boolean := coalesce(current_setting('rm_select.bootstrap', true), 'false') = 'true';
begin
  -- The one-time bootstrap RPC is the only trusted path that may promote the
  -- first account before that account is itself SUPER_ADMIN.
  if bootstrap_mode and new.role = 'SUPER_ADMIN' and old.role = 'CUSTOMER' then
    return new;
  end if;

  if new.role is distinct from old.role and not public.has_role('SUPER_ADMIN') then
    raise exception 'Only SUPER_ADMIN can change account roles';
  end if;

  if new.role = 'SUPER_ADMIN' and old.role <> 'SUPER_ADMIN' then
    if exists (select 1 from public.profiles where role = 'SUPER_ADMIN' and id <> new.id) then
      raise exception 'RM SELECT allows only one SUPER_ADMIN';
    end if;
  end if;

  if new.role = 'ADMIN' and old.role <> 'ADMIN' then
    select count(*) into admin_count from public.profiles where role = 'ADMIN' and id <> new.id;
    if admin_count >= 3 then
      raise exception 'RM SELECT allows a maximum of 3 ADMIN accounts';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profile_role_guard on public.profiles;
create trigger profile_role_guard
before insert or update of role on public.profiles
for each row execute function public.guard_profile_role_change();

-- Prevent deleting the only SUPER_ADMIN accidentally.
create or replace function public.guard_super_admin_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'SUPER_ADMIN' then
    raise exception 'The SUPER_ADMIN account cannot be deleted';
  end if;
  return old;
end;
$$;

drop trigger if exists super_admin_delete_guard on public.profiles;
create trigger super_admin_delete_guard
before delete on public.profiles
for each row execute function public.guard_super_admin_delete();
