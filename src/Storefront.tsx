import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SETTINGS,
  DEMO_CATEGORIES,
  DEMO_PRODUCTS,
  type Category,
  type Product,
  type StoreSettings,
  getProductOrderMessage,
  getWhatsAppUrl,
  money,
  supabase
} from "./lib";
import { track } from "./analytics";
import { ProductImage } from "./ProductImage";
import {
  applyCategoryMeta,
  applyHomeMeta,
  applyProductMeta,
  categoryPath,
  productShareMessage,
  productSharePath,
  whatsappShareUrl,
  type Navigate
} from "./share";

type CartLine = { product: Product; quantity: number };
type OrderReceipt = { id: string; order_number: string; total: number };

const fallbackHero = "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=1500&q=88";

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, ReactNode> = {
    bag: <><path d="M5 8h14l-1 13H6L5 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    arrow: <><path d="M4 12h15" /><path d="m13 5 7 7-7 7" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    minus: <path d="M5 12h14" />,
    trash: <><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    truck: <><path d="M3 6h11v12H3zM14 10h4l3 3v5h-7z" /><circle cx="7.5" cy="19" r="1.5" /><circle cx="17.5" cy="19" r="1.5" /></>,
    shield: <><path d="M12 3 20 6v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    whatsapp: <><path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.5L3.5 20.5l1.4-4.2A8.5 8.5 0 1 1 20.5 11.6Z" /><path d="M8.7 8.4c.3-.6.6-.6 1-.6h.6c.2 0 .5 0 .6.5l.7 1.6c.1.2 0 .4-.2.6l-.4.5c-.1.2-.2.3 0 .6.4.7 1.2 1.5 2 1.9.3.1.4.1.6-.1l.5-.5c.2-.2.4-.2.6-.1l1.6.8c.3.1.4.2.4.5 0 .7-.4 1.4-1 1.7-.5.3-1.2.4-2 .2-1.4-.4-2.8-1.1-3.9-2.3-1-1-1.7-2-2-3.1-.2-.8 0-1.5.3-2.2Z" /></>,
    star: <path d="m12 4 2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 9.3l5-.7L12 4Z" />
  };
  return <svg {...common} aria-hidden="true">{paths[name] || paths.bag}</svg>;
}

function ProductCard({
  product,
  whatsappHref,
  onOpen,
  onAdd
}: {
  product: Product;
  whatsappHref: string;
  onOpen: (product: Product) => void;
  onAdd: (product: Product) => void;
}) {
  const sale = Boolean(product.compare_at_price && product.compare_at_price > product.price);
  const soldOut = product.stock_quantity === 0;
  return (
    <article className="sf-card">
      <button className="sf-card-media" onClick={() => onOpen(product)} aria-label={"View " + product.name}>
        <ProductImage src={product.images?.[0] || fallbackHero} alt={product.name} loading="lazy" sizes="(max-width: 620px) 46vw, (max-width: 1100px) 31vw, 290px" />
        {sale ? <span className="sf-badge">SALE</span> : null}
        {soldOut ? <span className="sf-badge soft">SOLD OUT</span> : null}
        <span className="sf-quick">Quick view <Icon name="arrow" size={15} /></span>
      </button>
      <div className="sf-card-body">
        <span className="sf-card-cat">{product.category?.name || "BAG BARI"}</span>
        <h3 className="sf-card-name"><button onClick={() => onOpen(product)}>{product.name}</button></h3>
        <div className="sf-price-row">
          <span className="sf-price">{money(product.price)}</span>
          {sale ? <span className="sf-price-was">{money(Number(product.compare_at_price))}</span> : null}
        </div>
        <span className={soldOut ? "sf-stock out" : "sf-stock"}>
          <span>{soldOut ? "Out of stock" : <>In stock<span className="sf-stock-cod"> · Cash on delivery</span></>}</span>
        </span>
        <div className="sf-card-actions">
          <button className="sf-btn sf-add" disabled={soldOut} onClick={() => onAdd(product)}>
            <Icon name="bag" size={16} /> Add
          </button>
          <a
            className="sf-btn sf-wa"
            data-wa="card"
            href={whatsappHref || undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!whatsappHref}
            onClick={(event) => { if (!whatsappHref) event.preventDefault(); }}
          >
            <Icon name="whatsapp" size={16} /> Buy
          </a>
        </div>
      </div>
    </article>
  );
}

