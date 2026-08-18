#!/usr/bin/env python3
"""
Human Tester - Browser-based exploratory QA for SOS-SALES frontend
Tests the live application at http://localhost:3000
"""

import asyncio
import json
import os
from datetime import datetime
from pathlib import Path

# Browser automation setup
try:
    from playwright.async_api import async_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    print("Playwright not available. Install with: pip install playwright && playwright install chromium")

FRONTEND_URL = "http://localhost:3000"
OUTPUT_DIR = Path("./test-results")
OUTPUT_DIR.mkdir(exist_ok=True)

SCREENSHOTS_DIR = OUTPUT_DIR / "screenshots"
SCREENSHOTS_DIR.mkdir(exist_ok=True)

async def run_human_tester():
    if not PLAYWRIGHT_AVAILABLE:
        return {"error": "Playwright not available"}

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)  # Show browser for human-like testing
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            locale="pt-BR"
        )
        page = await context.new_page()
        
        # Track console errors
        console_errors = []
        page.on("console", lambda msg: console_errors.append({
            "type": msg.type,
            "text": msg.text,
            "location": msg.location
        }) if msg.type == "error" else None)
        
        page.on("pageerror", lambda err: console_errors.append({
            "type": "pageerror",
            "text": str(err),
            "location": {"url": page.url}
        }))
        
        results = {
            "timestamp": datetime.now().isoformat(),
            "url": FRONTEND_URL,
            "tests": [],
            "console_errors": [],
            "screenshots": [],
            "summary": {
                "total": 0,
                "passed": 0,
                "failed": 0,
                "warnings": 0
            }
        }
        
        def add_test(name, status, details="", screenshot_path=None):
            results["tests"].append({
                "name": name,
                "status": status,
                "details": details,
                "screenshot": screenshot_path
            })
            results["summary"]["total"] += 1
            if status == "passed":
                results["summary"]["passed"] += 1
            elif status == "failed":
                results["summary"]["failed"] += 1
            else:
                results["summary"]["warnings"] += 1
        
        async def take_screenshot(name):
            path = SCREENSHOTS_DIR / f"{name}_{datetime.now().strftime('%H%M%S')}.png"
            await page.screenshot(path=str(path), full_page=True)
            results["screenshots"].append(str(path))
            return str(path)
        
        print("=" * 60)
        print("SOS-SALES HUMAN TESTER - Exploratory QA")
        print("=" * 60)
        
        # TEST 1: Load homepage
        print("\n[1/10] Loading homepage...")
        try:
            await page.goto(FRONTEND_URL, wait_until="networkidle", timeout=30000)
            await page.wait_for_load_state("domcontentloaded")
            screenshot = await take_screenshot("01_homepage")
            add_test("Homepage loads", "passed", f"Loaded {FRONTEND_URL}", screenshot)
            print(f"  ✅ Homepage loaded - {page.url}")
        except Exception as e:
            screenshot = await take_screenshot("01_homepage_error")
            add_test("Homepage loads", "failed", str(e), screenshot)
            print(f"  ❌ Homepage failed: {e}")
        
        # TEST 2: Check for React app mount
        print("\n[2/10] Checking React app mount...")
        try:
            await page.wait_for_selector("#root", timeout=10000)
            root_content = await page.inner_html("#root")
            if root_content and len(root_content) > 100:
                add_test("React app mounted", "passed", "Root element has content")
                print("  ✅ React app mounted successfully")
            else:
                add_test("React app mounted", "warning", "Root element exists but minimal content")
                print("  ⚠️ React app mounted but content minimal")
        except Exception as e:
            add_test("React app mounted", "failed", str(e))
            print(f"  ❌ React mount failed: {e}")
        
        # TEST 3: Check for console errors
        print("\n[3/10] Checking console errors...")
        await page.wait_for_timeout(2000)
        js_errors = [e for e in console_errors if e["type"] == "error"]
        if js_errors:
            for err in js_errors[:5]:
                add_test(f"Console error: {err['text'][:50]}", "failed", err["text"])
            print(f"  ❌ Found {len(js_errors)} console errors")
        else:
            add_test("No console errors", "passed", "Clean console")
            print("  ✅ No console errors")
        
        # TEST 4: Navigation - Check sidebar/navigation
        print("\n[4/10] Checking navigation...")
        try:
            # Look for navigation elements
            nav_selectors = [
                "nav",
                "[role='navigation']",
                ".sidebar",
                "[data-testid='sidebar']",
                "aside",
                ".navigation"
            ]
            found_nav = False
            for sel in nav_selectors:
                if await page.locator(sel).count() > 0:
                    found_nav = True
                    add_test("Navigation present", "passed", f"Found with selector: {sel}")
                    print(f"  ✅ Navigation found: {sel}")
                    break
            
            if not found_nav:
                # Try to find any clickable navigation items
                links = await page.locator("a[href], button:has-text('Dashboard'), button:has-text('Cockpit')").count()
                if links > 0:
                    found_nav = True
                    add_test("Navigation present", "passed", f"Found {links} navigation links/buttons")
                    print(f"  ✅ Navigation links found: {links}")
                else:
                    add_test("Navigation present", "warning", "No standard navigation found")
                    print("  ⚠️ No standard navigation found")
        except Exception as e:
            add_test("Navigation present", "failed", str(e))
            print(f"  ❌ Navigation check failed: {e}")
        
        # TEST 5: Check for main views (Cockpit, Conversations, etc.)
        print("\n[5/10] Checking main views...")
        view_keywords = ["Cockpit", "Conversas", "Dashboard", "Agenda", "Grupos", "Resultados", "Inteligência", "Configurações"]
        found_views = []
        for keyword in view_keywords:
            try:
                count = await page.locator(f"text={keyword}").count()
                if count > 0:
                    found_views.append(keyword)
            except:
                pass
        
        if found_views:
            add_test("Main views accessible", "passed", f"Found: {', '.join(found_views)}")
            print(f"  ✅ Main views found: {', '.join(found_views)}")
        else:
            screenshot = await take_screenshot("05_views_check")
            add_test("Main views accessible", "warning", "No main view labels found", screenshot)
            print("  ⚠️ No main view labels found")
        
        # TEST 6: Try clicking on Cockpit if available
        print("\n[6/10] Testing Cockpit view...")
        try:
            cockpit_btn = page.locator("text=Cockpit").first
            if await cockpit_btn.count() > 0:
                await cockpit_btn.click()
                await page.wait_for_timeout(2000)
                screenshot = await take_screenshot("06_cockpit_view")
                add_test("Cockpit view opens", "passed", "Clicked Cockpit and loaded", screenshot)
                print("  ✅ Cockpit view opened")
            else:
                add_test("Cockpit view opens", "warning", "Cockpit button not found")
                print("  ⚠️ Cockpit button not found")
        except Exception as e:
            add_test("Cockpit view opens", "failed", str(e))
            print(f"  ❌ Cockpit test failed: {e}")
        
        # TEST 7: Check for responsive layout
        print("\n[7/10] Testing responsive layout...")
        try:
            # Mobile viewport
            await page.set_viewport_size({"width": 375, "height": 667})
            await page.wait_for_timeout(1000)
            screenshot = await take_screenshot("07_mobile_view")
            
            # Check if content is still visible
            body_text = await page.inner_text("body")
            if len(body_text) > 100:
                add_test("Mobile responsive", "passed", "Content visible on mobile")
                print("  ✅ Mobile layout works")
            else:
                add_test("Mobile responsive", "warning", "Minimal content on mobile")
                print("  ⚠️ Minimal content on mobile")
            
            # Restore desktop
            await page.set_viewport_size({"width": 1920, "height": 1080})
        except Exception as e:
            add_test("Mobile responsive", "failed", str(e))
            print(f"  ❌ Responsive test failed: {e}")
        
        # TEST 8: Check for forms/interactive elements
        print("\n[8/10] Checking interactive elements...")
        try:
            inputs = await page.locator("input, textarea, select, button").count()
            if inputs > 0:
                add_test("Interactive elements", "passed", f"Found {inputs} interactive elements")
                print(f"  ✅ Found {inputs} interactive elements")
            else:
                add_test("Interactive elements", "warning", "No form elements found")
                print("  ⚠️ No form elements found")
        except Exception as e:
            add_test("Interactive elements", "failed", str(e))
            print(f"  ❌ Interactive elements check failed: {e}")
        
        # TEST 9: Check for loading states / error boundaries
        print("\n[9/10] Checking for loading/error states...")
        try:
            loading_elements = await page.locator(".loading, [data-loading], .spinner, .skeleton").count()
            error_elements = await page.locator(".error, [data-error], .toast-error").count()
            
            if loading_elements > 0:
                add_test("Loading states", "passed", f"Found {loading_elements} loading indicators")
                print(f"  ✅ Loading states present: {loading_elements}")
            else:
                add_test("Loading states", "warning", "No loading indicators visible")
                print("  ⚠️ No loading indicators visible")
            
            if error_elements > 0:
                add_test("Error states", "warning", f"Found {error_elements} error elements visible")
                print(f"  ⚠️ Error elements visible: {error_elements}")
            else:
                add_test("Error states", "passed", "No error states visible")
                print("  ✅ No error states visible")
        except Exception as e:
            add_test("Loading/error states", "failed", str(e))
            print(f"  ❌ Loading/error check failed: {e}")
        
        # TEST 10: Full page screenshot for visual review
        print("\n[10/10] Final full-page screenshot...")
        try:
            screenshot = await take_screenshot("10_final_fullpage")
            add_test("Full page capture", "passed", "Complete page captured", screenshot)
            print("  ✅ Full page screenshot captured")
        except Exception as e:
            add_test("Full page capture", "failed", str(e))
            print(f"  ❌ Screenshot failed: {e}")
        
        # Collect console errors
        results["console_errors"] = console_errors
        
        # Generate report
        report_path = OUTPUT_DIR / f"human_tester_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(report_path, 'w') as f:
            json.dump(results, f, indent=2, default=str)
        
        # Print summary
        print("\n" + "=" * 60)
        print("HUMAN TESTER SUMMARY")
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
    results = asyncio.run(run_human_tester())
    exit(0 if results.get('summary', {}).get('failed', 0) == 0 else 1)