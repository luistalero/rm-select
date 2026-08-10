-- RM SELECT transactional inventory operations
-- Stock is changed only inside row-locked database functions.

revoke execute on function public.is_staff() from anon;

revoke update on public.profiles from authenticated;
grant update (full_name, phone, document_number) on public.profiles to authenticated;

create or replace function public.reserve_stock(p_variant_id uuid, p_quantity integer, p_order_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inventory public.inventory%rowtype;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  select * into v_inventory
  from public.inventory
  where variant_id = p_variant_id
  for update;

  if not found then
    raise exception 'Inventory record not found for variant %', p_variant_id;
  end if;

  if (v_inventory.stock_on_hand - v_inventory.stock_reserved) < p_quantity then
    return false;
  end if;

  update public.inventory
  set stock_reserved = stock_reserved + p_quantity,
      updated_at = now()
  where variant_id = p_variant_id;

  insert into public.inventory_movements (
    variant_id, movement_type, quantity_delta, stock_before, stock_after,
    reason, order_id, actor_id
  ) values (
    p_variant_id, 'RESERVATION', p_quantity,
    v_inventory.stock_on_hand, v_inventory.stock_on_hand,
    'Temporary reservation', p_order_id, auth.uid()
  );

  return true;
end;
$$;

create or replace function public.release_stock(p_variant_id uuid, p_quantity integer, p_order_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inventory public.inventory%rowtype;
  v_release integer;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  select * into v_inventory
  from public.inventory
  where variant_id = p_variant_id
  for update;

  if not found then
    raise exception 'Inventory record not found for variant %', p_variant_id;
  end if;

  v_release := least(p_quantity, v_inventory.stock_reserved);
  if v_release = 0 then
    return false;
  end if;

  update public.inventory
  set stock_reserved = stock_reserved - v_release,
      updated_at = now()
  where variant_id = p_variant_id;

  insert into public.inventory_movements (
    variant_id, movement_type, quantity_delta, stock_before, stock_after,
    reason, order_id, actor_id
  ) values (
    p_variant_id, 'RELEASE', -v_release,
    v_inventory.stock_on_hand, v_inventory.stock_on_hand,
    'Reservation released', p_order_id, auth.uid()
  );

  return true;
end;
$$;

create or replace function public.consume_reserved_stock(p_variant_id uuid, p_quantity integer, p_order_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inventory public.inventory%rowtype;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  select * into v_inventory
  from public.inventory
  where variant_id = p_variant_id
  for update;

  if not found then
    raise exception 'Inventory record not found for variant %', p_variant_id;
  end if;

  if v_inventory.stock_reserved < p_quantity then
    raise exception 'Not enough reserved stock for variant %', p_variant_id;
  end if;

  update public.inventory
  set stock_on_hand = stock_on_hand - p_quantity,
      stock_reserved = stock_reserved - p_quantity,
      updated_at = now()
  where variant_id = p_variant_id;

  insert into public.inventory_movements (
    variant_id, movement_type, quantity_delta, stock_before, stock_after,
    reason, order_id, actor_id
  ) values (
    p_variant_id, 'SALE', -p_quantity,
    v_inventory.stock_on_hand, v_inventory.stock_on_hand - p_quantity,
    'Reserved order completed', p_order_id, auth.uid()
  );

  return true;
end;
$$;

create or replace function public.record_external_sale(
  p_variant_id uuid,
  p_quantity integer,
  p_reason text,
  p_notes text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inventory public.inventory%rowtype;
begin
  if not public.is_staff() then
    raise exception 'Only staff can record external sales';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'A reason is required for an external sale';
  end if;

  select * into v_inventory
  from public.inventory
  where variant_id = p_variant_id
  for update;

  if not found then
    raise exception 'Inventory record not found for variant %', p_variant_id;
  end if;

  if (v_inventory.stock_on_hand - v_inventory.stock_reserved) < p_quantity then
    raise exception 'Insufficient available stock for external sale';
  end if;

  update public.inventory
  set stock_on_hand = stock_on_hand - p_quantity,
      updated_at = now()
  where variant_id = p_variant_id;

  insert into public.inventory_movements (
    variant_id, movement_type, quantity_delta, stock_before, stock_after,
    reason, notes, actor_id
  ) values (
    p_variant_id, 'EXTERNAL_SALE', -p_quantity,
    v_inventory.stock_on_hand, v_inventory.stock_on_hand - p_quantity,
    trim(p_reason), p_notes, auth.uid()
  );

  return true;
end;
$$;

create or replace function public.adjust_stock(
  p_variant_id uuid,
  p_quantity_delta integer,
  p_reason text,
  p_notes text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inventory public.inventory%rowtype;
  v_new_stock integer;
  v_type public.inventory_movement_type;
begin
  if not public.is_staff() then
    raise exception 'Only staff can adjust inventory';
  end if;
  if p_quantity_delta is null or p_quantity_delta = 0 then
    raise exception 'Quantity delta cannot be zero';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'A reason is required for an inventory adjustment';
  end if;

  select * into v_inventory
  from public.inventory
  where variant_id = p_variant_id
  for update;

  if not found then
    raise exception 'Inventory record not found for variant %', p_variant_id;
  end if;

  v_new_stock := v_inventory.stock_on_hand + p_quantity_delta;
  if v_new_stock < v_inventory.stock_reserved then
    raise exception 'Adjustment would reduce stock below the reserved quantity';
  end if;

  v_type := case when p_quantity_delta > 0 then 'RESTOCK' else 'ADJUSTMENT' end;

  update public.inventory
  set stock_on_hand = v_new_stock,
      updated_at = now()
  where variant_id = p_variant_id;

  insert into public.inventory_movements (
    variant_id, movement_type, quantity_delta, stock_before, stock_after,
    reason, notes, actor_id
  ) values (
    p_variant_id, v_type, p_quantity_delta,
    v_inventory.stock_on_hand, v_new_stock,
    trim(p_reason), p_notes, auth.uid()
  );

  return true;
end;
$$;

revoke all on function public.reserve_stock(uuid, integer, uuid) from public;
revoke all on function public.release_stock(uuid, integer, uuid) from public;
revoke all on function public.consume_reserved_stock(uuid, integer, uuid) from public;
revoke all on function public.record_external_sale(uuid, integer, text, text) from public;
revoke all on function public.adjust_stock(uuid, integer, text, text) from public;

grant execute on function public.reserve_stock(uuid, integer, uuid) to anon, authenticated;
grant execute on function public.release_stock(uuid, integer, uuid) to authenticated;
grant execute on function public.consume_reserved_stock(uuid, integer, uuid) to authenticated;
grant execute on function public.record_external_sale(uuid, integer, text, text) to authenticated;
grant execute on function public.adjust_stock(uuid, integer, text, text) to authenticated;
