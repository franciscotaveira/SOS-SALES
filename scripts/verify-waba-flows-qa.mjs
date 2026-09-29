import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9520 + Math.floor(Math.random() * 300);
const BASE_URL = "http://localhost:3400";
const SCREENSHOT_PATH = path.resolve("docs/audits/waba-flows-cockpit.png");

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
  console.log("=== WABA Flows QA Runner via Chrome CDP ===");
  fs.mkdirSync(path.dirname(SCREENSHOT_PATH), { recursive: true });

  const profileDir = `/tmp/chrome-waba-flows-profile-${Date.now()}`;
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

    // Wait for threads to load
    let threadFound = false;
    for (let i = 0; i < 20; i++) {
      const hasThread = await cdp.eval(`(() => {
        const threadCard = document.querySelector('section[aria-label="Fila de Atendimento"] div[style*="cursor: pointer"]');
        return Boolean(threadCard);
      })()`);
      if (hasThread) {
        threadFound = true;
        break;
      }
      await sleep(500);
    }
    console.log("Thread found in queue:", threadFound);

    if (!threadFound) {
      const bodySnippet = await cdp.eval("document.body.innerText.substring(0, 300)");
      console.log("Current body snippet:", bodySnippet);
    }

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

    // 3. Find and click "Formulários Flow" button in composer
    const flowButtonClicked = await cdp.eval(`(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const btn = buttons.find((b) => b.innerText.includes("Formulários Flow") || b.title?.includes("Formulário"));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    })()`);
    console.log("Clicked Formulários Flow button:", flowButtonClicked);
    await sleep(1500);

    // 4. Verify Flow Drawer is open and inspection of contents
    const drawerInfo = await cdp.eval(`(() => {
      const drawerTitle = document.querySelector('h2, [style*="font-weight: 700"]');
      const allText = document.body.innerText;
      return {
        hasFlowsDrawer: allText.includes("Formulários do WhatsApp"),
        hasNativeBanner: allText.includes("Experiência Nativa no WhatsApp"),
        hasBookingFlow: allText.includes("Agendamento de Horário"),
        hasQualifyFlow: allText.includes("Qualificação Comercial"),
        hasNpsFlow: allText.includes("Pesquisa de Satisfação"),
        hasPreviewTitle: allText.includes("Pré-visualização no WhatsApp do Cliente"),
        hasSendCta: allText.includes("Enviar Formulário ao Cliente"),
      };
    })()`);
    console.log("Flow Drawer Inspection:", JSON.stringify(drawerInfo, null, 2));

    // 5. Select "Qualificação Comercial" to see preview switch
    const qualifyClicked = await cdp.eval(`(() => {
      const cards = Array.from(document.querySelectorAll('div[style*="cursor: pointer"]'));
      const qualifyCard = cards.find((c) => c.innerText.includes("Qualificação Comercial"));
      if (qualifyCard) {
        qualifyCard.click();
        return true;
      }
      return false;
    })()`);
    console.log("Selected Qualificação Comercial card:", qualifyClicked);
    await sleep(1000);

    // 6. Capture full screenshot of Cockpit with Flow Drawer open
    console.log("Capturing screenshot to", SCREENSHOT_PATH);
    const screenshotRes = await cdp.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(screenshotRes.data, "base64"));
    console.log("Screenshot saved successfully! Size:", fs.statSync(SCREENSHOT_PATH).size, "bytes");

    // 7. Click "Enviar Formulário ao Cliente 🚀" to test outbound flow dispatch
    const sendClicked = await cdp.eval(`(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const sendBtn = buttons.find((b) => b.innerText.includes("Enviar Formulário ao Cliente"));
      if (sendBtn) {
        sendBtn.click();
        return true;
      }
      return false;
    })()`);
    console.log("Clicked Enviar Formulário button:", sendClicked);
    await sleep(2500);

    // 8. Check if optimistic/dispatched message appears on the chat timeline
    const timelineCheck = await cdp.eval(`(() => {
      const allText = document.body.innerText;
      return {
        hasFlowBadgeOnTimeline: allText.includes("Formulário do WhatsApp (Flow)"),
        hasQualifyBody: allText.includes("Diagnóstico Comercial") || allText.includes("Iniciar Diagnóstico"),
      };
    })()`);
    console.log("Timeline Flow verification:", JSON.stringify(timelineCheck, null, 2));

  } catch (err) {
    console.error("Test failed with error:", err);
    process.exitCode = 1;
  } finally {
    if (cdp) cdp.close();
    try {
      process.kill(-chromeProc.pid, "SIGKILL");
    } catch {
      chromeProc.kill("SIGKILL");
    }
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch {}
  }
}

run();