export default function Storefront({ navigate, initialSlug, initialCategorySlug }: { navigate: Navigate; initialSlug?: string; initialCategorySlug?: string }) {
  const [products, setProducts] = useState<Product[]>(supabase ? [] : DEMO_PRODUCTS);
  const [categories, setCategories] = useState<Category[]>(supabase ? [] : DEMO_CATEGORIES);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [loadError, setLoadError] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("featured");
  const [cart, setCart] = useState<CartLine[]>(() => {
    try {
      const saved = localStorage.getItem("bag-style-cart");
      return saved ? JSON.parse(saved) as CartLine[] : [];
    } catch { return []; }
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [detailQty, setDetailQty] = useState(1);
  const [imageIndex, setImageIndex] = useState(0);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [receipt, setReceipt] = useState<OrderReceipt | null>(null);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [notice, setNotice] = useState("");
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [pastHero, setPastHero] = useState(false);

  useEffect(() => {
    localStorage.setItem("bag-style-cart", JSON.stringify(cart));
  }, [cart]);

  // The phone sticky bar waits until the hero scrolls away so it never covers the hero buttons.
  useEffect(() => {
    const hero = document.querySelector(".sf-hero");
    if (!hero || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setPastHero(!entry.isIntersecting), { threshold: 0 });
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  // /p/<slug> links open the matching product, so a forwarded link lands on that bag.
  useEffect(() => {
    if (loading) return;
    const slug = (initialSlug || "").trim();
    if (!slug) {
      setSelected(null);
      return;
    }
    const match = products.find((product) => product.slug === slug || product.id === slug);
    if (!match) {
      setNotice("That bag is no longer in the collection. Here is everything else we have.");
      window.setTimeout(() => setNotice(""), 3600);
      navigate("/", { replace: true });
      return;
    }
    setSelected(match);
    setDetailQty(1);
    setImageIndex(0);
  }, [initialSlug, loading, products, navigate]);

  // /c/<slug> opens that category; any other route shows everything.
  useEffect(() => {
    if (loading || initialSlug) return;
    const match = categories.find((category) => category.slug === initialCategorySlug);
    setActiveCategory(match ? match.id : "all");
  }, [initialCategorySlug, initialSlug, loading, categories]);

  // Keep the document title/preview tags in step with the URL, including on back/forward.
  useEffect(() => {
    if (selected) return applyProductMeta(selected);
    const activeEntry = categories.find((category) => category.id === activeCategory);
    if (activeEntry) applyCategoryMeta(activeEntry);
    else applyHomeMeta();
  }, [selected, activeCategory, categories]);

  useEffect(() => {
    setDescriptionOpen(false);
  }, [selected?.id]);

  // Funnel: which bags get opened.
  useEffect(() => {
    if (!selected) return;
    track("product_view", {
      product_id: selected.id,
      product_slug: selected.slug,
      category: selected.category?.name || "Uncategorised",
      price: Number(selected.price)
    });
  }, [selected?.id]);

  // Funnel: WhatsApp hand-offs, labelled by where the shopper tapped.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as HTMLElement | null)?.closest?.('a[href^="https://wa.me/"]');
      if (link) track("whatsapp_click", { source: link.getAttribute("data-wa") || "storefront" });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    let alive = true;
    async function loadStore() {
      if (!supabase) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const [productResult, categoryResult, settingResult] = await Promise.all([
        supabase.from("products").select("*, category:categories(name)").eq("is_active", true).order("created_at", { ascending: false }),
        supabase.from("categories").select("id,name,slug,description,sort_order").order("sort_order", { ascending: true }),
        supabase.from("store_settings").select("key,value")
      ]);
      if (!alive) return;
      if (productResult.error) setLoadError("We could not load the catalogue. Please refresh in a moment.");
      else setProducts((productResult.data || []) as Product[]);
      if (!categoryResult.error) setCategories((categoryResult.data || []) as Category[]);
      if (!settingResult.error && settingResult.data) {
        const values: Record<string, unknown> = {};
        settingResult.data.forEach((row: { key: string; value: unknown }) => { values[row.key] = row.value; });
        setSettings({
          store_name: String(values.store_name ?? DEFAULT_SETTINGS.store_name),
          announcement: String(values.announcement ?? DEFAULT_SETTINGS.announcement),
          hero_title: String(values.hero_title ?? DEFAULT_SETTINGS.hero_title),
          hero_subtitle: String(values.hero_subtitle ?? DEFAULT_SETTINGS.hero_subtitle),
          whatsapp_number: String(values.whatsapp_number ?? ""),
          shipping_fee: Number(values.shipping_fee ?? DEFAULT_SETTINGS.shipping_fee),
          free_shipping_threshold: Number(values.free_shipping_threshold ?? DEFAULT_SETTINGS.free_shipping_threshold)
        });
      }
      setLoading(false);
    }
    void loadStore();
    return () => { alive = false; };
  }, []);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    let list = products.filter((product) => {
      const activeEntry = categories.find((category) => category.id === activeCategory);
      // Products carry extra categories in tags, stored as names or slugs.
      const matchesCategory = activeCategory === "all"
        || product.category_id === activeCategory
        || Boolean(activeEntry && (product.tags || []).some((tag) => {
          const value = String(tag).toLowerCase();
          return value === activeEntry.name.toLowerCase() || value === activeEntry.slug.toLowerCase();
        }));
      const matchesSearch = !query || [product.name, product.description, product.sku, ...(product.tags || [])]
        .some((value) => String(value || "").toLowerCase().includes(query));
      return matchesCategory && matchesSearch;
    });
    if (sort === "price-low") list = [...list].sort((a, b) => a.price - b.price);
    if (sort === "price-high") list = [...list].sort((a, b) => b.price - a.price);
    if (sort === "newest") list = [...list].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    if (sort === "featured") list = [...list].sort((a, b) => Number(b.featured) - Number(a.featured));
    return list;
  }, [products, categories, activeCategory, search, sort]);

  // Funnel: what shoppers look for, reported once typing settles, with results = 0 for dead ends.
  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) return;
    const results = filteredProducts.length;
    const timer = window.setTimeout(() => track("search", { query, results }), 800);
    return () => window.clearTimeout(timer);
  }, [search]);

  const featured = products.find((product) => product.featured) || products[0];
  const heroImage = featured?.images?.[0] || products[0]?.images?.[0] || fallbackHero;

  const categoryTiles = useMemo(() => categories
    .filter((category) => category.id !== "all")
    .map((category) => {
      const matches = products.filter((product) => product.category_id === category.id
        || (product.tags || []).some((tag) => String(tag).toLowerCase() === category.slug.toLowerCase()));
      return { category, count: matches.length, image: matches[0]?.images?.[0] };
    })
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3), [categories, products]);

  const navCategories = useMemo(() => categoryTiles.length
    ? categoryTiles.map((entry) => entry.category)
    : categories.filter((category) => category.id !== "all").slice(0, 3), [categoryTiles, categories]);

  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  const shipping = settings.free_shipping_threshold > 0 && subtotal >= settings.free_shipping_threshold ? 0 : settings.shipping_fee;
  const total = subtotal + shipping;

  const whatsappConfigured = Boolean(settings.whatsapp_number.trim());

  const productWhatsApp = (product: Product, quantity = 1): string => whatsappConfigured
    ? getWhatsAppUrl(settings.whatsapp_number, getProductOrderMessage(product, settings.store_name, quantity))
    : "";

  const supportWhatsApp = (): string => whatsappConfigured
    ? getWhatsAppUrl(settings.whatsapp_number, "Hello " + settings.store_name + "! I have a question about a bag on your website.")
    : "";

  const cartWhatsApp = (): string => {
    if (!whatsappConfigured) return "";
    const itemText = cart.map((line) => "- " + line.product.name + " × " + line.quantity + " — " + money(line.product.price * line.quantity)).join("\n");
    const message = "Hello " + settings.store_name + "! I'd like to order:\n\n" + itemText +
      "\n\nSubtotal: " + money(subtotal) + "\nPlease confirm availability, delivery charge and the next steps. Thank you!";
    return getWhatsAppUrl(settings.whatsapp_number, message);
  };

  const updateQuantity = (productId: string, difference: number) => {
    setCart((current) => current
      .map((line) => line.product.id === productId ? { ...line, quantity: Math.max(0, Math.min(99, line.quantity + difference)) } : line)
      .filter((line) => line.quantity > 0));
  };

  const addToCart = (product: Product, quantity = 1) => {
    if (product.stock_quantity === 0) {
      setNotice("This item is currently out of stock.");
      window.setTimeout(() => setNotice(""), 2800);
      return;
    }
    setCart((current) => {
      const found = current.find((line) => line.product.id === product.id);
      return found
        ? current.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + quantity } : line)
        : [...current, { product, quantity }];
    });
    track("add_to_bag", {
      product_id: product.id,
      product_slug: product.slug,
      price: Number(product.price),
      quantity,
      cart_size: cartCount + quantity
    });
    setNotice(product.name + " added to your bag.");
    window.setTimeout(() => setNotice(""), 2500);
  };

  const startWhatsAppOrder = (lines: CartLine[]) => {
    if (!whatsappConfigured) {
      setNotice("WhatsApp ordering is not configured yet. Please contact the store.");
      window.setTimeout(() => setNotice(""), 3500);
      return;
    }
    track("whatsapp_click", {
      source: "cart_drawer",
      item_count: lines.reduce((sum, line) => sum + line.quantity, 0)
    });
    const itemText = lines.map((line) => "- " + line.product.name + " × " + line.quantity + " — " + money(line.product.price * line.quantity)).join("\n");
    const amount = lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
    const message = "Hello " + settings.store_name + "! I'd like to place an order:\n\n" + itemText +
      "\n\nSubtotal: " + money(amount) + "\nPlease confirm availability, delivery fee and the next steps. Thank you!";
    window.open(getWhatsAppUrl(settings.whatsapp_number, message), "_blank", "noopener,noreferrer");
  };

  const categoryPathFor = (categoryId: string) => {
    const match = categories.find((category) => category.id === categoryId);
    return match ? categoryPath(match) : "/";
  };

  const openProduct = (product: Product) => {
    setDetailQty(1);
    setImageIndex(0);
    const path = productSharePath(product);
    if (window.location.pathname === path) setSelected(product);
    else navigate(path, { keepScroll: true });
  };

  const closeProduct = () => {
    if (window.location.pathname.startsWith("/p/")) navigate(categoryPathFor(activeCategory), { replace: true, keepScroll: true });
    else setSelected(null);
  };

  const openCheckout = () => {
    setCartOpen(false);
    setCheckoutError("");
    setReceipt(null);
    setCheckoutOpen(true);
  };

  const placeOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCheckoutError("");
    if (!supabase) {
      setCheckoutError("Connect your Supabase project and import the real catalogue before placing live orders.");
      return;
    }
    if (!cart.length || cart.some((line) => line.product.id.startsWith("demo-"))) {
      setCheckoutError("The preview products cannot be ordered. Add your real products from the admin dashboard first.");
      return;
    }
    const form = new FormData(event.currentTarget);
    setPlacingOrder(true);
    try {
      const { data, error } = await supabase.rpc("create_customer_order", {
        p_customer_name: String(form.get("name") || ""),
        p_customer_phone: String(form.get("phone") || ""),
        p_customer_address: String(form.get("address") || ""),
        p_customer_note: String(form.get("note") || ""),
        p_items: cart.map((line) => ({ product_id: line.product.id, quantity: line.quantity }))
      });
      if (error) throw error;
      const placed = data as OrderReceipt;
      setReceipt(placed);
      track("checkout_submitted", {
        order_number: placed.order_number,
        total: Number(placed.total),
        item_count: cartCount
      });
      setCart([]);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Could not place your order. Please try again.");
    } finally {
      setPlacingOrder(false);
    }
  };

  const goToCollection = (categoryId = "all") => {
    const picked = categories.find((category) => category.id === categoryId);
    setActiveCategory(categoryId);
    const nextPath = picked ? categoryPath(picked) : "/";
    if (window.location.pathname !== nextPath) navigate(nextPath, { keepScroll: true });
    document.getElementById("collection")?.scrollIntoView({ behavior: "smooth" });
  };

  // Funnel: narrowing the grid, so "shop all" links stay untracked.
  const filterByCategory = (categoryId: string) => {
    track("category_filter", { category: categories.find((category) => category.id === categoryId)?.slug || "all" });
    goToCollection(categoryId);
  };

  const freeDeliveryNote = settings.free_shipping_threshold > 0
    ? "Free delivery over " + money(settings.free_shipping_threshold)
    : "Delivery across Bangladesh";

  // Source copy often starts with its own "Description" label; the panel already labels it.
  const descriptionText = (selected?.description || "").replace(/^description\s*[:\-–]?\s*/i, "").trim()
    || "A thoughtful everyday favourite, chosen to move with you.";
  const longDescription = descriptionText.length > 320;
  // The phone bar only earns its space once there is a bag to check out and the hero is gone.
  const showStickyBar = pastHero && cartCount > 0;

  return (
    <div className={showStickyBar ? "store-shell is-past-hero" : "store-shell"}>
      <div className="sf-announce">
        <div className="sf-wrap">
          <span>{settings.announcement}</span>
          <span className="sf-announce-links">
            <span>Cash on delivery available</span>
            {whatsappConfigured ? <a data-wa="announcement" href={supportWhatsApp()} target="_blank" rel="noreferrer">WhatsApp {settings.whatsapp_number} ↗</a> : null}
          </span>
        </div>
      </div>

      <header className="sf-header">
        <div className="sf-wrap sf-header-inner">
          <button className="sf-icon-btn sf-menu-btn" aria-label="Shop the collection" onClick={() => goToCollection()}>
            <Icon name="menu" size={19} />
          </button>
          <button className="sf-logo" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <img className="sf-logo-mark" src="/favicon/web-app-manifest-192x192.png" alt="" width={54} height={54} />
            <span className="sf-logo-text">{settings.store_name}<small>THE EVERYDAY EDIT</small></span>
          </button>
          <nav className="sf-nav">
            <button onClick={() => goToCollection()}>All bags</button>
            {navCategories.map((category) => (
              <button key={category.id} onClick={() => goToCollection(category.id)}>{category.name}</button>
            ))}
            <a href="#our-story">Our story</a>
          </nav>
          <div className="sf-header-actions">
            <label className="sf-search">
              <Icon name="search" size={17} />
              <input
                value={search}
                onChange={(event) => { setSearch(event.target.value); document.getElementById("collection")?.scrollIntoView({ behavior: "smooth" }); }}
                placeholder="Search bags"
                aria-label="Search products"
              />
            </label>
            {whatsappConfigured ? (
              <a className="sf-icon-btn wa" data-wa="header" href={supportWhatsApp()} target="_blank" rel="noreferrer" aria-label="Chat on WhatsApp" title="Chat on WhatsApp">
                <Icon name="whatsapp" size={20} />
              </a>
            ) : null}
            <button className="sf-bag-btn" onClick={() => setCartOpen(true)} aria-label="Open bag">
              <Icon name="bag" size={19} /><span>Bag</span><b>{cartCount}</b>
            </button>
            <button className="sf-admin-link" onClick={() => navigate("/admin")}>Admin</button>
          </div>
        </div>
      </header>

      <main>
        <section className="sf-hero">
          <div className="sf-wrap sf-hero-grid">
            <div className="sf-hero-copy">
              <p className="sf-eyebrow">THE BAG BARI COLLECTION</p>
              <h1>{settings.hero_title}</h1>
              <p className="sf-hero-sub">{settings.hero_subtitle}</p>
              <div className="sf-hero-actions">
                <button className="sf-btn" onClick={() => goToCollection()}>Shop the collection <Icon name="arrow" size={17} /></button>
                {whatsappConfigured ? (
                  <a className="sf-btn sf-btn-wa" data-wa="hero" href={supportWhatsApp()} target="_blank" rel="noreferrer">
                    <Icon name="whatsapp" size={18} /> Order on WhatsApp
                  </a>
                ) : null}
              </div>
              <ul className="sf-hero-trust">
                <li><Icon name="truck" size={17} /> {freeDeliveryNote}</li>
                <li><Icon name="shield" size={17} /> Cash on delivery</li>
                <li><Icon name="whatsapp" size={17} /> Real person on WhatsApp</li>
              </ul>
            </div>
            <div className="sf-hero-media">
              <ProductImage src={heroImage} alt={featured?.name || "Bag Bari handbag"} fetchPriority="high" sizes="(max-width: 900px) 100vw, 46vw" />
              <span className="sf-hero-stat">{products.length || 0}+ styles in stock</span>
              {featured ? (
                <button className="sf-hero-badge" onClick={() => openProduct(featured)}>
                  <small>Featured piece</small>
                  <strong>{featured.name} · {money(featured.price)}</strong>
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="sf-trust" aria-label="Why shop with us">
          <div className="sf-wrap sf-trust-grid">
            <div className="sf-trust-item"><span className="sf-trust-icon"><Icon name="truck" size={20} /></span><span><strong>{freeDeliveryNote}</strong><small>Nationwide courier delivery</small></span></div>
            <div className="sf-trust-item"><span className="sf-trust-icon"><Icon name="shield" size={20} /></span><span><strong>Pay when it arrives</strong><small>Cash on delivery, no prepayment</small></span></div>
            <div className="sf-trust-item"><span className="sf-trust-icon"><Icon name="whatsapp" size={20} /></span><span><strong>Order on WhatsApp</strong><small>Talk to us before you buy</small></span></div>
            <div className="sf-trust-item"><span className="sf-trust-icon"><Icon name="star" size={20} /></span><span><strong>Chosen with care</strong><small>Quality checked before dispatch</small></span></div>
          </div>
        </section>

        {categoryTiles.length ? (
          <section className="sf-section">
            <div className="sf-wrap">
              <div className="sf-section-head">
                <div>
                  <p className="sf-eyebrow">FIND YOUR FIT</p>
                  <h2>Shop by <em>category</em></h2>
                  <p className="sf-section-sub">Every style in the store, sorted so you can find yours faster.</p>
                </div>
                <button className="sf-link" onClick={() => goToCollection()}>Shop all bags <Icon name="arrow" size={15} /></button>
              </div>
              <div className="sf-tiles">
                {categoryTiles.map(({ category, count, image }) => (
                  <button className="sf-tile" key={category.id} onClick={() => filterByCategory(category.id)}>
                    <ProductImage src={image || heroImage} alt={category.name} loading="lazy" sizes="(max-width: 620px) 100vw, (max-width: 900px) 50vw, 360px" />
                    <span className="sf-tile-copy">
                      <small>{count} {count === 1 ? "style" : "styles"}</small>
                      <strong>{category.name}</strong>
                      <span>Explore <Icon name="arrow" size={15} /></span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section id="collection" className="sf-section sf-collection">
          <div className="sf-wrap">
            <div className="sf-section-head">
              <div>
                <p className="sf-eyebrow">THE COLLECTION</p>
                <h2>Find your <em>new favourite</em></h2>
                <p className="sf-section-sub">{filteredProducts.length} {filteredProducts.length === 1 ? "piece" : "pieces"} ready to order · cash on delivery available</p>
              </div>
            </div>
            <div className="sf-toolbar">
              <div className="sf-chips">
                <button className={activeCategory === "all" ? "sf-chip active" : "sf-chip"} onClick={() => filterByCategory("all")}>All bags</button>
                {categories.filter((category) => category.id !== "all").map((category) => (
                  <button key={category.id} className={activeCategory === category.id ? "sf-chip active" : "sf-chip"} onClick={() => filterByCategory(category.id)}>{category.name}</button>
                ))}
              </div>
              <label className="sf-sort">Sort
                <select value={sort} onChange={(event) => setSort(event.target.value)}>
                  <option value="featured">Featured</option>
                  <option value="newest">Newest</option>
                  <option value="price-low">Price: low to high</option>
                  <option value="price-high">Price: high to low</option>
                </select>
              </label>
            </div>
            {loadError ? <div className="sf-alert">{loadError}</div> : null}
            {loading ? (
              <div className="sf-loading">{[1, 2, 3, 4].map((item) => <div className="sf-skel" key={item}><span /><i /><i /></div>)}</div>
            ) : null}
            {!loading && filteredProducts.length === 0 ? (
              <div className="sf-empty">
                <h3>No bags match that search.</h3>
                <p>Try a different word or browse the full collection.</p>
                <button className="sf-btn sf-btn-ghost" onClick={() => { setSearch(""); setActiveCategory("all"); }}>Clear filters</button>
              </div>
            ) : null}
            {!loading && filteredProducts.length > 0 ? (
              <div className="sf-grid">
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    whatsappHref={productWhatsApp(product)}
                    onOpen={openProduct}
                    onAdd={addToCart}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </section>

        {featured ? (
          <section className="sf-band">
            <div className="sf-band-media"><ProductImage src={featured.images?.[0] || heroImage} alt={featured.name} loading="lazy" sizes="(max-width: 900px) 100vw, 48vw" /></div>
            <div className="sf-band-copy">
              <p className="sf-eyebrow">A LITTLE MORE YOU</p>
              <h2>Everyday things.<br /><em>Extraordinary feeling.</em></h2>
              <p>Made for the plans you make, the places you find, and the moments in between. Pick the piece that feels like you.</p>
              <button className="sf-btn sf-btn-wa" onClick={() => openProduct(featured)}>
                View this piece <Icon name="arrow" size={17} />
              </button>
            </div>
          </section>
        ) : null}

        <section id="our-story" className="sf-section">
          <div className="sf-wrap sf-story">
            <div className="sf-story-copy">
              <p className="sf-eyebrow">THE WAY WE SEE IT</p>
              <h2>Good style should<br /><em>feel like you.</em></h2>
              <p>We believe the right bag is more than something you carry. It is part of the little rituals, big plans and everyday stories that make a day yours. That is the feeling behind Bag Bari.</p>
              <button className="sf-link" onClick={() => goToCollection()}>Find a little something <Icon name="arrow" size={15} /></button>
            </div>
            <div className="sf-story-media">
              <ProductImage src={products[1]?.images?.[0] || heroImage} alt="A Bag Bari piece ready for the day" loading="lazy" sizes="(max-width: 900px) 100vw, 44vw" />
            </div>
          </div>
        </section>

        <section className="sf-section tight sf-contact">
          <div className="sf-wrap sf-contact-inner">
            <div>
              <p className="sf-eyebrow">NEED A HAND?</p>
              <h2>Message us on WhatsApp.</h2>
              <p>Not sure which bag suits you, or want to confirm stock before ordering? Send us a message — we reply personally.</p>
            </div>
            <div className="sf-contact-actions">
              {whatsappConfigured ? (
                <>
                  <a className="sf-btn sf-btn-wa" href={supportWhatsApp()} target="_blank" rel="noreferrer">
                    <Icon name="whatsapp" size={18} /> Chat with us
                  </a>
                  <a className="sf-btn sf-btn-ghost" href={"tel:+" + settings.whatsapp_number.replace(/\D/g, "")}>{settings.whatsapp_number}</a>
                </>
              ) : (
                <button className="sf-btn" onClick={() => goToCollection()}>Browse the collection</button>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="sf-footer">
        <div className="sf-wrap">
          <div className="sf-footer-grid">
            <div>
              <div className="sf-footer-brand">
                <img className="sf-logo-mark" src="/favicon/favicon-96x96.png" alt="" width={54} height={54} />
                <div><strong>{settings.store_name}</strong><small>THE EVERYDAY EDIT</small></div>
              </div>
              <p>Carry a little more of what makes you, you.</p>
            </div>
            <div className="sf-footer-col">
              <strong>Shop</strong>
              <button onClick={() => goToCollection()}>All bags</button>
              {navCategories.slice(0, 2).map((category) => <button key={category.id} onClick={() => goToCollection(category.id)}>{category.name}</button>)}
              <a href="#our-story">Our story</a>
            </div>
            <div className="sf-footer-col">
              <strong>Contact</strong>
              {whatsappConfigured ? <a data-wa="footer" href={supportWhatsApp()} target="_blank" rel="noreferrer">WhatsApp {settings.whatsapp_number}</a> : null}
              <span style={{ color: "#b0a48c", fontSize: 13 }}>Cash on delivery</span>
              <button onClick={() => navigate("/admin")}>Store admin</button>
            </div>
          </div>
          <div className="sf-footer-bottom">
            <span>© {new Date().getFullYear()} {settings.store_name}. All rights reserved.</span>
            <span>{freeDeliveryNote}</span>
          </div>
        </div>
      </footer>

      {notice ? <div className="sf-toast"><Icon name="check" size={17} />{notice}</div> : null}

      {showStickyBar ? (
        <div className="sf-sticky">
          <span className="sf-sticky-total">
            <strong>{money(cartCount ? total : 0)}</strong>
            <small>{cartCount ? cartCount + (cartCount === 1 ? " item in bag" : " items in bag") : "No items yet"}</small>
          </span>
          <button className="sf-btn sf-btn-ghost" onClick={() => setCartOpen(true)}>View bag</button>
          <a
            className="sf-btn sf-btn-wa"
            data-wa="sticky_bar"
            href={cart.length ? cartWhatsApp() : (featured ? productWhatsApp(featured) : undefined)}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="whatsapp" size={17} /> WhatsApp
          </a>
        </div>
      ) : null}

      {cartOpen ? (
        <div className="sf-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}>
          <aside className="sf-drawer" aria-label="Your bag">
            <div className="sf-drawer-head">
              <div><p className="sf-eyebrow">YOUR SELECTION</p><h3>Your bag <span>({cartCount})</span></h3></div>
              <button className="sf-close" onClick={() => setCartOpen(false)} aria-label="Close bag"><Icon name="close" /></button>
            </div>
            {cart.length === 0 ? (
              <div className="sf-empty" style={{ flex: 1, display: "grid", placeContent: "center" }}>
                <h3>Your bag is empty.</h3>
                <p>Add a piece you love — or ask us on WhatsApp.</p>
                <button className="sf-btn" onClick={() => { setCartOpen(false); goToCollection(); }}>Browse the collection</button>
              </div>
            ) : (
              <>
                <div className="sf-cart-lines">
                  {cart.map((line) => (
                    <div className="sf-cart-line" key={line.product.id}>
                      <ProductImage src={line.product.images?.[0] || heroImage} alt={line.product.name} sizes="84px" />
                      <div className="sf-cart-info">
                        <strong>{line.product.name}</strong>
                        <span>{money(line.product.price)}</span>
                        <div className="sf-qty">
                          <button onClick={() => updateQuantity(line.product.id, -1)} aria-label="Decrease quantity"><Icon name="minus" size={13} /></button>
                          <span>{line.quantity}</span>
                          <button onClick={() => updateQuantity(line.product.id, 1)} aria-label="Increase quantity"><Icon name="plus" size={13} /></button>
                        </div>
                      </div>
                      <button className="sf-remove" onClick={() => setCart((current) => current.filter((item) => item.product.id !== line.product.id))} aria-label="Remove item"><Icon name="trash" size={17} /></button>
                    </div>
                  ))}
                </div>
                <div className="sf-drawer-foot">
                  {settings.free_shipping_threshold > 0 ? (
                    <p className="sf-ship-hint">{subtotal >= settings.free_shipping_threshold ? "You've unlocked free delivery." : "Add " + money(settings.free_shipping_threshold - subtotal) + " more for free delivery."}</p>
                  ) : null}
                  <div className="sf-sum-row"><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
                  <div className="sf-sum-row"><span>Delivery</span><strong>{shipping === 0 ? "FREE" : money(shipping)}</strong></div>
                  <div className="sf-sum-row total"><span>Total</span><span>{money(total)}</span></div>
                  <button className="sf-btn sf-btn-block" onClick={openCheckout}>Continue to checkout <Icon name="arrow" size={17} /></button>
                  <button className="sf-btn sf-btn-wa sf-btn-block" onClick={() => startWhatsAppOrder(cart)}>
                    <Icon name="whatsapp" size={18} /> Order on WhatsApp
                  </button>
                  <small className="sf-secure"><Icon name="shield" size={14} /> Your details stay private.</small>
                </div>
              </>
            )}
          </aside>
        </div>
      ) : null}

      {selected ? (
        <div className="sf-modal-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) closeProduct(); }}>
          <div className="sf-product">
            <button className="sf-close sf-product-close" onClick={closeProduct} aria-label="Close product"><Icon name="close" /></button>
            <div className="sf-product-gallery">
              <div className="sf-product-main">
                <ProductImage src={selected.images?.[imageIndex] || selected.images?.[0] || heroImage} alt={selected.name} sizes="(max-width: 900px) 100vw, 50vw" />
                {(selected.images || []).length > 1 ? (
                  <span className="sf-product-count">{imageIndex + 1} / {selected.images.length}</span>
                ) : null}
                <a
                  className="sf-share-float"
                  data-wa="share"
                  href={whatsappShareUrl(productShareMessage(selected))}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={"Share " + selected.name + " on WhatsApp"}
                  title="Share on WhatsApp"
                >
                  <Icon name="whatsapp" size={18} />
                </a>
              </div>
              {(selected.images || []).length > 1 ? (
                <div className="sf-thumbs">
                  {selected.images.map((image, index) => (
                    <button key={image + index} className={index === imageIndex ? "active" : ""} onClick={() => setImageIndex(index)} aria-label={"View image " + (index + 1)}>
                      <ProductImage src={image} alt="" loading="lazy" sizes="62px" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="sf-product-body">
              <div className="sf-product-scroll">
                <p className="sf-eyebrow">{selected.category?.name || "BAG BARI"}</p>
                <h2>{selected.name}</h2>
                <div className="sf-product-prices">
                  <strong>{money(selected.price)}</strong>
                  {selected.compare_at_price && selected.compare_at_price > selected.price ? (
                    <>
                      <span className="sf-price-was">{money(Number(selected.compare_at_price))}</span>
                      <span className="sf-save">Save {money(Number(selected.compare_at_price) - selected.price)}</span>
                    </>
                  ) : null}
                </div>
                <span className={selected.stock_quantity === 0 ? "sf-stock out" : "sf-stock"}>
                  {selected.stock_quantity === 0 ? "Out of stock" : "In stock · ready to deliver"}
                </span>

                <section className="sf-product-about">
                  <h3 className="sf-product-about-title">The details</h3>
                  <div className={descriptionOpen || !longDescription ? "sf-product-about-copy is-open" : "sf-product-about-copy"}>
                    {descriptionText}
                  </div>
                  {longDescription ? (
                    <button className="sf-readmore" onClick={() => setDescriptionOpen((open) => !open)}>
                      {descriptionOpen ? "Show less" : "Read the full description"}
                    </button>
                  ) : null}
                </section>

                <dl className="sf-specs">
                  <div><dt>Category</dt><dd>{selected.category?.name || "Bags"}</dd></div>
                  {selected.sku ? <div><dt>Product code</dt><dd>{selected.sku}</dd></div> : null}
                  <div><dt>Availability</dt><dd>{selected.stock_quantity === 0 ? "Out of stock" : "Ready to deliver"}</dd></div>
                  <div className="sf-spec-wide"><dt>Delivery</dt><dd>{freeDeliveryNote} · delivery charge {money(settings.shipping_fee)}</dd></div>
                  <div className="sf-spec-wide"><dt>Payment</dt><dd>Cash on delivery — pay when the bag arrives</dd></div>
                </dl>
              </div>

              <div className="sf-buy-dock">
                <div className="sf-dock-meta">
                  <strong>{money(selected.price * detailQty)}</strong>
                  <span>{selected.stock_quantity === 0 ? "Out of stock" : "Cash on delivery · " + freeDeliveryNote}</span>
                </div>
                <div className="sf-buy">
                  <div className="sf-buy-row">
                    <div className="sf-qty-lg">
                      <button onClick={() => setDetailQty((value) => Math.max(1, value - 1))} aria-label="Decrease quantity"><Icon name="minus" size={14} /></button>
                      <span>{detailQty}</span>
                      <button onClick={() => setDetailQty((value) => Math.min(99, value + 1))} aria-label="Increase quantity"><Icon name="plus" size={14} /></button>
                    </div>
                    <button className="sf-btn sf-btn-ghost" disabled={selected.stock_quantity === 0} onClick={() => { addToCart(selected, detailQty); closeProduct(); setCartOpen(true); }}>
                      <Icon name="bag" size={17} /> Add to bag
                    </button>
                  </div>
                  <a
                    className="sf-btn sf-btn-wa sf-btn-block"
                    data-wa="product_detail"
                    href={productWhatsApp(selected, detailQty) || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => { if (!whatsappConfigured) event.preventDefault(); }}
                  >
                    <Icon name="whatsapp" size={18} />
                    <span className="sf-wa-long">Buy this on WhatsApp</span>
                    <span className="sf-wa-short">Order on WhatsApp</span>
                  </a>
                  <div className="sf-buy-split">
                    <button className="sf-btn sf-btn-ghost" onClick={() => { addToCart(selected, detailQty); closeProduct(); openCheckout(); }}>
                      Buy now · cash on delivery
                    </button>
                    <a
                      className="sf-btn sf-btn-share"
                      data-wa="share"
                      href={whatsappShareUrl(productShareMessage(selected))}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={"Share " + selected.name + " on WhatsApp"}
                      title="Share on WhatsApp"
                    >
                      <Icon name="whatsapp" size={18} />
                      <span className="sf-share-short">Share</span>
                      <span className="sf-share-long">Share on WhatsApp</span>
                    </a>
                  </div>
                </div>
                {whatsappConfigured ? (
                  <a className="sf-dock-help" data-wa="product_help" href={supportWhatsApp()} target="_blank" rel="noreferrer">
                    <Icon name="whatsapp" size={15} /> Questions about this bag? Chat with us
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {checkoutOpen ? (
        <div className="sf-modal-layer" onMouseDown={(event) => { if (event.target === event.currentTarget && !placingOrder) setCheckoutOpen(false); }}>
          <div className="sf-checkout">
            <div className="sf-checkout-head">
              <div><p className="sf-eyebrow">ALMOST YOURS</p><h2>{receipt ? "Order received." : "Delivery details"}</h2></div>
              <button className="sf-close" onClick={() => setCheckoutOpen(false)} aria-label="Close checkout"><Icon name="close" /></button>
            </div>
            {receipt ? (
              <div className="sf-success">
                <span className="sf-success-mark"><Icon name="check" size={34} /></span>
                <h3>It's in our hands now.</h3>
                <p>Your order is placed. Our team will confirm delivery details with you shortly.</p>
                <div className="sf-receipt">
                  <small>ORDER NUMBER</small>
                  <strong>{receipt.order_number}</strong>
                  <div className="sf-receipt-total"><span>Order total</span><strong>{money(Number(receipt.total))}</strong></div>
                </div>
                <button className="sf-btn sf-btn-block" onClick={() => { setReceipt(null); setCheckoutOpen(false); }}>Back to the collection <Icon name="arrow" size={17} /></button>
              </div>
            ) : (
              <div className="sf-checkout-grid">
                <form className="sf-form" onSubmit={placeOrder}>
                  <label>Full name<input name="name" required minLength={2} maxLength={120} placeholder="Your name" /></label>
                  <label>Phone number<input name="phone" required minLength={8} maxLength={30} inputMode="tel" placeholder="01XXXXXXXXX" /></label>
                  <label>Delivery address<textarea name="address" required minLength={8} maxLength={600} rows={3} placeholder="House, road, area, district" /></label>
                  <label>Order note <span className="sf-label-note">OPTIONAL</span><textarea name="note" rows={2} placeholder="Any delivery instructions?" /></label>
                  {checkoutError ? <div className="sf-alert">{checkoutError}</div> : null}
                  <button className="sf-btn sf-btn-block" disabled={placingOrder || cart.length === 0}>
                    {placingOrder ? "Placing your order…" : "Confirm order · " + money(total)} <Icon name="arrow" size={17} />
                  </button>
                  <small className="sf-cod"><Icon name="shield" size={14} /> Cash on delivery · no online payment needed</small>
                </form>
                <div className="sf-summary">
                  <h3>Your bag</h3>
                  {cart.map((line) => (
                    <div className="sf-sum-item" key={line.product.id}>
                      <ProductImage src={line.product.images?.[0] || heroImage} alt="" sizes="52px" />
                      <div><strong>{line.product.name}</strong><small>Qty {line.quantity}</small></div>
                      <b>{money(line.product.price * line.quantity)}</b>
                    </div>
                  ))}
                  <div className="sf-sum-row"><span>Subtotal</span><span>{money(subtotal)}</span></div>
                  <div className="sf-sum-row"><span>Delivery</span><span>{shipping === 0 ? "FREE" : money(shipping)}</span></div>
                  <div className="sf-sum-row total"><span>Total</span><span>{money(total)}</span></div>
                  {whatsappConfigured ? (
                    <a className="sf-btn sf-btn-wa sf-btn-block" data-wa="checkout" style={{ marginTop: 14 }} href={cartWhatsApp()} target="_blank" rel="noreferrer">
                      <Icon name="whatsapp" size={18} /> Order on WhatsApp
                    </a>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {!supabase ? (
        <div className="sf-alert" style={{ margin: 16 }}>
          <strong>Preview mode.</strong> Connect Supabase and import the real catalogue to enable live orders.
          <button className="sf-link" style={{ marginLeft: 10 }} onClick={() => navigate("/admin")}>Admin setup</button>
        </div>
      ) : null}
    </div>
  );
}
