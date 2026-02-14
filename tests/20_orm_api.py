"""Test 20: ORM API generation — upload, download, deleteRemote, fetchAll.

Tests that every generated Dart class has the ORM public API:
  1. upload() — validates (if client validation enabled), then writes
     - Server-write mode → delegates to _saveToServer
     - Client/no transforms → uses direct Firestore
     - Returns Future<List<String>> (errors or empty on success)
  2. download() — fetches by remoteId, updates local data
     - Server-read mode → delegates to _fromServer
     - Client/no transforms → uses direct Firestore _fromFirestore
  3. deleteRemote() — deletes paired Firestore document by remoteId
  4. static fetchAll() — queries collection, returns List of ORM objects
  5. _remoteId internal field with public getter
  6. _updateFrom helper for mutable in-place download
  7. upload() calls validate() gate when validation is enabled
  8. Fields are mutable (no 'final' keyword) to support download() updates
"""
from playwright.sync_api import sync_playwright
import json, sys

BASE = "http://localhost:5173/DartStore/"
ERRORS = []


def check(condition, msg):
    if not condition:
        ERRORS.append(msg)
        print(f"  [FAIL] {msg}")
    else:
        print(f"  [PASS] {msg}")


def get_code(page, tab="dart"):
    view_code = page.locator('button:has-text("View Code"):not([type="submit"])')
    view_code.first.click()
    page.wait_for_timeout(1000)
    tab_label = "Dart Model" if tab == "dart" else "Cloud Function"
    page.locator(f'button[role="tab"]:has-text("{tab_label}")').click()
    page.wait_for_function("""() => {
        const eds = window.monaco?.editor?.getEditors?.();
        return eds && eds.length > 0 && eds[0].getValue().length > 0;
    }""", timeout=15000)
    page.wait_for_timeout(500)
    return page.evaluate("""() => {
        const eds = window.monaco?.editor?.getEditors?.();
        return (eds && eds.length > 0) ? eds[0].getValue() : '';
    }""")


def close_preview(page):
    close_btn = page.locator('button[aria-label="Close code preview"]')
    if close_btn.count() > 0 and close_btn.is_visible():
        close_btn.click()
        page.wait_for_timeout(500)


def seed(page, project, transform):
    page.evaluate(
        f'localStorage.setItem("dartstore_project", {json.dumps(json.dumps(project))})'
    )
    page.evaluate(
        f'localStorage.setItem("dartstore_transform_config", {json.dumps(json.dumps(transform))})'
    )
    page.reload()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1000)


# ── Project with validation rules ────────────────────────────────────────────
PROJECT_WITH_VALIDATION = {
    "name": "OrmTest",
    "description": "ORM API test",
    "collections": [
        {
            "id": "c1",
            "name": "orders",
            "description": "Order collection",
            "subcollections": [],
            "fields": [
                {
                    "id": "f1", "name": "product", "type": "string",
                    "isRequired": True, "description": "Product name",
                    "visibility": {"client": True, "server": True},
                },
                {
                    "id": "f2", "name": "quantity", "type": "number",
                    "isRequired": True, "description": "Order quantity",
                    "visibility": {"client": True, "server": True},
                },
                {
                    "id": "f3", "name": "notes", "type": "string",
                    "isRequired": False, "description": "Optional notes",
                    "visibility": {"client": True, "server": True},
                },
            ],
            "validationRules": {
                "clientEnabled": True,
                "serverEnabled": False,
                "rootGroup": {
                    "id": "g1",
                    "type": "AND",
                    "enabled": True,
                    "conditions": [
                        {
                            "id": "vc1",
                            "fieldId": "f1",
                            "operator": "isNotEmpty",
                            "value": "",
                            "enabled": True,
                        },
                        {
                            "id": "vc2",
                            "fieldId": "f2",
                            "operator": "greaterThan",
                            "value": "0",
                            "enabled": True,
                        },
                    ],
                    "groups": [],
                },
            },
        },
        {
            "id": "c2",
            "name": "categories",
            "description": "Product categories",
            "subcollections": [],
            "fields": [
                {
                    "id": "f4", "name": "name", "type": "string",
                    "isRequired": True, "description": "",
                    "visibility": {"client": True, "server": True},
                },
            ],
        },
    ],
}

