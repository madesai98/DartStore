"""Test 12: Cloud Function code generation — verify different transform node
configurations produce correct TypeScript Cloud Function code.

Strategy: seed localStorage with a project + transformConfig that includes
various node types (string, number, boolean, conversion, timestamp, array, map,
logic, constants) wired to fields via edges, then open Code Preview → Cloud
Function tab and assert the generated code contains the expected patterns.
"""
from playwright.sync_api import sync_playwright
import json, sys, os, re

BASE = "http://localhost:5173/DartStore/"
ERRORS = []

def check(condition, msg):
    if not condition:
        ERRORS.append(msg)
        print(f"  [FAIL] {msg}")
    else:
        print(f"  [PASS] {msg}")


# ──────────────────────────────────────────────────────────────────────────────
# Seed data — a "users" collection with fields and a rich transform pipeline
# ──────────────────────────────────────────────────────────────────────────────
PROJECT_SEED = {
    "name": "CodeGenTest",
    "description": "Test cloud function generation",
    "collections": [
        {
            "id": "c1",
            "name": "users",
            "description": "User accounts",
            "fields": [
                {"id": "f1", "name": "display name", "type": "string", "isRequired": True, "description": "User's display name"},
                {"id": "f2", "name": "email", "type": "string", "isRequired": True, "description": "User's email"},
                {"id": "f3", "name": "age", "type": "number", "isRequired": False, "description": "User's age"},
                {"id": "f4", "name": "is active", "type": "boolean", "isRequired": True, "description": "Whether active"},
                {"id": "f5", "name": "tags", "type": "array", "isRequired": False, "description": "Tags", "arrayItemType": "string"},
                {"id": "f6", "name": "metadata", "type": "map", "isRequired": False, "description": "Extra data", "mapValueType": "string"},
                {"id": "f7", "name": "created at", "type": "timestamp", "isRequired": True, "description": "Created time"},
                {"id": "f8", "name": "score", "type": "number", "isRequired": True, "description": "User score"},
            ],
            "subcollections": [],
        }
    ],
}

# Transform config for "c1" — READ direction (Firestore → Client)
# We build transform nodes and edges that:
#   1. toUpperCase on "display name" → output to client "display name"
#   2. number-clamp on "age" (min=0, max=150) → output to client "age"
#   3. boolean-not on "is active" → output to client "is active"
#   4. timestamp-now (no input) → output to client "created at"
#   5. array-unique on "tags" → output to client "tags"
#   6. map-keys on "metadata" → output to client "metadata" (type mismatch is OK for codegen)
#   7. constant-string "HELLO" → output to client "email" (override)
#   8. number-add: score + age → output to client "score"
READ_NODES = [
    {"id": "n1", "type": "string-toUpperCase", "position": {"x": 400, "y": 50}, "params": {}},
    {"id": "n2", "type": "number-clamp", "position": {"x": 400, "y": 150}, "params": {"min": "0", "max": "150"}},
    {"id": "n3", "type": "boolean-not", "position": {"x": 400, "y": 250}, "params": {}},
    {"id": "n4", "type": "timestamp-now", "position": {"x": 400, "y": 350}, "params": {}},
    {"id": "n5", "type": "array-unique", "position": {"x": 400, "y": 450}, "params": {}},
    {"id": "n6", "type": "map-keys", "position": {"x": 400, "y": 550}, "params": {}},
    {"id": "n7", "type": "constant-string", "position": {"x": 400, "y": 650}, "params": {"value": "HELLO"}},
    {"id": "n8", "type": "number-add", "position": {"x": 400, "y": 750}, "params": {}},
]

