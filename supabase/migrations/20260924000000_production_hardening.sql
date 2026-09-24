-- Production hardening for the GitHub Pages client.
-- Apply after the existing migrations.

-- Checkout is account-based in the deployed storefront. Do not let an anonymous
-- caller reserve stock through the public RPC endpoint.
create or replace function public.guard_web_order_authentication()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source = 'WEB' and auth.uid() is null then
    raise exception 'Authentication is required to create a web order';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_require_web_authentication on public.orders;
create trigger orders_require_web_authentication
before insert on public.orders
for each row execute function public.guard_web_order_authentication();

revoke execute on function public.create_order(jsonb, text, text, text, text, text, text) from anon;
grant execute on function public.create_order(jsonb, text, text, text, text, text, text) to authenticated;

-- Inventory rows are created by a staff-only RPC. This preserves the database
-- rule that browser clients cannot write the inventory table directly.
create or replace function public.ensure_inventory_record(p_variant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Only staff can initialize inventory';
  end if;

  if not exists (select 1 from public.product_variants where id = p_variant_id) then
    raise exception 'Product variant not found';
  end if;

  insert into public.inventory (variant_id, stock_on_hand, stock_reserved)
  values (p_variant_id, 0, 0)
  on conflict (variant_id) do nothing;

  return true;
end;
$$;

revoke all on function public.ensure_inventory_record(uuid) from public, anon, authenticated;
grant execute on function public.ensure_inventory_record(uuid) to authenticated;