# ── Project with subcollections ───────────────────────────────────────────────
PROJECT_WITH_SUB = {
    "name": "SubTest",
    "description": "Test subcollection paths",
    "collections": [
        {
            "id": "p1",
            "name": "shops",
            "description": "Shop collection",
            "fields": [
                {
                    "id": "sf1", "name": "name", "type": "string",
                    "isRequired": True, "description": "",
                    "visibility": {"client": True, "server": True},
                },
            ],
            "subcollections": [
                {
                    "id": "p2",
                    "name": "products",
                    "description": "Products in a shop",
                    "fields": [
                        {
                            "id": "sf2", "name": "title", "type": "string",
                            "isRequired": True, "description": "",
                            "visibility": {"client": True, "server": True},
                        },
                        {
                            "id": "sf3", "name": "price", "type": "number",
                            "isRequired": True, "description": "",
                            "visibility": {"client": True, "server": True},
                        },
                    ],
                    "subcollections": [],
                },
            ],
        },
    ],
}

TRANSFORM_NONE = {"endpointName": "api", "collectionConfigs": {}}


# ──────────────────────────────────────────────────────────────────────────────
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto(BASE)
    page.wait_for_load_state("networkidle")

    # ═══════════════════════════════════════════════════════════════════════
    # PART 1: ORM API presence (no transforms, with validation)
    # ═══════════════════════════════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("PART 1: ORM API on direct Firestore (no transforms)")
    print("=" * 70)

    seed(page, PROJECT_WITH_VALIDATION, TRANSFORM_NONE)
    dart = get_code(page, "dart")
    check(len(dart) > 200, f"Dart code generated ({len(dart)} chars)")

    # --- Field mutability ---
    print("\n--- Field mutability ---")
    # Fields should NOT have 'final' keyword (they're mutable for download)
    check("final String product" not in dart,
          "Fields are NOT final (mutable for download)")
    check("String product;" in dart,
          "'product' declared as mutable String")
    check("double quantity;" in dart,
          "'quantity' declared as mutable double")

    # --- _remoteId ---
    print("\n--- _remoteId ---")
    check("String? _remoteId;" in dart, "_remoteId private field present")
    check("String? get remoteId => _remoteId;" in dart,
          "remoteId public getter present")

    # --- Private methods present ---
    print("\n--- Private internal methods ---")
    check("_fromFirestore(" in dart, "_fromFirestore private factory present")
    check("_toFirestore()" in dart, "_toFirestore private method present")
    check("_fromJson(" in dart, "_fromJson private factory present")
    check("_toJson()" in dart, "_toJson private method present")
    # Public fromFirestore/toFirestore should NOT exist
    lines = dart.split('\n')
    public_from = any("factory" in l and ".fromFirestore(" in l and "._fromFirestore(" not in l for l in lines)
    check(not public_from, "No public fromFirestore (only private _fromFirestore)")
    public_to = any("toFirestore()" in l and "_toFirestore()" not in l for l in lines)
    check(not public_to, "No public toFirestore (only private _toFirestore)")

    # --- upload() ---
    print("\n--- upload() with validation ---")
    orders_idx = dart.find("class Orders")
    cat_idx = dart.find("class Categories")
    orders_section = dart[orders_idx:cat_idx] if orders_idx > 0 and cat_idx > orders_idx else dart[orders_idx:]

    check("Future<List<String>> upload()" in orders_section,
          "upload() returns Future<List<String>> in Orders")
    # Upload should call validate() since clientEnabled is true
    upload_idx = orders_section.find("upload()")
    if upload_idx > 0:
        upload_end = orders_section.find("download()", upload_idx)
        upload_section = orders_section[upload_idx:upload_end] if upload_end > upload_idx else orders_section[upload_idx:upload_idx + 500]
        check("validate()" in upload_section,
              "upload() calls validate() before sending (client validation enabled)")
        check("errors.isNotEmpty" in upload_section or "errors.isNotEmpty" in upload_section,
              "upload() returns errors if validation fails")
        # Direct Firestore write (no server transforms)
        check("_toFirestore()" in upload_section or "FirebaseFirestore" in upload_section,
              "upload() uses direct Firestore write")
        check("_remoteId" in upload_section,
              "upload() manages _remoteId")

    # --- download() ---
    print("\n--- download() ---")
    check("Future<void> download()" in orders_section,
          "download() method present in Orders")
    download_idx = orders_section.find("download()")
    if download_idx > 0:
        download_end = orders_section.find("deleteRemote()", download_idx)
        download_section = orders_section[download_idx:download_end] if download_end > download_idx else orders_section[download_idx:download_idx + 500]
        check("_remoteId" in download_section,
              "download() uses _remoteId")
        check("_fromFirestore" in download_section,
              "download() uses _fromFirestore for direct mode")
        check("_updateFrom" in download_section,
              "download() calls _updateFrom to update local data")

    # --- deleteRemote() ---
    print("\n--- deleteRemote() ---")
    check("Future<void> deleteRemote()" in orders_section,
          "deleteRemote() method present")
    delete_idx = orders_section.find("deleteRemote()")
    if delete_idx > 0:
        delete_end = orders_section.find("fetchAll()", delete_idx)
        delete_section = orders_section[delete_idx:delete_end] if delete_end > delete_idx else orders_section[delete_idx:delete_idx + 500]
        check("_remoteId" in delete_section,
              "deleteRemote() uses _remoteId")
        check(".delete()" in delete_section,
              "deleteRemote() calls Firestore .delete()")
        check("collection('orders')" in delete_section,
              "deleteRemote() uses correct collection path 'orders'")

    # --- fetchAll() ---
    print("\n--- fetchAll() ---")
    check("static Future<List<Orders>> fetchAll()" in orders_section,
          "fetchAll() static method returns List<Orders>")
    fetch_idx = orders_section.find("fetchAll()")
    if fetch_idx > 0:
        fetch_section = orders_section[fetch_idx:fetch_idx + 500]
        check("collection('orders')" in fetch_section,
              "fetchAll() queries correct collection 'orders'")
        check("_fromFirestore" in fetch_section,
              "fetchAll() uses _fromFirestore to parse documents")

    # --- _updateFrom ---
    print("\n--- _updateFrom ---")
    check("void _updateFrom(" in orders_section,
          "_updateFrom helper method present")
    update_idx = orders_section.find("void _updateFrom(")
    if update_idx > 0:
        update_section = orders_section[update_idx:update_idx + 500]
        check("product = other.product" in update_section,
              "_updateFrom copies field values")

    # --- Categories class (no validation) ---
    print("\n--- Categories class (no validation) ---")
    cat_section = dart[cat_idx:] if cat_idx > 0 else ""
    check("upload()" in cat_section, "Categories has upload()")
    # Categories upload should NOT have validate() since no validation rules
    cat_upload_idx = cat_section.find("upload()")
    if cat_upload_idx > 0:
        cat_upload_end = cat_section.find("download()", cat_upload_idx)
        cat_upload_section = cat_section[cat_upload_idx:cat_upload_end] if cat_upload_end > cat_upload_idx else cat_section[cat_upload_idx:cat_upload_idx + 400]
        check("validate()" not in cat_upload_section,
              "Categories upload() does NOT call validate() (no validation rules)")

    close_preview(page)

    # ═══════════════════════════════════════════════════════════════════════
    # PART 2: Subcollection paths in ORM methods
    # ═══════════════════════════════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("PART 2: Subcollection paths in ORM methods")
    print("=" * 70)

    seed(page, PROJECT_WITH_SUB, TRANSFORM_NONE)
    dart2 = get_code(page, "dart")
    check(len(dart2) > 200, f"Dart code generated ({len(dart2)} chars)")

    # Products is a subcollection of shops — path should be "shops/products"
    products_idx = dart2.find("class Products")
    if products_idx > 0:
        products_section = dart2[products_idx:]
        # The collection path in ORM methods should reflect the subcollection
        check("shops/products" in products_section,
              "Products ORM methods use 'shops/products' path")
    else:
        check(False, "Products class exists")

    # Shops is a root collection — path should be "shops"
    shops_idx = dart2.find("class Shops")
    shops_end = dart2.find("class Products") if dart2.find("class Products") > 0 else len(dart2)
    if shops_idx > 0:
        shops_section = dart2[shops_idx:shops_end]
        check("collection('shops')" in shops_section,
              "Shops ORM methods use 'shops' path")
    else:
        check(False, "Shops class exists")

    close_preview(page)
    browser.close()

# ── Summary ───────────────────────────────────────────────────────────────────
if ERRORS:
    print(f"\n>> {len(ERRORS)} ORM API test(s) failed:")
    for e in ERRORS:
        print(f"  x {e}")
    sys.exit(1)
else:
    print("\n>> All ORM API generation tests passed!")
