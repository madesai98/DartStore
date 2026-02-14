"""Test 13: Dart code generation — verify that transform nodes/edges produce
correct Dart inline expressions inside fromFirestore() and toFirestore().

Strategy: seed localStorage with project + transformConfig, open Code Preview
→ Dart Model tab, and assert the generated Dart class code contains the
expected transform expressions.
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


def get_dart_code(page):
    """Open Code Preview modal and extract the Dart code."""
    view_code = page.locator('button:has-text("View Code"):not([type="submit"])')
    view_code.first.click()
    page.wait_for_timeout(1000)

    dart_tab = page.locator('button[role="tab"]:has-text("Dart Model")')
    dart_tab.click()

    page.wait_for_function("""() => {
        const eds = window.monaco?.editor?.getEditors?.();
        return eds && eds.length > 0 && eds[0].getValue().length > 0;
    }""", timeout=15000)
    page.wait_for_timeout(500)

    return page.evaluate("""() => {
        const eds = window.monaco?.editor?.getEditors?.();
        return (eds && eds.length > 0) ? eds[0].getValue() : '';
    }""")


def close_code_preview(page):
    close_btn = page.locator('button[aria-label="Close code preview"]')
    if close_btn.count() > 0 and close_btn.is_visible():
        close_btn.click()
        page.wait_for_timeout(500)


def seed_and_reload(page, project, transform_config):
    page.evaluate(f'localStorage.setItem("dartstore_project", {json.dumps(json.dumps(project))})')
    page.evaluate(f'localStorage.setItem("dartstore_transform_config", {json.dumps(json.dumps(transform_config))})')
    page.reload()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1000)


# ──────────────────────────────────────────────────────────────────────────────
# SCENARIO A: Read transforms — fromFirestore()
# ──────────────────────────────────────────────────────────────────────────────
PROJECT_A = {
    "name": "DartReadTest",
    "description": "",
    "collections": [
        {
            "id": "c1",
            "name": "users",
            "description": "",
            "fields": [
                {"id": "f1", "name": "display name", "type": "string", "isRequired": True, "description": ""},
                {"id": "f2", "name": "email", "type": "string", "isRequired": True, "description": ""},
                {"id": "f3", "name": "age", "type": "number", "isRequired": False, "description": ""},
                {"id": "f4", "name": "is active", "type": "boolean", "isRequired": True, "description": ""},
                {"id": "f5", "name": "tags", "type": "array", "isRequired": False, "description": "", "arrayItemType": "string"},
            ],
            "subcollections": [],
        }
    ],
}

# Read transforms (Firestore → Client):
#  display name → toUpperCase → client display name
#  age → round → client age
#  is active → NOT → client is active
#  tags → unique → client tags
#  constant-string "default@email.com" → client email
READ_NODES_A = [
    {"id": "n1", "type": "string-toUpperCase", "position": {"x": 400, "y": 50}, "params": {}},
    {"id": "n2", "type": "number-round", "position": {"x": 400, "y": 150}, "params": {}},
    {"id": "n3", "type": "boolean-not", "position": {"x": 400, "y": 250}, "params": {}},
    {"id": "n4", "type": "array-unique", "position": {"x": 400, "y": 350}, "params": {}},
    {"id": "n5", "type": "constant-string", "position": {"x": 400, "y": 450}, "params": {"value": "default@email.com"}},
]

READ_EDGES_A = [
    # field → node
    {"id": "e1", "sourceNodeId": "server-node", "sourcePortId": "f1", "targetNodeId": "n1", "targetPortId": "in-in"},
    {"id": "e3", "sourceNodeId": "server-node", "sourcePortId": "f3", "targetNodeId": "n2", "targetPortId": "in-in"},
    {"id": "e5", "sourceNodeId": "server-node", "sourcePortId": "f4", "targetNodeId": "n3", "targetPortId": "in-in"},
    {"id": "e7", "sourceNodeId": "server-node", "sourcePortId": "f5", "targetNodeId": "n4", "targetPortId": "in-in"},
    # node → client field
    {"id": "e2", "sourceNodeId": "n1", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f1"},
    {"id": "e4", "sourceNodeId": "n2", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f3"},
    {"id": "e6", "sourceNodeId": "n3", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f4"},
    {"id": "e8", "sourceNodeId": "n4", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f5"},
    {"id": "e9", "sourceNodeId": "n5", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f2"},
]

TRANSFORM_A = {
    "endpointName": "api",
    "collectionConfigs": {
        "c1": {
            "readTransformMode": "client",
            "writeTransformMode": "client",
            "readNodes": READ_NODES_A,
            "readEdges": READ_EDGES_A,
            "writeNodes": [],
            "writeEdges": [],
        }
    },
}


# ──────────────────────────────────────────────────────────────────────────────
# SCENARIO B: Write transforms — toFirestore()
# ──────────────────────────────────────────────────────────────────────────────
PROJECT_B = {
    "name": "DartWriteTest",
    "description": "",
    "collections": [
        {
            "id": "c1",
            "name": "products",
            "description": "",
            "fields": [
                {"id": "f1", "name": "title", "type": "string", "isRequired": True, "description": ""},
                {"id": "f2", "name": "price", "type": "number", "isRequired": True, "description": ""},
                {"id": "f3", "name": "in stock", "type": "boolean", "isRequired": True, "description": ""},
            ],
            "subcollections": [],
        }
    ],
}

# Write transforms (Client → Firestore):
#  title → trim → server title
#  price → clamp(0,9999) → server price
WRITE_NODES_B = [
    {"id": "w1", "type": "string-trim", "position": {"x": 400, "y": 50}, "params": {}},
    {"id": "w2", "type": "number-clamp", "position": {"x": 400, "y": 150}, "params": {"min": "0", "max": "9999"}},
]

WRITE_EDGES_B = [
    {"id": "we1", "sourceNodeId": "client-node", "sourcePortId": "f1", "targetNodeId": "w1", "targetPortId": "in-in"},
    {"id": "we2", "sourceNodeId": "w1", "sourcePortId": "out-out", "targetNodeId": "server-node", "targetPortId": "f1"},
    {"id": "we3", "sourceNodeId": "client-node", "sourcePortId": "f2", "targetNodeId": "w2", "targetPortId": "in-in"},
    {"id": "we4", "sourceNodeId": "w2", "sourcePortId": "out-out", "targetNodeId": "server-node", "targetPortId": "f2"},
]

TRANSFORM_B = {
    "endpointName": "api",
    "collectionConfigs": {
        "c1": {
            "readTransformMode": "client",
            "writeTransformMode": "client",
            "readNodes": [],
            "readEdges": [],
            "writeNodes": WRITE_NODES_B,
            "writeEdges": WRITE_EDGES_B,
        }
    },
}


# ──────────────────────────────────────────────────────────────────────────────
# SCENARIO C: Chained Dart read transforms (node → node)
# ──────────────────────────────────────────────────────────────────────────────
PROJECT_C = {
    "name": "DartChainTest",
    "description": "",
    "collections": [
        {
            "id": "c1",
            "name": "items",
            "description": "",
            "fields": [
                {"id": "f1", "name": "label", "type": "string", "isRequired": True, "description": ""},
            ],
            "subcollections": [],
        }
    ],
}

# Chain: label → trim → toLowerCase → client label
CHAIN_NODES = [
    {"id": "cn1", "type": "string-trim", "position": {"x": 300, "y": 50}, "params": {}},
    {"id": "cn2", "type": "string-toLowerCase", "position": {"x": 600, "y": 50}, "params": {}},
]

CHAIN_EDGES = [
    {"id": "ce1", "sourceNodeId": "server-node", "sourcePortId": "f1", "targetNodeId": "cn1", "targetPortId": "in-in"},
    {"id": "ce2", "sourceNodeId": "cn1", "sourcePortId": "out-out", "targetNodeId": "cn2", "targetPortId": "in-in"},
    {"id": "ce3", "sourceNodeId": "cn2", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f1"},
]

TRANSFORM_C = {
    "endpointName": "api",
    "collectionConfigs": {
        "c1": {
            "readTransformMode": "client",
            "writeTransformMode": "client",
            "readNodes": CHAIN_NODES,
            "readEdges": CHAIN_EDGES,
            "writeNodes": [],
            "writeEdges": [],
        }
    },
}


# ──────────────────────────────────────────────────────────────────────────────
# SCENARIO D: No transforms — baseline Dart output
# ──────────────────────────────────────────────────────────────────────────────
PROJECT_D = {
    "name": "DartBaselineTest",
    "description": "",
    "collections": [
        {
            "id": "c1",
            "name": "messages",
            "description": "Chat messages",
            "fields": [
                {"id": "f1", "name": "body", "type": "string", "isRequired": True, "description": "Message body"},
                {"id": "f2", "name": "read", "type": "boolean", "isRequired": False, "description": "Read flag"},
            ],
            "subcollections": [],
        }
    ],
}

TRANSFORM_D = {"endpointName": "api", "collectionConfigs": {}}


# ──────────────────────────────────────────────────────────────────────────────
# Run tests
# ──────────────────────────────────────────────────────────────────────────────
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto(BASE)
    page.wait_for_load_state("networkidle")

    # ═══════════════════════════════════════════════════════════════════════
    # SCENARIO D first (no transforms) — tests baseline Dart before others
    # ═══════════════════════════════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("SCENARIO D: Baseline Dart generation (no transforms)")
    print("=" * 70)

    seed_and_reload(page, PROJECT_D, TRANSFORM_D)
    code_d = get_dart_code(page)
    check(len(code_d) > 50, f"Dart code generated ({len(code_d)} chars)")

    print("\n--- Baseline checks ---")
    check("class Messages" in code_d or "class Message" in code_d, "Class name present")
    check("_fromFirestore" in code_d, "_fromFirestore factory present")
    check("_toFirestore" in code_d, "_toFirestore method present")
    check("copyWith" in code_d, "copyWith method present")
    check("String body" in code_d, "String field typed correctly")
    check("bool?" in code_d or "bool " in code_d, "Boolean field present")
    check("data?['body']" in code_d, "fromFirestore reads body field")
    check("data?['read']" in code_d, "fromFirestore reads read field")
    check("'body': body" in code_d, "toFirestore writes body field")
    # No transform expressions in baseline
    check(".toUpperCase()" not in code_d, "No spurious transform in baseline")
    check(".trim()" not in code_d, "No spurious trim in baseline")

    close_code_preview(page)

    # ═══════════════════════════════════════════════════════════════════════
    # SCENARIO A: Read transforms in fromFirestore()
    # ═══════════════════════════════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("SCENARIO A: Dart read transforms in fromFirestore()")
    print("=" * 70)

    seed_and_reload(page, PROJECT_A, TRANSFORM_A)
    code_a = get_dart_code(page)
    check(len(code_a) > 100, f"Dart code generated ({len(code_a)} chars)")

    print("\n--- fromFirestore transform checks ---")
    # string-toUpperCase on display name
    check(".toUpperCase()" in code_a, "string-toUpperCase: .toUpperCase() in fromFirestore")
    # number-round on age
    check(".round()" in code_a, "number-round: .round() in fromFirestore")
    # boolean-not on isActive
    check("!(" in code_a, "boolean-not: negation in fromFirestore")
    # array-unique on tags
    check(".toSet().toList()" in code_a, "array-unique: .toSet().toList() in fromFirestore")
    # constant-string for email
    check("'default@email.com'" in code_a, "constant-string: literal in fromFirestore")

    # toFirestore should NOT have these transforms (no write transforms configured)
    # Check the toFirestore section specifically
    to_firestore_start = code_a.find("_toFirestore()")
    if to_firestore_start > 0:
        to_firestore_section = code_a[to_firestore_start:to_firestore_start + 500]
        check(".toUpperCase()" not in to_firestore_section,
              "_toFirestore does NOT contain toUpperCase (read-only transforms)")

    close_code_preview(page)

    # ═══════════════════════════════════════════════════════════════════════
    # SCENARIO B: Write transforms in toFirestore()
    # ═══════════════════════════════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("SCENARIO B: Dart write transforms in toFirestore()")
    print("=" * 70)

    seed_and_reload(page, PROJECT_B, TRANSFORM_B)
    code_b = get_dart_code(page)
    check(len(code_b) > 100, f"Dart code generated ({len(code_b)} chars)")

    print("\n--- toFirestore transform checks ---")
    # string-trim on title
    check(".trim()" in code_b, "string-trim: .trim() in toFirestore")
    # number-clamp on price
    check(".clamp(" in code_b, "number-clamp: .clamp() in toFirestore")
    check("0, 9999" in code_b, "number-clamp params: 0, 9999")

    # fromFirestore should NOT have write transforms
    from_firestore_start = code_b.find("_fromFirestore")
    to_firestore_start = code_b.find("_toFirestore")
    if from_firestore_start > 0 and to_firestore_start > from_firestore_start:
        from_firestore_section = code_b[from_firestore_start:to_firestore_start]
        check(".trim()" not in from_firestore_section,
              "_fromFirestore does NOT contain trim (write-only transforms)")

    close_code_preview(page)

    # ═══════════════════════════════════════════════════════════════════════
    # SCENARIO C: Chained Dart transforms (trim → toLowerCase)
    # ═══════════════════════════════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("SCENARIO C: Chained Dart transforms (trim → toLowerCase)")
    print("=" * 70)

    seed_and_reload(page, PROJECT_C, TRANSFORM_C)
    code_c = get_dart_code(page)
    check(len(code_c) > 50, f"Dart code generated ({len(code_c)} chars)")

    print("\n--- Chain checks ---")
    # The Dart generator uses inline expressions. A chain of trim → toLowerCase
    # should produce something like:
    #   (data?['label'] as String).trim().toLowerCase()
    # or the outer expression wrapping the inner one
    check(".trim()" in code_c, "Chain: trim present in Dart")
    check(".toLowerCase()" in code_c, "Chain: toLowerCase present in Dart")

    # Verify they appear together (chained, not separate fields)
    # Look for pattern like: .trim()).toLowerCase() or .trim().toLowerCase()
    chain_pattern = re.compile(r'\.trim\(\).*\.toLowerCase\(\)', re.DOTALL)
    check(bool(chain_pattern.search(code_c)),
          "Chain: trim and toLowerCase appear chained together")

    close_code_preview(page)

    browser.close()

# ── Summary ───────────────────────────────────────────────────────────────────
if ERRORS:
    print(f"\n>> {len(ERRORS)} Dart test(s) failed:")
    for e in ERRORS:
        print(f"  ✗ {e}")
    sys.exit(1)
else:
    print("\n>> All Dart code generation tests passed! ✓")
