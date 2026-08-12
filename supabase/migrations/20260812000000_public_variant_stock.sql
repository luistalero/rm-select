-- Public storefront stock information.
-- Inventory itself remains staff-only. This function exposes only the quantity
-- currently available for purchase for active variants.

create or replace function public.get_public_variant_stock()
returns table (
  variant_id uuid,
  available_quantity integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pv.id as variant_id,
    greatest(
      coalesce(i.stock_on_hand, 0) - coalesce(i.stock_reserved, 0),
      0
    )::integer as available_quantity
  from public.product_variants pv
  left join public.inventory i on i.variant_id = pv.id
  join public.products p on p.id = pv.product_id
  where pv.is_active = true
    and p.status = 'ACTIVE';
$$;

revoke all on function public.get_public_variant_stock() from public;
grant execute on function public.get_public_variant_stock() to anon, authenticated;
