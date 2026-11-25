import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SETTINGS,
  DEMO_CATEGORIES,
  DEMO_PRODUCTS,
  type Category,
  type Product,
  type StoreSettings,
  getWhatsAppUrl,
  money,
  supabase
} from "./lib";

type CartLine = { product: Product; quantity: number };
type OrderReceipt = { id: string; order_number: string; total: number };

const heroImage = "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=1500&q=88";

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.65, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
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
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.8 9a7 7 0 0 1 11.8-2L20 12M4 12l2.4 5a7 7 0 0 0 11.8-2" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>
  };
  return <svg {...common} aria-hidden="true">{paths[name] || paths.bag}</svg>;
}

function ProductCard({
  product,
  onOpen,
  onAdd
}: {
  product: Product;
  onOpen: (product: Product) => void;
  onAdd: (product: Product) => void;
}) {
  const sale = product.compare_at_price && product.compare_at_price > product.price;
  return (
    <article className="product-card">
      <button className="product-image-button" onClick={() => onOpen(product)} aria-label={"View " + product.name}>
        <div className="product-image-wrap">
          <img src={product.images?.[0] || heroImage} alt={product.name} loading="lazy" />
          {sale ? <span className="sale-pill">SPECIAL PRICE</span> : null}
          <span className="quick-view">Quick view <Icon name="arrow" size={15} /></span>
        </div>
      </button>
      <div className="product-card-meta">
        <div>
          <p className="product-category">{product.category?.name || "BAG STYLE EDIT"}</p>
          <button className="product-name" onClick={() => onOpen(product)}>{product.name}</button>
          <div className="product-prices">
            <strong>{money(product.price)}</strong>
            {sale ? <del>{money(Number(product.compare_at_price))}</del> : null}
          </div>
        </div>
        <button className="add-round" onClick={() => onAdd(product)} aria-label={"Add " + product.name + " to bag"}>
          <Icon name="plus" size={18} />
        </button>
      </div>
    </article>
  );
}

