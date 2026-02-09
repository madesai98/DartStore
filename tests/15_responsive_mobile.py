"""Test 15: Mobile responsiveness — sidebar drawer, no cutoff, collapsible sections, touch-friendly."""
from playwright.sync_api import sync_playwright
import os, json, sys

BASE = 'http://localhost:5174/DartStore/'
SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), 'screenshots')
os.makedirs(SCREENSHOT_DIR, exist_ok=True)
ERRORS = []

def check(condition, msg):
    if not condition:
        ERRORS.append(msg)
        print(f'  [FAIL] {msg}')
    else:
        print(f'  [PASS] {msg}')

def no_h_scroll(page):
    return not page.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth')

SEED = json.dumps({
    "name": "MobileTest",
    "description": "Testing responsive design",
    "collections": [
        {
            "id": "c1",
            "name": "users",
            "fields": [
                {"id": "f1", "name": "email", "type": "string", "isRequired": True, "description": "User email"},
                {"id": "f2", "name": "age", "type": "number", "isRequired": False, "description": ""},
                {"id": "f3", "name": "isActive", "type": "boolean", "isRequired": False, "description": ""}
            ],
            "subcollections": [],
            "description": "User collection"
        },
        {
            "id": "c2",
            "name": "posts",
            "fields": [
                {"id": "f4", "name": "title", "type": "string", "isRequired": True, "description": ""},
                {"id": "f5", "name": "body", "type": "string", "isRequired": True, "description": ""}
            ],
            "subcollections": [],
            "description": ""
        }
    ]
})

VIEWPORTS = [
    ("iPhone SE", 375, 667),
    ("iPhone 14", 390, 844),
    ("Galaxy S21", 360, 800),
    ("iPad Mini", 768, 1024),
    ("Small Laptop", 1024, 768),
]

