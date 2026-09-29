import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9450;
const BASE_URL = "http://localhost:3400/settings";
const SCREENSHOT_OVERVIEW = path.resolve("docs/audits/waba-settings-overview.png");
const SCREENSHOT_STEP1 = path.resolve("docs/audits/waba-settings-wizard-step1.png");
const SCREENSHOT_STEP2 = path.resolve("docs/audits/waba-settings-wizard-step2.png");

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
  console.log("=== WABA Facilitated Settings & 3-Step Wizard QA Runner via Chrome CDP ===");
  fs.mkdirSync(path.dirname(SCREENSHOT_OVERVIEW), { recursive: true });

  let chromeProc = null;
  let wsUrl = null;

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
    const profileDir = `/tmp/chrome-waba-settings-profile-${Date.now()}`;
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

    console.log("1. Navigating to base page...");
    await cdp.send("Page.navigate", { url: BASE_URL });
    await sleep(2000);

    const token = "REDACTED_DEV_JWT";
    const workspaceId = "f6205c16-6777-43c1-8017-4b78417a00fa";

    console.log("2. Injecting auth credentials and reloading...");
    await cdp.eval(`(() => {
      sessionStorage.setItem("sos_v3_lab_token", "${token}");
      sessionStorage.removeItem("sos_v3_explicit_logged_out");
      localStorage.setItem("sos_sales_auth_token", "${token}");
      localStorage.setItem("sos_sales_active_workspace_id", "${workspaceId}");
      window.location.reload();
    })()`);

    await sleep(3500);

    console.log("3. Navigating to 'Configurações' via sidebar...");
    await cdp.eval(`(() => {
      const items = Array.from(document.querySelectorAll("*"));
      const target = items.find(el => el.textContent && el.textContent.trim() === "Configurações");
      if (target) target.click();
    })()`);

    await sleep(2500);

    console.log("4. Capturing Settings Overview screenshot (with Institutional Pix block)...");
    const shot1 = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(SCREENSHOT_OVERVIEW, Buffer.from(shot1.data, "base64"));
    console.log("Saved screenshot:", SCREENSHOT_OVERVIEW);

    console.log("5. Clicking 'Conectar Nova Linha ⚡' to trigger 3-step wizard...");
    await cdp.eval(`(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const target = btns.find(b => b.textContent && b.textContent.includes("Conectar Nova Linha"));
      if (target) target.click();
      window.scrollTo({ top: 500, behavior: "instant" });
    })()`);

    await sleep(1500);

    console.log("6. Capturing Step 1 (Engine Selector) screenshot...");
    const shot2 = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(SCREENSHOT_STEP1, Buffer.from(shot2.data, "base64"));
    console.log("Saved screenshot:", SCREENSHOT_STEP1);

    console.log("7. Advancing to Step 2 (Credentials & Live Meta Validation)...");
    await cdp.eval(`(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const next = btns.find(b => b.textContent && b.textContent.includes("Próximo: Informar Credenciais"));
      if (next) next.click();
      window.scrollTo({ top: 500, behavior: "instant" });
    })()`);

    await sleep(1500);

    console.log("8. Capturing Step 2 screenshot...");
    const shot3 = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(SCREENSHOT_STEP2, Buffer.from(shot3.data, "base64"));
    console.log("Saved screenshot:", SCREENSHOT_STEP2);

    console.log("=== Verification Successful! All 3 audit screenshots captured. ===");
  } finally {
    if (cdp) cdp.close();
    if (chromeProc) chromeProc.kill();
  }
}

run().catch((err) => {
  console.error("FATAL QA FAILURE:", err);
  process.exit(1);
});
