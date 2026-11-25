# Bag Style

A mobile-first Bag Style storefront and private admin panel built with **Bun, Vite, React, TypeScript and Supabase**. It is configured for Vercel hosting.

## Stack

- Bun runtime and package manager
- React + TypeScript + Vite
- Supabase Auth, Postgres, Row Level Security and Storage
- Lightweight CSS motion and responsive layouts
- Vercel SPA rewrites and immutable asset caching

## Run locally

1. Install Bun.
2. Install dependencies: bun install
3. Copy .env.example to .env.local.
4. Add the Supabase Project URL and Publishable key (or legacy anon key).
5. Run the SQL in supabase/schema.sql in Supabase SQL Editor.
6. Start the dev server: bun run dev

Build with bun run build and preview with bun run preview.

## Supabase setup

1. Create a Supabase project.
2. In Project Settings → API, copy the Project URL and the **publishable** key into .env.local:
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_PUBLISHABLE_KEY
3. Run supabase/schema.sql in the SQL Editor. It creates the catalogue, orders, settings, admin allow-list, RLS policies, a secure checkout RPC and the public product image bucket.
4. Create your admin account from Authentication → Users (email/password).
5. Copy that Auth user's UUID and run this SQL, replacing the UUID:

~~~sql
insert into public.admin_users (user_id) values ('YOUR_AUTH_USER_UUID');
~~~

6. Open /admin and sign in with that email and password.
7. Add the WhatsApp number, shipping fee, free-shipping threshold and store copy from Admin → Settings.

**Never add a Supabase service-role/secret key to Vercel client environment variables or to any VITE_ variable.** Only the publishable/anon key belongs in the browser.

Supabase changed the default exposure behaviour for new public-schema tables in 2026. The SQL grants Data API privileges explicitly; also confirm that the public schema is enabled in Project Settings → API → Data API.

## Product catalogue migration

The original https://bag-style.com/ did not return readable page content in the environment used to prepare this repository, so its real product names, prices, variants and images could not be verified here. The visible products without Supabase are clearly marked **preview-only sample data**; they are not claimed to be the source catalogue.

A generic structured-data crawler is included. Run it from a network where the source site is reachable:

~~~sh
bun run scrape:source -- https://bag-style.com
~~~

It checks the website's sitemap(s), visits product pages and extracts Schema.org Product JSON-LD (name, description, SKU, price, currency, availability, category and image URLs) into data/source-products.json. Review the export, then use Admin → Products → Import JSON to load it. If the source CMS does not expose Product JSON-LD or blocks crawling, export products from that CMS (CSV/JSON) or provide the product-page URLs and a tailored importer can be added.

Images are imported as source URLs. For permanent ownership and predictable speed, download those images and upload them to the Supabase product-images bucket from the product editor before launch.

## Orders and checkout

- Customers can check out without creating an account.
- The database calculates product prices and shipping server-side; the browser only sends product IDs and quantities.
- Stock is checked and reduced atomically inside the checkout transaction.
- Orders are created as pending with cash-on-delivery as the initial payment method.
- Customers receive an order number immediately after placement.
- The WhatsApp option prepares a message with the cart details and opens the store's configured WhatsApp number. WhatsApp conversations must be confirmed by the store team; a click alone is not recorded as an order.
- Admins can review orders and move them through pending, confirmed, processing, shipped, delivered or cancelled.

Online card/mobile-wallet payments are not enabled. Add a payment provider only after its merchant account and server-side verification flow are available.

## Vercel deployment

1. Import minhazexo/bag-style into Vercel.
2. Framework preset: Vite. Build command: bun run build. Output directory: dist.
3. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY under Project → Settings → Environment Variables.
4. Redeploy after adding environment variables.
5. Add your custom domain in Vercel and update its DNS records as instructed by Vercel.

## Important launch checklist

- Import and verify the complete source catalogue, including product variants, stock and image rights.
- Replace preview images and editorial copy with the original store's approved assets and exact branding.
- Add the correct WhatsApp number and delivery fees.
- Create the admin allow-list entry.
- Place a test order and verify the order appears in Admin → Orders.
- Test the site on mobile and confirm delivery coverage and return policies.
