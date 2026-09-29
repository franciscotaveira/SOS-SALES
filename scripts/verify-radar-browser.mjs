import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pg from "./../packages/database/node_modules/pg/lib/index.js";
const { Pool } = pg;

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9466;
const BASE_URL = "http://localhost:3400";

const SCREENSHOT_BADGE = path.resolve("docs/audits/radar-cockpit-badge.png");
const SCREENSHOT_CARD = path.resolve("docs/audits/radar-suggestion-card.png");
const SCREENSHOT_DRAWER = path.resolve("docs/audits/radar-drawer-open.png");
const SCREENSHOT_ACCEPTED = path.resolve("docs/audits/radar-draft-accepted.png");

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function clickElement(cdp, selector, textMatch = null) {
  await cdp.eval(`
    (() => {
      let el;
      if (${textMatch ? JSON.stringify(textMatch) : "null"}) {
        const matches = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
        el = matches.find(m => m.textContent && m.textContent.includes(${JSON.stringify(textMatch)}));
      } else {
        el = document.querySelector(${JSON.stringify(selector)});
      }
      if (!el) throw new Error("Element not found: " + ${JSON.stringify(selector)});
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      el.click();
    })()
  `);
}

async function resetPendingSuggestion() {
  const pool = new Pool({
    connectionString:
      process.env.MIGRATION_DATABASE_URL ||
      "postgresql://sos_migration_owner:sos_migration_secret_2026@localhost:55440/sos_sales_v3?sslmode=disable",
  });

  const havenWorkspaceId = "22222222-2222-2222-2222-222222222222";
  const threadRes = await pool.query(
    `SELECT t.id as thread_id, c.id as contact_id, c.name, c.phone_e164
     FROM commercial_threads t
     JOIN contacts c ON c.id = t.contact_id
     WHERE t.workspace_id = $1 AND c.name LIKE '%Letícia%'
     LIMIT 1;`,
    [havenWorkspaceId]
  );

  if (threadRes.rows.length === 0) {
    await pool.end();
    throw new Error("Contato Letícia não encontrado.");
  }

  const { thread_id, contact_id, name: contact_name } = threadRes.rows[0];
  const idempotencyKey = `n8n-radar-${thread_id}-followup-v1`;

  // Reset to pending
  await pool.query(
    `UPDATE integration_suggestions
     SET status = 'pending', decided_at = NULL, decided_by_user_id = NULL, state_version = state_version + 1
     WHERE workspace_id = $1 AND idempotency_key = $2;`,
    [havenWorkspaceId, idempotencyKey]
  );

  console.log(`✅ Sugestão para '${contact_name}' resetada para 'pending' com sucesso.`);
  await pool.end();
}

