-- Customer feedback and operational settings.

create type public.review_status as enum ('PENDING', 'PUBLISHED', 'REJECTED');

create table public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text not null check (char_length(trim(comment)) between 10 and 1000),
  status public.review_status not null default 'PENDING',
  moderation_notes text,
  created_at timestamptz not null default now(),
  moderated_at timestamptz,
  moderated_by uuid references public.profiles(id) on delete set null,
  unique (customer_id, order_id, product_id)
);

create index product_reviews_product_status_idx on public.product_reviews(product_id, status, created_at desc);
alter table public.product_reviews enable row level security;

create policy reviews_public_read on public.product_reviews for select to anon, authenticated
using (status = 'PUBLISHED' or customer_id = auth.uid() or public.is_staff());
create policy reviews_customer_create on public.product_reviews for insert to authenticated
with check (customer_id = auth.uid() and status = 'PENDING');
create policy reviews_staff_manage on public.product_reviews for all to authenticated
using (public.is_staff()) with check (public.is_staff());

create table public.business_settings (
  id boolean primary key default true check (id = true),
  business_name text not null default 'R&M SELECT',
  whatsapp_numbers text[] not null default array[]::text[],
  payment_instructions text,
  shipping_policy text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.business_settings (id) values (true) on conflict (id) do nothing;
alter table public.business_settings enable row level security;

create policy settings_staff_read on public.business_settings for select to authenticated using (public.is_staff());
create policy settings_super_admin_update on public.business_settings for update to authenticated
using (public.has_role('SUPER_ADMIN')) with check (public.has_role('SUPER_ADMIN'));

create or replace function public.touch_business_settings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

create trigger business_settings_touch_updated_at before update on public.business_settings
for each row execute function public.touch_business_settings();
