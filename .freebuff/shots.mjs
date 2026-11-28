// Headless-Chrome screenshot + layout audit for the Bag Style storefront.
// Usage: bun .freebuff/shots.mjs [label]
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import os from "node:os";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://127.0.0.1:5175";
const OUT = join(process.cwd(), "screenshots", "gold");
const label = process.argv[2] || "pre";
const PORT = 9333;

const widths = [
  { name: "1440", width: 1440, height: 900 },
  { name: "768", width: 768, height: 900 },
  { name: "375", width: 375, height: 780, mobile: true },
];

const routes = [
  { key: "home", path: "/", wait: "main" },
  { key: "category", path: "/c/school-bag", wait: "main" },
  { key: "product", path: "/p/492", wait: ".sf-product, main" },
  { key: "admin", path: "/admin", wait: "form, .admin-shell" },
];

const auditScript = `(() => {
  const out = { overflow: document.documentElement.scrollWidth - window.innerWidth, wide: [], small: [], colors: [], olive: [] };
  const vw = window.innerWidth;
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > vw + 1 && !el.closest(".sf-chips, .sf-thumbs, .admin-table-wrap, .order-items-list")) {
      out.wide.push(el.tagName.toLowerCase() + "." + (el.className || "").toString().split(" ").filter(Boolean).slice(0,2).join(".") + " right=" + Math.round(r.right));
    }
  }
  out.wide = [...new Set(out.wide)].slice(0, 8);
  if (vw <= 420) {
    for (const el of document.querySelectorAll("button, a, input, select, [role=button]")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 40 || r.width < 32) {
        out.small.push((el.tagName.toLowerCase()) + "[" + (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24) + "] " + Math.round(r.width) + "x" + Math.round(r.height));
      }
    }
    out.small = [...new Set(out.small)].slice(0, 12);
  }
  const lum = (c) => { const [r,g,b] = c; const f = (v) => { v/=255; return v <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); }; return .2126*f(r)+.7152*f(g)+.0722*f(b); };
  const parse = (s) => { const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(",").map(Number); return { rgb: p.slice(0,3), a: p.length > 3 ? p[3] : 1 }; };
  const bgOf = (el) => { let n = el; while (n) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > .5) return c.rgb; n = n.parentElement; } return [255,255,255]; };
  const probes = [".sf-eyebrow", ".sf-section-sub", ".sf-card-cat", ".sf-price-was", ".sf-muted", ".sf-footer p", ".sf-nav button", ".sf-hero-sub", ".sf-trust-item small", ".sf-announce", ".sf-chip", ".sf-stock"];
  for (const sel of probes) {
    const el = document.querySelector(sel); if (!el) continue;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color); if (!fg) continue;
    const bg = bgOf(el);
    const l1 = lum(fg.rgb), l2 = lum(bg);
    const ratio = (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
    out.colors.push(sel + " " + ratio.toFixed(2) + ":1 size=" + cs.fontSize);
  }
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    for (const prop of ["color", "backgroundColor", "borderTopColor"]) {
      const c = parse(cs[prop]); if (!c || c.a < .4) continue;
      const [r,g,b] = c.rgb;
      if (g > r + 6 && g > b + 6) { out.olive.push(prop + "=" + cs[prop] + " on " + el.tagName.toLowerCase() + "." + (el.className||"").toString().split(" ")[0]); }
    }
    if (out.olive.length > 8) break;
  }
  out.olive = [...new Set(out.olive)].slice(0, 8);
  return out;
})()`;

class Conn {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const res = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
    return res.result.value;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targetFor() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" });
  return res.json();
}

async function openPage(url, width, height, mobile) {
  const target = await targetFor();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener("open", r); ws.addEventListener("error", j); });
  const conn = new Conn(ws);
  await conn.send("Page.enable");
  await conn.send("Runtime.enable");
  await conn.send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile: !!mobile,
  });
  await conn.send("Page.navigate", { url });
  return { conn, ws, target };
}

async function settle(conn, wait, extra = 1200) {
  for (let i = 0; i < 40; i++) {
    const ready = await conn.eval(`document.readyState === "complete" && !!document.querySelector(${JSON.stringify(wait)})`);
    if (ready) break;
    await sleep(150);
  }
  await sleep(extra);
}

async function shot(conn, file, width, height, full = true) {
  const metrics = await conn.send("Page.getLayoutMetrics");
  const content = metrics.cssContentSize || metrics.contentSize;
  const h = full ? Math.min(Math.ceil(content.height), 7000) : height;
  const { data } = await conn.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: full,
    clip: { x: 0, y: 0, width, height: h, scale: 1 },
  });
  await writeFile(join(OUT, file), Buffer.from(data, "base64"));
  return `${file} (${width}x${h})`;
}

await mkdir(OUT, { recursive: true });
const profile = join(os.tmpdir(), "bags-style-chrome");
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
  "--disable-gpu", "--force-device-scale-factor=1", "about:blank",
], { stdio: "ignore" });

for (let i = 0; i < 60; i++) {
  try { await fetch(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(250); }
}

const audit = [];
const shots = [];
try {
  for (const route of routes) {
    for (const w of widths) {
      const { conn, ws } = await openPage(BASE + route.path, w.width, w.height, w.mobile);
      await settle(conn, route.wait);
      shots.push(await shot(conn, `${label}-${route.key}-${w.name}.png`, w.width, w.height));
      const result = await conn.eval(auditScript);
      audit.push({ route: route.key, width: w.name, ...result });
      ws.close();
    }
  }

  // cart drawer + checkout modal, at each width
  for (const w of widths) {
    const { conn, ws } = await openPage(BASE + "/", w.width, w.height, w.mobile);
    await settle(conn, ".sf-card");
    await conn.eval(`document.querySelector(".sf-card-actions .sf-add").click()`);
    await sleep(500);
    await conn.eval(`document.querySelector(".sf-bag-btn").click()`);
    await sleep(900);
    shots.push(await shot(conn, `${label}-cart-${w.name}.png`, w.width, w.height, false));
    const cartAudit = await conn.eval(auditScript);
    audit.push({ route: "cart", width: w.name, ...cartAudit });
    await conn.eval(`(() => { const b = [...document.querySelectorAll(".sf-drawer-foot .sf-btn")].pop(); if (b) b.click(); })()`);
    await sleep(900);
    shots.push(await shot(conn, `${label}-checkout-${w.name}.png`, w.width, w.height, false));
    const checkoutAudit = await conn.eval(auditScript);
    audit.push({ route: "checkout", width: w.name, ...checkoutAudit });
    ws.close();
  }
} catch (error) {
  console.error("FAILED:", error.message);
} finally {
  chrome.kill();
}

await writeFile(join(OUT, `${label}-audit.json`), JSON.stringify(audit, null, 2));
console.log(shots.join("\n"));
for (const row of audit) {
  const bad = [];
  if (row.overflow > 1) bad.push("overflow " + row.overflow + "px");
  if (row.wide?.length) bad.push("wide: " + row.wide.join(" | "));
  if (row.small?.length) bad.push("tap: " + row.small.join(" | "));
  const weak = (row.colors || []).filter((c) => Number(c.split(" ")[1].split(":")[0]) < 4.5);
  if (weak.length) bad.push("contrast: " + weak.join(" | "));
  if (row.olive?.length) bad.push("green: " + row.olive.join(" | "));
  if (bad.length) console.log(`\n[${row.route} @ ${row.width}] ` + bad.join("\n   "));
}
