import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9800 + Math.floor(Math.random() * 150);
const BASE_URL = "http://localhost:3400";
const TOKEN = process.env.TEST_JWT_TOKEN || "";
const OUTPUT_DIR = path.resolve("docs/audits/live-test");

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.callbacks = new Map();
    this.consoleLogs = [];
    this.exceptions = [];

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
      if (msg.method === "Runtime.consoleAPICalled") {
        const text = msg.params.args.map((a) => a.value || a.description).join(" ");
        this.consoleLogs.push(`[${msg.params.type}] ${text}`);
      }
      if (msg.method === "Runtime.exceptionThrown") {
        this.exceptions.push(msg.params.exceptionDetails);
      }
    };
  }

  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    return new Promise((resolve) => {
      this.ws.onopen = () => resolve();
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result?.value;
  }

  async screenshot(filename) {
    const res = await this.send("Page.captureScreenshot", { format: "png" });
    const buffer = Buffer.from(res.data, "base64");
    fs.writeFileSync(path.join(OUTPUT_DIR, filename), buffer);
    console.log(`📸 Screenshot salvo: ${filename}`);
  }
}

async function run() {
  console.log("================================================================================");
  console.log(" 🧪 SOS SALES V3 — TESTE E2E REAL EM CHROME HEADLESS");
  console.log("================================================================================");

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const tmpProfile = `/tmp/chrome-test-${Date.now()}`;
  fs.mkdirSync(tmpProfile, { recursive: true });

  console.log(`[1/6] Iniciando Chrome em porta ${PORT}...`);
  let chromeLogs = "";
  const proc = spawn(CHROME_PATH, [
    "--headless=new",
    "--disable-gpu",
    `--remote-debugging-port=${PORT}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${tmpProfile}`,
    "--window-size=1440,900",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "about:blank",
  ]);

  proc.stdout.on("data", (d) => { chromeLogs += d.toString(); });
  proc.stderr.on("data", (d) => { chromeLogs += d.toString(); });

  try {
    let versionData = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 400));
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
        if (res.ok) {
          versionData = await res.json();
          break;
        }
      } catch {}
    }

    if (!versionData) {
      console.error("Chrome Process Output:\n", chromeLogs);
      throw new Error("Não foi possível conectar ao Chrome");
    }

    const pagesRes = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const pages = await pagesRes.json();
    const target = pages.find((p) => p.type === "page") || pages[0];

    const cdp = new CDP(target.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send("Page.enable");
    await cdp.send("DOM.enable");
    await cdp.send("Runtime.enable");

    console.log(`[2/6] Navegando para ${BASE_URL}...`);
    await cdp.send("Page.navigate", { url: BASE_URL });
    await new Promise((r) => setTimeout(r, 3500));

    console.log("[3/6] Verificando auto-autenticação Demo e dados do Cockpit...");
    let pageText = await cdp.eval("document.body.innerText");
    let title = await cdp.eval("document.title");
    console.log(`  - Título da página: "${title}"`);

    // Se ainda não tiver carregado a demo, injeta e recarrega
    if (!pageText.includes("Chapecó Matriz")) {
      console.log("  - Injetando token demo no sessionStorage e recarregando...");
      await cdp.eval(`sessionStorage.setItem("sos_v3_lab_token", "${TOKEN}"); window.location.reload();`);
      await new Promise((r) => setTimeout(r, 3500));
      pageText = await cdp.eval("document.body.innerText");
    }

    console.log(`  - Texto na tela (primeiros 300 caracteres):\n${pageText.substring(0, 300)}\n---`);

    const hasWorkspace = pageText.includes("Chapecó Matriz");
    const hasMariana = pageText.includes("Mariana Costa");
    const hasCarlos = pageText.includes("Carlos Eduardo");
    const hasDevLab = pageText.includes("LABORATÓRIO DEV");

    console.log(`  - Barra de Laboratório presente: ${hasDevLab ? "SIM" : "NÃO"}`);
    console.log(`  - Workspace 'Chapecó Matriz' exibido: ${hasWorkspace ? "SIM" : "NÃO"}`);
    console.log(`  - Contato 'Dra. Mariana Costa' na lista: ${hasMariana ? "SIM" : "NÃO"}`);
    console.log(`  - Contato 'Carlos Eduardo Silva' na lista: ${hasCarlos ? "SIM" : "NÃO"}`);

    await cdp.screenshot("01-cockpit-loaded.png");

    console.log("[4/6] Selecionando thread ativa da Dra. Mariana Costa...");
    await cdp.eval(`
      const card = Array.from(document.querySelectorAll("strong")).find(el => el.innerText.includes("Mariana Costa"));
      if (card) {
        card.closest("div[style*='cursor: pointer']")?.click();
      }
    `);
    await new Promise((r) => setTimeout(r, 2000));
    await cdp.screenshot("02-thread-selected.png");

    console.log("[5/6] Enviando mensagem de resposta e registrando Venda Ganha...");
    // 5a. Digitar mensagem
    await cdp.eval(`
      const input = document.querySelector("input[placeholder*='Responder']");
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(input, "Olá Dra. Mariana, confirmamos o suporte a múltiplos atendentes e rastreio CAPI.");
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    `);
    await new Promise((r) => setTimeout(r, 500));

    // 5b. Clicar em Enviar
    await cdp.eval(`
      const sendBtn = Array.from(document.querySelectorAll("button")).find(b => b.innerText.includes("Enviar"));
      if (sendBtn) sendBtn.click();
    `);
    await new Promise((r) => setTimeout(r, 2500));
    await cdp.screenshot("02b-message-sent.png");

    // 5c. Registrar Venda Ganha
    console.log("  - Registrando desfecho comercial 'Venda Ganha'...");
    await cdp.eval(`
      const wonBtn = Array.from(document.querySelectorAll("button")).find(b => b.innerText.includes("Venda Ganha"));
      if (wonBtn) wonBtn.click();
    `);
    await new Promise((r) => setTimeout(r, 2000));
    await cdp.screenshot("02c-sale-won.png");

    console.log("[6/6] Navegando pelas abas do SOS Sales V3...");

    // Contatos
    console.log("  - Navegando para Contatos & Leads...");
    await cdp.eval(`document.querySelector("button[data-nav-id='contacts']")?.click();`);
    await new Promise((r) => setTimeout(r, 2000));
    await cdp.screenshot("03-contacts-page.png");

    // Disparos CAPI
    console.log("  - Navegando para Disparos CAPI...");
    await cdp.eval(`document.querySelector("button[data-nav-id='campaigns']")?.click();`);
    await new Promise((r) => setTimeout(r, 2000));
    await cdp.screenshot("04-campaigns-page.png");

    // Configurações
    console.log("  - Navegando para Configurações...");
    await cdp.eval(`document.querySelector("button[data-nav-id='settings']")?.click();`);
    await new Promise((r) => setTimeout(r, 2000));
    await cdp.screenshot("05-settings-page.png");

    // Retornar ao Cockpit
    console.log("  - Retornando ao Cockpit...");
    await cdp.eval(`document.querySelector("button[data-nav-id='cockpit']")?.click();`);
    await new Promise((r) => setTimeout(r, 1500));
    await cdp.screenshot("06-cockpit-restored.png");

    console.log("\n================================================================================");
    console.log(" ✅ RESULTADO DO TESTE E2E");
    console.log("================================================================================");
    if (cdp.exceptions.length > 0) {
      console.error(`❌ EXCEÇÕES NÃO TRATADAS DETECTADAS: ${cdp.exceptions.length}`);
      console.error(JSON.stringify(cdp.exceptions, null, 2));
    } else {
      console.log("🎉 ZERO EXCEÇÕES JAVASCRIPT! Nenhuma tela branca!");
    }
    console.log(`📊 Logs do console (${cdp.consoleLogs.length}):`);
    cdp.consoleLogs.forEach((l) => console.log("   ", l));
    console.log("================================================================================");

  } finally {
    proc.kill("SIGKILL");
    await new Promise((r) => setTimeout(r, 1000));
    try {
      fs.rmSync(tmpProfile, { recursive: true, force: true });
    } catch {}
  }
}

run().catch((err) => {
  console.error("FATAL ERROR IN TEST:", err);
  process.exit(1);
});