export default function Storefront({ navigate }: { navigate: (path: string) => void }) {
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
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [receipt, setReceipt] = useState<OrderReceipt | null>(null);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    localStorage.setItem("bag-style-cart", JSON.stringify(cart));
  }, [cart]);

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
      const matchesCategory = activeCategory === "all" || product.category_id === activeCategory;
      const matchesSearch = !query || [product.name, product.description, product.sku, ...(product.tags || [])]
        .some((value) => String(value || "").toLowerCase().includes(query));
      return matchesCategory && matchesSearch;
    });
    if (sort === "price-low") list = [...list].sort((a, b) => a.price - b.price);
    if (sort === "price-high") list = [...list].sort((a, b) => b.price - a.price);
    if (sort === "newest") list = [...list].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    if (sort === "featured") list = [...list].sort((a, b) => Number(b.featured) - Number(a.featured));
    return list;
  }, [products, activeCategory, search, sort]);

  const featured = products.filter((product) => product.featured).slice(0, 4);
  const cartCount = cart.reduce((total, line) => total + line.quantity, 0);
  const subtotal = cart.reduce((total, line) => total + line.product.price * line.quantity, 0);
  const shipping = settings.free_shipping_threshold > 0 && subtotal >= settings.free_shipping_threshold ? 0 : settings.shipping_fee;
  const total = subtotal + shipping;

  const updateQuantity = (productId: string, difference: number) => {
    setCart((current) => current
      .map((line) => line.product.id === productId ? { ...line, quantity: Math.max(0, Math.min(99, line.quantity + difference)) } : line)
      .filter((line) => line.quantity > 0));
  };

  const addToCart = (product: Product) => {
    if (product.stock_quantity === 0) {
      setNotice("This item is currently out of stock.");
      window.setTimeout(() => setNotice(""), 2800);
      return;
    }
    setCart((current) => {
      const found = current.find((line) => line.product.id === product.id);
      return found
        ? current.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line)
        : [...current, { product, quantity: 1 }];
    });
    setNotice(product.name + " added to your bag.");
    window.setTimeout(() => setNotice(""), 2500);
  };

  const startWhatsAppOrder = (lines: CartLine[]) => {
    if (!settings.whatsapp_number.trim()) {
      setNotice("WhatsApp ordering is not configured yet. Please contact the store.");
      window.setTimeout(() => setNotice(""), 3500);
      return;
    }
    const itemText = lines.map((line) => "- " + line.product.name + " × " + line.quantity + " — " + money(line.product.price * line.quantity)).join("\n");
    const amount = lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
    const message = "Hello " + settings.store_name + "! I'd like to place an order:\n\n" + itemText +
      "\n\nSubtotal: " + money(amount) + "\nPlease confirm availability, delivery fee and the next steps. Thank you!";
    window.open(getWhatsAppUrl(settings.whatsapp_number, message), "_blank", "noopener,noreferrer");
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
      const result = data as OrderReceipt;
      setReceipt(result);
      setCart([]);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Could not place your order. Please try again.");
    } finally {
      setPlacingOrder(false);
    }
  };

  const goToCollection = () => {
    setActiveCategory("all");
    document.getElementById("collection")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="store-shell">
      <div className="announcement-bar">
        <span>{settings.announcement}</span>
        <span className="announcement-right">MADE FOR YOUR EVERYDAY <span>✳</span></span>
      </div>

      <header className="site-header">
        <button className="mobile-menu-icon" aria-label="Open collections" onClick={goToCollection}><Icon name="menu" /></button>
        <button className="wordmark" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <span className="wordmark-icon">b.</span>
          <span>{settings.store_name}<small>THE EVERYDAY EDIT</small></span>
        </button>
        <nav className="main-nav">
          <button onClick={goToCollection}>Shop all</button>
          <button onClick={() => { setActiveCategory(categories.find((c) => c.slug.includes("tote"))?.id || "all"); goToCollection(); }}>Totes</button>
          <button onClick={() => { setActiveCategory(categories.find((c) => c.slug.includes("shoulder"))?.id || "all"); goToCollection(); }}>Shoulder bags</button>
          <button onClick={() => { setActiveCategory(categories.find((c) => c.slug.includes("travel"))?.id || "all"); goToCollection(); }}>Travel</button>
          <a href="#our-story">Our story</a>
        </nav>
        <div className="header-actions">
          <label className="search-trigger">
            <Icon name="search" size={19} />
            <input value={search} onChange={(event) => { setSearch(event.target.value); document.getElementById("collection")?.scrollIntoView({ behavior: "smooth" }); }} placeholder="Search" aria-label="Search products" />
          </label>
          <button className="cart-trigger" onClick={() => setCartOpen(true)} aria-label="Open shopping bag">
            <Icon name="bag" size={21} /><span>Bag</span><b>{cartCount}</b>
          </button>
          <button className="admin-shortcut" onClick={() => navigate("/admin")} aria-label="Admin dashboard">Admin</button>
        </div>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <p className="eyebrow"><span></span> THE BAG STYLE COLLECTION</p>
            <h1>{settings.hero_title}</h1>
            <p className="hero-description">{settings.hero_subtitle}</p>
            <div className="hero-actions">
              <button className="button button-dark" onClick={goToCollection}>Explore the collection <Icon name="arrow" size={17} /></button>
              <a className="text-link" href="#our-story">A little about us <span>↗</span></a>
            </div>
            <div className="hero-footnote"><span className="hero-asterisk">✳</span><span>GOOD DESIGN.<br />GREAT EVERYDAY.</span><span className="hero-footnote-line"></span><span>01 / 03</span></div>
          </div>
          <div className="hero-visual">
            <img src={heroImage} alt="A thoughtfully styled everyday handbag" fetchPriority="high" />
            <div className="hero-photo-label"><span>THE EVERYDAY EDIT</span><strong>Made to move with you.</strong></div>
            <div className="hero-stamp"><span>FIND YOUR</span><strong>EVERYDAY<br />FAVOURITE</strong><i>✳</i></div>
          </div>
        </section>

        <section className="benefit-strip" aria-label="Store benefits">
          <div><Icon name="truck" size={22} /><span><strong>Thoughtful delivery</strong><small>Across Bangladesh</small></span></div>
          <div><Icon name="shield" size={22} /><span><strong>Secure ordering</strong><small>Simple, clear checkout</small></span></div>
          <div><Icon name="refresh" size={22} /><span><strong>Here to help</strong><small>Friendly customer care</small></span></div>
          <div><span className="benefit-star">✳</span><span><strong>Chosen with care</strong><small>Details matter</small></span></div>
        </section>

        <section className="category-section page-section">
          <div className="section-heading">
            <div><p className="eyebrow">FIND YOUR FIT</p><h2>What's your kind of carry?</h2></div>
            <button className="text-link" onClick={goToCollection}>Shop every style <span>↗</span></button>
          </div>
          <div className="category-tiles">
            {[
              { title: "Everyday totes", text: "Room for the day ahead", image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=78", match: "tote" },
              { title: "Shoulder bags", text: "Easy, from AM to PM", image: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=900&q=78", match: "shoulder" },
              { title: "On the move", text: "A little room for more", image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=78", match: "travel" }
            ].map((category) => (
              <button className="category-tile" key={category.title} onClick={() => {
                const match = categories.find((item) => item.slug.includes(category.match));
                setActiveCategory(match?.id || "all");
                document.getElementById("collection")?.scrollIntoView({ behavior: "smooth" });
              }}>
                <img src={category.image} alt="" loading="lazy" />
                <span className="category-tile-overlay"></span>
                <span className="category-tile-copy"><small>{category.text}</small><strong>{category.title}</strong><i>Explore <Icon name="arrow" size={15} /></i></span>
              </button>
            ))}
          </div>
        </section>

        <section id="collection" className="collection-section page-section">
          <div className="section-heading collection-heading">
            <div><p className="eyebrow">THE GOOD STUFF</p><h2>Find your new favourite.</h2><p className="section-subtitle">A few good things, chosen to go wherever the day takes you.</p></div>
            <label className="sort-control">Sort by
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="featured">Featured</option><option value="newest">Newest</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option>
              </select>
            </label>
          </div>
          <div className="category-filters">
            <button className={activeCategory === "all" ? "filter-chip active" : "filter-chip"} onClick={() => setActiveCategory("all")}>All pieces</button>
            {categories.filter((category) => category.id !== "all").map((category) => (
              <button key={category.id} className={activeCategory === category.id ? "filter-chip active" : "filter-chip"} onClick={() => setActiveCategory(category.id)}>{category.name}</button>
            ))}
          </div>
          {loadError ? <div className="inline-alert">{loadError}</div> : null}
          {loading ? <div className="loading-grid">{[1, 2, 3, 4].map((item) => <div className="skeleton-card" key={item}><span></span><i></i><i></i></div>)}</div> : null}
          {!loading && filteredProducts.length === 0 ? (
            <div className="empty-catalog"><span>✳</span><h3>No pieces found just yet.</h3><p>Try another search or check back soon.</p><button className="button button-outline" onClick={() => { setSearch(""); setActiveCategory("all"); }}>Clear filters</button></div>
          ) : null}
          {!loading && filteredProducts.length > 0 ? (
            <div className="product-grid">
              {filteredProducts.map((product) => <ProductCard key={product.id} product={product} onOpen={setSelected} onAdd={addToCart} />)}
            </div>
          ) : null}
          <div className="collection-bottom"><span>GOOD THINGS TAKE YOU PLACES.</span><span>{filteredProducts.length} {filteredProducts.length === 1 ? "piece" : "pieces"} to explore</span></div>
        </section>

        {featured.length > 0 ? (
          <section className="feature-note">
            <div className="feature-note-image"><img src={featured[0].images?.[0] || heroImage} alt={featured[0].name} loading="lazy" /></div>
            <div className="feature-note-copy"><p className="eyebrow">A LITTLE MORE YOU</p><h2>Everyday things.<br /><em>Extraordinary feeling.</em></h2><p>Made for the plans you make, the places you find, and the moments in between. Pick the piece that feels like you.</p><button className="button button-light" onClick={goToCollection}>Find your piece <Icon name="arrow" size={17} /></button></div>
            <span className="feature-note-mark">✳</span>
          </section>
        ) : null}

        <section id="our-story" className="story-section page-section">
          <div className="story-side-label">A NOTE FROM BAG STYLE · EST. 2026</div>
          <div className="story-main"><p className="eyebrow">THE WAY WE SEE IT</p><h2>Good style should<br /><em>feel like you.</em></h2><p>We believe the right bag is more than something you carry. It is part of the little rituals, big plans and everyday stories that make a day yours. That is the feeling behind Bag Style.</p><button className="story-link" onClick={goToCollection}>Find a little something <span>↗</span></button></div>
          <div className="story-visual"><img src="https://images.unsplash.com/photo-1581605405669-fcdf81165afa?auto=format&fit=crop&w=1000&q=82" alt="A bag ready for a day out" loading="lazy" /><span>YOUR DAY.<br />YOUR WAY.</span></div>
        </section>

        <section className="newsletter-section">
          <div><p className="eyebrow">STAY IN THE LOOP</p><h2>A little note from us,<br /><em>now and then.</em></h2></div>
          <div className="newsletter-copy"><p>New arrivals, thoughtful finds and a little inspiration for your everyday. Follow along and say hello.</p>
            <a href={settings.whatsapp_number ? getWhatsAppUrl(settings.whatsapp_number, "Hello Bag Style! I'd like to know about new arrivals.") : "#collection"} target={settings.whatsapp_number ? "_blank" : undefined} rel="noreferrer" className="newsletter-cta">Get in touch <span>↗</span></a>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-main">
          <div className="footer-brand"><span className="wordmark-icon">b.</span><div><strong>{settings.store_name}</strong><small>THE EVERYDAY EDIT</small></div><p>Carry a little more of what makes you, you.</p></div>
          <div className="footer-column"><strong>Explore</strong><button onClick={goToCollection}>Shop all</button><button onClick={() => { setActiveCategory("all"); goToCollection(); }}>New arrivals</button><a href="#our-story">Our story</a></div>
          <div className="footer-column"><strong>Need a hand?</strong><a href="#collection">Shopping guide</a><a href="#our-story">About Bag Style</a><button onClick={() => navigate("/admin")}>Store admin</button></div>
          <div className="footer-note"><span>✳</span><p>THANK YOU FOR<br />BEING HERE.</p></div>
        </div>
        <div className="footer-bottom"><span>© {new Date().getFullYear()} {settings.store_name}. All rights reserved.</span><span>MADE FOR THE EVERYDAY.</span></div>
      </footer>

      {notice ? <div className="toast-message"><Icon name="check" size={17} />{notice}</div> : null}

      {cartOpen ? (
        <div className="modal-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}>
          <aside className="side-drawer">
            <div className="drawer-head"><div><p className="eyebrow">YOUR SELECTION</p><h3>Your bag <span>({cartCount})</span></h3></div><button className="icon-button" onClick={() => setCartOpen(false)} aria-label="Close bag"><Icon name="close" /></button></div>
            {cart.length === 0 ? <div className="drawer-empty"><span>✳</span><h3>Your bag is taking a little break.</h3><p>Find something you'll love carrying.</p><button className="button button-dark" onClick={() => { setCartOpen(false); goToCollection(); }}>Explore the collection</button></div> : (
              <>
                <div className="cart-lines">
                  {cart.map((line) => <div className="cart-line" key={line.product.id}>
                    <img src={line.product.images?.[0] || heroImage} alt={line.product.name} />
                    <div className="cart-line-info"><strong>{line.product.name}</strong><span>{money(line.product.price)}</span><div className="quantity-control"><button onClick={() => updateQuantity(line.product.id, -1)} aria-label="Decrease quantity"><Icon name="minus" size={13} /></button><span>{line.quantity}</span><button onClick={() => updateQuantity(line.product.id, 1)} aria-label="Increase quantity"><Icon name="plus" size={13} /></button></div></div>
                    <button className="remove-line" onClick={() => setCart((current) => current.filter((item) => item.product.id !== line.product.id))} aria-label="Remove item"><Icon name="trash" size={17} /></button>
                  </div>)}
                </div>
                <div className="drawer-summary">
                  {settings.free_shipping_threshold > 0 ? <p className="shipping-hint">{subtotal >= settings.free_shipping_threshold ? "You've unlocked free delivery." : "Add " + money(settings.free_shipping_threshold - subtotal) + " more for free delivery."}</p> : null}
                  <div><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
                  <div><span>Delivery</span><strong>{shipping === 0 ? "FREE" : money(shipping)}</strong></div>
                  <div className="drawer-total"><span>Total</span><strong>{money(total)}</strong></div>
                  <button className="button button-dark button-full" onClick={openCheckout}>Continue to checkout <Icon name="arrow" size={17} /></button>
                  <button className="button button-whatsapp button-full" onClick={() => startWhatsAppOrder(cart)}>Order through WhatsApp ↗</button>
                  <small className="secure-note"><Icon name="shield" size={14} /> Your order details stay private.</small>
                </div>
              </>
            )}
          </aside>
        </div>
      ) : null}

      {selected ? (
        <div className="modal-layer product-modal-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <div className="product-modal">
            <button className="icon-button product-modal-close" onClick={() => setSelected(null)} aria-label="Close product"><Icon name="close" /></button>
            <div className="product-modal-image"><img src={selected.images?.[0] || heroImage} alt={selected.name} /></div>
            <div className="product-modal-copy"><p className="eyebrow">{selected.category?.name || "THE BAG STYLE EDIT"}</p><h2>{selected.name}</h2><div className="product-prices modal-prices"><strong>{money(selected.price)}</strong>{selected.compare_at_price && selected.compare_at_price > selected.price ? <del>{money(Number(selected.compare_at_price))}</del> : null}</div><p>{selected.description || "A thoughtful everyday favourite, chosen to move with you."}</p>{selected.sku ? <small className="sku-label">SKU · {selected.sku}</small> : null}
              {selected.stock_quantity === 0 ? <span className="stock-note">Currently out of stock</span> : <span className="stock-note">Ready to make it yours</span>}
              <button className="button button-dark button-full" disabled={selected.stock_quantity === 0} onClick={() => { addToCart(selected); setSelected(null); setCartOpen(true); }}>Add to bag <Icon name="bag" size={17} /></button>
              <button className="button button-outline button-full" onClick={() => { addToCart(selected); setSelected(null); openCheckout(); }}>Buy now</button>
              <button className="text-link modal-whatsapp" onClick={() => startWhatsAppOrder([{ product: selected, quantity: 1 }])}>Ask / order on WhatsApp ↗</button>
            </div>
          </div>
        </div>
      ) : null}

      {checkoutOpen ? (
        <div className="modal-layer checkout-layer" onMouseDown={(event) => { if (event.target === event.currentTarget && !placingOrder) setCheckoutOpen(false); }}>
          <div className="checkout-panel">
            <div className="checkout-head"><div><p className="eyebrow">ALMOST YOURS</p><h2>{receipt ? "Order received." : "A few details."}</h2></div><button className="icon-button" onClick={() => setCheckoutOpen(false)} aria-label="Close checkout"><Icon name="close" /></button></div>
            {receipt ? (
              <div className="order-success"><span className="success-mark"><Icon name="check" size={32} /></span><p className="eyebrow">THANK YOU FOR YOUR ORDER</p><h3>It's in our hands now.</h3><p>Your order has been placed. Keep this number handy — our team will confirm the details with you.</p><div className="receipt-number"><small>ORDER NUMBER</small><strong>{receipt.order_number}</strong></div><div className="receipt-total"><span>Order total</span><strong>{money(Number(receipt.total))}</strong></div><button className="button button-dark button-full" onClick={() => { setReceipt(null); setCheckoutOpen(false); }}>Back to the collection <Icon name="arrow" size={17} /></button></div>
            ) : (
              <div className="checkout-grid">
                <form className="checkout-form" onSubmit={placeOrder}>
                  <p className="form-section-label">DELIVERY DETAILS</p>
                  <label>Full name<input name="name" required minLength={2} maxLength={120} placeholder="Your name" /></label>
                  <label>Phone number<input name="phone" required minLength={8} maxLength={30} inputMode="tel" placeholder="01XXXXXXXXX" /></label>
                  <label>Full delivery address<textarea name="address" required minLength={8} maxLength={600} rows={3} placeholder="House, road, area, district" /></label>
                  <label>Order note <span className="optional-label">OPTIONAL</span><textarea name="note" rows={2} placeholder="Any delivery instructions?" /></label>
                  {checkoutError ? <div className="inline-alert">{checkoutError}</div> : null}
                  <button className="button button-dark button-full" disabled={placingOrder || cart.length === 0}>{placingOrder ? "Placing your order…" : "Confirm order · " + money(total)} <Icon name="arrow" size={17} /></button>
                  <small className="cod-note">Cash on delivery · No online payment required</small>
                </form>
                <div className="checkout-summary"><p className="form-section-label">YOUR BAG</p>{cart.map((line) => <div className="checkout-item" key={line.product.id}><img src={line.product.images?.[0] || heroImage} alt="" /><div><strong>{line.product.name}</strong><small>Qty {line.quantity}</small></div><b>{money(line.product.price * line.quantity)}</b></div>)}<div className="checkout-cost"><span>Subtotal</span><span>{money(subtotal)}</span></div><div className="checkout-cost"><span>Delivery</span><span>{shipping === 0 ? "FREE" : money(shipping)}</span></div><div className="checkout-cost checkout-grand"><strong>Total</strong><strong>{money(total)}</strong></div><button className="checkout-whatsapp" onClick={() => startWhatsAppOrder(cart)}>Prefer WhatsApp? Order there ↗</button></div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {!supabase ? <div className="preview-ribbon"><span>PREVIEW MODE</span> Connect Supabase and import the real catalogue to enable live orders. <button onClick={() => navigate("/admin")}>Admin setup ↗</button></div> : null}
    </div>
  );
}