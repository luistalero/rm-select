CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_variant_id uuid,
  p_quantity_delta integer,
  p_reason text,
  p_notes text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- A product variant can exist before its inventory row is created.
  -- The mutation is SECURITY DEFINER, so creation of the inventory row
  -- must happen here rather than through a direct client-side INSERT.
  select * into v_inventory
  from public.inventory
  where variant_id = p_variant_id
  for update;

  if not found then
    insert into public.inventory (variant_id, stock_on_hand, stock_reserved)
    values (p_variant_id, 0, 0);

    select * into v_inventory
    from public.inventory
    where variant_id = p_variant_id
    for update;
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
    variant_id,
    movement_type,
    quantity_delta,
    stock_before,
    stock_after,
    reason,
    notes,
    actor_id
  ) values (
    p_variant_id,
    v_type,
    p_quantity_delta,
    v_inventory.stock_on_hand,
    v_new_stock,
    trim(p_reason),
    p_notes,
    auth.uid()
  );

  return true;
end;
$function$;
