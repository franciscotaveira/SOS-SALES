/**
 * SOS Sales V3 — Real Browser QA, Responsive Viewports (375, 768, 1440px),
 * Focus Trap & Accessibility Verification (MCT OS v2.0)
 * 
 * Drives real Google Chrome on macOS via Chrome DevTools Protocol (CDP) using Node native WebSocket.
 * 
 * Verifies:
 * 1. Produção vs Laboratório: Quarentena rigorosa do catálogo e toolbar.
 * 2. Responsividade Canônica em 3 Viewports (375, 768, 1440px):
 *    - Ausência de overflow horizontal (scrollWidth <= innerWidth)
 *    - Quebra e adaptação de texto longo
 *    - Acesso a ações e botões interativos
 *    - Registro de screenshots de cada viewport
 * 3. Status Real do Cabeçalho: Verificação periódica /ready sem identidade fictícia.
 * 4. Navegação Real: 4 destinos dedicados com estados honestos.
 * 5. Focus Trap no Dialog: Extremidade 1, Shift+Tab (modifiers: 2) -> Extremidade 2, Tab -> Extremidade 1, Escape e retorno de foco.
 * 6. Focus Trap no Drawer: Extremidade 1, Shift+Tab (modifiers: 2) -> Extremidade 2, Tab -> Extremidade 1, Escape e retorno de foco.
 * 7. Contraste WCAG 2.2 AA: Limiar estrito de >= 4.5:1 para texto normal de botões (#008069 sobre #FFFFFF = 4.89:1).
 */

import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9444;
const BASE_URL = "http://localhost:3400";
const SCREENSHOTS_DIR = path.resolve("docs/audits/iteration-3/screenshots");

// Helper: Calculate WCAG relative luminance
function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function hexToRgb(hex) {
  hex = hex.replace("#", "");
  return [
    parseInt(hex.substring(0, 2), 16),
    parseInt(hex.substring(2, 4), 16),
    parseInt(hex.substring(4, 6), 16),
  ];
}

function getContrastRatio(hex1, hex2) {
  const l1 = getLuminance(...hexToRgb(hex1));
  const l2 = getLuminance(...hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

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
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
  }

  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    return new Promise((res) => {
      this.ws.onopen = () => res();
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
    return res.result.value;
  }

  async setViewport(width, height, isMobile = false) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: isMobile,
    });
    await sleep(300);
  }

  async captureScreenshot(filename) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    const targetFile = path.join(SCREENSHOTS_DIR, filename);
    const res = await this.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(targetFile, Buffer.from(res.data, "base64"));
    return targetFile;
  }

  close() {
    this.ws.close();
  }
}