READ_EDGES = [
    # f1 (display name) → n1 (toUpperCase) input
    {"id": "e1", "sourceNodeId": "server-node", "sourcePortId": "f1", "targetNodeId": "n1", "targetPortId": "in-in"},
    # n1 output → client "display name"
    {"id": "e2", "sourceNodeId": "n1", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f1"},
    # f3 (age) → n2 (clamp) input
    {"id": "e3", "sourceNodeId": "server-node", "sourcePortId": "f3", "targetNodeId": "n2", "targetPortId": "in-in"},
    # n2 output → client "age"
    {"id": "e4", "sourceNodeId": "n2", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f3"},
    # f4 (is active) → n3 (NOT) input
    {"id": "e5", "sourceNodeId": "server-node", "sourcePortId": "f4", "targetNodeId": "n3", "targetPortId": "in-in"},
    # n3 output → client "is active"
    {"id": "e6", "sourceNodeId": "n3", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f4"},
    # n4 (timestamp-now, no input) → client "created at"
    {"id": "e7", "sourceNodeId": "n4", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f7"},
    # f5 (tags) → n5 (unique) input
    {"id": "e8", "sourceNodeId": "server-node", "sourcePortId": "f5", "targetNodeId": "n5", "targetPortId": "in-in"},
    # n5 output → client "tags"
    {"id": "e9", "sourceNodeId": "n5", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f5"},
    # f6 (metadata) → n6 (map-keys) input
    {"id": "e10", "sourceNodeId": "server-node", "sourcePortId": "f6", "targetNodeId": "n6", "targetPortId": "in-in"},
    # n6 output → client "metadata"
    {"id": "e11", "sourceNodeId": "n6", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f6"},
    # n7 (constant-string "HELLO") → client "email"
    {"id": "e12", "sourceNodeId": "n7", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f2"},
    # f8 (score) → n8 input A, f3 (age) → n8 input B
    {"id": "e13", "sourceNodeId": "server-node", "sourcePortId": "f8", "targetNodeId": "n8", "targetPortId": "in-a"},
    {"id": "e14", "sourceNodeId": "server-node", "sourcePortId": "f3", "targetNodeId": "n8", "targetPortId": "in-b"},
    # n8 output → client "score"
    {"id": "e15", "sourceNodeId": "n8", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f8"},
]

# WRITE direction (Client → Firestore)
# 1. string-trim on "display name" → write to server "display name"
# 2. string-toLowerCase on "email" → write to server "email"
# 3. number-round on "score" → write to server "score"
WRITE_NODES = [
    {"id": "w1", "type": "string-trim", "position": {"x": 400, "y": 50}, "params": {}},
    {"id": "w2", "type": "string-toLowerCase", "position": {"x": 400, "y": 150}, "params": {}},
    {"id": "w3", "type": "number-round", "position": {"x": 400, "y": 250}, "params": {}},
]

WRITE_EDGES = [
    # client "display name" → w1 (trim)
    {"id": "we1", "sourceNodeId": "client-node", "sourcePortId": "f1", "targetNodeId": "w1", "targetPortId": "in-in"},
    # w1 → server "display name"
    {"id": "we2", "sourceNodeId": "w1", "sourcePortId": "out-out", "targetNodeId": "server-node", "targetPortId": "f1"},
    # client "email" → w2 (toLowerCase)
    {"id": "we3", "sourceNodeId": "client-node", "sourcePortId": "f2", "targetNodeId": "w2", "targetPortId": "in-in"},
    # w2 → server "email"
    {"id": "we4", "sourceNodeId": "w2", "sourcePortId": "out-out", "targetNodeId": "server-node", "targetPortId": "f2"},
    # client "score" → w3 (round)
    {"id": "we5", "sourceNodeId": "client-node", "sourcePortId": "f8", "targetNodeId": "w3", "targetPortId": "in-in"},
    # w3 → server "score"
    {"id": "we6", "sourceNodeId": "w3", "sourcePortId": "out-out", "targetNodeId": "server-node", "targetPortId": "f8"},
]

TRANSFORM_CONFIG = {
    "endpointName": "dataTransformer",
    "collectionConfigs": {
        "c1": {
            "readTransformMode": "server",
            "writeTransformMode": "server",
            "readNodes": READ_NODES,
            "readEdges": READ_EDGES,
            "writeNodes": WRITE_NODES,
            "writeEdges": WRITE_EDGES,
        }
    },
}


# ──────────────────────────────────────────────────────────────────────────────
# Second collection with ONLY conversion and logic nodes for broader coverage
# ──────────────────────────────────────────────────────────────────────────────
PROJECT_SEED_2 = {
    "name": "CodeGenTest2",
    "description": "Test more node types",
    "collections": [
        {
            "id": "c2",
            "name": "orders",
            "description": "Customer orders",
            "fields": [
                {"id": "f20", "name": "amount", "type": "number", "isRequired": True, "description": ""},
                {"id": "f21", "name": "label", "type": "string", "isRequired": True, "description": ""},
                {"id": "f22", "name": "processed", "type": "boolean", "isRequired": False, "description": ""},
                {"id": "f23", "name": "timestamp", "type": "timestamp", "isRequired": True, "description": ""},
            ],
            "subcollections": [],
        }
    ],
}

# Nodes: convert-toString, timestamp-toEpoch, logic-nullCoalesce, string-replace, number-multiply
READ_NODES_2 = [
    {"id": "r1", "type": "convert-toString", "position": {"x": 400, "y": 50}, "params": {}},
    {"id": "r2", "type": "timestamp-toEpoch", "position": {"x": 400, "y": 150}, "params": {}},
    {"id": "r3", "type": "string-replace", "position": {"x": 400, "y": 250}, "params": {"search": "old", "replace": "new"}},
    {"id": "r4", "type": "number-multiply", "position": {"x": 400, "y": 350}, "params": {}},
    {"id": "r5", "type": "constant-number", "position": {"x": 400, "y": 450}, "params": {"value": "100"}},
]

READ_EDGES_2 = [
    # amount → convert-toString → client label (override)
    {"id": "re1", "sourceNodeId": "server-node", "sourcePortId": "f20", "targetNodeId": "r1", "targetPortId": "in-in"},
    {"id": "re2", "sourceNodeId": "r1", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f21"},
    # timestamp → toEpoch → (unused, but should still generate code)
    {"id": "re3", "sourceNodeId": "server-node", "sourcePortId": "f23", "targetNodeId": "r2", "targetPortId": "in-in"},
    # label → string-replace → client label (this edge takes precedence over re2 if it comes later)
    {"id": "re4", "sourceNodeId": "server-node", "sourcePortId": "f21", "targetNodeId": "r3", "targetPortId": "in-in"},
    # amount → r4 input A, constant-number 100 → r4 input B → client amount
    {"id": "re5", "sourceNodeId": "server-node", "sourcePortId": "f20", "targetNodeId": "r4", "targetPortId": "in-a"},
    {"id": "re6", "sourceNodeId": "r5", "sourcePortId": "out-out", "targetNodeId": "r4", "targetPortId": "in-b"},
    {"id": "re7", "sourceNodeId": "r4", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f20"},
]

TRANSFORM_CONFIG_2 = {
    "endpointName": "orderApi",
    "collectionConfigs": {
        "c2": {
            "readTransformMode": "server",
            "writeTransformMode": "server",
            "readNodes": READ_NODES_2,
            "readEdges": READ_EDGES_2,
            "writeNodes": [],
            "writeEdges": [],
        }
    },
}


# ──────────────────────────────────────────────────────────────────────────────
# Third scenario: Chained transforms — field → node1 → node2 → client field
# ──────────────────────────────────────────────────────────────────────────────
PROJECT_SEED_3 = {
    "name": "ChainTest",
    "description": "Test chained transforms",
    "collections": [
        {
            "id": "c3",
            "name": "products",
            "description": "Product catalog",
            "fields": [
                {"id": "f30", "name": "title", "type": "string", "isRequired": True, "description": ""},
                {"id": "f31", "name": "price", "type": "number", "isRequired": True, "description": ""},
            ],
            "subcollections": [],
        }
    ],
}

# Chain: title → trim → toUpperCase → client title
# Chain: price → floor → add(constant 10) → client price
READ_NODES_3 = [
    {"id": "ch1", "type": "string-trim", "position": {"x": 300, "y": 50}, "params": {}},
    {"id": "ch2", "type": "string-toUpperCase", "position": {"x": 600, "y": 50}, "params": {}},
    {"id": "ch3", "type": "number-floor", "position": {"x": 300, "y": 200}, "params": {}},
    {"id": "ch4", "type": "number-add", "position": {"x": 600, "y": 200}, "params": {}},
    {"id": "ch5", "type": "constant-number", "position": {"x": 400, "y": 300}, "params": {"value": "10"}},
]

READ_EDGES_3 = [
    # title → ch1 (trim) → ch2 (toUpperCase) → client title
    {"id": "ce1", "sourceNodeId": "server-node", "sourcePortId": "f30", "targetNodeId": "ch1", "targetPortId": "in-in"},
    {"id": "ce2", "sourceNodeId": "ch1", "sourcePortId": "out-out", "targetNodeId": "ch2", "targetPortId": "in-in"},
    {"id": "ce3", "sourceNodeId": "ch2", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f30"},
    # price → ch3 (floor) → ch4 (add) input A, constant-10 → ch4 input B → client price
    {"id": "ce4", "sourceNodeId": "server-node", "sourcePortId": "f31", "targetNodeId": "ch3", "targetPortId": "in-in"},
    {"id": "ce5", "sourceNodeId": "ch3", "sourcePortId": "out-out", "targetNodeId": "ch4", "targetPortId": "in-a"},
    {"id": "ce6", "sourceNodeId": "ch5", "sourcePortId": "out-out", "targetNodeId": "ch4", "targetPortId": "in-b"},
    {"id": "ce7", "sourceNodeId": "ch4", "sourcePortId": "out-out", "targetNodeId": "client-node", "targetPortId": "f31"},
]

TRANSFORM_CONFIG_3 = {
    "endpointName": "productApi",
    "collectionConfigs": {
        "c3": {
            "readTransformMode": "server",
            "writeTransformMode": "server",
            "readNodes": READ_NODES_3,
            "readEdges": READ_EDGES_3,
            "writeNodes": [],
            "writeEdges": [],
        }
    },
}


def get_cloud_function_code(page):
    """Open Code Preview modal and extract the Cloud Function code."""
    # Click "View Code" button
    view_code = page.locator('button:has-text("View Code"):not([type="submit"])')
    view_code.first.click()
    page.wait_for_timeout(1000)

    # Switch to Cloud Function tab
    cloud_tab = page.locator('button[role="tab"]:has-text("Cloud Function")')
    cloud_tab.click()

    # Wait for Monaco editor to fully initialise (first load downloads it)
    page.wait_for_function("""() => {
        const eds = window.monaco?.editor?.getEditors?.();
        return eds && eds.length > 0 && eds[0].getValue().length > 0;
    }""", timeout=15000)
    page.wait_for_timeout(500)

    code = page.evaluate("""() => {
        const eds = window.monaco?.editor?.getEditors?.();
        return (eds && eds.length > 0) ? eds[0].getValue() : '';
    }""")

    return code


def get_dart_code(page):
    """Open Code Preview modal and extract the Dart code (default tab)."""
    view_code = page.locator('button:has-text("View Code"):not([type="submit"])')
    view_code.first.click()
    page.wait_for_timeout(1000)

    # Dart tab is selected by default
    dart_tab = page.locator('button[role="tab"]:has-text("Dart Model")')
    dart_tab.click()

    # Wait for Monaco editor to fully initialise
    page.wait_for_function("""() => {
        const eds = window.monaco?.editor?.getEditors?.();
        return eds && eds.length > 0 && eds[0].getValue().length > 0;
    }""", timeout=15000)
    page.wait_for_timeout(500)

    code = page.evaluate("""() => {
        const eds = window.monaco?.editor?.getEditors?.();
        return (eds && eds.length > 0) ? eds[0].getValue() : '';
    }""")

    return code


def close_code_preview(page):
    """Close the code preview dialog."""
    close_btn = page.locator('button[aria-label="Close code preview"]')
    if close_btn.count() > 0 and close_btn.is_visible():
        close_btn.click()
        page.wait_for_timeout(500)


def seed_and_reload(page, project, transform_config):
    """Write seed data into localStorage and reload the page."""
    page.evaluate(f'localStorage.setItem("dartstore_project", {json.dumps(json.dumps(project))})')
    page.evaluate(f'localStorage.setItem("dartstore_transform_config", {json.dumps(json.dumps(transform_config))})')
    page.reload()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1000)


# ──────────────────────────────────────────────────────────────────────────────
# Run tests
# ──────────────────────────────────────────────────────────────────────────────
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto(BASE)
    page.wait_for_load_state("networkidle")

    # ═══════════════════════════════════════════════════════════════════════
    # SCENARIO 1: Rich transforms — string, number, boolean, timestamp,
    #             array, map, constant, arithmetic, read + write direction
    # ═══════════════════════════════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("SCENARIO 1: Rich Cloud Function code generation (users)")
    print("=" * 70)

    seed_and_reload(page, PROJECT_SEED, TRANSFORM_CONFIG)
    code = get_cloud_function_code(page)
    check(len(code) > 100, f"Cloud function code generated ({len(code)} chars)")

    # ── Structural checks ─────────────────────────────────────────────────
    print("\n--- Structural checks ---")
    check("import * as admin from 'firebase-admin'" in code, "Has firebase-admin import")
    check("import * as express from 'express'" in code or "import express" in code, "Has express import")
    check("export const dataTransformer" in code, "Exports endpoint with correct name")
    check("app.get('" in code and "/:docId'" in code, "Has GET read route")
    check("app.post('" in code, "Has POST write route")
    check("app.put('" in code and "/:docId'" in code, "Has PUT write route")

    # ── READ transforms ───────────────────────────────────────────────────
    print("\n--- Read transform code ---")
    check(".toUpperCase()" in code, "string-toUpperCase: .toUpperCase() present")
    check("Math.min(Math.max(" in code, "number-clamp: Math.min(Math.max(…)) present")
    check(", 0)" in code and ", 150)" in code, "number-clamp: min=0, max=150 params present")
    check("!(" in code and "n3" in code.replace(" ", "") or "boolean" in code.lower(),
          "boolean-not: negation present")
    check("Timestamp.now()" in code, "timestamp-now: Timestamp.now() present")
    check("new Set(" in code, "array-unique: new Set() present")
    check("Object.keys(" in code, "map-keys: Object.keys() present")
    check("'HELLO'" in code, "constant-string: 'HELLO' literal present")

    # number-add: two-input arithmetic
    check("as number) + (" in code, "number-add: addition operator present")

    # ── WRITE transforms ──────────────────────────────────────────────────
    print("\n--- Write transform code ---")
    check(".trim()" in code, "string-trim: .trim() present in write handler")
    check(".toLowerCase()" in code, "string-toLowerCase: .toLowerCase() present")
    check("Math.round(" in code, "number-round: Math.round() present")

    # ── TypeScript typing checks ──────────────────────────────────────────
    print("\n--- TypeScript structure ---")
    check("interface" in code.lower() or "Record<string, any>" in code,
          "Has typed interface or Record usage")
    check("async" in code and "await" in code, "Has async/await for Firestore calls")

    close_code_preview(page)

    # ═══════════════════════════════════════════════════════════════════════
    # SCENARIO 2: Conversion, logic, string-replace, constant-number,
    #             number-multiply nodes (orders collection)
    # ═══════════════════════════════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("SCENARIO 2: Conversion & logic transforms (orders)")
    print("=" * 70)

    seed_and_reload(page, PROJECT_SEED_2, TRANSFORM_CONFIG_2)
    code2 = get_cloud_function_code(page)
    check(len(code2) > 100, f"Cloud function code generated ({len(code2)} chars)")

    print("\n--- Node-specific checks ---")
    check("String(" in code2, "convert-toString: String() present")
    check(".toMillis()" in code2, "timestamp-toEpoch: .toMillis() present")
    check(".replace(" in code2 and "/old/g" in code2, "string-replace: .replace(/old/g, 'new') present")
    check("* (" in code2 or "as number) * (" in code2, "number-multiply: multiplication present")
    check("100" in code2, "constant-number: 100 literal present")
    check("export const orderApi" in code2, "Exports endpoint 'orderApi'")

    close_code_preview(page)

    # ═══════════════════════════════════════════════════════════════════════
    # SCENARIO 3: Chained transforms (node → node → client field)
    # ═══════════════════════════════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("SCENARIO 3: Chained transforms (products)")
    print("=" * 70)

    seed_and_reload(page, PROJECT_SEED_3, TRANSFORM_CONFIG_3)
    code3 = get_cloud_function_code(page)
    check(len(code3) > 100, f"Cloud function code generated ({len(code3)} chars)")

    print("\n--- Chain checks ---")
    # The chained code should have:
    # 1. t_ch1_out = (…).trim()
    # 2. t_ch2_out = (t_ch1_out).toUpperCase()  (input references ch1's output)
    # 3. t_ch3_out = Math.floor(…)
    # 4. t_ch4_out = (t_ch3_out) + (t_ch5_out)   (ch3 feeds into ch4)
    check(".trim()" in code3, "Chain: trim node present")
    check(".toUpperCase()" in code3, "Chain: toUpperCase node present")
    check("Math.floor(" in code3, "Chain: floor node present")

    # Verify chaining: ch2 references ch1's output variable
    # The variable pattern is t_{nodeId}_out → t_ch1_out, t_ch2_out
    ch1_var_pattern = re.compile(r't_ch1\w*_out')
    ch2_line_pattern = re.compile(r'const t_ch2\w*_out\s*=.*t_ch1\w*_out')
    check(bool(ch1_var_pattern.search(code3)), "Chain: t_ch1_out variable exists")
    check(bool(ch2_line_pattern.search(code3)),
          "Chain: ch2 (toUpperCase) references ch1 (trim) output variable")

    ch3_var_pattern = re.compile(r't_ch3\w*_out')
    ch4_line_pattern = re.compile(r'const t_ch4\w*_out\s*=.*t_ch3\w*_out')
    check(bool(ch3_var_pattern.search(code3)), "Chain: t_ch3_out variable exists")
    check(bool(ch4_line_pattern.search(code3)),
          "Chain: ch4 (add) references ch3 (floor) output variable")

    # Check that chained output feeds into result
    check("result['title']" in code3, "Chain: result assigns transformed title")
    check("result['price']" in code3, "Chain: result assigns transformed price")

    close_code_preview(page)

    # ═══════════════════════════════════════════════════════════════════════
    # SCENARIO 4: No transforms enabled — should not generate transform code
    # ═══════════════════════════════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("SCENARIO 4: No server transforms enabled")
    print("=" * 70)

    no_transform_config = {
        "endpointName": "api",
        "collectionConfigs": {},
    }
    seed_and_reload(page, PROJECT_SEED, no_transform_config)
    code4 = get_cloud_function_code(page)

    # With no serverEnabled collections, should get a placeholder or very short output
    check("toUpperCase" not in code4, "No transform code when none configured")
    check("Math.min" not in code4, "No clamp transform when none configured")
    # There should still be the header comment at minimum
    print(f"  [INFO] Code length with no transforms: {len(code4)} chars")

    close_code_preview(page)

    browser.close()

# ── Summary ───────────────────────────────────────────────────────────────────
if ERRORS:
    print(f"\n>> {len(ERRORS)} test(s) failed:")
    for e in ERRORS:
        print(f"  ✗ {e}")
    sys.exit(1)
else:
    print("\n>> All Cloud Function code generation tests passed! ✓")
