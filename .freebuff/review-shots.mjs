// Visual review capture: hero, grid, card hover, footer + full page at 375/768/1440.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://127.0.0.1:5175";
const OUT = join(os.tmpdir(), "bag-bari-review");
const PORT = 9335;
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

async function openPage(url, width, height, mobile) {
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener("open", r); ws.addEventListener("error", j); });
  const conn = new Conn(ws);
  await conn.send("Page.enable");
  await conn.send("Runtime.enable");
  await conn.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: !!mobile });
  await conn.send("Page.navigate", { url });
  for (let i = 0; i < 50; i++) {
    const ready = await conn.eval(`document.readyState === "complete" && !!document.querySelector(".sf-card")`);
    if (ready) break;
    await sleep(200);
  }
  // deterministic starting point: no bag left over from an earlier run
  await conn.eval(`localStorage.removeItem("bag-style-cart"); location.reload()`);
  for (let i = 0; i < 50; i++) {
    const ready = await conn.eval(`document.readyState === "complete" && !!document.querySelector(".sf-card")`);
    if (ready) break;
    await sleep(200);
  }
  await sleep(1500);
  return { conn, ws };
}

async function shot(conn, file, width, height, opts = {}) {
  let h = height;
  let y = 0;
  if (opts.full) {
    const m = await conn.send("Page.getLayoutMetrics");
    const content = m.cssContentSize || m.contentSize;
    h = Math.min(Math.ceil(content.height), 8000);
  }
  const params = {
    format: "png",
    captureBeyondViewport: !!opts.full,
  };
  if (opts.full) params.clip = { x: 0, y, width, height: h, scale: 1 };
  const { data } = await conn.send("Page.captureScreenshot", params);
  await writeFile(join(OUT, file), Buffer.from(data, "base64"));
  return `${file} ${width}x${h}`;
}

async function shotEl(conn, file, selector) {
  const r = await conn.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top + window.scrollY, w: b.width, h: b.height }; })()`);
  if (!r) return `${file} missing`;
  const { data } = await conn.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.w, height: r.h, scale: 1 },
  });
  await writeFile(join(OUT, file), Buffer.from(data, "base64"));
  return `${file} ${Math.round(r.w)}x${Math.round(r.h)}`;
}

// Trigger lazy images before a full-page capture.
async function warmImages(conn, height) {
  const total = await conn.eval(`document.documentElement.scrollHeight`);
  for (let y = 0; y < total; y += Math.round(height * 0.8)) {
    await conn.eval(`window.scrollTo(0, ${y})`);
    await sleep(220);
  }
  await conn.eval(`window.scrollTo(0, 0)`);
  await sleep(900);
}

await mkdir(OUT, { recursive: true });
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(os.tmpdir(), "bag-bari-shot-chrome-" + Date.now())}`,
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
const log = [];
try {
  for (const w of widths) {
    const { conn, ws } = await openPage(BASE + "/", w.width, w.height, w.mobile);
    await warmImages(conn, w.height);

    log.push(await shot(conn, `hero-${w.name}.png`, w.width, w.height));

    // hero CTA row in full, to check the pills for wrapping
    await conn.eval(`window.scrollTo(0, Math.max(0, document.querySelector(".sf-hero-actions").getBoundingClientRect().top + window.scrollY - Math.round(window.innerHeight * 0.55)))`);
    await sleep(700);
    log.push(await shot(conn, `ctas-${w.name}.png`, w.width, w.height));
    await conn.eval(`window.scrollTo(0, 0)`);
    await sleep(500);

    // full page
    log.push(await shot(conn, `full-${w.name}.png`, w.width, w.height, { full: true }));

    // product grid section
    await conn.eval(`window.scrollTo(0, Math.max(0, document.querySelector(".sf-collection").getBoundingClientRect().top + window.scrollY - 24))`);
    await sleep(900);
    log.push(await shot(conn, `grid-${w.name}.png`, w.width, w.height));

    // hover the second product card
    const box = await conn.eval(`(() => { const el = document.querySelectorAll(".sf-card")[1]; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (box) {
      await conn.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y, buttons: 0 });
      await sleep(800);
      log.push(await shot(conn, `hover-${w.name}.png`, w.width, w.height));
      await conn.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5, buttons: 0 });
      await sleep(300);
    }

    // category tiles as one block
    log.push(await shotEl(conn, `tiles-${w.name}.png`, ".sf-tiles"));

    // contact CTA band
    await conn.eval(`window.scrollTo(0, Math.max(0, document.querySelector(".sf-contact").getBoundingClientRect().top + window.scrollY - 40))`);
    await sleep(700);
    log.push(await shot(conn, `contact-${w.name}.png`, w.width, w.height));

    // footer
    await conn.eval(`window.scrollTo(0, document.documentElement.scrollHeight)`);
    await sleep(900);
    log.push(await shot(conn, `footer-${w.name}.png`, w.width, w.height));

    // numbers for the record
    // sticky bar with one bag in it, on the collection
    await conn.eval(`document.querySelector(".sf-card-actions .sf-add").click()`);
    await sleep(3000);
    await conn.eval(`window.scrollTo(0, Math.max(0, document.querySelector(".sf-collection").getBoundingClientRect().top + window.scrollY - 24))`);
    await sleep(900);
    log.push(await shot(conn, `sticky-${w.name}.png`, w.width, w.height));

    const facts = await conn.eval(`({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      sticky: (() => { const b = document.querySelector(".sf-sticky"); if (!b) return "absent"; const r = b.getBoundingClientRect(); return getComputedStyle(b).display === "none" ? "hidden" : Math.round(r.top) + "-" + Math.round(r.bottom); })(),
      docHeight: document.documentElement.scrollHeight,
      footerPadBottom: getComputedStyle(document.querySelector(".sf-footer")).paddingBottom,
      footerBottom: Math.round(document.querySelector(".sf-footer-bottom").getBoundingClientRect().bottom)
    })`);
    log.push(`facts ${w.name}: ` + JSON.stringify(facts));
    ws.close();
  }
} catch (error) {
  console.error("FAILED:", error.message);
} finally {
  chrome.kill();
}
console.log(log.join("\n"));
