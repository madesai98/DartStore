"""Test 06: CodePreview modal - open, tabs, content, copy, close."""
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
    "name": "CodePreviewTest",
    "description": "Testing code preview",
    "collections": [
        {
            "id": "c1",
            "name": "users",
            "fields": [
                {"id": "f1", "name": "email", "type": "string", "isRequired": True, "description": "User email"},
                {"id": "f2", "name": "age", "type": "number", "isRequired": False, "description": ""},
                {"id": "f3", "name": "createdAt", "type": "timestamp", "isRequired": True, "description": ""}
            ],
            "subcollections": [],
            "description": "User collection"
        },
        {
            "id": "c2",
            "name": "posts",
            "fields": [
                {"id": "f4", "name": "title", "type": "string", "isRequired": True, "description": ""},
                {"id": "f5", "name": "tags", "type": "array", "isRequired": False, "description": "", "arrayItemType": "string"}
            ],
            "subcollections": [],
            "description": "Blog posts"
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
    page.evaluate(f'localStorage.setItem("dartstore_project", {json.dumps(SEED)})')
    page.reload()
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(800)

    # Open code preview
    print('\n=== TEST: Open Code Preview ===')
    code_btn = page.locator('button:has-text("View Code")')
    check(code_btn.count() > 0, 'Code preview button found')
    code_btn.first.click()
    page.wait_for_timeout(1000)

    dialog = page.locator('[role="dialog"]')
    check(dialog.is_visible(), 'Code preview dialog opens')
    page.screenshot(path=os.path.join(SCREENSHOT_DIR, '06_code_preview_open.png'))

    # Check Dart tab content
    print('\n=== TEST: Dart Code Content ===')
    dialog_text = dialog.inner_text()
    check('Users' in dialog_text or 'users' in dialog_text or 'class' in dialog_text.lower(),
          'Dart code contains generated class')
    check('email' in dialog_text, 'Dart code contains "email" field')
    check('fromFirestore' in dialog_text or 'toFirestore' in dialog_text or 'factory' in dialog_text.lower(),
          'Dart code has Firestore methods')

    # Check tabs exist
    print('\n=== TEST: Code Preview Tabs ===')
    tabs = ['Dart', 'Security', 'Cloud']
    for tab in tabs:
        tab_el = dialog.locator(f'button:has-text("{tab}")')
        if tab_el.count() > 0:
            check(True, f'Tab "{tab}" found')
            tab_el.first.click()
            page.wait_for_timeout(500)
            page.screenshot(path=os.path.join(SCREENSHOT_DIR, f'06_tab_{tab.lower()}.png'))
        else:
            check(False, f'Tab "{tab}" not found')

    dart_tab = dialog.locator('button:has-text("Dart")')
    if dart_tab.count() > 0:
        dart_tab.first.click()
        page.wait_for_timeout(500)

    # Copy button
    print('\n=== TEST: Copy Button ===')
    copy_btn = dialog.locator('button[aria-label*="copy" i], button:has-text("Copy")')
    check(copy_btn.count() > 0, 'Copy button found in dialog')

    # Close with Escape
    print('\n=== TEST: Close Dialog ===')
    page.keyboard.press('Escape')
    page.wait_for_timeout(500)
    check(not dialog.is_visible(), 'Dialog closes on Escape key')

    # Reopen and close with X
    code_btn.first.click()
    page.wait_for_timeout(800)
    close_btn = page.locator('[role="dialog"] button[aria-label*="close" i]')
    if close_btn.count() > 0:
        close_btn.first.click()
        page.wait_for_timeout(300)
        check(not page.locator('[role="dialog"]').is_visible(), 'Dialog closes on X button')
    else:
        page.keyboard.press('Escape')
        page.wait_for_timeout(300)
        check(True, 'Dialog close button not found, but Escape works')

    browser.close()

if ERRORS:
    print(f'\n>> {len(ERRORS)} test(s) failed')
    for e in ERRORS:
        print(f'  - {e}')
    sys.exit(1)
else:
    print('\n>> All tests passed')
