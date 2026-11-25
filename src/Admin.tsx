import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  type Category,
  type Product,
  DEFAULT_SETTINGS,
  money,
  slugify,
  supabase
} from "./lib";

type Tab = "overview" | "products" | "orders" | "settings";
type ProductDraft = {
  id: string;
  name: string;
  description: string;
  price: string;
  compare_at_price: string;
  sku: string;
  category_id: string;
  images: string;
  featured: boolean;
  is_active: boolean;
  stock_quantity: string;
};

const emptyDraft: ProductDraft = {
  id: "",
  name: "",
  description: "",
  price: "",
  compare_at_price: "",
  sku: "",
  category_id: "",
  images: "",
  featured: false,
  is_active: true,
  stock_quantity: ""
};

const statuses = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];

function AdminIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    box: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 8 9 5 9-5M3 8v9l9 5 9-5V8M12 13v9" /></>,
    orders: <><path d="M5 4h14v17H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1a1.8 1.8 0 1 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3 .9v.2a1.8 1.8 0 1 1-3.6 0v-.2a1.8 1.8 0 0 0-3-.9l-.1.1a1.8 1.8 0 1 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-.9-3H3.8a1.8 1.8 0 1 1 0-3.6H4a1.8 1.8 0 0 0 .9-3l-.1-.1a1.8 1.8 0 1 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3-.9V2.8a1.8 1.8 0 1 1 3.6 0V3a1.8 1.8 0 0 0 3 .9l.1-.1a1.8 1.8 0 1 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 .9 3h.2a1.8 1.8 0 1 1 0 3.6h-.2a1.8 1.8 0 0 0-.9 2Z" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M4 12h15M13 5l7 7-7 7" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    search: <><circle cx="10.8" cy="10.8" r="6.5" /><path d="m16 16 4.5 4.5" /></>
  };
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.grid}</svg>;
}

function AdminNotice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={error ? "admin-notice error" : "admin-notice"}>{children}</div>;
}

