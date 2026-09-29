import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9455;
const BASE_URL = "http://localhost:3400";
const SCREENSHOT_CONVERSATION = path.resolve("docs/audits/haven-chat-active.png");
const SCREENSHOT_CATALOG_DRAWER = path.resolve("docs/audits/haven-chat-catalog-drawer.png");
const SCREENSHOT_PIX_DRAWER = path.resolve("docs/audits/haven-chat-pix-drawer.png");

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.callbacks = new Map();

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
  }

  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${res.exceptionDetails.text} (${JSON.stringify(res.exceptionDetails)})`);
    }
    return res.result?.value;
  }

  close() {
    this.ws.close();
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log("=== Haven Escovaria Chat Flow & Commerce Verification via CDP ===");
  fs.mkdirSync(path.dirname(SCREENSHOT_CONVERSATION), { recursive: true });

  let chromeProc = null;
  const tmpDir = path.resolve(`.tmp-haven-chat-live-${Date.now()}`);

  try {
    chromeProc = spawn(
      CHROME_PATH,
      [
        `--remote-debugging-port=${PORT}`,
        `--user-data-dir=${tmpDir}`,
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--window-size=1440,900",
      ],
      { stdio: "ignore" }
    );

    let versionData = null;
    for (let i = 0; i < 30; i++) {
      await sleep(300);
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
        if (res.ok) {
          versionData = await res.json();
          break;
        }
      } catch {}
    }

    if (!versionData) throw new Error("Failed to connect to Chrome CDP");

    const newTabRes = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE_URL)}`, { method: "PUT" });
    const tabData = await newTabRes.json();
    const cdp = new CDPClient(tabData.webSocketDebuggerUrl);
    await cdp.ready();

    await cdp.send("Page.enable");
    await cdp.send("DOM.enable");
    await cdp.send("Runtime.enable");

    console.log("Waiting for application to load...");
    await sleep(2500);

    // 1. Switch to Haven Workspace
    console.log("Switching to Haven workspace...");
    await cdp.eval(`
      (() => {
        const trigger = document.querySelector('button[aria-haspopup="listbox"]');
        if (trigger) trigger.click();
      })()
    `);
    await sleep(400);

    await cdp.eval(`
      (() => {
        const options = Array.from(document.querySelectorAll('div[role="listbox"] button[role="option"]'));
        const haven = options.find(o => o.textContent && o.textContent.includes('Haven'));
        if (haven) haven.click();
      })()
    `);
    await sleep(2000);

    // 2. Click on the first thread item
    console.log("Selecting first thread item...");
    const clickedThread = await cdp.eval(`
      (() => {
        const item = document.querySelector('[data-testid="thread-item"]');
        if (item) {
          item.click();
          return 'thread_clicked';
        }
        return 'no_thread_item';
      })()
    `);
    console.log("Thread click status:", clickedThread);
    if (clickedThread !== "thread_clicked") {
      throw new Error(`Failed to click thread item: status=${clickedThread}`);
    }
    await sleep(2000);

    // 3. Screenshot 1: Conversa Ativa com Mensagens
    console.log("Capturing Haven Active Conversation...");
    const snap1 = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(SCREENSHOT_CONVERSATION, Buffer.from(snap1.data, "base64"));
    console.log(`Saved: ${SCREENSHOT_CONVERSATION}`);

    // 4. Open Catalog Drawer (24 serviços reais da Haven)
    console.log("Opening Catalog drawer...");
    const catOpened = await cdp.eval(`
      (() => {
        const catBtn = document.querySelector('[data-testid="btn-catalog-waba"]');
        if (catBtn) {
          catBtn.click();
          return 'catalog_drawer_opened';
        }
        return 'no_catalog_btn';
      })()
    `);
    console.log("Catalog status:", catOpened);
    if (catOpened !== "catalog_drawer_opened") {
      throw new Error(`Failed to open catalog drawer: status=${catOpened}`);
    }
    await sleep(2000);

    const snap2 = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(SCREENSHOT_CATALOG_DRAWER, Buffer.from(snap2.data, "base64"));
    console.log(`Saved: ${SCREENSHOT_CATALOG_DRAWER}`);

    // Close Catalog Drawer
    await cdp.eval(`
      (() => {
        const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && (b.textContent.includes('Fechar') || b.textContent === '×'));
        if (closeBtn) closeBtn.click();
      })()
    `);
    await sleep(600);

    // 5. Open Pix Drawer (Cobrança Pix Oficial Haven)
    console.log("Opening Pix drawer...");
    const pixOpened = await cdp.eval(`
      (() => {
        const pixBtn = document.querySelector('[data-testid="btn-pix-charge"]');
        if (pixBtn) {
          pixBtn.click();
          return 'pix_drawer_opened';
        }
        return 'no_pix_btn';
      })()
    `);
    console.log("Pix status:", pixOpened);
    if (pixOpened !== "pix_drawer_opened") {
      throw new Error(`Failed to open pix drawer: status=${pixOpened}`);
    }
    await sleep(2000);

    const snap3 = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(SCREENSHOT_PIX_DRAWER, Buffer.from(snap3.data, "base64"));
    console.log(`Saved: ${SCREENSHOT_PIX_DRAWER}`);

    cdp.close();
    console.log("🎉 Evidências completas de chat, catálogo e Pix da Haven capturadas!");
  } finally {
    if (chromeProc) chromeProc.kill();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

run().catch((err) => {
  console.error("Runner failed:", err);
  process.exit(1);
});
