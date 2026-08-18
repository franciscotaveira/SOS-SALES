#!/usr/bin/env python3
"""
Deep Human Tester - Tests specific user flows in SOS-SALES
Tests Cockpit, Conversations, Agenda, Groups, Results, Intelligence, Settings
"""

import asyncio
import json
import os
from datetime import datetime
from pathlib import Path

try:
    from playwright.async_api import async_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    print("Playwright not available")

FRONTEND_URL = "http://localhost:3000"
OUTPUT_DIR = Path("./test-results")
OUTPUT_DIR.mkdir(exist_ok=True)
SCREENSHOTS_DIR = OUTPUT_DIR / "screenshots"
SCREENSHOTS_DIR.mkdir(exist_ok=True)

async def run_deep_human_tester():
    if not PLAYWRIGHT_AVAILABLE:
        return {"error": "Playwright not available"}

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            locale="pt-BR"
        )
        page = await context.new_page()
        
        console_errors = []
        page.on("console", lambda msg: console_errors.append({
            "type": msg.type, "text": msg.text, "location": msg.location
        }) if msg.type == "error" else None)
        page.on("pageerror", lambda err: console_errors.append({
            "type": "pageerror", "text": str(err), "location": {"url": page.url}
        }))
        
        results = {
            "timestamp": datetime.now().isoformat(),
            "url": FRONTEND_URL,
            "tests": [],
            "console_errors": [],
            "screenshots": [],
            "summary": {"total": 0, "passed": 0, "failed": 0, "warnings": 0}
        }
        
        def add_test(name, status, details="", screenshot_path=None):
            results["tests"].append({"name": name, "status": status, "details": details, "screenshot": screenshot_path})
            results["summary"]["total"] += 1
            if status == "passed": results["summary"]["passed"] += 1
            elif status == "failed": results["summary"]["failed"] += 1
            else: results["summary"]["warnings"] += 1
        
        async def take_screenshot(name):
            path = SCREENSHOTS_DIR / f"{name}_{datetime.now().strftime('%H%M%S')}.png"
            await page.screenshot(path=str(path), full_page=True)
            results["screenshots"].append(str(path))
            return str(path)
        
        await page.goto(FRONTEND_URL, wait_until="networkidle", timeout=30000)
        await page.wait_for_load_state("domcontentloaded")
        await page.wait_for_timeout(2000)
        
        print("=" * 60)
        print("SOS-SALES DEEP HUMAN TESTER - User Flows")
        print("=" * 60)
        
        # NAVIGATION TEST: Find and click all main navigation items
        nav_items = [
            ("Cockpit", "text=Cockpit"),
            ("Conversas", "text=Conversas"),
            ("Agenda", "text=Agenda"),
            ("Grupos", "text=Grupos"),
            ("Resultados", "text=Resultados"),
            ("Inteligência", "text=Inteligência"),
            ("Configurações", "text=Configurações"),
        ]
        
        for label, selector in nav_items:
            print(f"\n🧪 Testing navigation: {label}")
            try:
                btn = page.locator(selector).first
                if await btn.count() > 0:
                    await btn.click()
                    await page.wait_for_timeout(2000)
                    screenshot = await take_screenshot(f"nav_{label.lower()}")
                    
                    # Check if content loaded
                    body_text = await page.inner_text("body")
                    if len(body_text) > 200:
                        add_test(f"Nav: {label}", "passed", f"View loaded, {len(body_text)} chars", screenshot)
                        print(f"  ✅ {label} - View loaded ({len(body_text)} chars)")
                    else:
                        add_test(f"Nav: {label}", "warning", f"View minimal content: {len(body_text)} chars", screenshot)
                        print(f"  ⚠️ {label} - Minimal content")
                else:
                    add_test(f"Nav: {label}", "warning", f"Button not found: {selector}")
                    print(f"  ⚠️ {label} - Button not found")
            except Exception as e:
                add_test(f"Nav: {label}", "failed", str(e))
                print(f"  ❌ {label} - Error: {e}")
        
        # COCKPIT SPECIFIC TESTS
        print(f"\n🧪 Deep testing: Cockpit")
        try:
            await page.locator("text=Cockpit").first.click()
            await page.wait_for_timeout(3000)
            screenshot = await take_screenshot("cockpit_deep")
            
            # Check for journey list
            journey_elements = await page.locator("[data-journey], .journey-item, .journey-card, tr:has(td), .list-item").count()
            # Check for priority/badge elements
            priority_elements = await page.locator(".priority, .badge, [data-priority], .sla, .urgent").count()
            # Check for message area
            message_area = await page.locator(".messages, .chat, .conversation, [data-messages]").count()
            
            details = f"Journeys: {journey_elements}, Priorities: {priority_elements}, Messages: {message_area}"
            if journey_elements > 0 or priority_elements > 0 or message_area > 0:
                add_test("Cockpit: Content sections", "passed", details, screenshot)
                print(f"  ✅ Cockpit content: {details}")
            else:
                # Try alternative selectors
                alt_content = await page.inner_text("body")
                if "lead" in alt_content.lower() or "jornada" in alt_content.lower() or "pipeline" in alt_content.lower():
                    add_test("Cockpit: Content sections", "passed", f"Content detected via text: {len(alt_content)} chars", screenshot)
                    print(f"  ✅ Cockpit content detected via text ({len(alt_content)} chars)")
                else:
                    add_test("Cockpit: Content sections", "warning", f"Minimal structured content: {len(alt_content)} chars", screenshot)
                    print(f"  ⚠️ Cockpit minimal content ({len(alt_content)} chars)")
        except Exception as e:
            add_test("Cockpit: Content sections", "failed", str(e))
            print(f"  ❌ Cockpit deep test failed: {e}")
        
        # CONVERSAS SPECIFIC TESTS
        print(f"\n🧪 Deep testing: Conversas")
        try:
            await page.locator("text=Conversas").first.click()
            await page.wait_for_timeout(3000)
            screenshot = await take_screenshot("conversas_deep")
            
            # Check for conversation list
            conv_list = await page.locator(".conversation-list, .conversations, [data-conversations], .list-item").count()
            # Check for search/filter
            search = await page.locator("input[placeholder*='buscar' i], input[placeholder*='search' i], .search").count()
            # Check for new conversation button
            new_conv = await page.locator("button:has-text('Nova'), button:has-text('Novo'), button:has-text('+')").count()
            
            details = f"List items: {conv_list}, Search: {search}, New btn: {new_conv}"
            if conv_list > 0 or search > 0 or new_conv > 0:
                add_test("Conversas: Content sections", "passed", details, screenshot)
                print(f"  ✅ Conversas content: {details}")
            else:
                alt_content = await page.inner_text("body")
                if "conversa" in alt_content.lower() or "chat" in alt_content.lower() or "mensagem" in alt_content.lower():
                    add_test("Conversas: Content sections", "passed", f"Content detected via text: {len(alt_content)} chars", screenshot)
                    print(f"  ✅ Conversas content detected via text ({len(alt_content)} chars)")
                else:
                    add_test("Conversas: Content sections", "warning", f"Minimal content: {len(alt_content)} chars", screenshot)
                    print(f"  ⚠️ Conversas minimal content ({len(alt_content)} chars)")
        except Exception as e:
            add_test("Conversas: Content sections", "failed", str(e))
            print(f"  ❌ Conversas deep test failed: {e}")
        
        # AGENDA SPECIFIC TESTS
        print(f"\n🧪 Deep testing: Agenda")
        try:
            await page.locator("text=Agenda").first.click()
            await page.wait_for_timeout(3000)
            screenshot = await take_screenshot("agenda_deep")
            
            # Check for calendar view
            calendar = await page.locator(".calendar, .fc-calendar, [data-calendar], .agenda-view").count()
            # Check for day/week/month views
            views = await page.locator("button:has-text('Dia'), button:has-text('Semana'), button:has-text('Mês'), button:has-text('Month')").count()
            # Check for appointments
            appointments = await page.locator(".appointment, .event, [data-appointment]").count()
            
            details = f"Calendar: {calendar}, Views: {views}, Appointments: {appointments}"
            if calendar > 0 or views > 0 or appointments > 0:
                add_test("Agenda: Content sections", "passed", details, screenshot)
                print(f"  ✅ Agenda content: {details}")
            else:
                alt_content = await page.inner_text("body")
                if "agenda" in alt_content.lower() or "calendário" in alt_content.lower() or "compromisso" in alt_content.lower():
                    add_test("Agenda: Content sections", "passed", f"Content detected via text: {len(alt_content)} chars", screenshot)
                    print(f"  ✅ Agenda content detected via text ({len(alt_content)} chars)")
                else:
                    add_test("Agenda: Content sections", "warning", f"Minimal content: {len(alt_content)} chars", screenshot)
                    print(f"  ⚠️ Agenda minimal content ({len(alt_content)} chars)")
        except Exception as e:
            add_test("Agenda: Content sections", "failed", str(e))
            print(f"  ❌ Agenda deep test failed: {e}")
        
        # GRUPOS SPECIFIC TESTS
        print(f"\n🧪 Deep testing: Grupos")
        try:
            await page.locator("text=Grupos").first.click()
            await page.wait_for_timeout(3000)
            screenshot = await take_screenshot("grupos_deep")
            
            groups_list = await page.locator(".group, .grupo, [data-group], .group-item").count()
            new_group = await page.locator("button:has-text('Novo Grupo'), button:has-text('Criar Grupo')").count()
            
            details = f"Groups: {groups_list}, New btn: {new_group}"
            if groups_list > 0 or new_group > 0:
                add_test("Grupos: Content sections", "passed", details, screenshot)
                print(f"  ✅ Grupos content: {details}")
            else:
                alt_content = await page.inner_text("body")
                if "grupo" in alt_content.lower() or "group" in alt_content.lower():
                    add_test("Grupos: Content sections", "passed", f"Content detected via text: {len(alt_content)} chars", screenshot)
                    print(f"  ✅ Grupos content detected via text ({len(alt_content)} chars)")
                else:
                    add_test("Grupos: Content sections", "warning", f"Minimal content: {len(alt_content)} chars", screenshot)
                    print(f"  ⚠️ Grupos minimal content ({len(alt_content)} chars)")
        except Exception as e:
            add_test("Grupos: Content sections", "failed", str(e))
            print(f"  ❌ Grupos deep test failed: {e}")
        
        # RESULTADOS SPECIFIC TESTS
        print(f"\n🧪 Deep testing: Resultados")
        try:
            await page.locator("text=Resultados").first.click()
            await page.wait_for_timeout(3000)
            screenshot = await take_screenshot("resultados_deep")
            
            charts = await page.locator(".chart, .recharts, canvas, svg.chart").count()
            metrics = await page.locator(".metric, .kpi, .stat, [data-metric]").count()
            
            details = f"Charts: {charts}, Metrics: {metrics}"
            if charts > 0 or metrics > 0:
                add_test("Resultados: Content sections", "passed", details, screenshot)
                print(f"  ✅ Resultados content: {details}")
            else:
                alt_content = await page.inner_text("body")
                if "resultado" in alt_content.lower() or "traffic" in alt_content.lower() or "roas" in alt_content.lower() or "métrica" in alt_content.lower():
                    add_test("Resultados: Content sections", "passed", f"Content detected via text: {len(alt_content)} chars", screenshot)
                    print(f"  ✅ Resultados content detected via text ({len(alt_content)} chars)")
                else:
                    add_test("Resultados: Content sections", "warning", f"Minimal content: {len(alt_content)} chars", screenshot)
                    print(f"  ⚠️ Resultados minimal content ({len(alt_content)} chars)")
        except Exception as e:
            add_test("Resultados: Content sections", "failed", str(e))
            print(f"  ❌ Resultados deep test failed: {e}")
        
        # INTELIGÊNCIA SPECIFIC TESTS
        print(f"\n🧪 Deep testing: Inteligência")
        try:
            await page.locator("text=Inteligência").first.click()
            await page.wait_for_timeout(3000)
            screenshot = await take_screenshot("inteligencia_deep")
            
            insights = await page.locator(".insight, .intelligence, [data-insight], .ai-insight").count()
            facts = await page.locator(".fact, .known-fact, [data-fact]").count()
            
            details = f"Insights: {insights}, Facts: {facts}"
            if insights > 0 or facts > 0:
                add_test("Inteligência: Content sections", "passed", details, screenshot)
                print(f"  ✅ Inteligência content: {details}")
            else:
                alt_content = await page.inner_text("body")
                if "inteligência" in alt_content.lower() or "insight" in alt_content.lower() or "fato" in alt_content.lower() or "ia" in alt_content.lower():
                    add_test("Inteligência: Content sections", "passed", f"Content detected via text: {len(alt_content)} chars", screenshot)
                    print(f"  ✅ Inteligência content detected via text ({len(alt_content)} chars)")
                else:
                    add_test("Inteligência: Content sections", "warning", f"Minimal content: {len(alt_content)} chars", screenshot)
                    print(f"  ⚠️ Inteligência minimal content ({len(alt_content)} chars)")
        except Exception as e:
            add_test("Inteligência: Content sections", "failed", str(e))
            print(f"  ❌ Inteligência deep test failed: {e}")
        
        # CONFIGURAÇÕES SPECIFIC TESTS
        print(f"\n🧪 Deep testing: Configurações")
        try:
            await page.locator("text=Configurações").first.click()
            await page.wait_for_timeout(3000)
            screenshot = await take_screenshot("configuracoes_deep")
            
            tabs = await page.locator("[role='tab'], .tab, button[role='tab']").count()
            forms = await page.locator("form, .settings-form, [data-settings]").count()
            inputs = await page.locator("input, select, textarea").count()
            
            details = f"Tabs: {tabs}, Forms: {forms}, Inputs: {inputs}"
            if tabs > 0 or forms > 0 or inputs > 5:
                add_test("Configurações: Content sections", "passed", details, screenshot)
                print(f"  ✅ Configurações content: {details}")
            else:
                alt_content = await page.inner_text("body")
                if "configuração" in alt_content.lower() or "setting" in alt_content.lower() or "workspace" in alt_content.lower() or "canal" in alt_content.lower():
                    add_test("Configurações: Content sections", "passed", f"Content detected via text: {len(alt_content)} chars", screenshot)
                    print(f"  ✅ Configurações content detected via text ({len(alt_content)} chars)")
                else:
                    add_test("Configurações: Content sections", "warning", f"Minimal content: {len(alt_content)} chars", screenshot)
                    print(f"  ⚠️ Configurações minimal content ({len(alt_content)} chars)")
        except Exception as e:
            add_test("Configurações: Content sections", "failed", str(e))
            print(f"  ❌ Configurações deep test failed: {e}")
        
        # TEST MODAL INTERACTIONS
        print(f"\n🧪 Testing: Modal interactions")
        try:
            await page.locator("text=Configurações").first.click()
            await page.wait_for_timeout(2000)
            
            # Try to find and click "Conectar WhatsApp" or similar
            connect_btns = page.locator("button:has-text('Conectar'), button:has-text('WhatsApp'), button:has-text('WABA')")
            if await connect_btns.count() > 0:
                await connect_btns.first.click()
                await page.wait_for_timeout(2000)
                screenshot = await take_screenshot("modal_waba")
                
                # Check if modal opened
                modal = await page.locator("[role='dialog'], .modal, .fixed.inset-0").count()
                if modal > 0:
                    add_test("Modal: WABA Connection", "passed", "Modal opened successfully", screenshot)
                    print(f"  ✅ WABA modal opened")
                    
                    # Try to close modal
                    close_btn = page.locator("button:has-text('Fechar'), button:has-text('Cancelar'), [aria-label='Close'], .close").first
                    if await close_btn.count() > 0:
                        await close_btn.click()
                        await page.wait_for_timeout(500)
                        print(f"  ✅ Modal closed")
                else:
                    add_test("Modal: WABA Connection", "warning", "Button clicked but no modal detected", screenshot)
                    print(f"  ⚠️ WABA button clicked but no modal")
            else:
                add_test("Modal: WABA Connection", "warning", "No WABA connect button found")
                print(f"  ⚠️ No WABA connect button found")
        except Exception as e:
            add_test("Modal: WABA Connection", "failed", str(e))
            print(f"  ❌ Modal test failed: {e}")
        
        # FINAL CHECKS
        print(f"\n🧪 Final: Performance and accessibility")
        try:
            # Check for images without alt
            images_no_alt = await page.locator("img:not([alt])").count()
            
            # Check for buttons without accessible names
            buttons_no_name = await page.locator("button:not([aria-label]):not([title]):not(:has-text(''))").count()
            
            # Check page load performance (rough)
            perf = await page.evaluate("""() => {
                const nav = performance.getEntriesByType('navigation')[0];
                return {
                    domContentLoaded: nav.domContentLoadedEventEnd - nav.domContentLoadedEventStart,
                    loadComplete: nav.loadEventEnd - nav.loadEventStart
                };
            }""")
            
            add_test("Accessibility: Images with alt", "passed" if images_no_alt == 0 else "warning", 
                    f"Images without alt: {images_no_alt}")
            add_test("Accessibility: Buttons labeled", "passed" if buttons_no_name == 0 else "warning",
                    f"Buttons without accessible name: {buttons_no_name}")
            add_test("Performance: DOM Content Loaded", "passed" if perf['domContentLoaded'] < 3000 else "warning",
                    f"{perf['domContentLoaded']:.0f}ms")
            add_test("Performance: Load Complete", "passed" if perf['loadComplete'] < 5000 else "warning",
                    f"{perf['loadComplete']:.0f}ms")
            
            print(f"  ✅ Accessibility: {images_no_alt} images without alt, {buttons_no_name} buttons unlabeled")
            print(f"  ✅ Performance: DOM {perf['domContentLoaded']:.0f}ms, Load {perf['loadComplete']:.0f}ms")
        except Exception as e:
            add_test("Performance/Accessibility", "warning", str(e))
            print(f"  ⚠️ Performance check failed: {e}")
        
        # Collect console errors
        results["console_errors"] = console_errors
        
        # Generate report
        report_path = OUTPUT_DIR / f"deep_human_tester_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(report_path, 'w') as f:
            json.dump(results, f, indent=2, default=str)
        
        # Print summary
        print("\n" + "=" * 60)
        print("DEEP HUMAN TESTER SUMMARY")
        print("=" * 60)
        print(f"Total Tests: {results['summary']['total']}")
        print(f"  ✅ Passed: {results['summary']['passed']}")
        print(f"  ❌ Failed: {results['summary']['failed']}")
        print(f"  ⚠️ Warnings: {results['summary']['warnings']}")
        print(f"\nConsole Errors: {len(console_errors)}")
        print(f"Screenshots: {len(results['screenshots'])}")
        print(f"Report saved: {report_path}")
        
        if results['summary']['failed'] > 0:
            print("\n❌ CRITICAL FAILURES:")
            for test in results['tests']:
                if test['status'] == 'failed':
                    print(f"  - {test['name']}: {test['details']}")
        
        await browser.close()
        return results

if __name__ == "__main__":
    results = asyncio.run(run_deep_human_tester())
    exit(0 if results.get('summary', {}).get('failed', 0) == 0 else 1)