export default function Admin({ navigate }: { navigate: (path: string) => void }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({
    store_name: DEFAULT_SETTINGS.store_name,
    announcement: DEFAULT_SETTINGS.announcement,
    hero_title: DEFAULT_SETTINGS.hero_title,
    hero_subtitle: DEFAULT_SETTINGS.hero_subtitle,
    whatsapp_number: "",
    shipping_fee: String(DEFAULT_SETTINGS.shipping_fee),
    free_shipping_threshold: String(DEFAULT_SETTINGS.free_shipping_threshold)
  });
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft);
  const [editorOpen, setEditorOpen] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [importing, setImporting] = useState(false);

  const loadData = useCallback(async () => {
    if (!supabase) return;
    const [productResult, categoryResult, orderResult, settingResult] = await Promise.all([
      supabase.from("products").select("*").order("created_at", { ascending: false }),
      supabase.from("categories").select("*").order("sort_order", { ascending: true }),
      supabase.from("orders").select("*, order_items(*)").order("created_at", { ascending: false }).limit(100),
      supabase.from("store_settings").select("key,value")
    ]);
    if (productResult.error) setError(productResult.error.message);
    else setProducts((productResult.data || []) as Product[]);
    if (categoryResult.error) setError(categoryResult.error.message);
    else setCategories((categoryResult.data || []) as Category[]);
    if (orderResult.error) setError(orderResult.error.message);
    else setOrders(orderResult.data || []);
    if (!settingResult.error && settingResult.data) {
      const next = { ...settings };
      settingResult.data.forEach((row: { key: string; value: unknown }) => { next[row.key] = String(row.value ?? ""); });
      setSettings(next);
    }
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) { setAuthReady(true); return; }
    let active = true;
    const verifyAdmin = async (current: Session | null) => {
      if (!active) return;
      if (!current) {
        setSession(null);
        setAuthReady(true);
        return;
      }
      const { data, error: lookupError } = await client.from("admin_users")
        .select("user_id").eq("user_id", current.user.id).maybeSingle();
      if (!active) return;
      if (lookupError || !data) {
        await client.auth.signOut();
        setSession(null);
        setAuthError("This account does not have admin access. Add its user ID to public.admin_users first.");
      } else {
        setSession(current);
        setAuthError("");
        void loadData();
      }
      setAuthReady(true);
    };
    void client.auth.getSession().then(({ data }) => verifyAdmin(data.session));
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      window.setTimeout(() => { void verifyAdmin(nextSession); }, 0);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadData]);

  const filteredProducts = useMemo(() => {
    const query = productSearch.toLowerCase().trim();
    return products.filter((product) => !query || [product.name, product.sku, product.slug].some((value) => String(value || "").toLowerCase().includes(query)));
  }, [products, productSearch]);

  const filteredOrders = useMemo(() => {
    const query = orderSearch.toLowerCase().trim();
    return orders.filter((order) => (statusFilter === "all" || order.status === statusFilter) &&
      (!query || [order.order_number, order.customer_name, order.customer_phone].some((value) => String(value || "").toLowerCase().includes(query))));
  }, [orders, orderSearch, statusFilter]);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  };

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setAuthError("");
    setSaving(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setSaving(false);
    if (signInError) setAuthError(signInError.message);
  };

  const signOut = async () => {
    await supabase?.auth.signOut();
    setSession(null);
  };

  const beginEdit = (product?: Product) => {
    if (!product) {
      setDraft(emptyDraft);
    } else {
      setDraft({
        id: product.id,
        name: product.name,
        description: product.description || "",
        price: String(product.price),
        compare_at_price: product.compare_at_price == null ? "" : String(product.compare_at_price),
        sku: product.sku || "",
        category_id: product.category_id || "",
        images: (product.images || []).join("\n"),
        featured: Boolean(product.featured),
        is_active: Boolean(product.is_active),
        stock_quantity: product.stock_quantity == null ? "" : String(product.stock_quantity)
      });
    }
    setEditorOpen(true);
    setError("");
  };

  const uploadImages = async (files: FileList | null) => {
    if (!supabase || !files?.length) return;
    setSaving(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
          throw new Error("Choose image files smaller than 5 MB.");
        }
        const safeName = file.name.toLowerCase().replace(/[^a-z0-9.-]+/g, "-");
        const path = Date.now() + "-" + crypto.randomUUID().slice(0, 8) + "-" + safeName;
        const { error: uploadError } = await supabase.storage.from("product-images").upload(path, file, {
          cacheControl: "31536000",
          upsert: false,
          contentType: file.type
        });
        if (uploadError) throw uploadError;
        urls.push(supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl);
      }
      setDraft((current) => ({ ...current, images: [current.images, ...urls].filter(Boolean).join("\n") }));
      showNotice(urls.length + " image(s) uploaded.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Image upload failed.");
    } finally {
      setSaving(false);
    }
  };

  const saveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setSaving(true);
    setError("");
    try {
      const name = draft.name.trim();
      const price = Number(draft.price);
      if (name.length < 2 || !Number.isFinite(price) || price <= 0) throw new Error("Add a product name and a price greater than zero.");
      const images = draft.images.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
      const row = {
        name,
        slug: slugify(name),
        description: draft.description.trim(),
        price,
        compare_at_price: draft.compare_at_price ? Number(draft.compare_at_price) : null,
        sku: draft.sku.trim() || null,
        category_id: draft.category_id || null,
        images,
        featured: draft.featured,
        is_active: draft.is_active,
        stock_quantity: draft.stock_quantity === "" ? null : Math.max(0, Number(draft.stock_quantity))
      };
      const result = draft.id
        ? await supabase.from("products").update(row).eq("id", draft.id)
        : await supabase.from("products").insert(row);
      if (result.error) throw result.error;
      setEditorOpen(false);
      await loadData();
      showNotice(draft.id ? "Product updated." : "Product added to the catalogue.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the product.");
    } finally {
      setSaving(false);
    }
  };

  const toggleProduct = async (product: Product) => {
    if (!supabase) return;
    const { error: updateError } = await supabase.from("products").update({ is_active: !product.is_active }).eq("id", product.id);
    if (updateError) setError(updateError.message);
    else {
      setProducts((current) => current.map((item) => item.id === product.id ? { ...item, is_active: !product.is_active } : item));
      showNotice(product.is_active ? "Product hidden from the storefront." : "Product is now visible.");
    }
  };

  const addCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !newCategory.trim()) return;
    const { error: categoryError } = await supabase.from("categories").insert({ name: newCategory.trim(), slug: slugify(newCategory), sort_order: categories.length });
    if (categoryError) setError(categoryError.message);
    else {
      setNewCategory("");
      await loadData();
      showNotice("Category created.");
    }
  };

  const importJson = async (file: File | undefined) => {
    if (!supabase || !file) return;
    setImporting(true);
    setError("");
    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>[];
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("The JSON file must contain a non-empty product array.");
      const rows = parsed.map((item) => {
        const name = String(item.name || "").trim();
        if (!name) return null;
        const categoryName = String(item.category || "").toLowerCase();
        const category = categories.find((entry) => entry.name.toLowerCase() === categoryName || entry.slug === slugify(categoryName));
        const imageList = Array.isArray(item.images) ? item.images.map(String) : [];
        const priceValue = item.price == null || item.price === "" ? Number.NaN : Number(item.price);
        const currency = String(item.currency || "BDT").toUpperCase();
        const validLocalPrice = Number.isFinite(priceValue) && priceValue > 0 && currency === "BDT";
        const availability = String(item.availability || "");
        const unavailable = /outofstock|discontinued/i.test(availability);
        return {
          name,
          slug: slugify(String(item.slug || name)),
          description: String(item.description || ""),
          price: validLocalPrice ? priceValue : 0,
          sku: item.sku ? String(item.sku) : null,
          category_id: category?.id || null,
          images: imageList,
          featured: false,
          is_active: validLocalPrice,
          stock_quantity: unavailable ? 0 : null,
          tags: [availability, currency].filter(Boolean)
        };
      }).filter((row): row is NonNullable<typeof row> => Boolean(row));
      if (!rows.length) throw new Error("No valid products were found in the JSON file.");
      const { error: importError } = await supabase.from("products").upsert(rows, { onConflict: "slug" });
      if (importError) throw importError;
      await loadData();
      showNotice("Imported " + rows.length + " products. Unpriced or non-BDT items stay hidden until reviewed.");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Could not import that JSON file.");
    } finally {
      setImporting(false);
    }
  };

  const updateOrderStatus = async (orderId: string, status: string) => {
    if (!supabase) return;
    const { error: statusError } = await supabase.from("orders").update({ status }).eq("id", orderId);
    if (statusError) setError(statusError.message);
    else {
      setOrders((current) => current.map((order) => order.id === orderId ? { ...order, status } : order));
      showNotice("Order status updated.");
    }
  };

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setSaving(true);
    setError("");
    try {
      const rows = Object.entries(settings).map(([key, value]) => ({
        key,
        value: key === "shipping_fee" || key === "free_shipping_threshold" ? Number(value || 0) : value
      }));
      const { error: settingsError } = await supabase.from("store_settings").upsert(rows, { onConflict: "key" });
      if (settingsError) throw settingsError;
      showNotice("Store settings saved.");
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (!supabase) {
    return <div className="admin-gate"><div className="admin-gate-card"><span className="admin-gate-mark">b.</span><p className="eyebrow">BAG STYLE · ADMIN</p><h1>Connect your store.</h1><p>Add your Supabase Project URL and publishable key to the Vercel environment or local .env.local file. Then run the setup SQL and reload this page.</p><button className="button button-dark" onClick={() => navigate("/")}>Back to storefront <AdminIcon name="arrow" /></button></div></div>;
  }

  if (!authReady) return <div className="admin-loading">Preparing your admin space…</div>;

  if (!session) {
    return (
      <div className="admin-login-shell">
        <div className="admin-login-aside"><button className="admin-login-logo" onClick={() => navigate("/")}>b.<span>BAG STYLE</span></button><div><p className="eyebrow">BEHIND THE EVERYDAY</p><h1>A little space<br />to run your store.</h1><p>Manage the collection, keep an eye on orders and make the store feel like yours.</p></div><span className="login-aside-foot">BAG STYLE · STORE MANAGEMENT</span></div>
        <div className="admin-login-main"><button className="back-store-link" onClick={() => navigate("/")}>← Back to storefront</button><form className="admin-login-form" onSubmit={signIn}><p className="eyebrow">WELCOME BACK</p><h2>Admin sign in</h2><p className="login-intro">Use your authorised Bag Style account to continue.</p><label>Email address<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" /></label>{authError ? <AdminNotice error>{authError}</AdminNotice> : null}<button className="button button-dark button-full" disabled={saving}>{saving ? "Signing in…" : "Sign in securely"} <AdminIcon name="arrow" /></button><small>Access is limited to accounts listed in the store's admin allow-list.</small></form></div>
      </div>
    );
  }

  const revenue = orders.filter((order) => order.status !== "cancelled").reduce((sum, order) => sum + Number(order.total || 0), 0);
  const pendingOrders = orders.filter((order) => order.status === "pending").length;
  const pageTitle = tab === "overview" ? "Overview" : tab === "products" ? "Products" : tab === "orders" ? "Orders" : "Store settings";

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <button className="admin-brand" onClick={() => navigate("/")}>b.<span><strong>BAG STYLE</strong><small>STORE ADMIN</small></span></button>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="admin-nav">
          {([
            ["overview", "grid", "Overview"],
            ["products", "box", "Products"],
            ["orders", "orders", "Orders"],
            ["settings", "settings", "Settings"]
          ] as [Tab, string, string][]).map(([value, icon, label]) => (
            <button key={value} className={tab === value ? "admin-nav-item active" : "admin-nav-item"} onClick={() => { setTab(value); setError(""); }}><AdminIcon name={icon} /><span>{label}</span>{value === "orders" && pendingOrders > 0 ? <b>{pendingOrders}</b> : null}</button>
          ))}
        </nav>
        <div className="sidebar-bottom"><div className="admin-user-avatar">{session.user.email?.slice(0, 1).toUpperCase() || "A"}</div><div className="admin-user-info"><strong>{session.user.email?.split("@")[0]}</strong><small>Store administrator</small></div><button className="signout-icon" onClick={signOut} title="Sign out"><AdminIcon name="logout" /></button></div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar"><div><p className="eyebrow">BAG STYLE / MANAGEMENT</p><h1>{pageTitle}</h1></div><div className="admin-top-actions"><span className="admin-live-dot">Store connected</span><button className="button button-outline button-small" onClick={() => navigate("/")}>View storefront <AdminIcon name="arrow" /></button></div></header>
        <div className="admin-content">
          {error ? <AdminNotice error>{error}</AdminNotice> : null}
          {notice ? <AdminNotice>{notice}</AdminNotice> : null}

          {tab === "overview" ? (
            <section className="admin-overview">
              <div className="admin-welcome-panel"><div><p className="eyebrow">YOUR STORE, AT A GLANCE</p><h2>Good to see you.</h2><p>Here is what is happening with Bag Style today.</p></div><span className="welcome-symbol">✳</span></div>
              <div className="stats-grid">
                <div className="stat-card"><span>PRODUCTS</span><strong>{products.length}</strong><small>In your catalogue</small><i><AdminIcon name="box" /></i></div>
                <div className="stat-card"><span>ORDERS</span><strong>{orders.length}</strong><small>Latest 100 orders</small><i><AdminIcon name="orders" /></i></div>
                <div className="stat-card"><span>NEEDS ATTENTION</span><strong>{pendingOrders}</strong><small>Pending confirmation</small><i className="stat-warm"><AdminIcon name="grid" /></i></div>
                <div className="stat-card"><span>ORDER VALUE</span><strong>{money(revenue)}</strong><small>Non-cancelled orders loaded</small><i><AdminIcon name="arrow" /></i></div>
              </div>
              <div className="admin-section-card"><div className="admin-section-head"><div><p className="eyebrow">RECENT ACTIVITY</p><h3>Recent orders</h3></div><button className="text-link" onClick={() => setTab("orders")}>View all <span>↗</span></button></div>
                {orders.length === 0 ? <div className="admin-empty">No orders yet. New customer orders will appear here.</div> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>DATE</th><th>TOTAL</th><th>STATUS</th></tr></thead><tbody>{orders.slice(0, 6).map((order) => <tr key={order.id}><td><strong>{order.order_number}</strong></td><td>{order.customer_name}<small>{order.customer_phone}</small></td><td>{new Date(order.created_at).toLocaleDateString("en-BD")}</td><td><strong>{money(Number(order.total))}</strong></td><td><span className={"status-pill " + order.status}>{order.status}</span></td></tr>)}</tbody></table></div>}
              </div>
              <div className="admin-quick-grid"><button onClick={() => { setTab("products"); beginEdit(); }}><span>＋</span><strong>Add a product</strong><small>Grow your collection</small></button><button onClick={() => setTab("settings")}><span>↗</span><strong>Update store details</strong><small>WhatsApp, shipping, copy</small></button></div>
            </section>
          ) : null}

          {tab === "products" ? (
            <section className="admin-products">
              <div className="admin-section-card">
                <div className="admin-section-head"><div><p className="eyebrow">YOUR COLLECTION</p><h3>Product catalogue <span className="count-badge">{products.length}</span></h3></div><div className="admin-head-actions"><label className="import-json-button"> {importing ? "Importing…" : "Import JSON"} <input type="file" accept="application/json,.json" disabled={importing} onChange={(event) => { void importJson(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label><button className="button button-dark button-small" onClick={() => beginEdit()}><AdminIcon name="plus" /> Add product</button></div></div>
                <label className="admin-search"><AdminIcon name="search" /><input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search by product, SKU or slug…" /></label>
                <div className="admin-products-grid">{filteredProducts.map((product) => <article className="admin-product-card" key={product.id}><img src={product.images?.[0] || "/bag-icon.svg"} alt={product.name} /><div className="admin-product-details"><div className="admin-product-title"><strong>{product.name}</strong><span className={product.is_active ? "visibility-tag visible" : "visibility-tag"}>{product.is_active ? "Live" : "Hidden"}</span></div><span>{product.sku || "No SKU"} · {product.stock_quantity == null ? "Stock not tracked" : product.stock_quantity + " in stock"}</span><b>{money(Number(product.price))}</b><div className="admin-product-actions"><button onClick={() => beginEdit(product)}>Edit details</button><button onClick={() => void toggleProduct(product)}>{product.is_active ? "Hide" : "Publish"}</button></div></div></article>)}</div>
                {filteredProducts.length === 0 ? <div className="admin-empty">No products match this search.</div> : null}
              </div>
              <div className="admin-section-card category-manager"><div><p className="eyebrow">ORGANISE THE COLLECTION</p><h3>Categories</h3></div><form onSubmit={addCategory}><input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="New category name" required /><button className="button button-outline button-small">Add category</button></form><div className="category-manager-list">{categories.map((category) => <span key={category.id}>{category.name}</span>)}</div></div>
              {editorOpen ? (
                <div className="admin-editor-layer"><form className="product-editor" onSubmit={saveProduct}>
                  <div className="admin-section-head"><div><p className="eyebrow">{draft.id ? "UPDATE THE DETAILS" : "ADD SOMETHING GOOD"}</p><h3>{draft.id ? "Edit product" : "New product"}</h3></div><button type="button" className="icon-button" onClick={() => setEditorOpen(false)}>×</button></div>
                  <div className="editor-grid">
                    <label className="editor-wide">Product name<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="The Everyday Tote" /></label>
                    <label>Price (BDT)<input type="number" min="0" step="1" required value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} /></label>
                    <label>Compare-at price<input type="number" min="0" step="1" value={draft.compare_at_price} onChange={(event) => setDraft({ ...draft, compare_at_price: event.target.value })} /></label>
                    <label>SKU<input value={draft.sku} onChange={(event) => setDraft({ ...draft, sku: event.target.value })} placeholder="Optional" /></label>
                    <label>Category<select value={draft.category_id} onChange={(event) => setDraft({ ...draft, category_id: event.target.value })}><option value="">Uncategorised</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                    <label>Stock quantity<input type="number" min="0" value={draft.stock_quantity} onChange={(event) => setDraft({ ...draft, stock_quantity: event.target.value })} placeholder="Leave blank for unlimited" /></label>
                    <label className="editor-wide">Description<textarea rows={4} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Product description and details…" /></label>
                    <label className="editor-wide">Image URLs <textarea rows={3} value={draft.images} onChange={(event) => setDraft({ ...draft, images: event.target.value })} placeholder="One image URL per line" /></label>
                    <label className="editor-wide upload-field">Upload images <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" multiple onChange={(event) => void uploadImages(event.target.files)} /><small>JPG, PNG, WEBP or AVIF · up to 5 MB each</small></label>
                    <label className="check-field"><input type="checkbox" checked={draft.featured} onChange={(event) => setDraft({ ...draft, featured: event.target.checked })} /> Feature on homepage</label>
                    <label className="check-field"><input type="checkbox" checked={draft.is_active} onChange={(event) => setDraft({ ...draft, is_active: event.target.checked })} /> Visible in store</label>
                  </div>
                  <div className="editor-actions"><button type="button" className="button button-outline" onClick={() => setEditorOpen(false)}>Cancel</button><button className="button button-dark" disabled={saving}>{saving ? "Saving…" : "Save product"} <AdminIcon name="check" /></button></div>
                </form></div>
              ) : null}
            </section>
          ) : null}

          {tab === "orders" ? (
            <section className="admin-orders"><div className="admin-section-card"><div className="admin-section-head"><div><p className="eyebrow">CUSTOMER ACTIVITY</p><h3>All orders <span className="count-badge">{orders.length}</span></h3></div></div><div className="orders-toolbar"><label className="admin-search"><AdminIcon name="search" /><input value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder="Order number, customer or phone…" /></label><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
              {filteredOrders.length === 0 ? <div className="admin-empty">No matching orders. Customer checkouts will show up here.</div> : <div className="order-list">{filteredOrders.map((order) => <details className="order-card" key={order.id}><summary><div><strong>{order.order_number}</strong><span>{order.customer_name} · {order.customer_phone}</span></div><div><b>{money(Number(order.total))}</b><span className={"status-pill " + order.status}>{order.status}</span></div><small>{new Date(order.created_at).toLocaleString("en-BD")}</small></summary><div className="order-card-body"><div className="order-customer"><span><small>DELIVERY ADDRESS</small>{order.customer_address}</span>{order.customer_note ? <span><small>NOTE</small>{order.customer_note}</span> : null}<span><small>PAYMENT</small>Cash on delivery</span></div><div className="order-items-list">{(order.order_items || []).map((item: any) => <div key={item.id}><img src={item.product_image || "/bag-icon.svg"} alt="" /><span>{item.product_name}<small>Qty {item.quantity} × {money(Number(item.unit_price))}</small></span><b>{money(Number(item.line_total))}</b></div>)}</div><div className="order-foot"><div><span>Subtotal {money(Number(order.subtotal))}</span><span>Delivery {money(Number(order.shipping_fee))}</span><strong>Total {money(Number(order.total))}</strong></div><label>Update status<select value={order.status} onChange={(event) => void updateOrderStatus(order.id, event.target.value)}>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label></div></div></details>)}</div>}
            </div></section>
          ) : null}

          {tab === "settings" ? (
            <section className="admin-settings"><form className="admin-section-card settings-form" onSubmit={saveSettings}><div className="admin-section-head"><div><p className="eyebrow">MAKE IT YOURS</p><h3>Store settings</h3></div></div><p className="settings-intro">These details appear on the storefront and are used when customers place orders.</p>
              <div className="settings-grid">
                <label>Store name<input value={settings.store_name} onChange={(event) => setSettings({ ...settings, store_name: event.target.value })} /></label>
                <label>WhatsApp number<input value={settings.whatsapp_number} onChange={(event) => setSettings({ ...settings, whatsapp_number: event.target.value })} placeholder="8801XXXXXXXXX" /><small>Include country code, without spaces.</small></label>
                <label>Delivery fee (BDT)<input type="number" min="0" value={settings.shipping_fee} onChange={(event) => setSettings({ ...settings, shipping_fee: event.target.value })} /></label>
                <label>Free delivery from (BDT)<input type="number" min="0" value={settings.free_shipping_threshold} onChange={(event) => setSettings({ ...settings, free_shipping_threshold: event.target.value })} /><small>Set to 0 to disable free delivery.</small></label>
                <label className="editor-wide">Announcement bar<input value={settings.announcement} onChange={(event) => setSettings({ ...settings, announcement: event.target.value })} /></label>
                <label className="editor-wide">Homepage headline<input value={settings.hero_title} onChange={(event) => setSettings({ ...settings, hero_title: event.target.value })} /></label>
                <label className="editor-wide">Homepage introduction<textarea rows={3} value={settings.hero_subtitle} onChange={(event) => setSettings({ ...settings, hero_subtitle: event.target.value })} /></label>
              </div>
              <div className="editor-actions"><span className="settings-helper">Changes are published to the storefront immediately.</span><button className="button button-dark" disabled={saving}>{saving ? "Saving…" : "Save settings"} <AdminIcon name="check" /></button></div>
            </form>
              <div className="admin-section-card settings-security"><span className="settings-security-icon">✓</span><div><strong>Admin access is protected by Supabase Auth + Row Level Security.</strong><p>Only user IDs registered in public.admin_users can manage products, orders and store settings. Keep the service-role key private and never add it to the browser environment.</p></div></div>
          </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}