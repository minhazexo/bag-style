// Focused capture for the softened WhatsApp treatment: hero, band, contact, drawer, sticky bar.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://127.0.0.1:5175";
const OUT = join(process.cwd(), "screenshots", "gold");
const PORT = 9336;
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

async function openPage(width, height, mobile) {
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener("open", r); ws.addEventListener("error", j); });
  const conn = new Conn(ws);
  await conn.send("Page.enable");
  await conn.send("Runtime.enable");
  await conn.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: !!mobile });
  await conn.send("Page.navigate", { url: BASE + "/" });
  for (let i = 0; i < 50; i++) {
    if (await conn.eval(`document.readyState === "complete" && !!document.querySelector(".sf-card")`)) break;
    await sleep(200);
  }
  await conn.eval(`localStorage.removeItem("bag-style-cart"); location.reload()`);
  for (let i = 0; i < 50; i++) {
    if (await conn.eval(`document.readyState === "complete" && !!document.querySelector(".sf-card")`)) break;
    await sleep(200);
  }
  await sleep(1600);
  return { conn, ws };
}

async function shot(conn, file) {
  const { data } = await conn.send("Page.captureScreenshot", { format: "png" });
  await writeFile(join(OUT, file), Buffer.from(data, "base64"));
  return file;
}

await mkdir(OUT, { recursive: true });
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(os.tmpdir(), "bag-bari-wa-chrome-" + Date.now())}`,
  "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
  "--disable-gpu", "--force-device-scale-factor=1", "about:blank",
], { stdio: "ignore" });
for (let i = 0; i < 60; i++) {
  try { await fetch(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(250); }
}

const log = [];
try {
  // Desktop: hero, feature band, contact band, cart drawer.
  {
    const { conn, ws } = await openPage(1440, 900, false);
    log.push(await shot(conn, "wa-hero-1440.png"));
    await conn.eval(`window.scrollTo(0, Math.max(0, document.querySelector(".sf-band").getBoundingClientRect().top + window.scrollY - 24))`);
    await sleep(800);
    log.push(await shot(conn, "wa-band-1440.png"));
    await conn.eval(`window.scrollTo(0, Math.max(0, document.querySelector(".sf-contact").getBoundingClientRect().top + window.scrollY - 40))`);
    await sleep(800);
    log.push(await shot(conn, "wa-contact-1440.png"));
    await conn.eval(`window.scrollTo(0, 0); document.querySelector(".sf-card-actions .sf-add").click()`);
    await sleep(900);
    await conn.eval(`document.querySelector(".sf-bag-btn").click()`);
    await sleep(700);
    log.push(await shot(conn, "wa-drawer-1440.png"));
    ws.close();
  }
  // Phone: hero and sticky bar with a bag in it.
  {
    const { conn, ws } = await openPage(375, 780, true);
    log.push(await shot(conn, "wa-hero-375.png"));
    await conn.eval(`document.querySelector(".sf-card-actions .sf-add").click()`);
    await sleep(2600);
    await conn.eval(`window.scrollTo(0, Math.max(0, document.querySelector(".sf-collection").getBoundingClientRect().top + window.scrollY - 24))`);
    await sleep(900);
    log.push(await shot(conn, "wa-sticky-375.png"));
    ws.close();
  }
} catch (error) {
  console.error("FAILED:", error.message);
} finally {
  chrome.kill();
}
console.log(log.join("\n"));
