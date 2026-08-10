-- RM SELECT security foundation
-- Public catalog is readable without authentication.
-- Customer/order/inventory mutations will be exposed through controlled functions.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'Cliente RM SELECT'),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists categories_touch_updated_at on public.categories;
create trigger categories_touch_updated_at
before update on public.categories
for each row execute function public.touch_updated_at();

drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at
before update on public.products
for each row execute function public.touch_updated_at();

drop trigger if exists variants_touch_updated_at on public.product_variants;
create trigger variants_touch_updated_at
before update on public.product_variants
for each row execute function public.touch_updated_at();

drop trigger if exists inventory_touch_updated_at on public.inventory;
create trigger inventory_touch_updated_at
before update on public.inventory
for each row execute function public.touch_updated_at();

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
before update on public.orders
for each row execute function public.touch_updated_at();

-- RLS is the security boundary for the browser client.
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_variants enable row level security;
alter table public.inventory enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.system_activity enable row level security;

-- Profiles: users can read/update their own customer profile; staff can manage profiles.
drop policy if exists profiles_select_own_or_staff on public.profiles;
create policy profiles_select_own_or_staff
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_staff());

drop policy if exists profiles_update_own_or_staff on public.profiles;
create policy profiles_update_own_or_staff
on public.profiles for update to authenticated
using (id = auth.uid() or public.is_staff())
with check (id = auth.uid() or public.is_staff());

-- Direct profile inserts are deliberately not exposed to the browser.
-- handle_new_user() creates profiles from auth.users.

-- Public catalog.
drop policy if exists categories_public_read on public.categories;
create policy categories_public_read
on public.categories for select to anon, authenticated
using (is_active or public.is_staff());

drop policy if exists categories_staff_write on public.categories;
create policy categories_staff_write
on public.categories for all to authenticated
using (public.is_staff())
with check (public.is_staff());

drop policy if exists products_public_read on public.products;
create policy products_public_read
on public.products for select to anon, authenticated
using (status = 'ACTIVE' or public.is_staff());

drop policy if exists products_staff_write on public.products;
create policy products_staff_write
on public.products for all to authenticated
using (public.is_staff())
with check (public.is_staff());

drop policy if exists product_images_public_read on public.product_images;
create policy product_images_public_read
on public.product_images for select to anon, authenticated
using (
  exists (
    select 1 from public.products p
    where p.id = product_images.product_id
      and (p.status = 'ACTIVE' or public.is_staff())
  )
);

drop policy if exists product_images_staff_write on public.product_images;
create policy product_images_staff_write
on public.product_images for all to authenticated
using (public.is_staff())
with check (public.is_staff());

-- Variants are public only when their product is active.
drop policy if exists variants_public_read on public.product_variants;
create policy variants_public_read
on public.product_variants for select to anon, authenticated
using (
  is_active and exists (
    select 1 from public.products p
    where p.id = product_variants.product_id and p.status = 'ACTIVE'
  )
  or public.is_staff()
);

drop policy if exists variants_staff_write on public.product_variants;
create policy variants_staff_write
on public.product_variants for all to authenticated
using (public.is_staff())
with check (public.is_staff());

-- Inventory is never public. Stock changes must go through controlled server-side functions.
drop policy if exists inventory_staff_read on public.inventory;
create policy inventory_staff_read
on public.inventory for select to authenticated
using (public.is_staff());

drop policy if exists inventory_staff_write on public.inventory;
create policy inventory_staff_write
on public.inventory for all to authenticated
using (public.is_staff())
with check (public.is_staff());

-- Customers can see only their own orders. Staff can see all orders.
drop policy if exists orders_customer_or_staff_read on public.orders;
create policy orders_customer_or_staff_read
on public.orders for select to authenticated
using (customer_id = auth.uid() or public.is_staff());

-- Browser clients cannot directly create/update/delete orders. Checkout RPCs will own these operations.

drop policy if exists order_items_customer_or_staff_read on public.order_items;
create policy order_items_customer_or_staff_read
on public.order_items for select to authenticated
using (
  public.is_staff()
  or exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and o.customer_id = auth.uid()
  )
);

-- Inventory audit history is staff-only.
drop policy if exists inventory_movements_staff_read on public.inventory_movements;
create policy inventory_movements_staff_read
on public.inventory_movements for select to authenticated
using (public.is_staff());

drop policy if exists system_activity_staff_read on public.system_activity;
create policy system_activity_staff_read
on public.system_activity for select to authenticated
using (public.is_staff());

-- Explicitly revoke table mutations from the public API roles. Security-definer functions
-- will be granted only for the operations that are intentionally exposed.
revoke insert, update, delete on public.orders from anon, authenticated;
revoke insert, update, delete on public.order_items from anon, authenticated;
revoke insert, update, delete on public.inventory_movements from anon, authenticated;
revoke insert, update, delete on public.system_activity from anon, authenticated;

-- Keep the REST API read-only for inventory from the browser even for staff.
revoke insert, update, delete on public.inventory from anon, authenticated;
