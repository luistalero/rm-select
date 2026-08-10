-- RM SELECT orders and two-hour reservation workflow

create or replace function public.create_order(
  p_items jsonb,
  p_customer_name text,
  p_document_number text,
  p_phone text,
  p_destination text,
  p_address text,
  p_additional_info text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_customer_id uuid := auth.uid();
  v_item jsonb;
  v_variant_id uuid;
  v_quantity integer;
  v_unit_price numeric(12,2);
  v_line_total numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_reserved boolean;
  v_product_name text;
  v_variant_name text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  if nullif(trim(p_customer_name), '') is null
     or nullif(trim(p_document_number), '') is null
     or nullif(trim(p_phone), '') is null
     or nullif(trim(p_destination), '') is null
     or nullif(trim(p_address), '') is null then
    raise exception 'Customer and delivery information is incomplete';
  end if;

  insert into public.orders (
    customer_id, source, customer_name, document_number, phone,
    destination, address, additional_info, reservation_expires_at
  ) values (
    v_customer_id, 'WEB', trim(p_customer_name), trim(p_document_number), trim(p_phone),
    trim(p_destination), trim(p_address), nullif(trim(p_additional_info), ''),
    now() + interval '2 hours'
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_variant_id := (v_item ->> 'variant_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception when others then
      raise exception 'Invalid cart item';
    end;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Invalid item quantity';
    end if;

    select p.name, pv.name,
           coalesce(pv.price, p.base_price)
    into v_product_name, v_variant_name, v_unit_price
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = v_variant_id
      and pv.is_active = true
      and p.status = 'ACTIVE';

    if not found then
      raise exception 'Product variant is unavailable';
    end if;

    v_line_total := v_unit_price * v_quantity;
    v_subtotal := v_subtotal + v_line_total;

    v_reserved := public.reserve_stock(v_variant_id, v_quantity, v_order_id);
    if not v_reserved then
      raise exception 'Insufficient stock for %', v_product_name;
    end if;

    insert into public.order_items (
      order_id, variant_id, product_name_snapshot, variant_name_snapshot,
      unit_price, quantity, line_total
    ) values (
      v_order_id, v_variant_id, v_product_name, v_variant_name,
      v_unit_price, v_quantity, v_line_total
    );
  end loop;

  update public.orders
  set subtotal = v_subtotal,
      total = v_subtotal,
      updated_at = now()
  where id = v_order_id;

  insert into public.system_activity (activity_type, actor_id, metadata)
  values ('ORDER_CREATED', v_customer_id, jsonb_build_object('order_id', v_order_id));

  return v_order_id;
exception
  when others then
    -- The exception aborts the transaction, including any reservations and the order itself.
    raise;
end;
$$;

create or replace function public.cancel_order(p_order_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if not (public.is_staff() or v_order.customer_id = auth.uid()) then
    raise exception 'Not authorized to cancel this order';
  end if;

  if v_order.order_status in ('DELIVERED', 'CANCELLED', 'EXPIRED') then
    return false;
  end if;

  for v_item in
    select oi.variant_id, oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id
  loop
    perform public.release_stock(v_item.variant_id, v_item.quantity, p_order_id);
  end loop;

  update public.orders
  set order_status = 'CANCELLED',
      payment_status = case when payment_status = 'VERIFIED' then payment_status else 'REJECTED' end,
      reservation_expires_at = null,
      updated_at = now()
  where id = p_order_id;

  insert into public.system_activity (activity_type, actor_id, metadata)
  values (
    'ORDER_CANCELLED', auth.uid(),
    jsonb_build_object('order_id', p_order_id, 'reason', trim(p_reason))
  );

  return true;
end;
$$;

create or replace function public.review_order_payment(p_order_id uuid, p_verified boolean, p_notes text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
begin
  if not public.is_staff() then
    raise exception 'Only staff can review payments';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.order_status in ('CANCELLED', 'EXPIRED', 'DELIVERED') then
    raise exception 'Order cannot be reviewed in its current state';
  end if;

  if p_verified then
    for v_item in
      select oi.variant_id, oi.quantity
      from public.order_items oi
      where oi.order_id = p_order_id
    loop
      perform public.consume_reserved_stock(v_item.variant_id, v_item.quantity, p_order_id);
    end loop;

    update public.orders
    set payment_status = 'VERIFIED',
        order_status = 'CONFIRMED',
        reservation_expires_at = null,
        updated_at = now()
    where id = p_order_id;
  else
    for v_item in
      select oi.variant_id, oi.quantity
      from public.order_items oi
      where oi.order_id = p_order_id
    loop
      perform public.release_stock(v_item.variant_id, v_item.quantity, p_order_id);
    end loop;

    update public.orders
    set payment_status = 'REJECTED',
        order_status = 'CANCELLED',
        reservation_expires_at = null,
        updated_at = now()
    where id = p_order_id;
  end if;

  insert into public.system_activity (activity_type, actor_id, metadata)
  values (
    case when p_verified then 'PAYMENT_VERIFIED' else 'PAYMENT_REJECTED' end,
    auth.uid(),
    jsonb_build_object('order_id', p_order_id, 'notes', p_notes)
  );

  return true;
end;
$$;

create or replace function public.expire_order_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_item record;
  v_count integer := 0;
begin
  for v_order in
    select id
    from public.orders
    where reservation_expires_at is not null
      and reservation_expires_at <= now()
      and order_status in ('PENDING_PAYMENT', 'PAYMENT_REVIEW')
    for update skip locked
  loop
    for v_item in
      select oi.variant_id, oi.quantity
      from public.order_items oi
      where oi.order_id = v_order.id
    loop
      perform public.release_stock(v_item.variant_id, v_item.quantity, v_order.id);
    end loop;

    update public.orders
    set order_status = 'EXPIRED',
        reservation_expires_at = null,
        updated_at = now()
    where id = v_order.id;

    insert into public.system_activity (activity_type, metadata)
    values ('ORDER_EXPIRED', jsonb_build_object('order_id', v_order.id));

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.create_order(jsonb, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.cancel_order(uuid, text) from public, anon, authenticated;
revoke all on function public.review_order_payment(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.expire_order_reservations() from public, anon, authenticated;

grant execute on function public.create_order(jsonb, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.cancel_order(uuid, text) to anon, authenticated;
grant execute on function public.review_order_payment(uuid, boolean, text) to authenticated;

-- expire_order_reservations is intentionally not exposed through the browser.
-- It will be invoked by a trusted scheduler once pg_cron is enabled in Supabase.
