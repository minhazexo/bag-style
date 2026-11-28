// Focused verification for the white/gold phone pass:
// sticky-bar overlap with hero CTAs, tap-target heights, text contrast.
import { spawn } from "node:child_process";
import os from "node:os";
import { join } from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://127.0.0.1:5175";
const PORT = 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const stateScript = `(() => {
  const lum = (c) => { const [r,g,b] = c; const f = (v) => { v/=255; return v <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); }; return .2126*f(r)+.7152*f(g)+.0722*f(b); };
  const parse = (s) => { const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(",").map(Number); return { rgb: p.slice(0,3), a: p.length > 3 ? p[3] : 1 }; };
  const bgOf = (el) => { let n = el; while (n) { if (n.classList && n.classList.contains("sf-footer")) return [27, 22, 16]; const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > .5) return c.rgb; n = n.parentElement; } return [255,255,255]; };
  const ratioOf = (el) => { const fg = parse(getComputedStyle(el).color); if (!fg) return null; const l1 = lum(fg.rgb), l2 = lum(bgOf(el)); return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05); };
  const out = { vw: window.innerWidth, scrollY: Math.round(window.scrollY), overflow: document.documentElement.scrollWidth - window.innerWidth };
  const bar = document.querySelector(".sf-sticky");
  const bRect = bar && getComputedStyle(bar).display !== "none" ? bar.getBoundingClientRect() : null;
  out.sticky = bar ? (bRect ? "visible " + Math.round(bRect.top) + "-" + Math.round(bRect.bottom) : "rendered-hidden") : "absent";
  out.heroActionsInView = [...document.querySelectorAll(".sf-hero-actions .sf-btn")].map((el) => {
    const r = el.getBoundingClientRect();
    const covered = bRect ? !(r.bottom <= bRect.top || r.top >= bRect.bottom || r.right <= bRect.left || r.left >= bRect.right) : false;
    return (el.textContent || "").trim().slice(0, 20) + " y=" + Math.round(r.top) + "-" + Math.round(r.bottom) + (covered ? " COVERED" : "");
  });
  const tap = {};
  const tapOf = (sel) => { const el = document.querySelector(sel); if (!el) return "missing"; const r = el.getBoundingClientRect(); return Math.round(r.width) + "x" + Math.round(r.height); };
  tap.cardName = tapOf(".sf-card-name button");
  tap.footerLink = tapOf(".sf-footer-col a");
  tap.footerButton = tapOf(".sf-footer-col button");
  tap.viewBag = tapOf(".sf-sticky .sf-btn-ghost");
  out.tap = tap;
  const probes = [".sf-eyebrow", ".sf-section-sub", ".sf-card-cat", ".sf-card-name button", ".sf-price-was",
    ".sf-trust-item small", ".sf-footer p", ".sf-footer-col a", ".sf-footer-bottom", ".sf-nav button", ".sf-hero-sub",
    ".sf-announce", ".sf-chip", ".sf-price", ".sf-stock", ".sf-link", ".sf-contact p"];
  out.contrast = [];
  for (const sel of probes) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const ratio = ratioOf(el);
    const cs = getComputedStyle(el);
    out.contrast.push({ sel, ratio: Number(ratio.toFixed(2)), size: cs.fontSize, weight: cs.fontWeight, color: cs.color });
  }
  if (bRect) {
    const stickyTotal = document.querySelector(".sf-sticky-total small");
    if (stickyTotal) out.contrast.push({ sel: ".sf-sticky-total small", ratio: Number(ratioOf(stickyTotal).toFixed(2)), size: getComputedStyle(stickyTotal).fontSize, weight: getComputedStyle(stickyTotal).fontWeight });
  }
  return out;
})()`;

async function openPage(url, width, height, mobile) {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" });
  const target = await res.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener("open", r); ws.addEventListener("error", j); });
  const conn = new Conn(ws);
  await conn.send("Page.enable");
  await conn.send("Runtime.enable");
  await conn.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: !!mobile });
  await conn.send("Page.navigate", { url });
  return { conn, ws };
}

async function settle(conn, wait) {
  for (let i = 0; i < 40; i++) {
    const ready = await conn.eval(`document.readyState === "complete" && !!document.querySelector(${JSON.stringify(wait)})`);
    if (ready) break;
    await sleep(150);
  }
  await sleep(1200);
}

const profile = join(os.tmpdir(), "bag-bari-verify-chrome");
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
  "--disable-gpu", "--force-device-scale-factor=1", "about:blank",
], { stdio: "ignore" });

for (let i = 0; i < 60; i++) {
  try { await fetch(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(250); }
}

const widths = [
  { name: "1440", width: 1440, height: 900 },
  { name: "768", width: 768, height: 900 },
  { name: "375", width: 375, height: 780, mobile: true },
];
const results = [];
try {
  for (const w of widths) {
    const { conn, ws } = await openPage(BASE + "/", w.width, w.height, w.mobile);
    await settle(conn, ".sf-card");
    const top = await conn.eval(stateScript);
    // bag in the cart, then back to the top: the bar must stay off the hero
    await conn.eval(`document.querySelector(".sf-card-actions .sf-add").click()`);
    await sleep(1200);
    await conn.eval(`window.scrollTo(0, 0)`);
    await sleep(900);
    const topWithBag = await conn.eval(stateScript);
    await conn.eval(`window.scrollTo(0, Math.ceil(document.querySelector(".sf-hero").getBoundingClientRect().bottom + window.scrollY) + 120)`);
    await sleep(900);
    const scrolled = await conn.eval(stateScript);
    results.push({ width: w.name, top, topWithBag, scrolled });
    ws.close();
  }
} catch (error) {
  console.error("FAILED:", error.message);
} finally {
  chrome.kill();
}

for (const r of results) {
  console.log(`\n=== ${r.width}px ===`);
  console.log("  top:      sticky=" + r.top.sticky + "  overflow=" + r.top.overflow);
  console.log("  heroCTAs: " + r.top.heroActionsInView.join(" | "));
  console.log("  with bag@top: sticky=" + r.topWithBag.sticky);
  console.log("  with bag CTAs: " + r.topWithBag.heroActionsInView.join(" | "));
  console.log("  scrolled: sticky=" + r.scrolled.sticky + "  overflow=" + r.scrolled.overflow);
  console.log("  heroCTAs: " + r.scrolled.heroActionsInView.join(" | "));
  console.log("  tap:      " + JSON.stringify(r.top.tap));
  for (const c of r.top.contrast) {
    const flag = c.ratio < 4.5 ? "  <-- UNDER 4.5" : "";
    console.log("  contrast: " + c.sel.padEnd(24) + " " + String(c.ratio).padEnd(6) + c.size.padEnd(7) + c.color + flag);
  }
}
