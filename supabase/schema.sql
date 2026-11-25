-- BAG STYLE - Supabase schema
-- Run this script in Supabase SQL Editor. All exposed tables have explicit
-- Data API grants and RLS policies.

create extension if not exists pgcrypto;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  short_description text,
  price numeric(12,2) not null check (price >= 0),
  compare_at_price numeric(12,2) check (compare_at_price is null or compare_at_price >= 0),
  sku text unique,
  category_id uuid references public.categories(id) on delete set null,
  images text[] not null default '{}',
  featured boolean not null default false,
  is_active boolean not null default true,
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  customer_address text not null,
  customer_note text,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  shipping_fee numeric(12,2) not null default 0 check (shipping_fee >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  status text not null default 'pending'
    check (status in ('pending','confirmed','processing','shipped','delivered','cancelled')),
  payment_method text not null default 'cash_on_delivery',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  product_sku text,
  product_image text,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create index if not exists products_active_created_idx on public.products (is_active, created_at desc);
create index if not exists products_category_idx on public.products (category_id);
create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists order_items_order_idx on public.order_items (order_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists store_settings_set_updated_at on public.store_settings;
create trigger store_settings_set_updated_at before update on public.store_settings
for each row execute function public.set_updated_at();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at before update on public.orders
for each row execute function public.set_updated_at();

-- Admin membership is held in a private allow-list. Do not authorize from
-- user-editable user_metadata or profile fields.
create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  );
$$;

grant execute on function public.is_admin() to authenticated;

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.store_settings enable row level security;
alter table public.admin_users enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "Categories are public to read" on public.categories;
create policy "Categories are public to read"
on public.categories for select to anon, authenticated using (true);

drop policy if exists "Admins manage categories" on public.categories;
create policy "Admins manage categories"
on public.categories for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Active products are public" on public.products;
create policy "Active products are public"
on public.products for select to anon, authenticated using (is_active = true);

drop policy if exists "Admins read all products" on public.products;
create policy "Admins read all products"
on public.products for select to authenticated using (public.is_admin());

drop policy if exists "Admins manage products" on public.products;
create policy "Admins manage products"
on public.products for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Store settings are public to read" on public.store_settings;
create policy "Store settings are public to read"
on public.store_settings for select to anon, authenticated using (true);

drop policy if exists "Admins manage store settings" on public.store_settings;
create policy "Admins manage store settings"
on public.store_settings for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can read their own admin record" on public.admin_users;
create policy "Admins can read their own admin record"
on public.admin_users for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Admins read orders" on public.orders;
create policy "Admins read orders"
on public.orders for select to authenticated using (public.is_admin());

drop policy if exists "Admins update orders" on public.orders;
create policy "Admins update orders"
on public.orders for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins read order items" on public.order_items;
create policy "Admins read order items"
on public.order_items for select to authenticated using (public.is_admin());

-- Explicit Data API privileges. RLS remains the row-level access boundary.
grant usage on schema public to anon, authenticated;
grant select on public.categories, public.products, public.store_settings to anon, authenticated;
grant insert, update, delete on public.categories, public.products, public.store_settings to authenticated;
grant select, update on public.orders to authenticated;
grant select on public.order_items, public.admin_users to authenticated;

-- Public checkout accepts only product IDs and quantities. The function
-- calculates prices, availability, stock, delivery and totals inside Postgres.
create or replace function public.create_customer_order(
  p_customer_name text,
  p_customer_phone text,
  p_customer_address text,
  p_customer_note text default null,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid := gen_random_uuid();
  v_order_number text := 'BS-' || to_char(now(), 'YYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 9));
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_subtotal numeric(12,2) := 0;
  v_shipping_fee numeric(12,2) := 80;
  v_free_shipping_threshold numeric(12,2) := 3000;
  v_total numeric(12,2);
begin
  if length(trim(coalesce(p_customer_name, ''))) < 2 or length(p_customer_name) > 120 then
    raise exception 'Please enter a valid name';
  end if;

  if length(regexp_replace(coalesce(p_customer_phone, ''), '[^0-9+]', '', 'g')) < 8
     or length(p_customer_phone) > 30 then
    raise exception 'Please enter a valid phone number';
  end if;

  if length(trim(coalesce(p_customer_address, ''))) < 8
     or length(p_customer_address) > 600 then
    raise exception 'Please enter a complete delivery address';
  end if;

  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 30 then
    raise exception 'Your cart is empty or contains too many items';
  end if;

  insert into public.orders (
    id, order_number, customer_name, customer_phone, customer_address,
    customer_note, subtotal, shipping_fee, total, status, payment_method
  ) values (
    v_order_id, v_order_number, trim(p_customer_name), trim(p_customer_phone),
    trim(p_customer_address), nullif(trim(coalesce(p_customer_note, '')), ''),
    0, 0, 0, 'pending', 'cash_on_delivery'
  );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := coalesce((v_item ->> 'quantity')::integer, 0);
    if v_quantity < 1 or v_quantity > 99 then
      raise exception 'Invalid item quantity';
    end if;

    select * into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid
      and is_active = true
    for update;

    if not found then
      raise exception 'One of the products is no longer available';
    end if;

    if v_product.stock_quantity is not null and v_product.stock_quantity < v_quantity then
      raise exception 'Not enough stock for %', v_product.name;
    end if;

    v_subtotal := v_subtotal + (v_product.price * v_quantity);

    insert into public.order_items (
      order_id, product_id, product_name, product_sku, product_image,
      unit_price, quantity, line_total
    ) values (
      v_order_id, v_product.id, v_product.name, v_product.sku,
      v_product.images[1], v_product.price, v_quantity, v_product.price * v_quantity
    );

    if v_product.stock_quantity is not null then
      update public.products
      set stock_quantity = stock_quantity - v_quantity
      where id = v_product.id;
    end if;
  end loop;

  select coalesce((select nullif(value #>> '{}', '')::numeric
                   from public.store_settings where key = 'shipping_fee'), 80)
    into v_shipping_fee;
  select coalesce((select nullif(value #>> '{}', '')::numeric
                   from public.store_settings where key = 'free_shipping_threshold'), 3000)
    into v_free_shipping_threshold;

  if v_free_shipping_threshold > 0 and v_subtotal >= v_free_shipping_threshold then
    v_shipping_fee := 0;
  end if;

  v_total := v_subtotal + v_shipping_fee;

  update public.orders
  set subtotal = v_subtotal, shipping_fee = v_shipping_fee, total = v_total
  where id = v_order_id;

  return jsonb_build_object(
    'id', v_order_id,
    'order_number', v_order_number,
    'subtotal', v_subtotal,
    'shipping_fee', v_shipping_fee,
    'total', v_total,
    'status', 'pending'
  );
end;
$$;

revoke all on function public.create_customer_order(text, text, text, text, jsonb) from public;
grant execute on function public.create_customer_order(text, text, text, text, jsonb) to anon, authenticated;

-- Product images are public to display; admins alone can upload/update/delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update
set public = true, file_size_limit = 5242880;

drop policy if exists "Product images are public" on storage.objects;
create policy "Product images are public"
on storage.objects for select to anon, authenticated
using (bucket_id = 'product-images');

drop policy if exists "Admins upload product images" on storage.objects;
create policy "Admins upload product images"
on storage.objects for insert to authenticated
with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "Admins update product images" on storage.objects;
create policy "Admins update product images"
on storage.objects for update to authenticated
using (bucket_id = 'product-images' and public.is_admin())
with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "Admins delete product images" on storage.objects;
create policy "Admins delete product images"
on storage.objects for delete to authenticated
using (bucket_id = 'product-images' and public.is_admin());

insert into public.store_settings (key, value) values
  ('store_name', '"BAG STYLE"'::jsonb),
  ('announcement', '"A little something special for the way you move."'::jsonb),
  ('hero_title', '"Carry your story."'::jsonb),
  ('hero_subtitle', '"Considered shapes, everyday ease, and the details that make a bag yours."'::jsonb),
  ('whatsapp_number', '""'::jsonb),
  ('shipping_fee', '80'::jsonb),
  ('free_shipping_threshold', '3000'::jsonb)
on conflict (key) do nothing;

-- Create an Auth user in Supabase, copy its UUID and run:
-- insert into public.admin_users (user_id) values ('AUTH_USER_UUID');
