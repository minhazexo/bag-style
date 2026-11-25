import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    })
  : null;

export type Category = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  sort_order?: number;
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  short_description?: string | null;
  price: number;
  compare_at_price?: number | null;
  sku?: string | null;
  category_id?: string | null;
  category?: { name?: string } | null;
  images: string[];
  featured: boolean;
  is_active: boolean;
  stock_quantity?: number | null;
  tags?: string[];
  created_at?: string;
};

export type StoreSettings = {
  store_name: string;
  announcement: string;
  hero_title: string;
  hero_subtitle: string;
  whatsapp_number: string;
  shipping_fee: number;
  free_shipping_threshold: number;
};

export const DEFAULT_SETTINGS: StoreSettings = {
  store_name: "BAG STYLE",
  announcement: "A little something special for the way you move.",
  hero_title: "Carry your story.",
  hero_subtitle: "Considered shapes, everyday ease, and the details that make a bag yours.",
  whatsapp_number: "",
  shipping_fee: 80,
  free_shipping_threshold: 3000
};

const demoImages = [
  "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=1000&q=82",
  "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1000&q=82",
  "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=1000&q=82",
  "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1000&q=82",
  "https://images.unsplash.com/photo-1581605405669-fcdf81165afa?auto=format&fit=crop&w=1000&q=82",
  "https://images.unsplash.com/photo-1565026057447-bc90a3dceb87?auto=format&fit=crop&w=1000&q=82"
];

export const DEMO_CATEGORIES: Category[] = [
  { id: "all", name: "All bags", slug: "all" },
  { id: "totes", name: "Tote bags", slug: "tote-bags" },
  { id: "shoulder", name: "Shoulder bags", slug: "shoulder-bags" },
  { id: "crossbody", name: "Crossbody", slug: "crossbody" },
  { id: "travel", name: "Travel", slug: "travel" }
];

// Preview-only products. Real catalogue data is imported from the source site into Supabase.
export const DEMO_PRODUCTS: Product[] = [
  { id: "demo-01", name: "The Everyday Tote", slug: "everyday-tote", price: 1890, compare_at_price: 2290, description: "A relaxed everyday carryall with room for the things that move with you.", images: [demoImages[0]], category_id: "totes", featured: true, is_active: true, stock_quantity: 12, tags: ["everyday", "bestseller"] },
  { id: "demo-02", name: "Studio Shoulder Bag", slug: "studio-shoulder-bag", price: 1650, description: "A clean silhouette designed to go from slow mornings to late plans.", images: [demoImages[1]], category_id: "shoulder", featured: true, is_active: true, stock_quantity: 8, tags: ["minimal"] },
  { id: "demo-03", name: "The Weekend Edit", slug: "weekend-edit", price: 2490, compare_at_price: 2890, description: "An easy-going companion for weekends, short trips, and everything between.", images: [demoImages[3]], category_id: "travel", featured: true, is_active: true, stock_quantity: 6, tags: ["travel"] },
  { id: "demo-04", name: "Mini Crossbody", slug: "mini-crossbody", price: 1290, description: "Compact, hands-free, and just the right size for your daily essentials.", images: [demoImages[2]], category_id: "crossbody", featured: false, is_active: true, stock_quantity: 16, tags: ["compact"] },
  { id: "demo-05", name: "The Daily Backpack", slug: "daily-backpack", price: 2190, description: "A practical shape with a little polish, made for the days that do not sit still.", images: [demoImages[4]], category_id: "travel", featured: true, is_active: true, stock_quantity: 5, tags: ["work", "travel"] },
  { id: "demo-06", name: "Soft Form Handbag", slug: "soft-form-handbag", price: 1750, description: "A soft-structured favourite that brings an effortless finish to any look.", images: [demoImages[5]], category_id: "shoulder", featured: false, is_active: true, stock_quantity: 9, tags: ["new"] }
];

export function money(value: number): string {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

export function slugify(value: string): string {
  return value.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function settingValue(value: unknown): string | number {
  if (typeof value === "string" || typeof value === "number") return value;
  return "";
}

export function getWhatsAppUrl(number: string, message: string): string {
  const cleaned = number.replace(/\D/g, "");
  return "https://wa.me/" + cleaned + "?text=" + encodeURIComponent(message);
}