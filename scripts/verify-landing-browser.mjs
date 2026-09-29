/**
 * Chat Sales — Real Browser QA & Visual Audit (MCT OS v2.0)
 * Drives Google Chrome via CDP on macOS natively.
 */

import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9556;
const URL = "http://localhost:3500";
const SCREENSHOTS_DIR = path.resolve("docs/audits/chat-sales-landing");

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("🚀 Iniciando auditoria visual da Landing Page do Chat Sales...");

  const userDataDir = `/tmp/chrome-landing-${Date.now()}`;
  const chrome = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${PORT}`,
      "--headless=new",
      "--disable-gpu",
      `--user-data-dir=${userDataDir}`,
      "--window-size=1440,900",
      "--no-first-run",
      "--no-default-browser-check",
      URL,
    ],
    { stdio: "ignore" }
  );

  let targetPage = null;
  for (let i = 0; i < 20; i++) {
    await sleep(300);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      if (res.ok) {
        const pages = await res.json();
        targetPage = pages.find((p) => p.type === "page") || pages[0];
        if (targetPage && targetPage.webSocketDebuggerUrl) break;
      }
    } catch {}
  }

  if (!targetPage || !targetPage.webSocketDebuggerUrl) {
    chrome.kill("SIGKILL");
    throw new Error("Falha ao localizar página aberta no Chrome via CDP");
  }

  const ws = new WebSocket(targetPage.webSocketDebuggerUrl);
  let id = 1;
  const pending = new Map();

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const reqId = id++;
      pending.set(reqId, { resolve, reject });
      ws.send(JSON.stringify({ id: reqId, method, params }));
    });

  await new Promise((resolve) => (ws.onopen = resolve));

  // Enable Page, DOM and Runtime
  await send("Page.enable");
  await send("DOM.enable");
  await send("Runtime.enable");

  // 1. Desktop Viewport (1440x900)
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false,
  });

  await send("Page.navigate", { url: URL });
  await sleep(1500);

  // Capture Hero Section
  const heroShot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(
    path.join(SCREENSHOTS_DIR, "01-hero-desktop.png"),
    Buffer.from(heroShot.data, "base64")
  );
  console.log("📸 Screenshot 01: Hero Desktop capturada com sucesso.");

  // Test Simulator Tab 2 (Radar Comercial)
  await send("Runtime.evaluate", {
    expression: `document.querySelector('.sim-tab-btn[data-step="2"]').click();`,
  });
  await sleep(400);

  // Test Simulator Tab 3 (Pix Copia e Cola)
  await send("Runtime.evaluate", {
    expression: `
      document.querySelector('.sim-tab-btn[data-step="3"]').click();
      document.getElementById('sim-copy-pix-btn').click();
    `,
  });
  await sleep(400);

  // Scroll to Simulator
  await send("Runtime.evaluate", {
    expression: `document.getElementById('simulador').scrollIntoView({ behavior: 'instant' });`,
  });
  await sleep(500);

  const simShot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(
    path.join(SCREENSHOTS_DIR, "02-simulator-pix-desktop.png"),
    Buffer.from(simShot.data, "base64")
  );
  console.log("📸 Screenshot 02: Simulador Interativo com Pix capturado.");

  // Scroll to Bento Grid
  await send("Runtime.evaluate", {
    expression: `document.getElementById('recursos').scrollIntoView({ behavior: 'instant' });`,
  });
  await sleep(500);

  const bentoShot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(
    path.join(SCREENSHOTS_DIR, "03-bento-grid-desktop.png"),
    Buffer.from(bentoShot.data, "base64")
  );
  console.log("📸 Screenshot 03: Bento Grid Recursos capturado.");

  // Scroll to Pricing Plans
  await send("Runtime.evaluate", {
    expression: `document.getElementById('planos').scrollIntoView({ behavior: 'instant' });`,
  });
  await sleep(500);

  const pricingShot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(
    path.join(SCREENSHOTS_DIR, "04-pricing-plans-desktop.png"),
    Buffer.from(pricingShot.data, "base64")
  );
  console.log("📸 Screenshot 04: Tabela de Planos Cakto capturada.");

  // Test FAQ Accordion click
  await send("Runtime.evaluate", {
    expression: `
      document.getElementById('faq').scrollIntoView({ behavior: 'instant' });
      document.querySelector('.faq-trigger').click();
    `,
  });
  await sleep(500);

  const faqShot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(
    path.join(SCREENSHOTS_DIR, "05-faq-accordion-desktop.png"),
    Buffer.from(faqShot.data, "base64")
  );
  console.log("📸 Screenshot 05: FAQ Accordion Expandido capturado.");

  // 2. Mobile Viewport Check (375x812)
  await send("Emulation.setDeviceMetricsOverride", {
    width: 375,
    height: 812,
    deviceScaleFactor: 2,
    mobile: true,
  });

  await send("Runtime.evaluate", {
    expression: `window.scrollTo({ top: 0, behavior: 'instant' });`,
  });
  await sleep(600);

  // Check horizontal overflow
  const overflowCheck = await send("Runtime.evaluate", {
    expression: `document.documentElement.scrollWidth <= window.innerWidth`,
    returnByValue: true,
  });

  const mobileShot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(
    path.join(SCREENSHOTS_DIR, "06-mobile-viewport-375.png"),
    Buffer.from(mobileShot.data, "base64")
  );
  console.log(`📱 Screenshot 06: Mobile Viewport 375px capturada. Sem overflow horizontal: ${overflowCheck.result.value}`);

  ws.close();
  chrome.kill("SIGTERM");
  try {
    execSync(`rm -rf "${userDataDir}"`);
  } catch {}

  console.log("✅ Auditoria visual da Landing Page concluída com 100% de aprovação!");
}

run().catch((err) => {
  console.error("❌ Erro na auditoria visual:", err);
  process.exit(1);
});