async function main() {
  console.log("🚀 Iniciando Verificação Visual do F1 Radar...");

  await resetPendingSuggestion();

  let chromeProc = null;
  const tmpDir = path.resolve(`.tmp-haven-radar-${Date.now()}`);

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
        "--window-size=1440,1050",
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

    if (!versionData) throw new Error("Falha ao conectar no Chrome CDP");

    const newTabRes = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE_URL)}`, { method: "PUT" });
    const tabData = await newTabRes.json();
    const cdp = new CDPClient(tabData.webSocketDebuggerUrl);
    await cdp.ready();

    await cdp.send("Page.enable");
    await cdp.send("DOM.enable");
    await cdp.send("Runtime.enable");

    console.log("Aguardando carregamento da aplicação...");
    for (let i = 0; i < 30; i++) {
      const text = await cdp.eval(`document.querySelector('button[aria-haspopup="listbox"]')?.textContent || ''`);
      if (text && !text.includes("Carregando") && text.length > 5) {
        break;
      }
      await sleep(300);
    }

    // 1. Switch to Haven Workspace
    console.log("Selecionando workspace Haven Escovaria...");
    await clickElement(cdp, 'button[aria-haspopup="listbox"]');
    await sleep(500);

    await clickElement(cdp, 'div[role="listbox"] button[role="option"]', "Haven");

    for (let i = 0; i < 30; i++) {
      const text = await cdp.eval(`document.querySelector('button[aria-haspopup="listbox"]')?.textContent || ''`);
      if (text && text.includes("Haven")) {
        break;
      }
      await sleep(300);
    }
    await sleep(1500);

    // 2. Capture badge screenshot
    console.log("Capturando screenshot do Cockpit com Badge do Radar...");
    const snap1 = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(SCREENSHOT_BADGE, Buffer.from(snap1.data, "base64"));
    console.log(`📸 Salvo: ${SCREENSHOT_BADGE}`);

    // 3. Select thread for Letícia Bortoluzzi
    console.log("Aguardando fila de atendimento e selecionando Letícia Bortoluzzi...");
    for (let i = 0; i < 30; i++) {
      const hasLeticia = await cdp.eval(`
        (() => {
          const items = Array.from(document.querySelectorAll('[data-testid="thread-item"]'));
          return items.some(i => i.textContent && i.textContent.includes('Letícia'));
        })()
      `);
      if (hasLeticia) break;
      await sleep(300);
    }
    await clickElement(cdp, '[data-testid="thread-item"]', "Letícia");
    await sleep(1500);

    // Wait for Radar Suggestion Card in conversation
    for (let i = 0; i < 20; i++) {
      const cardExists = await cdp.eval(`document.querySelector('[data-testid^="radar-suggestion-"]') !== null`);
      if (cardExists) break;
      await sleep(300);
    }

    // 4. Capture Radar Suggestion Card in conversation
    console.log("Capturando screenshot do Card de Sugestão no Chat...");
    await cdp.eval(`
      (() => {
        const card = document.querySelector('[data-testid^="radar-suggestion-"]');
        if (card) card.scrollIntoView({ behavior: "instant", block: "center" });
      })()
    `);
    await sleep(500);
    const snap2 = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(SCREENSHOT_CARD, Buffer.from(snap2.data, "base64"));
    console.log(`📸 Salvo: ${SCREENSHOT_CARD}`);

    // 5. Open Radar Drawer
    console.log("Abrindo Drawer lateral do Radar...");
    await clickElement(cdp, '[data-testid="btn-radar-drawer"]');
    await sleep(1000);

    // 6. Capture Drawer screenshot
    console.log("Capturando screenshot do Drawer do Radar...");
    const snap3 = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(SCREENSHOT_DRAWER, Buffer.from(snap3.data, "base64"));
    console.log(`📸 Salvo: ${SCREENSHOT_DRAWER}`);

    // 7. Click "Aceitar & Usar Rascunho" in drawer
    console.log("Aceitando sugestão para preenchimento automático no composer...");
    await clickElement(cdp, 'div[role="dialog"] button', "Aceitar & Usar Rascunho");
    await sleep(1500);

    // 8. Capture composer with prefilled text
    console.log("Capturando screenshot do Composer com o rascunho preenchido...");
    await cdp.eval(`
      (() => {
        const input = document.querySelector('input[data-testid="message-input"]') || document.querySelector('input[type="text"][placeholder*="Responder"]');
        if (input) {
          input.scrollIntoView({ behavior: "instant", block: "center" });
          input.focus();
        }
      })()
    `);
    await sleep(500);
    const snap4 = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(SCREENSHOT_ACCEPTED, Buffer.from(snap4.data, "base64"));
    console.log(`📸 Salvo: ${SCREENSHOT_ACCEPTED}`);

    console.log("\n✅ Verificação Visual do F1 Radar concluída com sucesso!");

    cdp.close();
  } catch (err) {
    console.error("❌ Erro no teste visual:", err);
    process.exitCode = 1;
  } finally {
    if (chromeProc) {
      chromeProc.kill("SIGTERM");
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

main();
