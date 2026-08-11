ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_receipt_url text,
  ADD COLUMN IF NOT EXISTS payment_receipt_public_id text,
  ADD COLUMN IF NOT EXISTS payment_submitted_at timestamptz;

CREATE OR REPLACE FUNCTION public.submit_payment_receipt(
  p_order_id uuid,
  p_receipt_url text,
  p_receipt_public_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_order public.orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if nullif(trim(p_receipt_url), '') is null then
    raise exception 'Payment receipt is required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
    and customer_id = auth.uid()
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.order_status <> 'PENDING_PAYMENT' or v_order.payment_status not in ('PENDING','REJECTED') then
    raise exception 'This order cannot receive a payment receipt in its current state';
  end if;

  update public.orders
  set payment_receipt_url = trim(p_receipt_url),
      payment_receipt_public_id = nullif(trim(p_receipt_public_id), ''),
      payment_submitted_at = now(),
      payment_status = 'RECEIPT_SUBMITTED',
      order_status = 'PAYMENT_REVIEW',
      updated_at = now()
  where id = p_order_id;

  insert into public.system_activity (activity_type, actor_id, metadata)
  values (
    'PAYMENT_RECEIPT_SUBMITTED',
    auth.uid(),
    jsonb_build_object('order_id', p_order_id)
  );

  return true;
end;
$function$;

REVOKE ALL ON FUNCTION public.submit_payment_receipt(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_payment_receipt(uuid, text, text) TO authenticated;
