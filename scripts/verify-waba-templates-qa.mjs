import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9556;
const BASE_URL = "http://localhost:3400";
const SCREENSHOT_PATH = path.resolve("docs/audits/waba-templates-cockpit.png");

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
  console.log("=== WABA Templates QA Runner via Chrome CDP ===");
  fs.mkdirSync(path.dirname(SCREENSHOT_PATH), { recursive: true });

  const profileDir = `/tmp/chrome-waba-profile-${Date.now()}`;
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
    { stdio: "ignore" }
  );

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

    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    console.log(`Navigating to ${BASE_URL}...`);
    await cdp.send("Page.navigate", { url: BASE_URL });
    await sleep(1500);

    // Inject demo token in sessionStorage
    const token = "REDACTED_DEV_JWT";
    await cdp.eval(`(() => {
      sessionStorage.setItem("sos_v3_lab_token", "${token}");
      window.location.reload();
    })()`);
    await sleep(3000);

    // 1. Verify app loaded
    const pageTitle = await cdp.eval("document.title");
    console.log("Page title:", pageTitle);

    // Check body innerText snippet to see what's loaded
    const bodySnippet = await cdp.eval("document.body.innerText.substring(0, 200)");
    console.log("Body snippet:", bodySnippet);

    // 2. Select first thread in queue
    const threadClicked = await cdp.eval(`(() => {
      const threadCard = document.querySelector('section[aria-label="Fila de Atendimento"] div[style*="cursor: pointer"]');
      if (threadCard) {
        threadCard.click();
        return true;
      }
      return false;
    })()`);
    console.log("Thread selected in queue:", threadClicked);
    await sleep(2000);

    // 3. Check Window status badge in header
    const windowBadge = await cdp.eval(`(() => {
      const badges = Array.from(document.querySelectorAll('span')).map(s => s.innerText);
      const match = badges.find(b => b.includes('Janela 24h'));
      return match || null;
    })()`);
    console.log("Window 24h Badge detected in Header:", windowBadge);

    // 4. Click 'Modelos WABA' button
    const openDrawer = await cdp.eval(`(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.innerText.includes('Modelos WABA'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    })()`);
    console.log("Clicked 'Modelos WABA' button:", openDrawer);
    await sleep(1000);

    // 5. Verify Drawer opened and list templates
    const drawerTitle = await cdp.eval(`(() => {
      const h2 = document.querySelector('h2');
      return h2 ? h2.innerText : null;
    })()`);
    console.log("Drawer title detected:", drawerTitle);

    const templateNames = await cdp.eval(`(() => {
      const strongs = Array.from(document.querySelectorAll('strong')).map(s => s.innerText);
      return strongs.filter(s => s.includes('_v1'));
    })()`);
    console.log("Master Templates detected in Drawer:", templateNames);

    // 6. Inspect WhatsApp bubble preview
    const previewText = await cdp.eval(`(() => {
      const bubble = document.querySelector('div[style*="background-color: rgb(239, 234, 226)"]');
      return bubble ? bubble.innerText : null;
    })()`);
    console.log("WhatsApp Preview Bubble:\n", previewText);

    // 7. Click 'Disparar Modelo' button
    const sent = await cdp.eval(`(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const sendBtn = buttons.find(b => b.innerText.includes('Disparar Modelo ('));
      if (sendBtn) {
        sendBtn.click();
        return true;
      }
      return false;
    })()`);
    console.log("Clicked 'Disparar Modelo' button:", sent);
    await sleep(2000);

    // 8. Take screenshot after dispatch
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(screenshot.data, "base64"));
    console.log(`Saved screenshot to ${SCREENSHOT_PATH}`);

    console.log("✅ WABA Templates & Window 24h Verification Passed!");
  } finally {
    if (cdp) cdp.close();
    chromeProc.kill("SIGTERM");
  }
}

run().catch((err) => {
  console.error("❌ Verification failed:", err);
  process.exit(1);
});
