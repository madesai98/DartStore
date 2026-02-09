"""Test 05: CollectionEditor - field CRUD, type config."""
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
    "name": "FieldTest",
    "description": "Testing field CRUD",
    "collections": [
        {
            "id": "c1",
            "name": "users",
            "fields": [],
            "subcollections": [],
            "description": "User collection"
        }
    ],
    "securityRules": {},
    "transformConfig": {"collections": {}}
})


def add_field(page, field_name, field_type):
    """Helper to add a field via the Add Field form."""
    # First, click the "Add Field" button that OPENS the form (not type=submit)
    # Wait for form to be gone (in case previous submission is still processing)
    page.wait_for_timeout(200)

    # The opener button is NOT type="submit" and has text "Add Field"
    opener = page.locator('button:has-text("Add Field"):not([type="submit"])')
    if opener.count() > 0 and opener.first.is_visible():
        opener.first.click()
        page.wait_for_timeout(300)

    # Fill field name
    name_input = page.locator('input[placeholder="fieldName"]')
    name_input.fill(field_name)

    # Select type - get the type select within the form
    form = page.locator('form')
    type_select = form.locator('select').first
    type_select.select_option(field_type)
    page.wait_for_timeout(200)

    # Submit the form
    submit_btn = form.locator('button[type="submit"]')
    submit_btn.click()
    page.wait_for_timeout(300)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    page.evaluate(f'localStorage.setItem("dartstore_project", {json.dumps(SEED)})')
    page.reload()
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(500)

    # Select the collection
    users_item = page.locator('div[role="button"][aria-label*="users" i]')
    if users_item.count() > 0:
        users_item.first.click()
        page.wait_for_timeout(500)

    # Add a field
    print('\n=== TEST: Add Field ===')
    add_field_btn = page.locator('button:has-text("Add Field")')
    check(add_field_btn.count() > 0, 'Add Field button found')

    add_field(page, 'email', 'string')
    page.screenshot(path=os.path.join(SCREENSHOT_DIR, '05_field_added.png'))

    # Verify field appears in the list
    body_text = page.inner_text('body')
    check('email' in body_text, 'Field "email" visible after adding')

    # Add more fields with different types
    print('\n=== TEST: Add Multiple Fields ===')
    field_types = [
        ('age', 'number'),
        ('isActive', 'boolean'),
        ('createdAt', 'timestamp'),
        ('location', 'geopoint'),
        ('tags', 'array'),
    ]
    # Note: 'array' type may show additional form fields but submission should still work

    for fname, ftype in field_types:
        add_field(page, fname, ftype)

    page.screenshot(path=os.path.join(SCREENSHOT_DIR, '05_multiple_fields.png'))

    body_text2 = page.inner_text('body')
    for fname, _ in field_types:
        check(fname in body_text2, f'Field "{fname}" visible in editor')

    # Wait for auto-save debounce (1000ms) to flush to localStorage
    page.wait_for_timeout(1500)

    # Verify localStorage has the fields
    print('\n=== TEST: Fields Persisted ===')
    saved = page.evaluate('localStorage.getItem("dartstore_project")')
    if saved:
        project = json.loads(saved)
        fields = project.get('collections', [{}])[0].get('fields', [])
        check(len(fields) >= 5, f'At least 5 fields saved (got {len(fields)})')
        field_names = [f.get('name', '') for f in fields]
        for fname, _ in field_types:
            check(fname in field_names, f'Field "{fname}" persisted in localStorage')
    else:
        check(False, 'No project in localStorage')

    # Delete a field
    print('\n=== TEST: Delete Field ===')
    # First, get current field count from localStorage
    saved_before = page.evaluate('localStorage.getItem("dartstore_project")')
    if saved_before:
        fields_before = json.loads(saved_before).get('collections', [{}])[0].get('fields', [])
        count_before = len(fields_before)
    else:
        count_before = 0

    delete_btns = page.locator('button[title="Delete field"]')
    if delete_btns.count() > 0:
        # Buttons are hidden until hover - hover near the button to trigger group-hover
        last_btn = delete_btns.last
        box = last_btn.bounding_box()
        if box:
            page.mouse.move(box['x'] - 50, box['y'] + box['height'] / 2)
            page.wait_for_timeout(400)
        last_btn.click()
        page.wait_for_timeout(1500)  # Wait for auto-save debounce
        saved_after = page.evaluate('localStorage.getItem("dartstore_project")')
        if saved_after:
            fields_after = json.loads(saved_after).get('collections', [{}])[0].get('fields', [])
            check(len(fields_after) < count_before, f'Field count decreased ({count_before} -> {len(fields_after)})')
        else:
            check(False, 'localStorage empty after delete')
    else:
        check(False, 'No delete buttons found')

    page.screenshot(path=os.path.join(SCREENSHOT_DIR, '05_after_field_delete.png'))
    browser.close()

if ERRORS:
    print(f'\n>> {len(ERRORS)} test(s) failed')
    for e in ERRORS:
        print(f'  - {e}')
    sys.exit(1)
else:
    print('\n>> All tests passed')
