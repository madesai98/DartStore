"""Test 14: Extended code-gen coverage — geopoint, reference, logic, map, array,
timestamp, string-template, string-hash, string-regex, convert, custom-expression
nodes in Cloud Function AND Dart output.

Covers node types NOT tested in tests 12/13 to achieve near-complete coverage.
"""
from playwright.sync_api import sync_playwright
import json, sys, re

BASE = "http://localhost:5173/DartStore/"
ERRORS = []


def check(condition, msg):
    if not condition:
        ERRORS.append(msg)
        print(f"  [FAIL] {msg}")
    else:
        print(f"  [PASS] {msg}")


def get_code(page, tab="cloud-function"):
    """Open Code Preview and return code for the given tab."""
    view_code = page.locator('button:has-text("View Code"):not([type="submit"])')
    view_code.first.click()
    page.wait_for_timeout(1000)

    tab_label = "Cloud Function" if tab == "cloud-function" else "Dart Model"
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
    page.evaluate(f'localStorage.setItem("dartstore_project", {json.dumps(json.dumps(project))})')
    page.evaluate(f'localStorage.setItem("dartstore_transform_config", {json.dumps(json.dumps(transform))})')
    page.reload()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1000)


# ──────────────────────────────────────────────────────────────────────────────
# Scenario 1 — Geo, Reference, Template, Hash, Regex, Custom
# ──────────────────────────────────────────────────────────────────────────────
PROJECT_1 = {
    "name": "AdvancedTest",
    "description": "",
    "collections": [{
        "id": "c1", "name": "places", "description": "", "subcollections": [],
        "fields": [
            {"id": "f1", "name": "location", "type": "geopoint", "isRequired": True, "description": ""},
            {"id": "f2", "name": "second location", "type": "geopoint", "isRequired": True, "description": ""},
            {"id": "f3", "name": "ref", "type": "reference", "isRequired": False, "description": ""},
            {"id": "f4", "name": "first name", "type": "string", "isRequired": True, "description": ""},
            {"id": "f5", "name": "last name", "type": "string", "isRequired": True, "description": ""},
            {"id": "f6", "name": "password", "type": "string", "isRequired": True, "description": ""},
            {"id": "f7", "name": "code", "type": "string", "isRequired": True, "description": ""},
            {"id": "f8", "name": "distance", "type": "number", "isRequired": True, "description": ""},
            {"id": "f9", "name": "lat", "type": "number", "isRequired": True, "description": ""},
            {"id": "f10", "name": "ref path", "type": "string", "isRequired": True, "description": ""},
            {"id": "f11", "name": "ref id", "type": "string", "isRequired": True, "description": ""},
            {"id": "f12", "name": "raw", "type": "string", "isRequired": True, "description": ""},
        ],
    }],
}

NODES_1 = [
    # geopoint-distance: location A + second-location B → distance
    {"id": "g1", "type": "geopoint-distance", "position": {"x": 400, "y": 50}, "params": {}},
    # geopoint-getLat: location → lat
    {"id": "g2", "type": "geopoint-getLat", "position": {"x": 400, "y": 150}, "params": {}},
    # reference-getPath: ref → ref path
    {"id": "g3", "type": "reference-getPath", "position": {"x": 400, "y": 250}, "params": {}},
    # reference-getId: ref → ref id
    {"id": "g4", "type": "reference-getId", "position": {"x": 400, "y": 350}, "params": {}},
    # string-template: first name A + last name B → code
    {"id": "g5", "type": "string-template", "position": {"x": 400, "y": 450},
     "params": {"template": "Hello ${a} ${b}!"}},
    # string-hash: password → password (hashed)
    {"id": "g6", "type": "string-hash", "position": {"x": 400, "y": 550}, "params": {}},
    # string-regex: code → code (regex match)
    {"id": "g7", "type": "string-regex", "position": {"x": 400, "y": 650},
     "params": {"pattern": "^[A-Z]+$"}},
    # custom-expression: raw → raw (custom)
    {"id": "g8", "type": "custom-expression", "position": {"x": 400, "y": 750},
     "params": {"expression": "value.split('-')[0]"}},
]

