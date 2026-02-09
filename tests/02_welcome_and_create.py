"""Test 02: Welcome Screen - create project, import project, join session form."""
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

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 900})

    # Fresh state
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    page.evaluate('localStorage.clear()')
    page.reload()
    page.wait_for_load_state('networkidle')

    print('\n=== TEST: Welcome Screen ===')

    create_btn = page.locator('button:has-text("Create New Project")')
    check(create_btn.is_visible(), 'Create New Project button is visible')

    import_label = page.locator('text=Import Project')
    check(import_label.count() > 0, 'Import Project element exists')

    join_inputs = page.locator('input[placeholder]').all()
    check(len(join_inputs) >= 2, f'At least 2 inputs found, got {len(join_inputs)}')

    join_btn = page.locator('button:has-text("Join Session")')
    check(join_btn.is_visible(), 'Join Session button exists')

    # Test project creation flow
    print('\n=== TEST: Create New Project ===')
    create_btn.click()
    page.wait_for_timeout(500)
    page.screenshot(path=os.path.join(SCREENSHOT_DIR, '02_create_project_form.png'))

    name_input = page.locator('input[placeholder*="project" i], input[placeholder*="name" i]').first
    check(name_input.is_visible(), 'Project name input is visible after clicking Create')

    name_input.fill('Test Project')

    desc_input = page.locator('input[placeholder*="description" i], input[placeholder*="Describe" i], textarea[placeholder*="description" i], textarea[placeholder*="Describe" i]').first
    if desc_input.count() > 0:
        desc_input.fill('A test project for DartStore')
        check(True, 'Description input found and filled')
    else:
        check(False, 'Description input not found')

    submit_btn = page.locator('button[type="submit"], button:has-text("Create")')
    submit_btn.first.click()
    page.wait_for_timeout(1000)
    page.screenshot(path=os.path.join(SCREENSHOT_DIR, '02_after_create_project.png'))

    header = page.locator('header')
    check(header.count() > 0, 'Header is visible after project creation')

    project_name_el = page.locator('text=Test Project')
    check(project_name_el.count() > 0, 'Project name "Test Project" visible in header')

    sidebar = page.locator('nav')
    check(sidebar.count() > 0, 'Sidebar/nav is visible')

    no_collection = page.locator('text=No collection selected')
    empty_hint = page.locator('text=Create a collection')
    check(no_collection.count() > 0 or empty_hint.count() > 0, 'Shows empty state when no collections exist')

    # Test auto-save to localStorage
    print('\n=== TEST: Auto-save to localStorage ===')
    saved = page.evaluate('localStorage.getItem("dartstore_project")')
    check(saved is not None, 'Project saved to localStorage')
    if saved:
        parsed = json.loads(saved)
        check(parsed.get('name') == 'Test Project', 'Saved project name matches')
        check(parsed.get('description') == 'A test project for DartStore', 'Saved project description matches')

    browser.close()

if ERRORS:
    print(f'\n>> {len(ERRORS)} test(s) failed')
    for e in ERRORS:
        print(f'  - {e}')
    sys.exit(1)
else:
    print('\n>> All tests passed')
