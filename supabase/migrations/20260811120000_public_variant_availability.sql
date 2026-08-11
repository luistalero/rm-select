-- Public catalog availability must not depend on direct SELECT access to inventory.
-- RLS intentionally keeps inventory private to staff. This SECURITY DEFINER
-- function exposes only the minimum information the storefront needs: whether
-- an active variant currently has stock available for purchase.
CREATE OR REPLACE FUNCTION public.get_public_variant_availability()
RETURNS TABLE (
  variant_id uuid,
  in_stock boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    pv.id AS variant_id,
    (COALESCE(i.stock_on_hand, 0) - COALESCE(i.stock_reserved, 0)) > 0 AS in_stock
  FROM public.product_variants pv
  LEFT JOIN public.inventory i ON i.variant_id = pv.id
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.is_active = true
    AND p.status = 'ACTIVE';
$function$;

REVOKE ALL ON FUNCTION public.get_public_variant_availability() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_variant_availability() TO anon, authenticated;
