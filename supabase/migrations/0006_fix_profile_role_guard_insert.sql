-- Fix profile creation for Supabase Auth users.
--
-- The profile trigger runs AFTER auth.users INSERT and creates a CUSTOMER profile.
-- The previous role guard treated every INSERT as a role change because OLD is
-- not populated on INSERT. That caused Supabase Auth to return:
-- "Database error saving new user".
--
-- New CUSTOMER profiles are allowed. Role escalation remains protected, while
-- the one-time bootstrap flag continues to allow CUSTOMER -> SUPER_ADMIN.

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
  -- New accounts are always created as CUSTOMER by handle_new_user().
  -- A new privileged profile must never be created directly through the API.
  if tg_op = 'INSERT' then
    if new.role <> 'CUSTOMER' then
      if bootstrap_mode and new.role = 'SUPER_ADMIN' then
        return new;
      end if;
      raise exception 'New profiles must start as CUSTOMER';
    end if;
    return new;
  end if;

  -- The one-time bootstrap RPC is the only trusted path that may promote the
  -- first account before that account is itself SUPER_ADMIN.
  if bootstrap_mode and new.role = 'SUPER_ADMIN' and old.role = 'CUSTOMER' then
    return new;
  end if;

  if new.role is distinct from old.role and not public.has_role('SUPER_ADMIN') then
    raise exception 'Only SUPER_ADMIN can change account roles';
  end if;

  if new.role = 'SUPER_ADMIN' and old.role <> 'SUPER_ADMIN' then
    if exists (
      select 1 from public.profiles
      where role = 'SUPER_ADMIN' and id <> new.id
    ) then
      raise exception 'RM SELECT allows only one SUPER_ADMIN';
    end if;
  end if;

  if new.role = 'ADMIN' and old.role <> 'ADMIN' then
    select count(*) into admin_count
    from public.profiles
    where role = 'ADMIN' and id <> new.id;

    if admin_count >= 3 then
      raise exception 'RM SELECT allows a maximum of 3 ADMIN accounts';
    end if;
  end if;

  return new;
end;
$$;

-- Recreate the trigger so the corrected function is the active implementation.
drop trigger if exists profile_role_guard on public.profiles;
create trigger profile_role_guard
before insert or update of role on public.profiles
for each row execute function public.guard_profile_role_change();
