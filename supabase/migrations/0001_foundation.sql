-- RM SELECT foundation schema
-- Domain model only. RLS and transactional inventory functions follow in reviewed migrations.

create extension if not exists pgcrypto;

do $$ begin create type public.app_role as enum ('SUPER_ADMIN','ADMIN','CUSTOMER'); exception when duplicate_object then null; end $$;
do $$ begin create type public.product_status as enum ('DRAFT','ACTIVE','ARCHIVED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.order_source as enum ('WEB','WHATSAPP','MANUAL'); exception when duplicate_object then null; end $$;
do $$ begin create type public.order_status as enum ('PENDING_PAYMENT','PAYMENT_REVIEW','CONFIRMED','PREPARING','SHIPPED','DELIVERED','CANCELLED','EXPIRED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.payment_status as enum ('PENDING','RECEIPT_SUBMITTED','VERIFIED','REJECTED','REFUNDED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.shipping_status as enum ('NOT_REQUIRED','PENDING','PREPARING','SHIPPED','DELIVERED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.inventory_movement_type as enum ('SALE','EXTERNAL_SALE','RESERVATION','RELEASE','RESTOCK','ADJUSTMENT','RETURN'); exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  document_number text,
  role public.app_role not null default 'CUSTOMER',
  welcome_shipping_discount_available boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique,
  description text, image_url text, sort_order integer not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(), category_id uuid references public.categories(id) on delete set null,
  name text not null, slug text not null unique, description text, sku text unique,
  base_price numeric(12,2) not null check (base_price >= 0),
  compare_at_price numeric(12,2) check (compare_at_price is null or compare_at_price >= base_price),
  status public.product_status not null default 'DRAFT', featured boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
  cloudinary_public_id text, url text not null, alt_text text, sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
  name text not null, sku text unique, price numeric(12,2) check (price is null or price >= 0),
  attributes jsonb not null default '{}'::jsonb, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.inventory (
  variant_id uuid primary key references public.product_variants(id) on delete cascade,
  stock_on_hand integer not null default 0 check (stock_on_hand >= 0),
  stock_reserved integer not null default 0 check (stock_reserved >= 0),
  updated_at timestamptz not null default now(),
  constraint inventory_reserved_not_above_stock check (stock_reserved <= stock_on_hand)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(), order_number bigint generated always as identity unique,
  customer_id uuid references public.profiles(id) on delete set null, source public.order_source not null default 'WEB',
  order_status public.order_status not null default 'PENDING_PAYMENT', payment_status public.payment_status not null default 'PENDING',
  shipping_status public.shipping_status not null default 'PENDING', customer_name text not null, document_number text not null,
  phone text not null, destination text not null, address text not null, additional_info text,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0), discount numeric(12,2) not null default 0 check (discount >= 0),
  shipping_cost numeric(12,2) not null default 0 check (shipping_cost >= 0), total numeric(12,2) not null default 0 check (total >= 0),
  reservation_expires_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete restrict, product_name_snapshot text not null,
  variant_name_snapshot text, unit_price numeric(12,2) not null check (unit_price >= 0), quantity integer not null check (quantity > 0),
  line_total numeric(12,2) not null check (line_total >= 0), created_at timestamptz not null default now()
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(), variant_id uuid not null references public.product_variants(id) on delete restrict,
  movement_type public.inventory_movement_type not null, quantity_delta integer not null check (quantity_delta <> 0),
  stock_before integer not null, stock_after integer not null, reason text not null, notes text,
  order_id uuid references public.orders(id) on delete set null, actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.system_activity (
  id bigint generated always as identity primary key, activity_type text not null,
  actor_id uuid references public.profiles(id) on delete set null, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists products_category_idx on public.products(category_id);
create index if not exists products_status_idx on public.products(status);
create index if not exists variants_product_idx on public.product_variants(product_id);
create index if not exists orders_customer_idx on public.orders(customer_id);
create index if not exists orders_status_idx on public.orders(order_status);
create index if not exists orders_reservation_idx on public.orders(reservation_expires_at);
create index if not exists inventory_movements_variant_idx on public.inventory_movements(variant_id);
create index if not exists inventory_movements_created_idx on public.inventory_movements(created_at desc);
create index if not exists system_activity_created_idx on public.system_activity(created_at desc);

create or replace function public.has_role(required_role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = required_role);
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role in ('SUPER_ADMIN','ADMIN'));
$$;