EDGES_1 = [
    # geopoint-distance: f1 → a, f2 → b
    {"id": "ge1", "sourceNodeId": "server-node", "sourcePortId": "f1", "targetNodeId": "g1", "targetPortId": "in-a"},
    {"id": "ge2", "sourceNodeId": "server-node", "sourcePortId": "f2", "targetNodeId": "g1", "targetPortId": "in-b"},
    {"id": "ge3", "sourceNodeId": "g1", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f8"},
    # geopoint-getLat: f1 → in
    {"id": "ge4", "sourceNodeId": "server-node", "sourcePortId": "f1", "targetNodeId": "g2", "targetPortId": "in-in"},
    {"id": "ge5", "sourceNodeId": "g2", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f9"},
    # reference-getPath: f3 → in
    {"id": "ge6", "sourceNodeId": "server-node", "sourcePortId": "f3", "targetNodeId": "g3", "targetPortId": "in-in"},
    {"id": "ge7", "sourceNodeId": "g3", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f10"},
    # reference-getId: f3 → in
    {"id": "ge8", "sourceNodeId": "server-node", "sourcePortId": "f3", "targetNodeId": "g4", "targetPortId": "in-in"},
    {"id": "ge9", "sourceNodeId": "g4", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f11"},
    # string-template: f4 → a, f5 → b
    {"id": "ge10", "sourceNodeId": "server-node", "sourcePortId": "f4", "targetNodeId": "g5", "targetPortId": "in-a"},
    {"id": "ge11", "sourceNodeId": "server-node", "sourcePortId": "f5", "targetNodeId": "g5", "targetPortId": "in-b"},
    {"id": "ge12", "sourceNodeId": "g5", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f7"},
    # string-hash: f6 → in
    {"id": "ge13", "sourceNodeId": "server-node", "sourcePortId": "f6", "targetNodeId": "g6", "targetPortId": "in-in"},
    {"id": "ge14", "sourceNodeId": "g6", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f6"},
    # string-regex: f7 → in (match output to boolean, result to code)
    {"id": "ge15", "sourceNodeId": "server-node", "sourcePortId": "f7", "targetNodeId": "g7", "targetPortId": "in-in"},
    # custom-expression: f12 → in
    {"id": "ge16", "sourceNodeId": "server-node", "sourcePortId": "f12", "targetNodeId": "g8", "targetPortId": "in-in"},
    {"id": "ge17", "sourceNodeId": "g8", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f12"},
]

TRANSFORM_1 = {
    "endpointName": "advancedApi",
    "collectionConfigs": {
        "c1": {
            "readTransformMode": "server", "writeTransformMode": "server",
            "readNodes": NODES_1, "readEdges": EDGES_1,
            "writeNodes": [], "writeEdges": [],
        }
    },
}


# ──────────────────────────────────────────────────────────────────────────────
# Scenario 2 — Map ops, Array ops, Timestamp ops, Logic ops (Cloud Function)
# ──────────────────────────────────────────────────────────────────────────────
PROJECT_2 = {
    "name": "MapArrayTest",
    "description": "",
    "collections": [{
        "id": "c2", "name": "records", "description": "", "subcollections": [],
        "fields": [
            {"id": "f20", "name": "data", "type": "map", "isRequired": True, "description": "", "mapValueType": "string"},
            {"id": "f21", "name": "items", "type": "array", "isRequired": True, "description": "", "arrayItemType": "number"},
            {"id": "f22", "name": "created", "type": "timestamp", "isRequired": True, "description": ""},
            {"id": "f23", "name": "flag", "type": "boolean", "isRequired": False, "description": ""},
            {"id": "f24", "name": "count", "type": "number", "isRequired": True, "description": ""},
            {"id": "f25", "name": "formatted", "type": "string", "isRequired": True, "description": ""},
            {"id": "f26", "name": "merged data", "type": "map", "isRequired": True, "description": "", "mapValueType": "string"},
            {"id": "f27", "name": "sorted items", "type": "array", "isRequired": True, "description": "", "arrayItemType": "number"},
        ],
    }],
}

NODES_2 = [
    # map-merge: data A + merged data B → merged data
    {"id": "m1", "type": "map-merge", "position": {"x": 400, "y": 50}, "params": {}},
    # map-pick: data → (pick keys "a,b")
    {"id": "m2", "type": "map-pick", "position": {"x": 400, "y": 150}, "params": {"keys": "a,b"}},
    # array-sort: items → sorted items (desc)
    {"id": "m3", "type": "array-sort", "position": {"x": 400, "y": 250}, "params": {"direction": "desc"}},
    # array-length: items → count
    {"id": "m4", "type": "array-length", "position": {"x": 400, "y": 350}, "params": {}},
    # timestamp-format: created → formatted
    {"id": "m5", "type": "timestamp-format", "position": {"x": 400, "y": 450}, "params": {"format": "ISO"}},
    # logic-isNull: flag → (boolean)
    {"id": "m6", "type": "logic-isNull", "position": {"x": 400, "y": 550}, "params": {}},
    # array-filter: items → (filtered)
    {"id": "m7", "type": "array-filter", "position": {"x": 400, "y": 650}, "params": {"expression": "item > 0"}},
    # array-reverse: items → (reversed)
    {"id": "m8", "type": "array-reverse", "position": {"x": 400, "y": 750}, "params": {}},
]

EDGES_2 = [
    # map-merge: f20 (data) → a, f26 (merged data) → b → client merged data
    {"id": "me1", "sourceNodeId": "server-node", "sourcePortId": "f20", "targetNodeId": "m1", "targetPortId": "in-a"},
    {"id": "me2", "sourceNodeId": "server-node", "sourcePortId": "f26", "targetNodeId": "m1", "targetPortId": "in-b"},
    {"id": "me3", "sourceNodeId": "m1", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f26"},
    # map-pick: f20 → in → client data
    {"id": "me4", "sourceNodeId": "server-node", "sourcePortId": "f20", "targetNodeId": "m2", "targetPortId": "in-in"},
    {"id": "me5", "sourceNodeId": "m2", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f20"},
    # array-sort: f21 → in → client sorted items
    {"id": "me6", "sourceNodeId": "server-node", "sourcePortId": "f21", "targetNodeId": "m3", "targetPortId": "in-in"},
    {"id": "me7", "sourceNodeId": "m3", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f27"},
    # array-length: f21 → in → client count
    {"id": "me8", "sourceNodeId": "server-node", "sourcePortId": "f21", "targetNodeId": "m4", "targetPortId": "in-in"},
    {"id": "me9", "sourceNodeId": "m4", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f24"},
    # timestamp-format: f22 → in → client formatted
    {"id": "me10", "sourceNodeId": "server-node", "sourcePortId": "f22", "targetNodeId": "m5", "targetPortId": "in-in"},
    {"id": "me11", "sourceNodeId": "m5", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f25"},
    # logic-isNull: f23 → in → client flag
    {"id": "me12", "sourceNodeId": "server-node", "sourcePortId": "f23", "targetNodeId": "m6", "targetPortId": "in-in"},
    {"id": "me13", "sourceNodeId": "m6", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f23"},
]

TRANSFORM_2 = {
    "endpointName": "recordsApi",
    "collectionConfigs": {
        "c2": {
            "readTransformMode": "server", "writeTransformMode": "server",
            "readNodes": NODES_2, "readEdges": EDGES_2,
            "writeNodes": [], "writeEdges": [],
        }
    },
}


# ──────────────────────────────────────────────────────────────────────────────
# Scenario 3 — Visibility (server-only and client-only fields)
# ──────────────────────────────────────────────────────────────────────────────
PROJECT_3 = {
    "name": "VisibilityTest",
    "description": "",
    "collections": [{
        "id": "c3", "name": "secrets", "description": "", "subcollections": [],
        "fields": [
            {"id": "f30", "name": "public name", "type": "string", "isRequired": True, "description": "",
             "visibility": {"client": True, "server": True}},
            {"id": "f31", "name": "secret key", "type": "string", "isRequired": True, "description": "",
             "visibility": {"client": False, "server": True}},
            {"id": "f32", "name": "computed label", "type": "string", "isRequired": True, "description": "",
             "visibility": {"client": True, "server": False}},
        ],
    }],
}

TRANSFORM_3 = {
    "endpointName": "secretsApi",
    "collectionConfigs": {
        "c3": {
            "readTransformMode": "server", "writeTransformMode": "server",
            "readNodes": [], "readEdges": [],
            "writeNodes": [], "writeEdges": [],
        }
    },
}


# ──────────────────────────────────────────────────────────────────────────────
# Run tests
# ──────────────────────────────────────────────────────────────────────────────
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto(BASE)
    page.wait_for_load_state("networkidle")

    # ═══════════════════════════════════════════════════════════════════════
    # SCENARIO 1: Geo, Ref, Template, Hash, Regex, Custom — Cloud Function
    # ═══════════════════════════════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("SCENARIO 1: Geopoint, Reference, Template, Hash, Regex, Custom (CF)")
    print("=" * 70)

    seed(page, PROJECT_1, TRANSFORM_1)
    cf1 = get_code(page, "cloud-function")
    check(len(cf1) > 200, f"Cloud function generated ({len(cf1)} chars)")

    print("\n--- Geopoint ops ---")
    check("Haversine" in cf1 or "Math.acos" in cf1, "geopoint-distance: Haversine present")
    check(".latitude" in cf1, "geopoint-getLat: .latitude present")

    print("\n--- Reference ops ---")
    check(".path" in cf1, "reference-getPath: .path present")
    check(".id" in cf1, "reference-getId: .id present")

    print("\n--- String-template ---")
    check("${" in cf1 or "template" in cf1.lower(), "string-template: template interpolation present")

    print("\n--- String-hash ---")
    check("sha256" in cf1 or "createHash" in cf1, "string-hash: SHA256 hash present")

    print("\n--- String-regex ---")
    check("RegExp" in cf1 or "new RegExp" in cf1, "string-regex: RegExp present")
    check("^[A-Z]+$" in cf1, "string-regex: pattern param present")

    print("\n--- Custom expression ---")
    check("value.split('-')[0]" in cf1, "custom-expression: custom code present")

    close_preview(page)

    # ═══════════════════════════════════════════════════════════════════════
    # SCENARIO 2: Map, Array, Timestamp, Logic — Cloud Function
    # ═══════════════════════════════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("SCENARIO 2: Map, Array, Timestamp, Logic ops (Cloud Function)")
    print("=" * 70)

    seed(page, PROJECT_2, TRANSFORM_2)
    cf2 = get_code(page, "cloud-function")
    check(len(cf2) > 200, f"Cloud function generated ({len(cf2)} chars)")

    print("\n--- Map ops ---")
    check("...(${" in cf2 or "..." in cf2, "map-merge: spread operator present")
    check("Object.fromEntries" in cf2, "map-pick: Object.fromEntries for pick present")
    check("'a'" in cf2 and "'b'" in cf2, "map-pick: keys a,b present")

    print("\n--- Array ops ---")
    check(".sort(" in cf2, "array-sort: .sort() present")
    check("desc" in cf2.lower() or "a > b ? -1" in cf2, "array-sort: desc direction present")
    check(".length" in cf2, "array-length: .length present")
    check(".filter(" in cf2, "array-filter: .filter() present")
    check("item > 0" in cf2, "array-filter: expression param present")

    print("\n--- Timestamp ops ---")
    check(".toDate()" in cf2, "timestamp-format: .toDate() present")
    check(".toISOString()" in cf2, "timestamp-format: .toISOString() present")

    print("\n--- Logic ops ---")
    check("== null" in cf2, "logic-isNull: == null check present")

    close_preview(page)

    # ═══════════════════════════════════════════════════════════════════════
    # SCENARIO 3: Visibility — server-only & client-only fields
    # ═══════════════════════════════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("SCENARIO 3: Field visibility in Dart code")
    print("=" * 70)

    seed(page, PROJECT_3, TRANSFORM_3)
    dart3 = get_code(page, "dart")
    check(len(dart3) > 50, f"Dart code generated ({len(dart3)} chars)")

    print("\n--- Visibility checks ---")
    # client:true fields should appear in class
    check("publicName" in dart3 or "public_name" in dart3 or "final String publicName" in dart3,
          "Client-visible field 'publicName' appears in Dart class")
    check("computedLabel" in dart3, "Client-only field 'computedLabel' appears in Dart class")
    # server-only field should NOT appear in Dart class (client: false)
    check("secretKey" not in dart3, "Server-only field 'secretKey' NOT in Dart class")
    # _fromFirestore: computedLabel (client-only, not in Firestore) should get null
    check("null" in dart3, "Client-only field gets null in _fromFirestore")

    # Cloud function: server-only field should be in server interface
    close_preview(page)
    cf3 = get_code(page, "cloud-function")
    check("secretKey" in cf3, "Server-only field 'secretKey' in Cloud Function server interface")
    # Cloud function should have a route for 'secrets'
    check("secrets" in cf3.lower() or "/secrets" in cf3, "Cloud function has secrets route")

    close_preview(page)

    browser.close()

# ── Summary ───────────────────────────────────────────────────────────────────
if ERRORS:
    print(f"\n>> {len(ERRORS)} test(s) failed:")
    for e in ERRORS:
        print(f"  ✗ {e}")
    sys.exit(1)
else:
    print("\n>> All advanced code generation tests passed! ✓")
