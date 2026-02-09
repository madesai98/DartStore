"""Test 09: Overview Graph view - switch tab, verify graph renders."""
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
    "name": "OverviewTest",
    "description": "Testing overview graph",
    "collections": [
        {
            "id": "c1",
            "name": "users",
            "fields": [
                {"id": "f1", "name": "email", "type": "string", "isRequired": True, "description": ""},
                {"id": "f2", "name": "postRef", "type": "reference", "isRequired": False, "description": "", "referenceCollections": ["c2"]}
            ],
            "subcollections": [
                {
                    "id": "c3",
                    "name": "settings",
                    "fields": [
                        {"id": "f5", "name": "theme", "type": "string", "isRequired": False, "description": ""}
                    ],
                    "subcollections": [],
                    "description": "User settings"
                }
            ],
            "description": "User collection"
        },
        {
            "id": "c2",
            "name": "posts",
            "fields": [
                {"id": "f3", "name": "title", "type": "string", "isRequired": True, "description": ""},
                {"id": "f4", "name": "authorRef", "type": "reference", "isRequired": True, "description": "", "referenceCollections": ["c1"]}
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
    page.wait_for_timeout(500)

    # Switch to Overview tab (be precise - avoid matching project name "OverviewTest")
    print('\n=== TEST: Overview Tab ===')
    overview_tab = page.locator('button[aria-selected]:has-text("Overview")')
    check(overview_tab.count() > 0, 'Overview tab found')
    overview_tab.first.click()
    page.wait_for_timeout(1500)
    page.screenshot(path=os.path.join(SCREENSHOT_DIR, '09_overview_graph.png'))

    # Verify React Flow canvas
    print('\n=== TEST: Graph Canvas ===')
    canvas = page.locator('.react-flow, [class*="reactflow"], .react-flow__viewport')
    check(canvas.count() > 0, 'React Flow canvas is present in overview')

    # Verify nodes for collections
    print('\n=== TEST: Collection Nodes ===')
    nodes = page.locator('.react-flow__node')
    check(nodes.count() >= 2, f'At least 2 graph nodes (got {nodes.count()})')

    node_texts = []
    for i in range(nodes.count()):
        node_texts.append(nodes.nth(i).inner_text())
    all_node_text = ' '.join(node_texts).lower()
    check('users' in all_node_text, 'Node for "users" collection found')
    check('posts' in all_node_text, 'Node for "posts" collection found')

    # Verify edges
    print('\n=== TEST: Graph Edges ===')
    edges = page.locator('.react-flow__edge')
    check(edges.count() >= 1, f'At least 1 edge drawn (got {edges.count()})')

    # Check for subcollection node
    print('\n=== TEST: Subcollection Node ===')
    check('settings' in all_node_text, 'Subcollection "settings" node visible')

    # Check layout controls
    print('\n=== TEST: Graph Controls ===')
    controls = page.locator('.react-flow__controls, button[aria-label*="fit" i], button[aria-label*="zoom" i]')
    check(controls.count() > 0, 'Graph controls (zoom/fit) are present')

    # Click on a node
    print('\n=== TEST: Click Node ===')
    if nodes.count() > 0:
        nodes.first.click(force=True)
        page.wait_for_timeout(300)
        check(True, 'Successfully clicked a node')
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, '09_node_clicked.png'))

    browser.close()

if ERRORS:
    print(f'\n>> {len(ERRORS)} test(s) failed')
    for e in ERRORS:
        print(f'  - {e}')
    sys.exit(1)
else:
    print('\n>> All tests passed')
