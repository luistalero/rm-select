-- RM SELECT order fulfillment lifecycle
-- Staff-only transitions after payment verification.

create or replace function public.transition_order_status(
  p_order_id uuid,
  p_target_status public.order_status,
  p_notes text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_allowed boolean := false;
  v_shipping_status public.shipping_status;
begin
  if not public.is_staff() then
    raise exception 'Only staff can update order fulfillment status';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if p_target_status = 'PREPARING' and v_order.order_status = 'CONFIRMED' then
    v_allowed := true;
    v_shipping_status := 'PREPARING';
  elsif p_target_status = 'SHIPPED' and v_order.order_status = 'PREPARING' then
    v_allowed := true;
    v_shipping_status := 'SHIPPED';
  elsif p_target_status = 'DELIVERED' and v_order.order_status = 'SHIPPED' then
    v_allowed := true;
    v_shipping_status := 'DELIVERED';
  end if;

  if not v_allowed then
    raise exception 'Invalid order transition from % to %', v_order.order_status, p_target_status;
  end if;

  update public.orders
  set order_status = p_target_status,
      shipping_status = v_shipping_status,
      updated_at = now()
  where id = p_order_id;

  insert into public.system_activity (activity_type, actor_id, metadata)
  values (
    case p_target_status
      when 'PREPARING' then 'ORDER_PREPARING'
      when 'SHIPPED' then 'ORDER_SHIPPED'
      when 'DELIVERED' then 'ORDER_DELIVERED'
      else 'ORDER_STATUS_CHANGED'
    end,
    auth.uid(),
    jsonb_build_object(
      'order_id', p_order_id,
      'from_status', v_order.order_status,
      'to_status', p_target_status,
      'notes', nullif(trim(p_notes), '')
    )
  );

  return true;
end;
$$;

revoke all on function public.transition_order_status(uuid, public.order_status, text) from public, anon, authenticated;
grant execute on function public.transition_order_status(uuid, public.order_status, text) to authenticated;

-- Fix payment rejection so the customer can submit a corrected receipt while the
-- two-hour reservation is still active. Stock is released only by cancellation/expiration.
create or replace function public.review_order_payment(
  p_order_id uuid,
  p_verified boolean,
  p_notes text default null
)
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
    if v_order.payment_status = 'VERIFIED' then
      return false;
    end if;

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
        shipping_status = case when shipping_status = 'NOT_REQUIRED' then 'NOT_REQUIRED' else 'PENDING' end,
        reservation_expires_at = null,
        updated_at = now()
    where id = p_order_id;
  else
    if v_order.order_status <> 'PAYMENT_REVIEW' or v_order.payment_status <> 'RECEIPT_SUBMITTED' then
      raise exception 'Only submitted payment receipts can be rejected';
    end if;

    if v_order.reservation_expires_at is null or v_order.reservation_expires_at <= now() then
      for v_item in
        select oi.variant_id, oi.quantity
        from public.order_items oi
        where oi.order_id = p_order_id
      loop
        perform public.release_stock(v_item.variant_id, v_item.quantity, p_order_id);
      end loop;

      update public.orders
      set payment_status = 'REJECTED',
          order_status = 'EXPIRED',
          reservation_expires_at = null,
          updated_at = now()
      where id = p_order_id;
    else
      update public.orders
      set payment_status = 'REJECTED',
          order_status = 'PENDING_PAYMENT',
          updated_at = now()
      where id = p_order_id;
    end if;
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

revoke all on function public.review_order_payment(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.review_order_payment(uuid, boolean, text) to authenticated;
