"""Test 11: Responsive design - mobile viewport, hamburger menu, layout, console errors."""
from playwright.sync_api import sync_playwright
import os, json, sys

BASE = 'http://localhost:5173/DartStore/'
SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), 'screenshots')
os.makedirs(SCREENSHOT_DIR, exist_ok=True)
ERRORS = []

def check(condition, msg):
    if not condition:
        ERRORS.append(msg)
        print(f'  [FAIL] {msg}')
    else:
        print(f'  [PASS] {msg}')

SEED = json.dumps({
    "name": "ResponsiveTest",
    "description": "",
    "collections": [
        {
            "id": "c1",
            "name": "users",
            "fields": [
                {"id": "f1", "name": "email", "type": "string", "isRequired": True, "description": ""}
            ],
            "subcollections": [],
            "description": ""
        }
    ],
    "securityRules": {},
    "transformConfig": {"collections": {}}
})

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # Mobile viewport
    print('\n=== TEST: Mobile Viewport (375x667) ===')
    mobile_page = browser.new_page(viewport={'width': 375, 'height': 667})
    mobile_page.goto(BASE)
    mobile_page.wait_for_load_state('networkidle')
    mobile_page.evaluate(f'localStorage.setItem("dartstore_project", {json.dumps(SEED)})')
    mobile_page.reload()
    mobile_page.wait_for_load_state('networkidle')
    mobile_page.wait_for_timeout(500)
    mobile_page.screenshot(path=os.path.join(SCREENSHOT_DIR, '11_mobile_375.png'))

    has_h_scroll = mobile_page.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth')
    check(not has_h_scroll, 'No horizontal scrollbar on mobile')

    hamburger = mobile_page.locator('button[aria-label*="menu" i], button[aria-expanded]')
    check(hamburger.count() > 0, 'Hamburger menu button visible on mobile')

    if hamburger.count() > 0:
        hamburger.first.click()
        mobile_page.wait_for_timeout(300)
        mobile_page.screenshot(path=os.path.join(SCREENSHOT_DIR, '11_mobile_menu_open.png'))

    header = mobile_page.locator('header')
    check(header.is_visible(), 'Header visible on mobile')
    mobile_page.close()

    # Tablet viewport
    print('\n=== TEST: Tablet Viewport (768x1024) ===')
    tablet_page = browser.new_page(viewport={'width': 768, 'height': 1024})
    tablet_page.goto(BASE)
    tablet_page.wait_for_load_state('networkidle')
    tablet_page.evaluate(f'localStorage.setItem("dartstore_project", {json.dumps(SEED)})')
    tablet_page.reload()
    tablet_page.wait_for_load_state('networkidle')
    tablet_page.wait_for_timeout(500)
    tablet_page.screenshot(path=os.path.join(SCREENSHOT_DIR, '11_tablet_768.png'))

    has_h_scroll = tablet_page.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth')
    check(not has_h_scroll, 'No horizontal scrollbar on tablet')
    tablet_page.close()

    # Wide viewport
    print('\n=== TEST: Wide Viewport (1920x1080) ===')
    wide_page = browser.new_page(viewport={'width': 1920, 'height': 1080})
    wide_page.goto(BASE)
    wide_page.wait_for_load_state('networkidle')
    wide_page.evaluate(f'localStorage.setItem("dartstore_project", {json.dumps(SEED)})')
    wide_page.reload()
    wide_page.wait_for_load_state('networkidle')
    wide_page.wait_for_timeout(500)
    wide_page.screenshot(path=os.path.join(SCREENSHOT_DIR, '11_wide_1920.png'))

    sidebar = wide_page.locator('nav')
    check(sidebar.is_visible(), 'Sidebar visible on wide viewport')
    wide_page.close()

    # Console errors check
    print('\n=== TEST: No Console Errors ===')
    console_errors = []
    clean_page = browser.new_page(viewport={'width': 1440, 'height': 900})
    clean_page.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' else None)
    clean_page.goto(BASE)
    clean_page.wait_for_load_state('networkidle')
    clean_page.evaluate(f'localStorage.setItem("dartstore_project", {json.dumps(SEED)})')
    clean_page.reload()
    clean_page.wait_for_load_state('networkidle')
    clean_page.wait_for_timeout(1000)

    for tab in ['Models', 'Security Rules', 'Transforms', 'Overview']:
        tab_btn = clean_page.locator(f'button:has-text("{tab}")')
        if tab_btn.count() > 0:
            tab_btn.first.click()
            clean_page.wait_for_timeout(500)

    if console_errors:
        print(f'  [WARN] Console errors found:')
        for err in console_errors[:10]:
            print(f'    {err[:120]}')
    check(len(console_errors) == 0, f'No console errors ({len(console_errors)} found)')

    clean_page.close()
    browser.close()

if ERRORS:
    print(f'\n>> {len(ERRORS)} test(s) failed')
    for e in ERRORS:
        print(f'  - {e}')
    sys.exit(1)
else:
    print('\n>> All tests passed')