def seed_project(page):
    """Inject test project via localStorage and reload."""
    page.evaluate(f'localStorage.setItem("dartstore_project", {json.dumps(SEED)})')
    page.reload()
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(500)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # ── 1. Welcome screen at mobile sizes ────────────────────────────────
    print('\n=== TEST: Welcome Screen Mobile ===')
    page = browser.new_page(viewport={'width': 375, 'height': 667})
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    page.evaluate('localStorage.removeItem("dartstore_project")')
    page.reload()
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(500)

    check(no_h_scroll(page), 'Welcome screen: no horizontal scrollbar at 375px')
    title = page.locator('h1:has-text("DartStore")')
    check(title.is_visible(), 'Welcome screen: title visible at 375px')
    title_box = title.bounding_box()
    if title_box:
        check(title_box['x'] >= 0 and title_box['x'] + title_box['width'] <= 375,
              'Welcome screen: title not clipped horizontally')
    create_btn = page.locator('button:has-text("Create New Project")')
    check(create_btn.is_visible(), 'Welcome screen: Create Project button visible')
    page.screenshot(path=os.path.join(SCREENSHOT_DIR, '15_welcome_mobile.png'))
    page.close()

    # ── 2. Main layout at multiple viewports ─────────────────────────────
    for name, w, h in VIEWPORTS:
        print(f'\n=== TEST: Main Layout at {name} ({w}x{h}) ===')
        page = browser.new_page(viewport={'width': w, 'height': h})
        page.goto(BASE)
        page.wait_for_load_state('networkidle')
        seed_project(page)

        check(no_h_scroll(page), f'{name}: no horizontal scrollbar')

        header = page.locator('header')
        check(header.is_visible(), f'{name}: header visible')
        header_box = header.bounding_box()
        if header_box:
            check(header_box['width'] <= w + 1, f'{name}: header not wider than viewport')

        tabs = page.locator('button[role="tab"]')
        check(tabs.count() >= 4, f'{name}: all 4 tab buttons present')

        # Tab labels should be hidden below md (768px) — icons only
        if w < 768:
            label_span = tabs.first.locator('span')
            if label_span.count() > 0:
                check(not label_span.first.is_visible(), f'{name}: tab labels hidden (icon-only)')

        # Hamburger menu on mobile (< 1024px)
        if w < 1024:
            hamburger = page.locator('button[aria-label*="menu" i], button[aria-expanded]')
            check(hamburger.count() > 0, f'{name}: hamburger menu visible')

        page.screenshot(path=os.path.join(SCREENSHOT_DIR, f'15_layout_{name.lower().replace(" ", "_")}.png'))
        page.close()

    # ── 3. Mobile sidebar drawer + full-height ───────────────────────────
    print('\n=== TEST: Mobile Sidebar Drawer ===')
    page = browser.new_page(viewport={'width': 375, 'height': 667})
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    seed_project(page)

    sidebar_toggle = page.locator('button[aria-label="Open sidebar"]')
    check(sidebar_toggle.count() > 0, 'Mobile sidebar: toggle FAB visible')

    if sidebar_toggle.count() > 0:
        sidebar_toggle.first.click()
        page.wait_for_timeout(400)

        nav = page.locator('nav[aria-label]')
        check(nav.is_visible(), 'Mobile sidebar: drawer opens when toggle clicked')

        # Check sidebar stretches full height
        nav_box = nav.bounding_box()
        if nav_box:
            check(nav_box['height'] >= 600, f'Mobile sidebar: full height ({nav_box["height"]:.0f}px >= 600px)')

        # Backdrop present
        overlays = page.evaluate('() => document.querySelectorAll(".fixed.inset-0").length')
        check(overlays > 0, 'Mobile sidebar: backdrop overlay present')

        page.screenshot(path=os.path.join(SCREENSHOT_DIR, '15_sidebar_open.png'))

        # Click backdrop to close
        page.locator('.fixed.inset-0').first.click(position={'x': 350, 'y': 300})
        page.wait_for_timeout(400)

    page.close()

    # ── 4. Sidebar FAB on overview page ──────────────────────────────────
    print('\n=== TEST: Sidebar FAB on Overview ===')
    page = browser.new_page(viewport={'width': 375, 'height': 667})
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    seed_project(page)

    # Switch to overview tab
    overview_tab = page.locator('button[role="tab"][title="Overview"]')
    if overview_tab.count() > 0:
        overview_tab.first.click()
        page.wait_for_timeout(500)

        fab = page.locator('button[aria-label="Open sidebar"]')
        check(fab.count() > 0 and fab.first.is_visible(), 'Overview page: sidebar FAB visible')
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, '15_overview_fab.png'))

    page.close()

    # ── 5. Code Preview modal at mobile ──────────────────────────────────
    print('\n=== TEST: Code Preview Modal Mobile ===')
    page = browser.new_page(viewport={'width': 375, 'height': 667})
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    seed_project(page)

    hamburger = page.locator('button[aria-label*="menu" i], button[aria-expanded]')
    if hamburger.count() > 0:
        hamburger.first.click()
        page.wait_for_timeout(300)

        view_code = page.locator('button:has-text("View Code"):visible')
        if view_code.count() > 0:
            view_code.first.click()
            page.wait_for_timeout(500)

            modal = page.locator('[role="dialog"]')
            check(modal.is_visible(), 'Code preview: modal visible')
            check(no_h_scroll(page), 'Code preview: no horizontal scrollbar')

            # Header should not wrap — title and close button on same row
            modal_title = modal.locator('h2')
            close_btn = modal.locator('button[aria-label="Close code preview"]')
            if modal_title.count() > 0 and close_btn.count() > 0:
                title_box = modal_title.first.bounding_box()
                close_box = close_btn.first.bounding_box()
                if title_box and close_box:
                    check(abs(title_box['y'] - close_box['y']) < 15,
                          'Code preview header: title and close on same row')

            # Tab switcher should have icon-only tabs (labels hidden at <640px)
            code_tabs = modal.locator('button[role="tab"]')
            if code_tabs.count() > 0:
                label_span = code_tabs.first.locator('span')
                if label_span.count() > 0:
                    check(not label_span.first.is_visible(),
                          'Code preview: tab labels hidden on mobile (icon-only)')

            page.screenshot(path=os.path.join(SCREENSHOT_DIR, '15_code_preview_mobile.png'))

            close_btn = modal.locator('button[aria-label="Close code preview"]')
            if close_btn.count() > 0:
                close_btn.first.click()
                page.wait_for_timeout(300)

    page.close()

    # ── 6. Security Rules page header on mobile ──────────────────────────
    print('\n=== TEST: Security Rules Header Mobile ===')
    page = browser.new_page(viewport={'width': 375, 'height': 667})
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    seed_project(page)

    sec_tab = page.locator('button[role="tab"][title="Security Rules"]')
    if sec_tab.count() > 0:
        sec_tab.first.click()
        page.wait_for_timeout(500)

        check(no_h_scroll(page), 'Security Rules page: no horizontal scrollbar')

        # The toolbar should be a single row — version picker and toggle aligned
        v2_btn = page.locator('button:has-text("v2")')
        if v2_btn.count() > 0:
            v2_box = v2_btn.first.bounding_box()
            # Find the Preview/Toggle buttons on the right
            preview_btn = page.locator('button[title="Preview Rules"]')
            if preview_btn.count() > 0 and v2_box:
                preview_box = preview_btn.first.bounding_box()
                if preview_box:
                    check(abs(v2_box['y'] - preview_box['y']) < 20,
                          'Security Rules toolbar: version and preview on same row')

        page.screenshot(path=os.path.join(SCREENSHOT_DIR, '15_security_rules_mobile.png'))

    page.close()

    # ── 7. Transforms page header on mobile ──────────────────────────────
    print('\n=== TEST: Transforms Header Mobile ===')
    page = browser.new_page(viewport={'width': 375, 'height': 667})
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    seed_project(page)

    trans_tab = page.locator('button[role="tab"][title="Transforms"]')
    if trans_tab.count() > 0:
        trans_tab.first.click()
        page.wait_for_timeout(500)

        check(no_h_scroll(page), 'Transforms page: no horizontal scrollbar')

        # Read/Write switcher should be visible
        read_btn = page.locator('button:has-text("Read")')
        write_btn = page.locator('button:has-text("Write")')
        check(read_btn.count() > 0 and read_btn.first.is_visible(), 'Transforms: Read button visible')
        check(write_btn.count() > 0 and write_btn.first.is_visible(), 'Transforms: Write button visible')

        # Toolbar should be single row — Read and toggles on same Y
        if read_btn.count() > 0:
            read_box = read_btn.first.bounding_box()
            toggle_labels = page.locator('label:has(button)')
            if toggle_labels.count() > 0 and read_box:
                toggle_box = toggle_labels.last.bounding_box()
                if toggle_box:
                    check(abs(read_box['y'] - toggle_box['y']) < 20,
                          'Transforms toolbar: Read and toggles on same row')

        page.screenshot(path=os.path.join(SCREENSHOT_DIR, '15_transforms_mobile.png'))

    page.close()

    # ── 8. Collection editor fields at mobile ────────────────────────────
    print('\n=== TEST: Collection Editor Mobile ===')
    page = browser.new_page(viewport={'width': 375, 'height': 667})
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    seed_project(page)

    main = page.locator('main')
    check(main.is_visible(), 'Main content visible on mobile')

    field_rows = page.locator('main .font-mono')
    if field_rows.count() > 0:
        field_box = field_rows.first.bounding_box()
        if field_box:
            check(field_box['x'] >= 0, 'Field row not clipped on left')
            check(field_box['x'] + field_box['width'] <= 377, 'Field row not clipped on right')

    add_field_btn = page.locator('button:has-text("Add Field")')
    if add_field_btn.count() > 0:
        add_field_btn.first.click()
        page.wait_for_timeout(300)
        check(no_h_scroll(page), 'Add Field form: no horizontal scrollbar')
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, '15_add_field_mobile.png'))

    page.close()

    # ── 9. All tabs at mobile without overflow ───────────────────────────
    print('\n=== TEST: All Tabs No Overflow ===')
    page = browser.new_page(viewport={'width': 375, 'height': 667})
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    seed_project(page)

    tab_buttons = page.locator('button[role="tab"]')
    tab_count = tab_buttons.count()
    for i in range(tab_count):
        tab = tab_buttons.nth(i)
        label = tab.get_attribute('title') or tab.inner_text().strip()
        tab.click()
        page.wait_for_timeout(400)
        check(no_h_scroll(page), f'Tab "{label}": no horizontal scrollbar at 375px')

    page.screenshot(path=os.path.join(SCREENSHOT_DIR, '15_tabs_mobile.png'))
    page.close()

    # ── 10. Tiny viewport stress test (320px) ────────────────────────────
    print('\n=== TEST: Tiny Viewport (320x480) ===')
    page = browser.new_page(viewport={'width': 320, 'height': 480})
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    seed_project(page)

    check(no_h_scroll(page), 'Tiny viewport (320px): no horizontal scrollbar')
    header = page.locator('header')
    check(header.is_visible(), 'Tiny viewport: header still visible')
    page.screenshot(path=os.path.join(SCREENSHOT_DIR, '15_tiny_320.png'))
    page.close()

    browser.close()

if ERRORS:
    print(f'\n>> {len(ERRORS)} test(s) failed')
    for e in ERRORS:
        print(f'  - {e}')
    sys.exit(1)
else:
    print('\n>> All tests passed')
