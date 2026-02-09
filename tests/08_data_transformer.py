"""Test 08: Data Transformer view - switch tab, interact with flow editor."""
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
    "name": "TransformTest",
    "description": "",
    "collections": [
        {
            "id": "c1",
            "name": "users",
            "fields": [
                {"id": "f1", "name": "email", "type": "string", "isRequired": True, "description": ""},
                {"id": "f2", "name": "age", "type": "number", "isRequired": False, "description": ""}
            ],
            "subcollections": [],
            "description": ""
        },
        {
            "id": "c2",
            "name": "posts",
            "fields": [
                {"id": "f3", "name": "title", "type": "string", "isRequired": True, "description": ""}
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

    # Switch to Transforms tab
    print('\n=== TEST: Transforms Tab ===')
    xform_tab = page.locator('button:has-text("Transforms")')
    check(xform_tab.count() > 0, 'Transforms tab found')
    xform_tab.first.click()
    page.wait_for_timeout(1000)
    page.screenshot(path=os.path.join(SCREENSHOT_DIR, '08_transforms_view.png'))

    # Check for React Flow canvas
    print('\n=== TEST: Flow Editor Canvas ===')
    flow_canvas = page.locator('.react-flow, [class*="reactflow"], .react-flow__viewport')
    check(flow_canvas.count() > 0, 'React Flow canvas is present')

    # Check for UI elements
    print('\n=== TEST: Transformer UI Elements ===')
    page_text = page.inner_text('body')
    check('users' in page_text.lower() or 'transform' in page_text.lower() or 'node' in page_text.lower(),
          'Transform view shows collection or node info')

    # Check for source/target nodes or add-node button
    print('\n=== TEST: Transform Nodes ===')
    nodes = page.locator('.react-flow__node')
    add_node_btn = page.locator('button:has-text("Add"), button:has-text("Node"), button[aria-label*="add" i]')
    check(nodes.count() > 0 or add_node_btn.count() > 0, 'Nodes exist or add-node button available')

    if nodes.count() > 0:
        print(f'  [INFO] Found {nodes.count()} nodes in flow editor')
    if add_node_btn.count() > 0:
        add_node_btn.first.click()
        page.wait_for_timeout(500)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, '08_after_add_node.png'))

    # Select a collection for transformer if needed
    print('\n=== TEST: Collection Selection in Transformer ===')
    select_el = page.locator('select').first
    if select_el.count() > 0 and select_el.is_visible():
        options = select_el.locator('option').all_text_contents()
        check(len(options) > 0, f'Select has options: {options[:5]}')
        if len(options) > 1:
            select_el.select_option(index=1)
            page.wait_for_timeout(500)
    else:
        col_btns = page.locator('button:has-text("users"), button:has-text("posts")')
        if col_btns.count() > 0:
            col_btns.first.click()
            page.wait_for_timeout(500)

    page.screenshot(path=os.path.join(SCREENSHOT_DIR, '08_transforms_final.png'))
    browser.close()

if ERRORS:
    print(f'\n>> {len(ERRORS)} test(s) failed')
    for e in ERRORS:
        print(f'  - {e}')
    sys.exit(1)
else:
    print('\n>> All tests passed')
