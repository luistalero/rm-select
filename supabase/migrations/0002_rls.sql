-- RM SELECT RLS baseline.
-- Direct order/inventory writes stay closed; transactional RPCs will be the write boundary.

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

create policy profiles_select_self_or_staff on public.profiles
for select using (id = auth.uid() or public.is_staff());

create policy profiles_update_self on public.profiles
for update using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_staff_all on public.profiles
for all using (public.is_staff()) with check (public.is_staff());

create policy categories_public_read on public.categories
for select using (is_active or public.is_staff());
create policy categories_staff_write on public.categories
for all using (public.is_staff()) with check (public.is_staff());

create policy products_public_read on public.products
for select using (status = 'ACTIVE' or public.is_staff());
create policy products_staff_write on public.products
for all using (public.is_staff()) with check (public.is_staff());

create policy images_public_read on public.product_images
for select using (exists (select 1 from public.products p where p.id = product_id and (p.status = 'ACTIVE' or public.is_staff())));
create policy images_staff_write on public.product_images
for all using (public.is_staff()) with check (public.is_staff());

create policy variants_public_read on public.product_variants
for select using (is_active and exists (select 1 from public.products p where p.id = product_id and p.status = 'ACTIVE') or public.is_staff());
create policy variants_staff_write on public.product_variants
for all using (public.is_staff()) with check (public.is_staff());

create policy inventory_public_read on public.inventory
for select using (true);
create policy inventory_staff_write on public.inventory
for all using (public.is_staff()) with check (public.is_staff());

create policy orders_customer_read on public.orders
for select using (customer_id = auth.uid() or public.is_staff());
create policy orders_staff_write on public.orders
for update using (public.is_staff()) with check (public.is_staff());

create policy order_items_customer_read on public.order_items
for select using (exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or public.is_staff())));
create policy order_items_staff_write on public.order_items
for all using (public.is_staff()) with check (public.is_staff());

create policy inventory_movements_staff_read on public.inventory_movements
for select using (public.is_staff());
create policy inventory_movements_staff_insert on public.inventory_movements
for insert with check (public.is_staff());

create policy system_activity_staff_read on public.system_activity
for select using (public.is_staff());

-- Deliberately no public INSERT policy on orders/order_items/inventory_movements.
-- Browser clients must use controlled transactional functions instead.
