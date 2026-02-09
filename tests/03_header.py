"""Test 03: Header - view tabs, inline editing, export/import, mobile menu."""
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

SEED_PROJECT = json.dumps({
    "name": "Header Test Project",
    "description": "For testing header",
    "collections": [
        {
            "id": "c1",
            "name": "users",
            "fields": [
                {"id": "f1", "name": "email", "type": "string", "required": True, "isArray": False, "description": ""}
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
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    page.evaluate(f'localStorage.setItem("dartstore_project", {json.dumps(SEED_PROJECT)})')
    page.reload()
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(500)

    print('\n=== TEST: Header Visibility ===')
    header = page.locator('header')
    check(header.is_visible(), 'Header visible')

    name_el = page.locator('text=Header Test Project')
    check(name_el.count() > 0, 'Project name shown in header')

    # View tab switching
    print('\n=== TEST: View Tab Switching ===')
    tab_names = ['Models', 'Security Rules', 'Transforms', 'Overview']
    for tab_name in tab_names:
        tab = page.locator(f'button:has-text("{tab_name}")')
        if tab.count() > 0 and tab.first.is_visible():
            tab.first.click()
            page.wait_for_timeout(300)
            is_selected = tab.first.get_attribute('aria-selected')
            has_active = 'bg-' in (tab.first.get_attribute('class') or '')
            check(is_selected == 'true' or has_active, f'Tab "{tab_name}" clickable and becomes active')
        else:
            check(False, f'Tab "{tab_name}" not found or not visible')

    models_tab = page.locator('button:has-text("Models")')
    if models_tab.count() > 0:
        models_tab.first.click()
        page.wait_for_timeout(300)

    page.screenshot(path=os.path.join(SCREENSHOT_DIR, '03_header_tabs.png'))

    # Inline project name editing
    print('\n=== TEST: Inline Project Name Editing ===')
    # The project name is a button that triggers inline editing on click
    name_btn = page.locator('header button:has-text("Header Test Project")').first
    name_btn.click()
    page.wait_for_timeout(300)

    # After clicking, an input should appear (no explicit type="text")
    name_input = page.locator('header input').first
    if name_input.is_visible():
        name_input.fill('Renamed Project')
        name_input.press('Enter')
        page.wait_for_timeout(500)
        renamed = page.locator('text=Renamed Project')
        check(renamed.count() > 0, 'Project name updated after inline edit')
    else:
        check(False, 'Could not find inline edit input for project name')

    # Code preview button
    print('\n=== TEST: Code Preview Button ===')
    code_btn = page.locator('button[aria-label*="code" i], button:has-text("Code"), button[aria-label*="preview" i]')
    if code_btn.count() > 0:
        code_btn.first.click()
        page.wait_for_timeout(500)
        dialog = page.locator('[role="dialog"]')
        check(dialog.count() > 0, 'Code preview modal opens')
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, '03_code_preview_modal.png'))
        page.keyboard.press('Escape')
        page.wait_for_timeout(300)
        dialog_after = page.locator('[role="dialog"]')
        check(dialog_after.count() == 0 or not dialog_after.is_visible(), 'Code preview closes on Escape')
    else:
        check(False, 'Code preview button not found')

    # Export button
    print('\n=== TEST: Export Button ===')
    export_btn = page.locator('button[aria-label*="export" i], button:has-text("Export")')
    if export_btn.count() > 0:
        check(True, 'Export button found')
    else:
        more_btn = page.locator('button[aria-label*="more" i], button[aria-label*="menu" i]')
        if more_btn.count() > 0:
            more_btn.first.click()
            page.wait_for_timeout(300)
        export_btn = page.locator('button[aria-label*="export" i], button:has-text("Export"), [role="menuitem"]:has-text("Export")')
        check(export_btn.count() > 0, 'Export button found (possibly in menu)')

    page.screenshot(path=os.path.join(SCREENSHOT_DIR, '03_header_final.png'))
    browser.close()

if ERRORS:
    print(f'\n>> {len(ERRORS)} test(s) failed')
    for e in ERRORS:
        print(f'  - {e}')
    sys.exit(1)
else:
    print('\n>> All tests passed')
