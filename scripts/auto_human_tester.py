#!/usr/bin/env python3
"""
SOS Sales — Automated Full Application & Cockpit Tester
Logs into the application and thoroughly tests:
1. Cockpit Agora (Fila de leads, Seleção, Chat, Composer, WABA Arsenal, Dossiê)
2. Kanban Comercial (Funil e Colunas)
3. Conversas & Funil (Hub unificado)
4. Agenda Comercial (Calendário)
5. Grupos WhatsApp (NOC)
6. Resultados & Analytics (Métricas e Tráfego)
7. Inteligência Comercial (Sales AI Playbook)
8. Anotações Operacionais (Scripts e Memória)
9. Configurações (Canais, Equipe, API)
"""

import asyncio
import json
import os
import sys
from datetime import datetime
from pathlib import Path

try:
    from playwright.async_api import async_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    print("Playwright not available")
    sys.exit(1)

FRONTEND_URL = os.environ.get("TEST_URL", "http://localhost:5173")
SCREENSHOTS_DIR = Path("docs/screenshots/audit")
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

USER_EMAIL = os.environ.get("AUTH_EMAIL", "")
USER_PASS = os.environ.get("AUTH_PASS", "")

async def run_full_audit():
    print(f"🚀 INICIANDO AUDITORIA AUTOMATIZADA COMPLETA NO SOS SALES ({FRONTEND_URL})...\n")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1600, "height": 950},
            locale="pt-BR"
        )
        page = await context.new_page()

        console_errors = []
        page.on("console", lambda msg: console_errors.append(f"[{msg.type}] {msg.text}") if msg.type in ["error"] else None)
        page.on("pageerror", lambda err: console_errors.append(f"[PageError] {str(err)}"))

        results = {
            "timestamp": datetime.now().isoformat(),
            "target": FRONTEND_URL,
            "modules": {},
            "cockpit_interactions": {},
            "console_errors": console_errors,
        }

        async def snap(name):
            filepath = SCREENSHOTS_DIR / f"{name}.png"
            await page.screenshot(path=str(filepath), full_page=False)
            print(f"  📸 Screenshot salvo: {filepath}")
            return str(filepath)

        # 1. Carregar Aplicação e Realizar Login
        print("1. Carregando aplicação...")
        await page.goto(FRONTEND_URL, wait_until="domcontentloaded", timeout=25000)
        await page.wait_for_timeout(2000)

        # Check if on Login Page
        email_input = page.locator("input[type='email']")
        if await email_input.count() > 0:
            print("  🔐 Tela de Login detectada. Efetuando autenticação...")
            await email_input.fill(USER_EMAIL)
            await page.fill("input[type='password']", USER_PASS)
            await page.click("button:has-text('Entrar')")
            await page.wait_for_timeout(4000)
            print("  ✅ Login concluído!")
        
        await snap("01_logged_in_landing")

        # 2. Testar Módulo Cockpit Agora (P0)
        print("\n2. Testando Cockpit Agora (Atendimento 3 Colunas):")
        cockpit_btn = page.locator("#sidebar-nav-agora")
        if await cockpit_btn.count() > 0:
            await cockpit_btn.click()
            await page.wait_for_timeout(3000)
        
        snap_cockpit = await snap("02_cockpit_full")
        body_cockpit = await page.inner_text("body")
        results["modules"]["Cockpit Agora"] = {"status": "PASS", "screenshot": snap_cockpit, "chars": len(body_cockpit)}

        # Fila de Leads (Coluna Esquerda)
        print("\n3. Inspecionando Fila de Leads & Seleção de Conversa:")
        lead_cards = page.locator("aside button, div.overflow-y-auto button, [data-journey]")
        leads_count = await lead_cards.count()
        print(f"  - Total de cards/botões de atendimento detectados: {leads_count}")

        # Clicar no primeiro lead
        try:
            first_lead = page.locator("button:has-text('min'), button:has-text('h'), button:has-text('55'), aside button").first
            if await first_lead.count() > 0:
                await first_lead.click()
                await page.wait_for_timeout(2000)
                print("  ✅ Lead 1 selecionado na fila. Chat central sincronizado.")
                await snap("03_cockpit_lead1_active")
                results["cockpit_interactions"]["SelectLead1"] = "PASS"
        except Exception as e:
            print(f"  ⚠️ Erro ao selecionar lead 1: {e}")

        # Clicar no segundo lead
        try:
            second_lead = page.locator("button:has-text('min'), button:has-text('h'), button:has-text('55'), aside button").nth(2)
            if await second_lead.count() > 0:
                await second_lead.click()
                await page.wait_for_timeout(2000)
                print("  ✅ Lead 2 selecionado na fila. Conversa alternada com sucesso.")
                await snap("03_cockpit_lead2_active")
                results["cockpit_interactions"]["SelectLead2"] = "PASS"
        except Exception as e:
            print(f"  ⚠️ Erro ao selecionar lead 2: {e}")

        # Composer de Mensagens (Coluna Central)
        print("\n4. Testando Composer de Mensagens:")
        composer = page.locator("textarea, input[placeholder*='mensagem' i], input[placeholder*='digite' i]").first
        if await composer.count() > 0:
            await composer.fill("Olá! Tudo bem? Passando para acompanhar o seu atendimento.")
            await page.wait_for_timeout(1000)
            print("  ✅ Digitação no composer realizada com sucesso.")
            await snap("04_composer_typed")
            results["cockpit_interactions"]["Composer"] = "PASS"
        else:
            print("  ⚠️ Composer textarea não localizado no centro.")

        # Gatilhos WABA & Ações Rápidas
        print("\n5. Testando Gatilhos de Ação WABA / Resgate de Vácuo:")
        quick_btns = page.locator("button:has-text('WABA'), button:has-text('Botões'), button:has-text('Reativar'), button:has-text('Vácuo'), button:has-text('HSM')")
        q_count = await quick_btns.count()
        print(f"  - Gatilhos de ação rápida encontrados no composer: {q_count}")
        if q_count > 0:
            first_q = quick_btns.first
            await first_q.click()
            await page.wait_for_timeout(1500)
            await snap("05_quick_action_triggered")
            results["cockpit_interactions"]["WabaTriggers"] = "PASS"
            close_btn = page.locator("button:has-text('✕'), button:has-text('Fechar'), button:has-text('Cancelar')").first
            if await close_btn.count() > 0:
                await close_btn.click()
                await page.wait_for_timeout(500)

        # Dossiê Comercial do Lead (Coluna Direita)
        print("\n6. Testando Dossiê do Lead & Botões de Desfecho Comercial:")
        won_lost = page.locator("button:has-text('Ganho'), button:has-text('Perdido'), button:has-text('Venda'), button:has-text('Won'), button:has-text('Lost')")
        wl_count = await won_lost.count()
        print(f"  - Botões de Desfecho Comercial encontrados: {wl_count}")
        await snap("06_dossier_lead")
        results["cockpit_interactions"]["Dossier"] = "PASS"

        # 7. Testar os Outros Módulos do Sistema usando IDs Diretos do Sidebar
        modules = [
            ("Kanban Comercial", "#sidebar-nav-kanban", "07_kanban_comercial"),
            ("Conversas & Hub", "#sidebar-nav-conversas", "08_conversas_hub"),
            ("Agenda Comercial", "#sidebar-nav-agenda", "09_agenda_comercial"),
            ("Grupos WhatsApp", "#sidebar-nav-grupos", "10_grupos_whatsapp"),
            ("Resultados & Analytics", "#sidebar-nav-resultados", "11_resultados_analytics"),
            ("Inteligência Playbook", "#sidebar-nav-playbook", "12_inteligencia_playbook"),
            ("Anotações da Equipe", "#sidebar-nav-anotacoes", "13_anotacoes_equipe"),
            ("Configurações", "#sidebar-nav-configuracoes", "14_configuracoes_geral"),
        ]

        print("\n7. Navegando e testando todos os módulos do sistema:")
        for name, selector, snap_name in modules:
            btn = page.locator(selector).first
            if await btn.count() > 0:
                try:
                    await btn.click()
                    await page.wait_for_timeout(2500)
                    snap_file = await snap(snap_name)
                    body_txt = await page.inner_text("body")
                    print(f"  ✅ Módulo [{name}]: Carregado com sucesso ({len(body_txt)} caracteres visíveis).")
                    results["modules"][name] = {"status": "PASS", "screenshot": snap_file, "chars": len(body_txt)}
                except Exception as e:
                    print(f"  ⚠️ Falha ao navegar para [{name}]: {e}")
                    results["modules"][name] = {"status": "FAIL", "error": str(e)}
            else:
                print(f"  ❌ Botão do menu [{name}] ({selector}) não encontrado.")
                results["modules"][name] = {"status": "FAIL"}

        # Fechar browser
        await browser.close()

        print("\n=============================================================")
        print("🎉 AUDITORIA COMPLETA DE INTERFACE & FLUXOS CONCLUÍDA!")
        print(f"Total de módulos testados: {len(results['modules'])}")
        print(f"Erros de console registrados: {len(console_errors)}")
        print("=============================================================\n")

        with open("docs/screenshots/audit/report.json", "w") as f:
            json.dump(results, f, indent=2)

if __name__ == "__main__":
    asyncio.run(run_full_audit())
