import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9453;
const BASE_URL = "http://localhost:3400";
const SCREENSHOT_COCKPIT = path.resolve("docs/audits/haven-cockpit-inbox.png");
const SCREENSHOT_CATALOG = path.resolve("docs/audits/haven-catalog-24-services.png");
const SCREENSHOT_TEMPLATES = path.resolve("docs/audits/haven-templates-waba.png");
const SCREENSHOT_SETTINGS = path.resolve("docs/audits/haven-waba-settings-pix.png");

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
  console.log("=== Haven Escovaria WABA & Intelligence Browser Verification via CDP ===");
  fs.mkdirSync(path.dirname(SCREENSHOT_COCKPIT), { recursive: true });

  let chromeProc = null;
  const tmpDir = path.resolve(`.tmp-haven-chrome-${Date.now()}`);

  try {
    console.log(`Starting headless Chrome on port ${PORT}...`);
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

    console.log("Waiting for application to load and session to settle...");
    await sleep(2500);

    // 1. Alternar para o Workspace Haven Escovaria & Esmalteria
    console.log("Opening workspace dropdown...");
    const openRes = await cdp.eval(`
      (() => {
        const trigger = document.querySelector('button[aria-haspopup="listbox"]');
        if (trigger) {
          trigger.click();
          return 'trigger_clicked';
        }
        return 'no_trigger';
      })()
    `);
    console.log("Open dropdown result:", openRes);
    await sleep(500);

    const selectRes = await cdp.eval(`
      (() => {
        const options = Array.from(document.querySelectorAll('div[role="listbox"] button[role="option"]'));
        const haven = options.find(o => o.textContent && o.textContent.includes('Haven'));
        if (haven) {
          haven.click();
          return 'haven_clicked: ' + haven.textContent.trim();
        }
        return 'haven_option_not_found. Options: ' + options.map(o => o.textContent.trim()).join(' | ');
      })()
    `);
    console.log("Select result:", selectRes);
    await sleep(2000);

    // 2. Screenshot 1: Cockpit Inbox
    console.log("Capturing Haven Cockpit Inbox screenshot...");
    const snap1 = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(SCREENSHOT_COCKPIT, Buffer.from(snap1.data, "base64"));
    console.log(`Saved: ${SCREENSHOT_COCKPIT}`);

    // 3. Screenshot 2: Catálogo Haven (24 serviços)
    console.log("Navigating to Catálogo Haven...");
    await cdp.eval(`
      (() => {
        const catBtn = Array.from(document.querySelectorAll('button')).find(el => el.textContent && el.textContent.includes('Catálogo'));
        if (catBtn) catBtn.click();
      })()
    `);
    await sleep(2000);

    const snap2 = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(SCREENSHOT_CATALOG, Buffer.from(snap2.data, "base64"));
    console.log(`Saved: ${SCREENSHOT_CATALOG}`);

    // 4. Screenshot 3: Modelos (Templates Homologados)
    console.log("Navigating to Modelos (Templates)...");
    await cdp.eval(`
      (() => {
        const tplBtn = Array.from(document.querySelectorAll('button')).find(el => el.textContent && el.textContent.includes('Modelos'));
        if (tplBtn) tplBtn.click();
      })()
    `);
    await sleep(2000);

    const snap3 = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(SCREENSHOT_TEMPLATES, Buffer.from(snap3.data, "base64"));
    console.log(`Saved: ${SCREENSHOT_TEMPLATES}`);

    // 5. Screenshot 4: Configurações (Settings)
    console.log("Navigating to Configurações (Settings)...");
    await cdp.eval(`
      (() => {
        const setBtn = Array.from(document.querySelectorAll('button')).find(el => el.textContent && el.textContent.includes('Configurações'));
        if (setBtn) setBtn.click();
      })()
    `);
    await sleep(2000);

    const snap4 = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(SCREENSHOT_SETTINGS, Buffer.from(snap4.data, "base64"));
    console.log(`Saved: ${SCREENSHOT_SETTINGS}`);

    cdp.close();
    console.log("🎉 Todas as 4 evidências visuais da Haven capturadas com sucesso!");
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