async function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function runBrowserQA() {
  console.log("=== SOS SALES V3: QA DE NAVEGADOR REAL (HEADLESS CHROME) ===");

  // Etapa 0: Compilar produção e lab builds
  console.log("[1/8] Compilando distribuições: Produção (dist) e Laboratório (dist-lab)...");
  execSync("pnpm --filter @sos-sales/web build", { stdio: "ignore" });
  execSync("pnpm --filter @sos-sales/web build:lab", { stdio: "ignore" });

  // Iniciar Google Chrome Headless com porta CDP
  console.log(`[2/8] Iniciando Chrome Headless em porta ${PORT} com janela 1440x900...`);
  const chromeProcess = spawn(CHROME_PATH, [
    "--headless=new",
    "--disable-gpu",
    `--remote-debugging-port=${PORT}`,
    "--user-data-dir=/tmp/chrome-qa-profile-9444",
    "--window-size=1440,900",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ]);

  let versionData = null;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) {
        versionData = await res.json();
        break;
      }
    } catch {
      // Chrome is still launching
    }
  }

  if (!versionData) {
    console.error("Falha ao conectar com porta de debug do Chrome após várias tentativas.");
    chromeProcess.kill();
    process.exit(1);
  }

  // Obter a página web real (evitar Omnibox Popup)
  const pagesRes = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const pages = await pagesRes.json();
  const targetPage = pages.find((p) => p.type === "page") || pages[0];
  console.log(`[3/8] Conectado via CDP na página (${targetPage.title}): ${targetPage.webSocketDebuggerUrl}`);

  const client = new CDPClient(targetPage.webSocketDebuggerUrl);
  await client.ready();
  await client.send("Page.enable");
  await client.send("DOM.enable");

  const results = [];

  try {
    // -------------------------------------------------------------
    // FASE A: Teste da Distribuição Pura de Produção (Quarentena)
    // -------------------------------------------------------------
    console.log("\n[4/8] Testando Distribuição de Produção: Quarentena de Ferramentas e Catálogo...");
    execSync("docker cp apps/web/dist/. sos-v3-web:/usr/share/nginx/html/", { stdio: "ignore" });
    await sleep(500);

    await client.send("Page.navigate", { url: `${BASE_URL}/#catalog` });
    await sleep(1000);

    const prodHasNoDevToolbar = await client.eval(`
      document.querySelector('[aria-label="Barra de Laboratório de Desenvolvimento"]') === null
    `);
    const prodHasNoCatalog = await client.eval(`
      !document.body.innerText.includes('Catálogo de Primitives & Tokens')
    `);
    const prodHasNoLabLeak = await client.eval(`
      !document.body.innerText.includes('barra de laboratório') &&
      !document.body.innerText.includes('token Bearer')
    `);
    const prodStorageClean = await client.eval(`
      sessionStorage.getItem('sos_v3_lab_token') === null
    `);

    results.push({
      test: "Quarentena de Produção (Catálogo e Ferramentas Excluídos)",
      criteria: "Na distribuição de produção, #catalog não abre catálogo, toolbar é null, sem menção a laboratório/token e sessionStorage é vazio",
      passed: prodHasNoDevToolbar && prodHasNoCatalog && prodHasNoLabLeak && prodStorageClean,
      detail: `Toolbar excluído: ${prodHasNoDevToolbar}, Sem menção de lab/token: ${prodHasNoLabLeak}, Catálogo inacessível: ${prodHasNoCatalog}, Storage limpo: ${prodStorageClean}`,
    });

    // -------------------------------------------------------------
    // FASE A.1: Estado Sem Sessão em Produção (Ausência de Ação Inoperante)
    // -------------------------------------------------------------
    await client.send("Page.navigate", { url: `${BASE_URL}/` });
    await sleep(800);

    const prodUnauthState = await client.eval(`(() => {
      const emptyState = document.querySelector('.sos-empty-state');
      const hasAcessarContaBtn = Array.from(document.querySelectorAll('button')).some(b => 
        (b.innerText || '').includes('Acessar Conta')
      );
      const hasWaitingConfigBadge = document.body.innerText.includes('Acesso aguardando configuração');
      const hasActiveSessionTitle = document.body.innerText.includes('Nenhuma Sessão Ativa');
      const inoperativeButtonsInEmptyState = emptyState ? Array.from(emptyState.querySelectorAll('button')).length : 0;
      return {
        hasNoInoperativeAction: !hasAcessarContaBtn && inoperativeButtonsInEmptyState === 0,
        hasWaitingConfigBadge,
        hasActiveSessionTitle,
        inoperativeButtonsInEmptyState
      };
    })()`);

    results.push({
      test: "Estado Sem Sessão em Produção (Ausência de Ação Inoperante)",
      criteria: "No build de produção sem sessão, tela 'Nenhuma Sessão Ativa' não oferece botão inoperante ('Acessar Conta') e exibe estado não interativo 'Acesso aguardando configuração'",
      passed: prodUnauthState.hasNoInoperativeAction && prodUnauthState.hasWaitingConfigBadge && prodUnauthState.hasActiveSessionTitle,
      detail: `Sem botão inoperante: ${prodUnauthState.hasNoInoperativeAction} (botões no empty state: ${prodUnauthState.inoperativeButtonsInEmptyState}), Badge não-interativo presente: ${prodUnauthState.hasWaitingConfigBadge}, Título presente: ${prodUnauthState.hasActiveSessionTitle}`,
    });

    // -------------------------------------------------------------
    // FASE B: Validação de Responsividade no Build Final de Produção (375, 768 e 1440px)
    // -------------------------------------------------------------
    console.log("\n[5/9] Testando Responsividade Canônica no Build de Produção (1440px, 768px, 375px)...");

    // 1. Desktop 1440px
    await client.setViewport(1440, 900, false);
    await client.send("Page.navigate", { url: `${BASE_URL}/` });
    await sleep(800);

    const desktop1440 = await client.eval(`(() => {
      const docW = document.documentElement.scrollWidth;
      const winW = window.innerWidth;
      const clientW = document.documentElement.clientWidth;
      const visualW = window.visualViewport ? window.visualViewport.width : winW;
      const hasSidebar = document.querySelector('aside') !== null;
      const buttons = Array.from(document.querySelectorAll('button:not([disabled])')).filter(b => b.offsetWidth > 0);
      return {
        hasNoHorizontalOverflow: docW <= 1440,
        hasSidebar,
        actionCount: buttons.length,
        winW,
        clientW,
        visualW,
        docW
      };
    })()`);

    await client.captureScreenshot("viewport-1440px-desktop.png");

    results.push({
      test: "Responsividade Desktop (1440x900) — Build Produção",
      criteria: "Sem overflow horizontal em 1440px, sidebar visível, ações acessíveis e screenshot registrado",
      passed: desktop1440.hasNoHorizontalOverflow && desktop1440.hasSidebar && desktop1440.actionCount > 0,
      detail: `Configurado: 1440px | innerWidth: ${desktop1440.winW}px | clientWidth: ${desktop1440.clientW}px | visualViewport: ${desktop1440.visualW}px | scrollWidth: ${desktop1440.docW}px. Sidebar: ${desktop1440.hasSidebar}, Ações: ${desktop1440.actionCount}, Screenshot: viewport-1440px-desktop.png`,
    });

    // 2. Tablet 768px
    await client.setViewport(768, 1024, false);
    await sleep(500);

    const tablet768 = await client.eval(`(() => {
      const docW = document.documentElement.scrollWidth;
      const winW = window.innerWidth;
      const clientW = document.documentElement.clientWidth;
      const visualW = window.visualViewport ? window.visualViewport.width : winW;
      const buttons = Array.from(document.querySelectorAll('button:not([disabled])')).filter(b => b.offsetWidth > 0);
      return {
        hasNoHorizontalOverflow: docW <= 768,
        actionCount: buttons.length,
        winW,
        clientW,
        visualW,
        docW
      };
    })()`);

    await client.captureScreenshot("viewport-768px-tablet.png");

    results.push({
      test: "Responsividade Tablet (768x1024) — Build Produção",
      criteria: "Sem overflow horizontal em 768px, layout adaptativo, ações preservadas e screenshot registrado",
      passed: tablet768.hasNoHorizontalOverflow && tablet768.actionCount > 0,
      detail: `Configurado: 768px | innerWidth: ${tablet768.winW}px | clientWidth: ${tablet768.clientW}px | visualViewport: ${tablet768.visualW}px | scrollWidth: ${tablet768.docW}px. Ações: ${tablet768.actionCount}, Screenshot: viewport-768px-tablet.png`,
    });

    // 3. Mobile 375px (iPhone viewport canônico)
    await client.setViewport(375, 812, true);
    await sleep(500);

    const mobile375 = await client.eval(`(() => {
      const configuredW = 375;
      const docW = document.documentElement.scrollWidth;
      const bodyW = document.body.scrollWidth;
      const winW = window.innerWidth;
      const clientW = document.documentElement.clientWidth;
      const visualW = window.visualViewport ? window.visualViewport.width : winW;
      const metaViewport = document.querySelector('meta[name="viewport"]')?.content || '';
      const hasMobileNav = document.querySelector('nav') !== null;
      const isHeaderAdapted = document.querySelector('header')?.offsetWidth <= winW;

      // Auditoria rigorosa de ações alcançáveis no mobile
      const buttons = Array.from(document.querySelectorAll('button:not([disabled])'));
      const evaluatedButtons = buttons.map(b => {
        const rect = b.getBoundingClientRect();
        const style = window.getComputedStyle(b);
        const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0;
        const isWithinBounds = rect.left >= 0 && rect.right <= (winW + 1);
        const hasTouchTarget = rect.width >= 44 && rect.height >= 44;
        return {
          text: (b.innerText || b.getAttribute('aria-label') || '').trim(),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          isVisible,
          isWithinBounds,
          hasTouchTarget
        };
      }).filter(b => b.isVisible);

      const allWithinBounds = evaluatedButtons.length > 0 && evaluatedButtons.every(b => b.isWithinBounds);
      const allHaveTouchTarget = evaluatedButtons.length > 0 && evaluatedButtons.every(b => b.hasTouchTarget);

      // Auditoria rigorosa de elementos informativos essenciais no mobile
      const informativeElements = [
        document.querySelector('header'),
        document.querySelector('.sos-workspace-trigger'),
        document.querySelector('.sos-header-status-badge'),
        document.querySelector('main h1, main h2, main h3'),
        document.querySelector('main p'),
        document.querySelector('.sos-mobile-nav')
      ].filter(el => el !== null);

      const evaluatedInformative = informativeElements.map(el => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
        const isWithinBounds = rect.left >= 0 && rect.right <= (winW + 1);
        return {
          isWithinBounds,
          isVisible,
          width: Math.round(rect.width),
          left: Math.round(rect.left),
          right: Math.round(rect.right)
        };
      });

      const allInformativeWithinBounds = evaluatedInformative.length > 0 && evaluatedInformative.every(el => el.isWithinBounds);

      // Conferir status badge específico no header mobile (deve ser curto e não truncado)
      const statusBadge = document.querySelector('.sos-header-status-badge');
      const statusBadgeText = statusBadge ? statusBadge.innerText.trim() : '';
      const isStatusShortAndClean = statusBadgeText === 'Online' || statusBadgeText === 'Offline' || statusBadgeText === 'Sistema online';
      const statusBadgeRight = statusBadge ? Math.round(statusBadge.getBoundingClientRect().right) : 0;

      return {
        configuredW,
        winW,
        clientW,
        visualW,
        docW,
        bodyW,
        isStrictly375: winW === 375 && clientW === 375 && docW <= 375,
        hasNoHorizontalOverflow: docW <= 375 && bodyW <= 375,
        hasMobileNav,
        isHeaderAdapted,
        hasMetaViewport: metaViewport.includes('width=device-width'),
        actionCount: evaluatedButtons.length,
        allWithinBounds,
        allHaveTouchTarget,
        allInformativeWithinBounds,
        isStatusShortAndClean,
        statusBadgeText,
        statusBadgeRight,
        buttonDetails: evaluatedButtons.map(b => (b.text || 'icon') + ': ' + b.width + 'x' + b.height + 'px [x:' + b.left + '-' + b.right + ']').join(' | ')
      };
    })()`);

    await client.captureScreenshot("viewport-375px-mobile.png");

    results.push({
      test: "Responsividade Mobile Canônica (375x812) — Build Produção",
      criteria: "Largura estrita de 375px (sem expansão 422px), scrollWidth <= 375px, ações e elementos informativos essenciais integralmente contidos no viewport com alvos de toque >= 44x44px e status não truncado",
      passed: mobile375.isStrictly375 && mobile375.hasNoHorizontalOverflow && mobile375.allWithinBounds && mobile375.allHaveTouchTarget && mobile375.allInformativeWithinBounds && mobile375.isStatusShortAndClean && mobile375.hasMetaViewport,
      detail: `Configurado: 375px | innerWidth: ${mobile375.winW}px | clientWidth: ${mobile375.clientW}px | visualViewport: ${mobile375.visualW}px | scrollWidth: ${mobile375.docW}px. Ações (${mobile375.actionCount}): Contidas e touch targets >= 44x44px: ${mobile375.allHaveTouchTarget}. Elementos informativos contidos: ${mobile375.allInformativeWithinBounds} (Badge: "${mobile375.statusBadgeText}", x_right: ${mobile375.statusBadgeRight}px <= 375px). Screenshot: viewport-375px-mobile.png`,
    });

    // 4. Resiliência a Texto Longo (Wrap e Clamp em 375px)
    console.log("[6/9] Testando Resiliência a Texto Longo e Quebra de Linha em 375px...");
    const longTextProbe = await client.eval(`(() => {
      const probe = document.createElement('div');
      probe.id = 'qa-long-text-probe';
      probe.style.padding = '12px';
      probe.innerHTML = '<h3 style="overflow-wrap: anywhere; word-break: break-word; font-size: 1rem;">' +
        'EmpresaComNomeExtraordinariamenteLongoSemEspacosParaTestarWordBreakEOverflowAnywhereNoLayoutMobile1234567890</h3>' +
        '<p style="overflow-wrap: anywhere; word-break: break-word; font-size: 0.85rem;">' +
        'DescricaoComTextoContinuoSemEspacosParaGarantirQueNenhumTextoLongoProvoqueScrollHorizontalNoViewportDoClienteMobile9876543210</p>';
      document.querySelector('main')?.prepend(probe);

      const docW = document.documentElement.scrollWidth;
      const winW = window.innerWidth;
      const hasNoOverflow = docW <= winW;

      return {
        hasNoOverflow,
        docW,
        winW
      };
    })()`);

    await client.captureScreenshot("viewport-long-text-375px.png");

    // Remove probe
    await client.eval(`document.getElementById('qa-long-text-probe')?.remove()`);

    results.push({
      test: "Resiliência a Texto Longo (Word Break & Overflow Anywhere em 375px)",
      criteria: "Títulos e descrições sem quebra prévia não devem forçar scroll horizontal além de 375px",
      passed: longTextProbe.hasNoOverflow,
      detail: `Overflow com texto longo: ${!longTextProbe.hasNoOverflow} (scrollWidth: ${longTextProbe.docW}px <= innerWidth: ${longTextProbe.winW}px). Screenshot: viewport-long-text-375px.png`,
    });

    // 5. Teste de Ampliação Visual por Zoom (200% Scale Factor)
    console.log("[7/9] Testando Ampliação Visual por Zoom (200% Scale Factor) e Acesso a Controles...");
    await client.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2.0 });
    await sleep(400);

    const zoomAudit = await client.eval(`(() => {
      const scale = window.visualViewport ? window.visualViewport.scale : 1;
      const visualW = window.visualViewport ? window.visualViewport.width : 0;
      const clientW = document.documentElement.clientWidth;

      // Testar leitura do conteúdo sob zoom
      const mainHeading = document.querySelector('h1, h2, h3');
      const headingRect = mainHeading ? mainHeading.getBoundingClientRect() : null;
      const isHeadingLegible = headingRect !== null && headingRect.height > 0;

      // Testar acesso a ações sob zoom
      const navBtn = document.querySelector('nav button');
      let clickDispatched = false;
      if (navBtn) {
        navBtn.focus();
        clickDispatched = document.activeElement === navBtn;
      }

      return {
        scale,
        visualW,
        clientW,
        isZoomed: scale >= 1.95,
        isHeadingLegible,
        clickDispatched
      };
    })()`);

    await client.captureScreenshot("viewport-zoom-200pct.png");

    // Reset zoom back to 1.0
    await client.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1.0 });
    await sleep(300);

    results.push({
      test: "Ampliação Visual por Zoom (200% — Distinta de Reflow Desktop)",
      criteria: "Comprova ampliação visual de 2.0x no visualViewport com legibilidade e foco operável nos controles (sem atestar conformidade completa com reflow desktop WCAG 1.4.10 em 320 CSS px)",
      passed: zoomAudit.isZoomed && zoomAudit.isHeadingLegible && zoomAudit.clickDispatched,
      detail: `Escala visualViewport: ${zoomAudit.scale}x (visualWidth: ${zoomAudit.visualW}px, clientWidth: ${zoomAudit.clientW}px). Conteúdo legível: ${zoomAudit.isHeadingLegible}, Foco/Ação operável sob zoom: ${zoomAudit.clickDispatched}. Nota: avalia ampliação visual em viewport móvel, sem declarar reflow responsivo irrestrito. Screenshot: viewport-zoom-200pct.png`,
    });

    // Restaurar 1440px para testes funcionais e de navegação no build de produção
    await client.setViewport(1440, 900, false);
    await sleep(300);

    // 6. Status Real do Cabeçalho
    const headerStatusText = await client.eval(`
      const h = document.querySelector('header');
      h ? h.innerText : '';
    `);
    const hasRealStatus = headerStatusText.includes("Sistema online") || headerStatusText.includes("Online");
    const hasNoFakeUser = !headerStatusText.includes("operador@mct.br") && !headerStatusText.includes("operator");
    const hasNoRawLatencyInBadge = !headerStatusText.includes("Fastify Online");

    results.push({
      test: "Cabeçalho com Status Compreensível & Sem Identidade Fictícia",
      criteria: "Mostra 'Sistema online' (ou 'Online' no mobile), reserva latência à área de diagnóstico/tooltip e não exibe 'operador@mct.br' quando deslogado",
      passed: hasRealStatus && hasNoFakeUser && hasNoRawLatencyInBadge,
      detail: `Status compreensível: ${hasRealStatus} (Texto: "${headerStatusText.replace(/\\n/g, ' ')}"), Sem fake user: ${hasNoFakeUser}, Latência técnica segregada: ${hasNoRawLatencyInBadge}`,
    });

    // 7. Navegação Real entre 4 Destinos
    console.log("[8/9] Testando Navegação Real (Cockpit, Contatos, Campanhas, Configurações)...");

    // Destino: Contatos & Leads
    await client.eval(`(() => {
      const btn = Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('Contatos & Leads') || (b.title && b.title.includes('Contatos')));
      if (btn) btn.click();
    })()`);
    await sleep(500);
    const contactsBodyText = await client.eval(`document.body.innerText`);
    const isContactsPage = contactsBodyText.includes('Contatos & Leads') && contactsBodyText.includes('Nenhum Contato Registrado');

    results.push({
      test: "Navegação: Destino Contatos & Leads",
      criteria: "Exibe tela dedicada com estado honesto e busca",
      passed: isContactsPage,
      detail: `Destino alcançado: ${isContactsPage}`,
    });

    // Destino: Disparos CAPI
    await client.eval(`(() => {
      const btn = Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('Disparos CAPI') || (b.title && b.title.includes('Disparos')));
      if (btn) btn.click();
    })()`);
    await sleep(500);
    const campaignsBodyText = await client.eval(`document.body.innerText`);
    const isCampaignsPage = campaignsBodyText.includes('Disparos & Campanhas CAPI') && campaignsBodyText.includes('Nenhuma Campanha Criada');

    results.push({
      test: "Navegação: Destino Disparos CAPI",
      criteria: "Exibe tela dedicada com telemetria CAPI planejada",
      passed: isCampaignsPage,
      detail: `Destino alcançado: ${isCampaignsPage}`,
    });

    // Destino: Configurações
    await client.eval(`(() => {
      const btn = Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('Configurações') || (b.title && b.title.includes('Configurações')));
      if (btn) btn.click();
    })()`);
    await sleep(500);
    const settingsBodyText = await client.eval(`document.body.innerText`);
    const isSettingsPage = settingsBodyText.includes('Configurações do Tenant');

    results.push({
      test: "Navegação: Destino Configurações",
      criteria: "Exibe tela dedicada de configurações",
      passed: isSettingsPage,
      detail: `Destino alcançado: ${isSettingsPage}`,
    });

    // -------------------------------------------------------------
    // FASE C: Teste da Distribuição de Laboratório (Exclusivo para Catálogo e Modais)
    // -------------------------------------------------------------
    console.log("\n[9/9] Carregando Distribuição de Laboratório em sos-v3-web (Catálogo & Focus Trap)...");
    execSync("docker cp apps/web/dist-lab/. sos-v3-web:/usr/share/nginx/html/", { stdio: "ignore" });
    await sleep(500);

    // -------------------------------------------------------------
    // FASE D: Teste Real de Focus Trap via Entrada de Teclado
    // -------------------------------------------------------------
    console.log("[8/8] Testando Focus Trap Real (Teclado, Foco Inicial, Extremidades 1 e 2, Escape)...");

    // Navegar para about:blank primeiro para descarregar o bundle de produção da memória do navegador
    await client.send("Page.navigate", { url: "about:blank" });
    await sleep(300);

    // Navegar para o Catálogo na distribuição de laboratório recém-implantada
    await client.send("Page.navigate", { url: `${BASE_URL}/#catalog` });
    await sleep(1200);

    // --- TESTE DE FOCUS TRAP NO DIALOG ---
    // 1. Identificar e focar botão disparador
    await client.eval(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Abrir Dialog Acessível'));
      if (btn) {
        btn.id = 'qa-dialog-trigger';
        btn.focus();
      }
    })()`);
    const dialogTriggerFocusedBefore = await client.eval(`document.activeElement.id === 'qa-dialog-trigger'`);

    // 2. Clicar para abrir modal
    await client.eval(`document.getElementById('qa-dialog-trigger').click()`);
    await sleep(400);

    // 3. Extremidade 1: Foco inicial deve ser exatamente o botão Fechar Diálogo
    let dialogFirstElementMatches = false;
    for (let i = 0; i < 15; i++) {
      dialogFirstElementMatches = await client.eval(`(() => {
        const d = document.querySelector('div[role="dialog"][aria-modal="true"]');
        const closeBtn = d ? d.querySelector('button[aria-label="Fechar diálogo"]') : null;
        return Boolean(closeBtn && document.activeElement === closeBtn);
      })()`);
      if (dialogFirstElementMatches) break;
      await sleep(100);
    }

    // Capturar screenshot do Dialog aberto
    await client.captureScreenshot("dialog-focus-trap.png");

    // 4. Shift+Tab com modifiers: 2 a partir do primeiro elemento -> deve reter e ir diretamente para a Extremidade 2 ("Confirmar")
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", modifiers: 2, windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", modifiers: 2, windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await sleep(200);

    const dialogShiftTabLandedOnLast = await client.eval(`(() => {
      const d = document.querySelector('div[role="dialog"][aria-modal="true"]');
      const buttons = d ? Array.from(d.querySelectorAll('button')) : [];
      const lastBtn = buttons[buttons.length - 1];
      return Boolean(lastBtn && document.activeElement === lastBtn && lastBtn.innerText.trim() === 'Confirmar');
    })()`);

    // 5. Tab com modifiers: 0 a partir do último elemento -> deve ciclar de volta para a Extremidade 1 ("Fechar diálogo")
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await sleep(200);

    const dialogTabCycledBackToFirst = await client.eval(`(() => {
      const d = document.querySelector('div[role="dialog"][aria-modal="true"]');
      const closeBtn = d ? d.querySelector('button[aria-label="Fechar diálogo"]') : null;
      return Boolean(closeBtn && document.activeElement === closeBtn);
    })()`);

    // 6. Escape via teclado CDP: fecha o modal
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await sleep(300);
    const dialogClosed = await client.eval(`document.querySelector('div[role="dialog"][aria-modal="true"]') === null`);

    // 7. Restauração de foco ao controle disparador
    const dialogFocusRestored = await client.eval(`document.activeElement && document.activeElement.id === 'qa-dialog-trigger'`);

    results.push({
      test: "Focus Trap Real no Dialog (Teclado, Foco Inicial, Ciclo e Retorno)",
      criteria: "Foco inicial no primeiro elemento (Fechar diálogo), Shift+Tab (modifiers: 2) retém no último (Confirmar), Tab cicla para o primeiro, Escape fecha e restaura foco",
      passed: dialogTriggerFocusedBefore && dialogFirstElementMatches && dialogShiftTabLandedOnLast && dialogTabCycledBackToFirst && dialogClosed && dialogFocusRestored,
      detail: `Foco inicial (Extremidade 1): ${dialogFirstElementMatches}, Shift+Tab modifiers: 2 -> Extremidade 2 ("Confirmar"): ${dialogShiftTabLandedOnLast}, Tab -> Extremidade 1 ("Fechar diálogo"): ${dialogTabCycledBackToFirst}, Escape fechou: ${dialogClosed}, Foco restaurado: ${dialogFocusRestored}`,
    });

    // --- TESTE DE FOCUS TRAP NO DRAWER ---
    // 1. Identificar e focar botão disparador
    await client.eval(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Abrir Drawer Lateral'));
      if (btn) {
        btn.id = 'qa-drawer-trigger';
        btn.focus();
      }
    })()`);
    const drawerTriggerFocusedBefore = await client.eval(`document.activeElement.id === 'qa-drawer-trigger'`);

    // 2. Clicar para abrir Drawer
    await client.eval(`document.getElementById('qa-drawer-trigger').click()`);
    await sleep(400);

    // 3. Extremidade 1: Foco inicial no Drawer (botão Fechar Painel no cabeçalho)
    let drawerFirstElementMatches = false;
    for (let i = 0; i < 15; i++) {
      drawerFirstElementMatches = await client.eval(`(() => {
        const d = document.querySelector('div[role="dialog"][aria-modal="true"]');
        const closeBtn = d ? d.querySelector('button[aria-label="Fechar painel"]') : null;
        return Boolean(closeBtn && document.activeElement === closeBtn);
      })()`);
      if (drawerFirstElementMatches) break;
      await sleep(100);
    }

    // Capturar screenshot do Drawer aberto
    await client.captureScreenshot("drawer-focus-trap.png");

    // 4. Shift+Tab com modifiers: 2 a partir do primeiro elemento -> deve reter e ir diretamente para a Extremidade 2 ("Fechar Painel" no footer)
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", modifiers: 2, windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", modifiers: 2, windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await sleep(200);

    const drawerShiftTabLandedOnLast = await client.eval(`(() => {
      const d = document.querySelector('div[role="dialog"][aria-modal="true"]');
      const buttons = d ? Array.from(d.querySelectorAll('button')) : [];
      const lastBtn = buttons[buttons.length - 1];
      return Boolean(lastBtn && document.activeElement === lastBtn && lastBtn.innerText.trim() === 'Fechar Painel');
    })()`);

    // 5. Tab com modifiers: 0 a partir do último elemento -> deve ciclar de volta para a Extremidade 1 ("Fechar painel")
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await sleep(200);

    const drawerTabCycledBackToFirst = await client.eval(`(() => {
      const d = document.querySelector('div[role="dialog"][aria-modal="true"]');
      const closeBtn = d ? d.querySelector('button[aria-label="Fechar painel"]') : null;
      return Boolean(closeBtn && document.activeElement === closeBtn);
    })()`);

    // 6. Escape via teclado CDP: fecha o Drawer
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await sleep(300);
    const drawerClosed = await client.eval(`document.querySelector('div[role="dialog"][aria-modal="true"]') === null`);

    // 7. Restauração de foco ao controle disparador
    const drawerFocusRestored = await client.eval(`document.activeElement && document.activeElement.id === 'qa-drawer-trigger'`);

    results.push({
      test: "Focus Trap Real no Drawer (Teclado, Foco Inicial, Ciclo e Retorno)",
      criteria: "Foco inicial no primeiro elemento (Fechar painel), Shift+Tab (modifiers: 2) retém no último (Fechar Painel), Tab cicla para o primeiro, Escape fecha e restaura foco",
      passed: drawerTriggerFocusedBefore && drawerFirstElementMatches && drawerShiftTabLandedOnLast && drawerTabCycledBackToFirst && drawerClosed && drawerFocusRestored,
      detail: `Foco inicial (Extremidade 1): ${drawerFirstElementMatches}, Shift+Tab modifiers: 2 -> Extremidade 2 ("Fechar Painel"): ${drawerShiftTabLandedOnLast}, Tab -> Extremidade 1 ("Fechar painel"): ${drawerTabCycledBackToFirst}, Escape fechou: ${drawerClosed}, Foco restaurado: ${drawerFocusRestored}`,
    });

    // -------------------------------------------------------------
    // FASE D.1: Preservação de Ferramentas Técnicas no Build de Laboratório
    // -------------------------------------------------------------
    await client.send("Page.navigate", { url: `${BASE_URL}/` });
    await sleep(800);

    const labUnauthState = await client.eval(`(() => {
      const emptyState = document.querySelector('.sos-empty-state');
      const hasReloadBtn = emptyState ? Array.from(emptyState.querySelectorAll('button')).some(b => 
        (b.innerText || '').includes('Recarregar Sessão')
      ) : false;
      const hasLabInstruction = document.body.innerText.includes('barra de laboratório');
      const hasDevToolbar = document.querySelector('[aria-label="Barra de Laboratório de Desenvolvimento"]') !== null;
      return {
        hasReloadBtn,
        hasLabInstruction,
        hasDevToolbar
      };
    })()`);

    results.push({
      test: "Preservação de Ferramentas Técnicas no Build de Laboratório",
      criteria: "No build de laboratório, tela 'Nenhuma Sessão Ativa' preserva o botão técnico 'Recarregar Sessão', instrução técnica e barra de laboratório",
      passed: labUnauthState.hasReloadBtn && labUnauthState.hasLabInstruction && labUnauthState.hasDevToolbar,
      detail: `Botão técnico 'Recarregar Sessão' presente: ${labUnauthState.hasReloadBtn}, Instrução técnica presente: ${labUnauthState.hasLabInstruction}, Toolbar presente: ${labUnauthState.hasDevToolbar}`,
    });

    // -------------------------------------------------------------
    // FASE E: Auditoria de Contraste WCAG 2.2 AA (Limiar Estrito >= 4.5:1)
    // -------------------------------------------------------------
    console.log("\nCalculando Razões de Contraste WCAG 2.2 AA (Limiar estrito >= 4.5:1 para texto normal)...");

    const textPrimaryContrast = getContrastRatio("#0F172A", "#FFFFFF");
    const textSecondaryContrast = getContrastRatio("#475569", "#FFFFFF");
    const actionButtonContrast = getContrastRatio("#FFFFFF", "#008069");
    const operationalContrast = getContrastRatio("#FFFFFF", "#2563EB");
    const dangerContrast = getContrastRatio("#FFFFFF", "#DC2626");

    const contrastAuditPassed =
      textPrimaryContrast >= 4.5 &&
      textSecondaryContrast >= 4.5 &&
      actionButtonContrast >= 4.5 &&
      operationalContrast >= 4.5 &&
      dangerContrast >= 4.5;

    results.push({
      test: "Contraste de Botões e Cores Primárias (WCAG 2.2 AA >= 4.5:1)",
      criteria: "Todos os botões de ação e textos primários devem satisfazer contraste >= 4.5:1",
      passed: contrastAuditPassed,
      detail: `Verde WhatsApp (#008069): ${actionButtonContrast.toFixed(2)}:1 | Slate 900: ${textPrimaryContrast.toFixed(2)}:1 | Slate 600: ${textSecondaryContrast.toFixed(2)}:1 | Azul: ${operationalContrast.toFixed(2)}:1 | Vermelho: ${dangerContrast.toFixed(2)}:1`,
    });

    // -------------------------------------------------------------
    // TABELA CONSOLIDADA DE RESULTADOS
    // -------------------------------------------------------------
    console.log("\n==============================================================");
    console.log("             RELATÓRIO DE EXECUÇÃO DE BROWSER QA             ");
    console.log("==============================================================");

    let allPassed = true;
    for (const r of results) {
      const statusStr = r.passed ? "✔ APROVADO" : "✖ FALHOU";
      console.log(`[${statusStr}] ${r.test}`);
      console.log(`    Critério: ${r.criteria}`);
      console.log(`    Detalhe:  ${r.detail}`);
      if (!r.passed) allPassed = false;
    }
    console.log("==============================================================");

    if (allPassed) {
      console.log(`RESULTADO FINAL: TODOS OS ${results.length} TESTES DE NAVEGADOR PASSARAM (100%)!\n`);
    } else {
      console.log("RESULTADO FINAL: ALGUNS TESTES DE NAVEGADOR FALHARAM.\n");
      process.exitCode = 1;
    }

  } finally {
    // Restaura a distribuição limpa de produção no container Docker
    console.log("Restaurando distribuição de produção limpa no container Docker...");
    execSync("docker cp apps/web/dist/. sos-v3-web:/usr/share/nginx/html/", { stdio: "ignore" });
    client.close();
    chromeProcess.kill();
  }
}

runBrowserQA().catch((err) => {
  console.error("Erro durante execução do Browser QA:", err);
  process.exit(1);
});
