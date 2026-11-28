# Bag Bari

A mobile-first storefront and private admin dashboard built with **Bun, Vite, React, TypeScript and Supabase**, configured for Vercel.

## Local setup

1. Install Bun.
2. Run `bun install`.
3. Copy `.env.example` to `.env.local`.
4. Add your Supabase Project URL and Publishable key.
5. Run `supabase/schema.sql` in Supabase SQL Editor.
6. Start the development server with `bun run dev`.
7. Check the production build with `bun run build`.

## Supabase setup

- Use `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Never expose a `service_role` / secret key in a VITE variable or browser bundle.
- Run `supabase/schema.sql`. It creates categories, products, settings, the admin allow-list, orders, order items, a secure checkout RPC, RLS policies and the public `product-images` bucket.
- Supabase changed default Data API exposure behaviour for new tables in 2026. The SQL grants Data API privileges explicitly; also ensure the `public` schema is enabled in Project Settings → API → Data API.
- Create an admin user under Authentication → Users. Copy its UUID and run:

```sql
insert into public.admin_users (user_id) values ('YOUR_AUTH_USER_UUID');
```

- Sign in at `/admin`. Set the correct WhatsApp number, shipping and storefront copy in Settings.

## Source catalogue migration

The source URL, https://bag-style.com/, did not return readable page content in the environment used to prepare this repository. Its real product names, prices, variants and original images could not be verified. Until the catalogue is imported, the homepage uses clearly labelled preview-only sample products. These are not represented as the original site's products.

A structured-data crawler is included. Run it from a computer/network where the source site is reachable:

```sh
bun run scrape:source -- https://bag-style.com
```

It reads sitemap files, visits product pages and extracts Schema.org Product data (name, description, SKU, price, currency, availability, category and image URLs) into `data/source-products.json`. Review the output and import it from Admin → Products → Import JSON. A site that blocks bots, renders products only in JavaScript or omits Product JSON-LD may need a CMS export or a tailored page importer. Variant-specific inventory/options may also need a custom migration.

Imported images initially retain their source URLs. For permanent ownership and predictable performance, download the approved product images and upload them to Supabase Storage from the product editor before launch.

## Store and orders

- Guest checkout; no customer account is required.
- Cash on delivery is the initial payment method.
- Product prices, stock, shipping and totals are calculated in the database checkout function, not trusted from the browser.
- Stock is decremented inside the checkout transaction.
- Orders start as pending and can be managed from Admin → Orders.
- WhatsApp ordering opens a pre-filled message with the cart items. The store team must confirm the conversation; clicking the link alone does not create a recorded order.
- Online card or mobile-wallet payments are not enabled. Add a payment provider only after its merchant account and server-side verification flow are available.

## Vercel

1. Import `minhazexo/bag-style` into Vercel. `vercel.json` pins the framework preset, `bun install --frozen-lockfile`, `bun run build` and the `dist` output directory, so keep the tracked `bun.lock` in sync with `package.json` (CI enforces the same).
2. Add these Environment Variables to the project (Production, Preview and Development): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `SITE_URL` (for example `https://bag-style.com`, no trailing slash). Optionally add `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST`.
3. Deploy and add the custom domain in Vercel settings.
4. Shared links to `/p/<slug>` get their own title, description and Open Graph image: `bun run build` prerenders one page per product and category. Without `SITE_URL` on the deployment the sitemap, canonical links and product JSON-LD are skipped and the build log says so.
5. `vercel.json` rewrites unknown paths to `index.html` so `/admin` and other client routes survive a hard refresh; `/assets/*` is cached immutably, and the prerendered `/p/<slug>` and `/c/<slug>` pages plus `sitemap.xml` and `robots.txt` are served as real files.

## Before launch

Import and verify the complete original catalogue; replace preview imagery and copy with the store's approved assets; add the official WhatsApp number and shipping rules; create the admin allow-list row; place a test order; and verify order status handling on mobile.
