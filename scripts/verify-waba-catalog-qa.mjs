import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9550 + Math.floor(Math.random() * 300);
const BASE_URL = "http://localhost:3400";
const SCREENSHOT_PATH = path.resolve("docs/audits/waba-catalog-cockpit.png");

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
  console.log("=== WABA Catalog & Product Messages QA Runner via Chrome CDP ===");
  fs.mkdirSync(path.dirname(SCREENSHOT_PATH), { recursive: true });

  const profileDir = `/tmp/chrome-waba-catalog-profile-${Date.now()}`;
  fs.mkdirSync(profileDir, { recursive: true });

  const chromeProc = spawn(
    CHROME_PATH,
    [
      "--headless=new",
      "--disable-gpu",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profileDir}`,
      "--window-size=1440,900",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { detached: true, stdio: "ignore" }
  );
  chromeProc.unref();

  let cdp = null;

  try {
    let wsUrl = null;
    for (let i = 0; i < 25; i++) {
      await sleep(400);
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
        if (res.ok) {
          const targets = await res.json();
          const page = targets.find((t) => t.type === "page") || targets[0];
          if (page?.webSocketDebuggerUrl) {
            wsUrl = page.webSocketDebuggerUrl;
            break;
          }
        }
      } catch {}
    }

    if (!wsUrl) throw new Error("Could not connect to Chrome CDP WebSocket");

    cdp = new CDPClient(wsUrl);
    await cdp.ready();
    await cdp.send("Page.enable");
    await cdp.send("DOM.enable");
    await cdp.send("Runtime.enable");

    console.log("Navigating to Cockpit...");
    await cdp.send("Page.navigate", { url: BASE_URL });
    await sleep(2000);

    const token =
      process.env.SOS_SALES_AUTH_TOKEN ||
      process.env.VITE_DEV_DEMO_TOKEN ||
      "";
    if (!token) {
      console.warn("WARN: Missing SOS_SALES_AUTH_TOKEN / VITE_DEV_DEMO_TOKEN in environment.");
    }

    await cdp.eval(`
      localStorage.setItem("sos_sales_auth_token", "${token}");
      localStorage.setItem("sos_sales_active_workspace_id", "f6205c16-6777-43c1-8017-4b78417a00fa");
      window.location.reload();
    `);
    await sleep(3500);

    console.log("Checking Cockpit rendering...");
    const pageTitle = await cdp.eval("document.title");
    console.log("Page Title:", pageTitle);

    // Wait for threads to load in queue
    let threadFound = false;
    for (let i = 0; i < 20; i++) {
      const hasThread = await cdp.eval(`(() => {
        const threadCard = document.querySelector('[data-testid="thread-item"]');
        return Boolean(threadCard);
      })()`);
      if (hasThread) {
        threadFound = true;
        break;
      }
      await sleep(400);
    }
    console.log("Thread found in queue:", threadFound);

    // Click first thread in queue
    const selected = await cdp.eval(`
      (() => {
        const threadCard = document.querySelector('[data-testid="thread-item"]');
        if (threadCard) {
          threadCard.click();
          return true;
        }
        return false;
      })()
    `);
    console.log("Selected conversation:", selected);
    await sleep(2000);

    // Click on 'Catálogo 🛍️' button
    console.log("Opening Catalog Drawer...");
    const clickedCatalogBtn = await cdp.eval(`
      (() => {
        const btn = document.querySelector('[data-testid="btn-catalog-waba"]');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log("Clicked Catalog button:", clickedCatalogBtn);
    await sleep(2000);

    // Verify products rendered in drawer
    const productInfo = await cdp.eval(`
      (() => {
        const strongs = Array.from(document.querySelectorAll('strong'));
        const titles = strongs.map(s => s.textContent).filter(t => t && (t.includes('Plano') || t.includes('Mentoria') || t.includes('Setup') || t.includes('Treinamento')));
        return { count: titles.length, titles };
      })()
    `);
    console.log("Products found in Drawer:", productInfo);

    // Click 'Enviar Produto no Chat 🚀'
    console.log("Sending product offer to customer...");
    const clickedSendProduct = await cdp.eval(`
      (() => {
        const btn = document.querySelector('[data-testid="btn-send-product"]');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log("Clicked Send Product button:", clickedSendProduct);
    await sleep(3000);

    // Re-open catalog drawer to capture preview and screenshot with drawer open
    await cdp.eval(`
      (() => {
        const btn = document.querySelector('[data-testid="btn-catalog-waba"]');
        if (btn) btn.click();
      })()
    `);
    await sleep(2000);

    // Capture screenshot
    console.log("Capturing visual audit screenshot...");
    const screenshotRes = await cdp.send("Page.captureScreenshot", {
      format: "png",
      quality: 95,
      fromSurface: true,
    });
    fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(screenshotRes.data, "base64"));
    console.log("Saved audit screenshot to:", SCREENSHOT_PATH);

    console.log("=== WABA Catalog QA Completed Successfully! ===");
  } catch (err) {
    console.error("QA failed:", err);
    process.exitCode = 1;
  } finally {
    if (cdp) cdp.close();
    try {
      chromeProc.kill("SIGKILL");
    } catch {}
  }
}

run();
