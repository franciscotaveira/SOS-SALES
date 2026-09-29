import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9477;
const BASE_URL = "http://localhost:3400";

const SCREENSHOT_THREAD_A_DRAFT = path.resolve("docs/audits/e1-thread-a-draft.png");
const SCREENSHOT_THREAD_B_ISOLATED = path.resolve("docs/audits/e1-thread-b-isolated.png");
const SCREENSHOT_THREAD_A_RESTORED = path.resolve("docs/audits/e1-thread-a-restored.png");
const SCREENSHOT_PIX_DRAWER_CLEAN = path.resolve("docs/audits/e1-pix-drawer-clean.png");

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

async function setInputValue(cdp, selector, value) {
  await cdp.eval(`
    (() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error("Input not found: " + ${JSON.stringify(selector)});
      const tracker = el._valueTracker;
      if (tracker) {
        tracker.setValue('');
      }
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `);
}

async function main() {
  console.log("🚀 Iniciando Verificação de Confiança E1 (CS-01 & CS-02)...");

  let chromeProc = null;
  const tmpDir = path.resolve(`.tmp-e1-trust-${Date.now()}`);

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

    // Switch to Haven Workspace
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
    await sleep(2000);

    // Wait for at least 2 threads in list for Haven
    console.log("Aguardando lista de threads no Cockpit...");
    for (let i = 0; i < 30; i++) {
      const text = await cdp.eval(`document.querySelector('[data-testid="thread-item"]')?.textContent || ''`);
      if (text.includes("Mariana") || text.includes("Camila")) break;
      await sleep(300);
    }

    // 1. Select Thread A (first item)
    console.log("1. Selecionando Thread A...");
    await cdp.eval(`document.querySelectorAll('[data-testid="thread-item"]')[0].click()`);
    
    // Wait for message input to appear
    for (let i = 0; i < 30; i++) {
      const hasInput = await cdp.eval(`!!document.querySelector('input[data-testid="message-input"]')`);
      if (hasInput) break;
      await sleep(300);
    }
    await sleep(1000);

    const threadAName = await cdp.eval(`document.querySelectorAll('[data-testid="thread-item"]')[0].textContent.trim().slice(0, 20)`);
    console.log(`Thread A ativa: "${threadAName}"`);

    // Check deal value default is empty (CS-02: zero fake 1500,00)
    const initialDealVal = await cdp.eval(`
      (() => {
        const inp = document.querySelector('input[placeholder="0,00"]');
        return inp ? inp.value : null;
      })()
    `);
    console.log(`Valor do negócio inicial (deve ser vazio): "${initialDealVal}"`);
    if (initialDealVal !== "" && initialDealVal !== null) {
      throw new Error(`❌ VIOLAÇÃO CS-02: dealValue inicial não está limpo! Valor encontrado: "${initialDealVal}"`);
    }
    console.log(`✅ CS-02 verificado: dealValue inicial está limpo (sem '1500,00' fictício).`);

    // Type a unique draft for Thread A
    const testDraftA = "Rascunho isolado exclusivo da Thread A — " + Date.now();
    console.log(`Digitando rascunho na Thread A: "${testDraftA}"`);
    await setInputValue(cdp, 'input[data-testid="message-input"]', testDraftA);
    await sleep(500);

    const snap1 = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(SCREENSHOT_THREAD_A_DRAFT, Buffer.from(snap1.data, "base64"));
    console.log(`📸 Salvo: ${SCREENSHOT_THREAD_A_DRAFT}`);

    // 2. Switch to Thread B (second item)
    console.log("2. Alternando para Thread B...");
    await cdp.eval(`document.querySelectorAll('[data-testid="thread-item"]')[1].click()`);
    await sleep(1000);

    const threadBName = await cdp.eval(`document.querySelectorAll('[data-testid="thread-item"]')[1].textContent.trim().slice(0, 20)`);
    console.log(`Thread B ativa: "${threadBName}"`);

    const inputValThreadB = await cdp.eval(`document.querySelector('input[data-testid="message-input"]')?.value || ''`);
    console.log(`Valor do composer na Thread B (deve ser vazio): "${inputValThreadB}"`);

    if (inputValThreadB === "") {
      console.log("✅ CS-01 verificado: composer da Thread B está limpo (nenhum vazamento de rascunho de A para B)!");
    } else {
      throw new Error(`❌ VIOLAÇÃO CS-01: Rascunho da Thread A vazou para a Thread B: "${inputValThreadB}"`);
    }

    const snap2 = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(SCREENSHOT_THREAD_B_ISOLATED, Buffer.from(snap2.data, "base64"));
    console.log(`📸 Salvo: ${SCREENSHOT_THREAD_B_ISOLATED}`);

    // 3. Switch back to Thread A
    console.log("3. Retornando para Thread A...");
    await cdp.eval(`document.querySelectorAll('[data-testid="thread-item"]')[0].click()`);
    await sleep(1000);

    const inputValThreadARestored = await cdp.eval(`document.querySelector('input[data-testid="message-input"]')?.value || ''`);
    console.log(`Valor do composer ao retornar para Thread A: "${inputValThreadARestored}"`);

    if (inputValThreadARestored === testDraftA) {
      console.log("✅ CS-01 verificado: Rascunho da Thread A foi perfeitamente preservado!");
    } else {
      throw new Error(`❌ Falha: Rascunho da Thread A não foi restaurado. Obtido: "${inputValThreadARestored}"`);
    }

    const snap3 = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(SCREENSHOT_THREAD_A_RESTORED, Buffer.from(snap3.data, "base64"));
    console.log(`📸 Salvo: ${SCREENSHOT_THREAD_A_RESTORED}`);

    // 4. Open Pix Drawer and check zero defaults
    console.log("4. Abrindo Drawer Pix para inspecionar valores padrão...");
    await clickElement(cdp, '[data-testid="btn-pix-charge"]');
    await sleep(800);

    const pixTitleVal = await cdp.eval(`document.querySelector('[data-testid="input-pix-title"]')?.value || ''`);
    const pixAmountVal = await cdp.eval(`document.querySelector('[data-testid="input-pix-amount"]')?.value || ''`);
    console.log(`Título Pix no Drawer (deve ser vazio): "${pixTitleVal}"`);
    console.log(`Valor Pix no Drawer (deve ser vazio): "${pixAmountVal}"`);

    if (pixTitleVal !== "" || pixAmountVal !== "") {
      throw new Error(`❌ VIOLAÇÃO CS-02: Drawer Pix possui valores pré-preenchidos não autorizados: Title="${pixTitleVal}", Amount="${pixAmountVal}"`);
    }
    console.log("✅ CS-02 verificado: Drawer Pix inicia limpo (sem 'Plano Anual' ou '1497,00' fictícios)!");

    // Verify submit button disabled state when amount is empty
    const isSubmitDisabled = await cdp.eval(`document.querySelector('[data-testid="btn-submit-pix"]')?.disabled`);
    console.log(`Botão de envio de Pix desabilitado sem valor preenchido: ${isSubmitDisabled}`);
    if (!isSubmitDisabled) {
      throw new Error("❌ VIOLAÇÃO CS-02: Botão de envio de Pix deveria estar desabilitado quando valor está vazio.");
    }
    console.log("✅ CS-02 verificado: Botão de geração de Pix protegido contra submissões sem valor.");

    const snap4 = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(SCREENSHOT_PIX_DRAWER_CLEAN, Buffer.from(snap4.data, "base64"));
    console.log(`📸 Salvo: ${SCREENSHOT_PIX_DRAWER_CLEAN}`);

    // 5. Generate Two Distinct Pix Charges in Thread A (E1.1 Blockers Validation)
    console.log("\n5. Testando Duas Cobranças Pix Independentes na Mesma Thread...");

    // Charge 1: R$ 75,00
    console.log("Gerando Cobrança 1: R$ 75,00 (Corte e Escova)...");
    await setInputValue(cdp, '[data-testid="input-pix-title"]', "Corte e Escova");
    await setInputValue(cdp, '[data-testid="input-pix-amount"]', "75,00");
    await sleep(500);

    const btn1Disabled = await cdp.eval(`document.querySelector('[data-testid="btn-submit-pix"]')?.disabled`);
    console.log("Botão de envio da cobrança 1 está desabilitado?", btn1Disabled);

    await clickElement(cdp, '[data-testid="btn-submit-pix"]');
    await sleep(3000);

    const error1 = await cdp.eval(`document.querySelector('.alert, [role="alert"]')?.textContent || ''`);
    if (error1) console.log("Possível erro ao enviar Cobrança 1:", error1);

    // Charge 2: R$ 140,00
    console.log("Abrindo Drawer para Cobrança 2: R$ 140,00 (Tratamento Capilar)...");
    await clickElement(cdp, '[data-testid="btn-pix-charge"]');
    await sleep(1000);
    await setInputValue(cdp, '[data-testid="input-pix-title"]', "Tratamento Capilar");
    await setInputValue(cdp, '[data-testid="input-pix-amount"]', "140,00");
    await sleep(500);

    const btn2Disabled = await cdp.eval(`document.querySelector('[data-testid="btn-submit-pix"]')?.disabled`);
    console.log("Botão de envio da cobrança 2 está desabilitado?", btn2Disabled);

    await clickElement(cdp, '[data-testid="btn-submit-pix"]');
    await sleep(3000);

    const error2 = await cdp.eval(`document.querySelector('.alert, [role="alert"]')?.textContent || ''`);
    if (error2) console.log("Possível erro ao enviar Cobrança 2:", error2);

    // 6. Inspect Pix Cards in Timeline
    console.log("6. Inspecionando cards Pix gerados na timeline...");
    const cardsInfo = await cdp.eval(`
      (() => {
        const cards = Array.from(document.querySelectorAll('div')).filter(d => 
          d.textContent && d.textContent.includes('Cobrança Pix Enviada ao Cliente')
        );
        return cards.map(c => ({
          text: c.textContent.trim(),
          hasConfirmBtn: !!Array.from(c.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Conferir no Caixa')),
          hasManualOrigin: c.textContent.includes('Conferido no Caixa (Manual)'),
          isPending: c.textContent.includes('Aguardando Pagamento'),
        }));
      })()
    `);
    console.log(`Total de cards Pix encontrados: ${cardsInfo.length}`);
    if (cardsInfo.length < 2) {
      throw new Error(`❌ Esperado pelo menos 2 cards Pix na timeline, encontrado: ${cardsInfo.length}`);
    }

    console.log("✅ Duas cobranças Pix coexistem na mesma conversa.");

    // 7. Confirm the second charge manually (140,00)
    console.log("7. Acionando conferência manual no Caixa para o segundo card...");
    await cdp.eval(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button')).filter(b => 
          b.textContent && b.textContent.includes('Conferir no Caixa (Manual)')
        );
        if (buttons.length === 0) throw new Error("Botão 'Conferir no Caixa (Manual)' não encontrado!");
        const targetBtn = buttons[buttons.length - 1];
        targetBtn.click();
      })()
    `);
    await sleep(2000);

    // Verify card states are distinct (one settled manual, one pending)
    const afterConfirmInfo = await cdp.eval(`
      (() => {
        const cards = Array.from(document.querySelectorAll('div')).filter(d => 
          d.textContent && d.textContent.includes('Cobrança Pix Enviada ao Cliente')
        );
        return cards.map(c => ({
          hasConfirmBtn: !!Array.from(c.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Conferir no Caixa')),
          hasManualOrigin: c.textContent.includes('Conferido no Caixa (Manual)'),
          isPending: c.textContent.includes('Aguardando Pagamento'),
        }));
      })()
    `);
    console.log("Estado dos cards após conferência manual:", afterConfirmInfo.slice(-2));

    const manualCard = afterConfirmInfo.find(c => c.hasManualOrigin && !c.hasConfirmBtn);
    const pendingCard = afterConfirmInfo.find(c => c.isPending && c.hasConfirmBtn);

    if (!manualCard) {
      throw new Error("❌ VIOLAÇÃO: Card confirmado não apresentou '✓ Conferido no Caixa (Manual)' ou manteve botão de conferência!");
    }
    if (!pendingCard) {
      throw new Error("❌ VIOLAÇÃO: Outro card Pix foi incorretamente alterado! Cada card deve manter seu próprio estado.");
    }
    console.log("✅ Estados distintos verificados: card confirmado exibe origem manual e remove botão; card pendente permanece aguardando!");

    // Check pre-filled composer draft
    const cashierDraftThreadA = await cdp.eval(`document.querySelector('input[data-testid="message-input"]')?.value || ''`);
    console.log(`Rascunho preparado no composer após conferência: "${cashierDraftThreadA}"`);
    if (!cashierDraftThreadA.includes("conferido pelo caixa")) {
      throw new Error(`❌ VIOLAÇÃO: Rascunho de conferência não foi preparado no composer: "${cashierDraftThreadA}"`);
    }

    const snap5 = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.resolve("docs/audits/e1-pix-two-charges-distinct-states.png"), Buffer.from(snap5.data, "base64"));
    console.log("📸 Salvo: docs/audits/e1-pix-two-charges-distinct-states.png");

    // 8. Test draft persistence across thread switches (A -> B -> A)
    console.log("8. Testando persistência do rascunho de conferência ao alternar conversas (A -> B -> A)...");
    await cdp.eval(`document.querySelectorAll('[data-testid="thread-item"]')[1].click()`);
    await sleep(1000);

    const draftInThreadB = await cdp.eval(`document.querySelector('input[data-testid="message-input"]')?.value || ''`);
    if (draftInThreadB !== "") {
      throw new Error(`❌ VIOLAÇÃO: Rascunho da conferência de A vazou para Thread B: "${draftInThreadB}"`);
    }
    console.log("✅ Thread B permanece limpa.");

    // Switch back to Thread A
    await cdp.eval(`document.querySelectorAll('[data-testid="thread-item"]')[0].click()`);
    await sleep(1000);

    const draftInThreadARestored = await cdp.eval(`document.querySelector('input[data-testid="message-input"]')?.value || ''`);
    console.log(`Rascunho restaurado na Thread A: "${draftInThreadARestored}"`);
    if (draftInThreadARestored !== cashierDraftThreadA) {
      throw new Error(`❌ VIOLAÇÃO: Rascunho de conferência desapareceu após alternar conversas! Obtido: "${draftInThreadARestored}"`);
    }
    console.log("✅ Rascunho de conferência sobreviveu com 100% de integridade à alternância de conversas (A -> B -> A)!");

    const snap6 = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.resolve("docs/audits/e1-cashier-draft-persisted.png"), Buffer.from(snap6.data, "base64"));
    console.log("📸 Salvo: docs/audits/e1-cashier-draft-persisted.png");

    console.log("\n🎯 Todas as verificações de Confiança E1.1 (Cards independentes, origem manual e persistência de rascunho) passaram com 100% de sucesso!");

    cdp.close();
  } catch (err) {
    console.error("❌ Erro no teste visual E1:", err);
    process.exit(1);
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
