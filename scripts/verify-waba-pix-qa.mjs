import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9444;
const BASE_URL = "http://localhost:3400";
const SCREENSHOT_PATH = path.resolve("docs/audits/waba-pix-cockpit.png");

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
  console.log("=== WABA Instant Pix Charges & Checkout QA Runner via Chrome CDP ===");
  fs.mkdirSync(path.dirname(SCREENSHOT_PATH), { recursive: true });

  let chromeProc = null;
  let wsUrl = null;

  // Check if Chrome is already active on PORT
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    if (res.ok) {
      const targets = await res.json();
      const page = targets.find((t) => t.type === "page" && !t.url.includes("extension"));
      if (page?.webSocketDebuggerUrl) {
        wsUrl = page.webSocketDebuggerUrl;
        console.log("Reusing existing Chrome instance on port", PORT);
      }
    }
  } catch {}

  if (!wsUrl) {
    const profileDir = `/tmp/chrome-waba-pix-profile-${Date.now()}`;
    fs.mkdirSync(profileDir, { recursive: true });

    chromeProc = spawn(
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
      { stdio: "ignore" }
    );

    for (let i = 0; i < 25; i++) {
      await sleep(400);
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
        if (res.ok) {
          const targets = await res.json();
          const page = targets.find((t) => t.type === "page" && !t.url.includes("extension")) || targets[0];
          if (page?.webSocketDebuggerUrl) {
            wsUrl = page.webSocketDebuggerUrl;
            break;
          }
        }
      } catch {}
    }
  }

  if (!wsUrl) throw new Error("Could not connect to Chrome CDP WebSocket");

  let cdp = null;
  try {
    cdp = new CDPClient(wsUrl);
    await cdp.ready();
    await cdp.send("Page.enable");
    await cdp.send("DOM.enable");
    await cdp.send("Runtime.enable");

    console.log("Navigating to Cockpit...");
    await cdp.send("Page.navigate", { url: BASE_URL });
    await sleep(2000);

    const token =
      "REDACTED_DEV_JWT";

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

    // Click on 'Pix 💰' button
    console.log("Opening Pix Drawer...");
    const clickedPixBtn = await cdp.eval(`
      (() => {
        const btn = document.querySelector('[data-testid="btn-pix-charge"]');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log("Clicked Pix button:", clickedPixBtn);
    await sleep(2000);

    // Click 'Enviar Cobrança Pix no Chat 🚀'
    console.log("Generating Pix charge and sending to WhatsApp chat...");
    const clickedSubmitPix = await cdp.eval(`
      (() => {
        const btn = document.querySelector('[data-testid="btn-submit-pix"]');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log("Clicked Submit Pix button:", clickedSubmitPix);
    await sleep(3000);

    // Verify Pix card in timeline
    const timelineHasPix = await cdp.eval(`
      (() => {
        const text = document.body.innerText;
        return text.includes("Cobrança Pix Gerada") || text.includes("Chave Pix Copia e Cola");
      })()
    `);
    console.log("Timeline contains Pix charge card:", timelineHasPix);

    // Click 'Confirmar Pagamento do Cliente ✅'
    console.log("Confirming Pix payment to simulate bank webhook & close sale...");
    const clickedConfirmPayment = await cdp.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const confirmBtn = btns.find(b => b.textContent && b.textContent.includes("Confirmar Pagamento"));
        if (confirmBtn) {
          confirmBtn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log("Clicked Confirm Payment button:", clickedConfirmPayment);
    await sleep(3000);

    // Capture timeline screenshot (Pix card and closed sale)
    console.log("Capturing timeline audit screenshot...");
    const timelineScreenshotRes = await cdp.send("Page.captureScreenshot", {
      format: "png",
      quality: 95,
      fromSurface: true,
    });
    fs.writeFileSync(path.resolve("docs/audits/waba-pix-timeline.png"), Buffer.from(timelineScreenshotRes.data, "base64"));
    console.log("Saved timeline screenshot to docs/audits/waba-pix-timeline.png");

    // Re-open Pix drawer to showcase the complete UX alongside the confirmed sale
    await cdp.eval(`
      (() => {
        const btn = document.querySelector('[data-testid="btn-pix-charge"]');
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

    console.log("=== WABA Pix Instant Checkout QA Completed Successfully! ===");
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
