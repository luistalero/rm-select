-- Customer-facing payment instructions and verified reviews.

create or replace function public.get_public_checkout_settings()
returns table (
  whatsapp_numbers text[],
  payment_instructions text,
  shipping_policy text
)
language sql stable security definer set search_path = public as $$
  select whatsapp_numbers, payment_instructions, shipping_policy
  from public.business_settings
  where id = true;
$$;

revoke all on function public.get_public_checkout_settings() from public;
grant execute on function public.get_public_checkout_settings() to anon, authenticated;

create or replace function public.guard_verified_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_staff() then
    return new;
  end if;
  if new.customer_id <> auth.uid() or new.status <> 'PENDING' then
    raise exception 'Invalid review submission';
  end if;
  if not exists (
    select 1 from public.orders o
    join public.order_items oi on oi.order_id = o.id
    join public.product_variants pv on pv.id = oi.variant_id
    where o.id = new.order_id and o.customer_id = auth.uid()
      and o.order_status = 'DELIVERED' and pv.product_id = new.product_id
  ) then
    raise exception 'Reviews are only available for delivered products you purchased';
  end if;
  return new;
end;
$$;

drop trigger if exists product_reviews_verified_purchase on public.product_reviews;
create trigger product_reviews_verified_purchase before insert on public.product_reviews
for each row execute function public.guard_verified_review();
