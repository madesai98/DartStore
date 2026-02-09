"""Test 07: Security Rules view - switch tab, toggle rules, conditions."""
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
    "name": "SecurityTest",
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
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    page.evaluate(f'localStorage.setItem("dartstore_project", {json.dumps(SEED)})')
    page.reload()
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(500)

    # Switch to Security Rules tab
    print('\n=== TEST: Security Rules Tab ===')
    sec_tab = page.locator('button:has-text("Security Rules")')
    check(sec_tab.count() > 0, 'Security Rules tab found')
    sec_tab.first.click()
    page.wait_for_timeout(500)

    # Select collection from sidebar
    users_item = page.locator('div[role="button"][aria-label*="users" i]')
    if users_item.count() > 0:
        users_item.first.click()
        page.wait_for_timeout(500)

    page.screenshot(path=os.path.join(SCREENSHOT_DIR, '07_security_rules_view.png'))

    page_text = page.inner_text('body')
    check('users' in page_text.lower() or 'security' in page_text.lower() or 'rules' in page_text.lower(),
          'Security rules view shows content')

    # Check for rule operation toggles (need to add a rule first)
    print('\n=== TEST: Rule Operation Toggles ===')
    add_rule_btn = page.locator('button:has-text("Add Rule"), button:has-text("Add First Rule")')
    if add_rule_btn.count() > 0:
        add_rule_btn.first.click()
        page.wait_for_timeout(500)

    operations = ['Read', 'Write', 'Create', 'Update', 'Delete', 'Get', 'List']
    found_ops = 0
    for op in operations:
        op_el = page.locator(f'button:has-text("{op}")')
        if op_el.count() > 0:
            found_ops += 1
    check(found_ops >= 2, f'At least 2 rule operations visible ({found_ops} found)')

    # Toggle a checkbox/switch for a rule
    print('\n=== TEST: Toggle Rule ===')
    checkboxes = page.locator('input[type="checkbox"]').all()
    toggles = page.locator('button[role="switch"]').all()
    toggle_els = checkboxes + toggles
    if toggle_els:
        toggle_els[0].click()
        page.wait_for_timeout(300)
        check(True, 'Toggled first rule control')
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, '07_rule_toggled.png'))
    else:
        check(False, 'No toggle controls found for rules')

    # Look for condition-related elements (conditions appear in the rule card)
    print('\n=== TEST: Rule Conditions ===')
    page_text2 = page.inner_text('body')
    has_condition = ('condition' in page_text2.lower()
                     or 'allow' in page_text2.lower()
                     or 'deny' in page_text2.lower()
                     or 'Add Condition' in page_text2
                     or 'authenticated' in page_text2.lower())
    check(has_condition, 'Condition-related content found')

    # Preview rules button
    print('\n=== TEST: Security Rules Preview ===')
    preview_btn = page.locator('button[aria-label*="preview" i], button:has-text("Preview"), button[aria-label*="code" i]')
    if preview_btn.count() > 0:
        preview_btn.first.click()
        page.wait_for_timeout(800)
        dialog = page.locator('[role="dialog"]')
        if dialog.is_visible():
            check(True, 'Security Rules preview dialog opens')
            preview_text = dialog.inner_text()
            check('rules_version' in preview_text or 'match' in preview_text or 'allow' in preview_text,
                  'Preview contains Firestore security rules syntax')
            page.screenshot(path=os.path.join(SCREENSHOT_DIR, '07_rules_preview_dialog.png'))
            page.keyboard.press('Escape')
            page.wait_for_timeout(300)
        else:
            check(False, 'Preview dialog did not open')
    else:
        check(False, 'No preview button found for security rules')

    browser.close()

if ERRORS:
    print(f'\n>> {len(ERRORS)} test(s) failed')
    for e in ERRORS:
        print(f'  - {e}')
    sys.exit(1)
else:
    print('\n>> All tests passed')
