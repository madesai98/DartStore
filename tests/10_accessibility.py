"""Test 10: Accessibility - keyboard navigation, ARIA, focus management."""
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
    "name": "A11yTest",
    "description": "Accessibility testing",
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

    # ARIA landmarks
    print('\n=== TEST: ARIA Landmarks ===')
    header = page.locator('header')
    nav = page.locator('nav')
    main = page.locator('main')
    check(header.count() > 0, '<header> landmark exists')
    check(nav.count() > 0, '<nav> landmark exists')
    check(main.count() > 0 or page.locator('[role="main"]').count() > 0, '<main> or role="main" exists')

    # Sidebar aria-label
    print('\n=== TEST: Sidebar ARIA ===')
    nav_label = nav.first.get_attribute('aria-label')
    check(nav_label is not None and len(nav_label) > 0, f'Sidebar nav has aria-label: "{nav_label}"')

    # Tab roles for view tabs
    print('\n=== TEST: Tab ARIA Roles ===')
    tablist = page.locator('[role="tablist"]')
    check(tablist.count() > 0, 'Tablist role exists for view tabs')
    tabs = page.locator('[role="tab"]')
    check(tabs.count() >= 3, f'At least 3 tabs with role="tab" (got {tabs.count()})')

    selected_tabs = page.locator('[role="tab"][aria-selected="true"]')
    check(selected_tabs.count() == 1, 'Exactly one tab has aria-selected="true"')

    # Icon buttons have aria-labels
    print('\n=== TEST: Icon Button Labels ===')
    all_buttons = page.locator('button').all()
    unlabeled = []
    for btn in all_buttons:
        text = btn.inner_text().strip()
        aria_label = btn.get_attribute('aria-label')
        title = btn.get_attribute('title')
        aria_hidden = btn.get_attribute('aria-hidden')
        if aria_hidden == 'true':
            continue
        if not text and not aria_label and not title:
            tag_html = btn.evaluate('el => el.outerHTML.substring(0, 100)')
            unlabeled.append(tag_html)

    if unlabeled:
        print(f'  [WARN] {len(unlabeled)} unlabeled buttons:')
        for u in unlabeled[:5]:
            print(f'    {u}')
    check(len(unlabeled) == 0, f'All icon buttons have labels ({len(unlabeled)} unlabeled)')

    # Keyboard navigation
    print('\n=== TEST: Keyboard Navigation ===')
    page.keyboard.press('Tab')
    page.wait_for_timeout(200)
    focused = page.evaluate('document.activeElement?.tagName')
    check(focused is not None and focused != 'BODY', f'Tab key moves focus (focused: {focused})')

    for _ in range(5):
        page.keyboard.press('Tab')
        page.wait_for_timeout(100)
    focused2 = page.evaluate('document.activeElement?.tagName')
    check(focused2 is not None and focused2 != 'BODY', f'Multiple Tab presses move focus (focused: {focused2})')

    # Modal accessibility
    print('\n=== TEST: Modal Accessibility ===')
    code_btn = page.locator('button:has-text("View Code")')
    if code_btn.count() > 0:
        code_btn.first.click()
        page.wait_for_timeout(800)
        dialog = page.locator('[role="dialog"]')
        check(dialog.count() > 0, 'Modal has role="dialog"')
        aria_modal = dialog.first.get_attribute('aria-modal')
        check(aria_modal == 'true', 'Modal has aria-modal="true"')
        aria_labelledby = dialog.first.get_attribute('aria-labelledby')
        check(aria_labelledby is not None, f'Modal has aria-labelledby="{aria_labelledby}"')
        page.keyboard.press('Escape')
        page.wait_for_timeout(300)

    # Meta tags
    print('\n=== TEST: Meta Tags ===')
    theme_color = page.locator('meta[name="theme-color"]')
    check(theme_color.count() > 0, 'Meta theme-color tag exists')
    color_scheme = page.locator('meta[name="color-scheme"]')
    check(color_scheme.count() > 0, 'Meta color-scheme tag exists')

    # prefers-reduced-motion
    print('\n=== TEST: Reduced Motion ===')
    has_motion_rule = page.evaluate('''() => {
        const sheets = document.styleSheets;
        for (let s = 0; s < sheets.length; s++) {
            try {
                const rules = sheets[s].cssRules;
                for (let r = 0; r < rules.length; r++) {
                    if (rules[r].conditionText && rules[r].conditionText.includes('prefers-reduced-motion')) {
                        return true;
                    }
                }
            } catch(e) {}
        }
        return false;
    }''')
    check(has_motion_rule, 'CSS includes prefers-reduced-motion media query')

    page.screenshot(path=os.path.join(SCREENSHOT_DIR, '10_a11y.png'))
    browser.close()

if ERRORS:
    print(f'\n>> {len(ERRORS)} test(s) failed')
    for e in ERRORS:
        print(f'  - {e}')
    sys.exit(1)
else:
    print('\n>> All tests passed')
