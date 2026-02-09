"""Test 04: Sidebar - collection CRUD, subcollections, selection."""
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
    "name": "Sidebar Test",
    "description": "",
    "collections": [],
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

    # Sidebar visible
    print('\n=== TEST: Sidebar Visibility ===')
    sidebar = page.locator('nav[aria-label]')
    check(sidebar.count() > 0, 'Sidebar nav element exists')

    # Create first collection
    print('\n=== TEST: Create Collection ===')
    add_btn = page.locator('button[aria-label="Add collection"]')
    check(add_btn.count() > 0, 'Add collection button found')
    add_btn.first.click()
    page.wait_for_timeout(500)

    # Fill in the collection form
    name_input = page.locator('input[placeholder="Collection name"]')
    check(name_input.is_visible(), 'Collection name input appeared')
    name_input.fill('users')

    desc_input = page.locator('input[placeholder="Description (optional)"]')
    if desc_input.count() > 0:
        desc_input.fill('User collection')

    create_btn = page.locator('button:has-text("Create")')
    create_btn.click()
    page.wait_for_timeout(500)
    page.screenshot(path=os.path.join(SCREENSHOT_DIR, '04_collection_created.png'))

    users_el = page.locator('text=users')
    check(users_el.count() > 0, 'Collection "users" appears in sidebar')

    # Select collection
    print('\n=== TEST: Select Collection ===')
    # Collection items are div[role="button"] not <button>
    collection_item = page.locator('div[role="button"][aria-label*="users" i]')
    if collection_item.count() == 0:
        collection_item = page.locator('[aria-selected]:has-text("users")')
    if collection_item.count() > 0:
        collection_item.first.click()
        page.wait_for_timeout(500)
        is_selected = collection_item.first.get_attribute('aria-selected')
        check(is_selected == 'true', f'Collection becomes selected (aria-selected={is_selected})')
    else:
        check(False, 'No collection item to select')

    body_text = page.inner_text('body')
    has_editor = ('Add Field' in body_text or 'Fields' in body_text or
                  'field' in body_text.lower() or 'No fields' in body_text)
    check(has_editor, 'Collection editor content visible after selecting collection')
    page.screenshot(path=os.path.join(SCREENSHOT_DIR, '04_collection_selected.png'))

    # Create second collection
    print('\n=== TEST: Create Second Collection ===')
    add_btn2 = page.locator('button[aria-label="Add collection"]')
    add_btn2.first.click()
    page.wait_for_timeout(500)

    name_input2 = page.locator('input[placeholder="Collection name"]')
    name_input2.fill('posts')
    create_btn2 = page.locator('button:has-text("Create")')
    create_btn2.click()
    page.wait_for_timeout(500)

    sidebar_text = page.locator('nav').inner_text()
    check('users' in sidebar_text.lower() and 'posts' in sidebar_text.lower(),
          'Both collections exist in sidebar')
    page.screenshot(path=os.path.join(SCREENSHOT_DIR, '04_two_collections.png'))

    # Delete a collection
    print('\n=== TEST: Delete Collection ===')
    # First select posts collection
    posts_item = page.locator('div[role="button"][aria-label*="posts" i]')
    if posts_item.count() > 0:
        posts_item.first.click()
        page.wait_for_timeout(300)

    # Delete button has aria-label="Delete posts" and requires double-click (confirm)
    delete_btn = page.locator('button[aria-label="Delete posts"]')
    if delete_btn.count() == 0:
        delete_btn = page.locator('button[aria-label*="Delete" i]')
    if delete_btn.count() > 0:
        # First click changes to "Confirm delete"
        delete_btn.first.click()
        page.wait_for_timeout(300)
        # Second click - now it says "Confirm delete"
        confirm_btn = page.locator('button[aria-label="Confirm delete"]')
        if confirm_btn.count() > 0:
            confirm_btn.first.click()
        else:
            delete_btn.first.click()
        page.wait_for_timeout(500)
        sidebar_text_after = page.locator('nav').inner_text()
        check('posts' not in sidebar_text_after.lower(), 'Collection "posts" was deleted')
    else:
        check(False, 'No delete button found for posts collection')

    page.screenshot(path=os.path.join(SCREENSHOT_DIR, '04_after_delete.png'))
    browser.close()

if ERRORS:
    print(f'\n>> {len(ERRORS)} test(s) failed')
    for e in ERRORS:
        print(f'  - {e}')
    sys.exit(1)
else:
    print('\n>> All tests passed')
