"""Test 16: Client-only and server-only field visibility in Dart and Cloud
Function code generation.

Tests that:
1. Server-only fields (client:false, server:true) do NOT appear in Dart class
   but DO appear in Cloud Function server interfaces, read handlers, and write
   handlers.
2. Client-only fields (client:true, server:false) DO appear in Dart class but
   get null/default in fromFirestore() and are NOT serialised by toFirestore().
   In Cloud Functions they appear in client interface and read response but are
   NOT read from/written to Firestore documents.
3. Both-visible fields (client:true, server:true) work normally.
4. Transforms wired to client-only or server-only fields work correctly.
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


def get_code(page, tab="dart"):
    """Open Code Preview and return code for the given tab."""
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


# ──────────────────────────────────────────────────────────────────────────────
# Seed data — collection with all three visibility categories
# ──────────────────────────────────────────────────────────────────────────────

PROJECT = {
    "name": "VisibilityCodegen",
    "description": "Test visibility in codegen",
    "collections": [
        {
            "id": "c1",
            "name": "accounts",
            "description": "User accounts",
            "subcollections": [],
            "fields": [
                # Both-visible (default)
                {
                    "id": "f1", "name": "display name", "type": "string",
                    "isRequired": True, "description": "Public name",
                    "visibility": {"client": True, "server": True},
                },
                # Server-only: should NOT be in Dart class, SHOULD be in CF
                {
                    "id": "f2", "name": "password hash", "type": "string",
                    "isRequired": True, "description": "Hashed password",
                    "visibility": {"client": False, "server": True},
                },
                # Client-only: should be in Dart class with null from Firestore
                {
                    "id": "f3", "name": "computed score", "type": "number",
                    "isRequired": False, "description": "Computed on client",
                    "visibility": {"client": True, "server": False},
                },
                # Both-visible number
                {
                    "id": "f4", "name": "age", "type": "number",
                    "isRequired": False, "description": "Age",
                    "visibility": {"client": True, "server": True},
                },
                # Server-only timestamp
                {
                    "id": "f5", "name": "internal ts", "type": "timestamp",
                    "isRequired": True, "description": "Internal timestamp",
                    "visibility": {"client": False, "server": True},
                },
                # Client-only boolean
                {
                    "id": "f6", "name": "is editing", "type": "boolean",
                    "isRequired": False, "description": "UI state",
                    "visibility": {"client": True, "server": False},
                },
                # Both-visible boolean
                {
                    "id": "f7", "name": "is active", "type": "boolean",
                    "isRequired": True, "description": "Active flag",
                    "visibility": {"client": True, "server": True},
                },
            ],
        }
    ],
}

# ── No transforms first (baseline visibility) ────────────────────────────────
TRANSFORM_NONE = {
    "endpointName": "api",
    "collectionConfigs": {},
}

# ── Transforms with visibility: server-only field fed by timestamp-now,
#    client-only field fed by number-add transform ─────────────────────────────
_VIS_READ_NODES = [
    {"id": "rn1", "type": "number-round", "position": {"x": 400, "y": 50}, "params": {}},
    {"id": "rn2", "type": "constant-number", "position": {"x": 400, "y": 150}, "params": {"value": "42"}},
]
_VIS_READ_EDGES = [
    # age -> round -> client age
    {"id": "re1", "sourceNodeId": "server-node", "sourcePortId": "f4",
     "targetNodeId": "rn1", "targetPortId": "in-in"},
    {"id": "re2", "sourceNodeId": "rn1", "sourcePortId": "out-out",
     "targetNodeId": "client-node", "targetPortId": "f4"},
    # constant 42 -> client computed score (client-only field)
    {"id": "re3", "sourceNodeId": "rn2", "sourcePortId": "out-out",
     "targetNodeId": "client-node", "targetPortId": "f3"},
]
_VIS_WRITE_NODES = [
    {"id": "wn1", "type": "string-trim", "position": {"x": 400, "y": 50}, "params": {}},
    {"id": "wn2", "type": "timestamp-now", "position": {"x": 400, "y": 150}, "params": {}},
]
_VIS_WRITE_EDGES = [
    # display name -> trim -> server display name
    {"id": "we1", "sourceNodeId": "client-node", "sourcePortId": "f1",
     "targetNodeId": "wn1", "targetPortId": "in-in"},
    {"id": "we2", "sourceNodeId": "wn1", "sourcePortId": "out-out",
     "targetNodeId": "server-node", "targetPortId": "f1"},
    # timestamp-now -> server internal ts (server-only, no client source)
    {"id": "we3", "sourceNodeId": "wn2", "sourcePortId": "out-out",
     "targetNodeId": "server-node", "targetPortId": "f5"},
]

# Client mode — used for Scenario B (Dart transforms with visibility)
TRANSFORM_WITH_VIS_CLIENT = {
    "endpointName": "accountsApi",
    "collectionConfigs": {
        "c1": {
            "readTransformMode": "client",
            "writeTransformMode": "client",
            "readNodes": _VIS_READ_NODES,
            "readEdges": _VIS_READ_EDGES,
            "writeNodes": _VIS_WRITE_NODES,
            "writeEdges": _VIS_WRITE_EDGES,
        }
    },
}

# Server mode — used for Scenario C (Cloud Function visibility)
TRANSFORM_WITH_VIS_SERVER = {
    "endpointName": "accountsApi",
    "collectionConfigs": {
        "c1": {
            "readTransformMode": "server",
            "writeTransformMode": "server",
            "readNodes": _VIS_READ_NODES,
            "readEdges": _VIS_READ_EDGES,
            "writeNodes": _VIS_WRITE_NODES,
            "writeEdges": _VIS_WRITE_EDGES,
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
    # SCENARIO A: Baseline Dart (no transforms) with visibility
    # ═══════════════════════════════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("SCENARIO A: Baseline Dart visibility (no transforms)")
    print("=" * 70)

    seed(page, PROJECT, TRANSFORM_NONE)
    dart = get_code(page, "dart")
    check(len(dart) > 50, f"Dart code generated ({len(dart)} chars)")

    print("\n--- Class field presence ---")
    # Both-visible fields should be in the class
    check("String displayName" in dart,
          "Both-visible 'displayName' is in Dart class")
    check("bool isActive" in dart,
          "Both-visible 'isActive' is in Dart class")

    # Server-only fields should NOT be in the Dart class
    check("passwordHash" not in dart,
          "Server-only 'passwordHash' NOT in Dart class")
    check("internalTs" not in dart,
          "Server-only 'internalTs' NOT in Dart class")

    # Client-only fields should be in the Dart class
    check("computedScore" in dart,
          "Client-only 'computedScore' is in Dart class")
    check("isEditing" in dart,
          "Client-only 'isEditing' is in Dart class")

    print("\n--- _fromFirestore checks ---")
    from_idx = dart.find("_fromFirestore")
    to_idx = dart.find("_toFirestore")
    if from_idx > 0 and to_idx > from_idx:
        from_section = dart[from_idx:to_idx]

        # Both-visible fields should read from data
        check("data?['display name']" in from_section,
              "_fromFirestore reads 'display name' from data")
        check("data?['is active']" in from_section,
              "_fromFirestore reads 'is active' from data")
        check("data?['age']" in from_section,
              "_fromFirestore reads 'age' from data")

        # Client-only fields should NOT read from data (they don't exist in Firestore)
        check("data?['computed score']" not in from_section,
              "_fromFirestore does NOT read client-only 'computed score' from data")
        check("data?['is editing']" not in from_section,
              "_fromFirestore does NOT read client-only 'is editing' from data")
        # They should get null
        check("computedScore: null" in from_section,
              "_fromFirestore assigns null to client-only 'computedScore'")
        check("isEditing: null" in from_section,
              "_fromFirestore assigns null to client-only 'isEditing'")

        # Server-only fields should not appear at all in _fromFirestore
        check("passwordHash" not in from_section,
              "_fromFirestore does NOT reference server-only 'passwordHash'")
        check("internalTs" not in from_section,
              "_fromFirestore does NOT reference server-only 'internalTs'")
    else:
        check(False, "Could not find _fromFirestore/_toFirestore sections")

    print("\n--- _toFirestore checks ---")
    if to_idx > 0:
        # Slice just the _toFirestore method (until the next factory/method)
        next_method_idx = dart.find('\n  /// ', to_idx + 10)
        to_section = dart[to_idx:next_method_idx] if next_method_idx > to_idx else dart[to_idx:to_idx + 1000]

        # Both-visible fields should be serialised
        check("'display name': displayName" in to_section,
              "_toFirestore writes 'display name'")
        check("'is active': isActive" in to_section,
              "_toFirestore writes 'is active'")

        # Client-only fields should NOT be serialised (not in Firestore)
        check("'computed score'" not in to_section,
              "_toFirestore does NOT write client-only 'computed score'")
        check("'is editing'" not in to_section,
              "_toFirestore does NOT write client-only 'is editing'")

        # Server-only fields should NOT appear (no Dart class property for them)
        check("passwordHash" not in to_section,
              "_toFirestore does NOT reference server-only 'passwordHash'")
        check("internalTs" not in to_section,
              "_toFirestore does NOT reference server-only 'internalTs'")
    else:
        check(False, "Could not find _toFirestore section")

    print("\n--- copyWith checks ---")
    copy_idx = dart.find("copyWith")
    if copy_idx > 0:
        copy_section = dart[copy_idx:copy_idx + 1000]
        check("computedScore" in copy_section,
              "copyWith includes client-only 'computedScore'")
        check("isEditing" in copy_section,
              "copyWith includes client-only 'isEditing'")
        check("passwordHash" not in copy_section,
              "copyWith does NOT include server-only 'passwordHash'")
    else:
        check(False, "Could not find copyWith section")

    close_preview(page)

    # ═══════════════════════════════════════════════════════════════════════
    # SCENARIO B: Dart with transforms + visibility
    # ═══════════════════════════════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("SCENARIO B: Dart transforms with visibility fields")
    print("=" * 70)

    seed(page, PROJECT, TRANSFORM_WITH_VIS_CLIENT)
    dart_t = get_code(page, "dart")
    check(len(dart_t) > 50, f"Dart code generated ({len(dart_t)} chars)")

    from_idx_t = dart_t.find("_fromFirestore")
    to_idx_t = dart_t.find("_toFirestore")

    print("\n--- _fromFirestore with transforms ---")
    if from_idx_t > 0 and to_idx_t > from_idx_t:
        from_section_t = dart_t[from_idx_t:to_idx_t]

        # Read transform on both-visible age: should have .round()
        check(".round()" in from_section_t,
              "_fromFirestore has .round() transform on age")

        # Read transform: constant 42 → client-only computedScore
        check("42" in from_section_t,
              "_fromFirestore has constant 42 for client-only computedScore")
    else:
        check(False, "Could not find _fromFirestore/_toFirestore sections")

    print("\n--- _toFirestore with transforms ---")
    if to_idx_t > 0:
        to_section_t = dart_t[to_idx_t:to_idx_t + 1000]

        # Write transform on display name: should have .trim()
        check(".trim()" in to_section_t,
              "_toFirestore has .trim() transform on displayName")

        # Server-only 'internal ts' with timestamp-now write transform:
        # Should appear in _toFirestore since transform provides the value
        check("'internal ts'" in to_section_t or "internalTs" in to_section_t,
              "_toFirestore includes server-only 'internal ts' (from timestamp-now transform)")
    else:
        check(False, "Could not find _toFirestore section")

    close_preview(page)

    # ═══════════════════════════════════════════════════════════════════════
    # SCENARIO C: Cloud Function with visibility
    # ═══════════════════════════════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("SCENARIO C: Cloud Function visibility")
    print("=" * 70)

    seed(page, PROJECT, TRANSFORM_WITH_VIS_SERVER)
    cf = get_code(page, "cloud-function")
    check(len(cf) > 100, f"Cloud function generated ({len(cf)} chars)")

    print("\n--- Server interface ---")
    # Server interface should have server-visible fields
    check("passwordHash" in cf or "password_hash" in cf,
          "CF server interface includes server-only 'passwordHash'")
    check("internalTs" in cf or "internal_ts" in cf,
          "CF server interface includes server-only 'internalTs'")
    check("displayName" in cf,
          "CF server interface includes both-visible 'displayName'")

    print("\n--- Client interface ---")
    # Client interface should have client-visible fields
    check("computedScore" in cf or "computed_score" in cf,
          "CF client interface includes client-only 'computedScore'")
    check("isEditing" in cf or "is_editing" in cf,
          "CF client interface includes client-only 'isEditing'")

    print("\n--- Read handler ---")
    # Read handler should read server fields from Firestore doc
    check("data['display name']" in cf or "data['displayName']" in cf,
          "CF read handler reads 'display name' from Firestore")
    check("data['password hash']" in cf or "data['passwordHash']" in cf,
          "CF read handler reads server-only 'password hash' from Firestore")
    check("data['internal ts']" in cf or "data['internalTs']" in cf,
          "CF read handler reads server-only 'internal ts' from Firestore")

    # Read response should contain client-visible fields
    check("result['display name']" in cf or "result['displayName']" in cf,
          "CF read result includes 'display name'")
    check("result['computed score']" in cf or "result['computedScore']" in cf,
          "CF read result includes client-only 'computed score'")
    # Read response should NOT contain server-only fields
    check("result['password hash']" not in cf and "result['passwordHash']" not in cf,
          "CF read result does NOT include server-only 'password hash'")

    print("\n--- Read transforms ---")
    check(".round()" in cf or "Math.round(" in cf,
          "CF read handler applies round transform to age")
    check("42" in cf,
          "CF read handler has constant 42 for computed score")

    print("\n--- Write handler ---")
    # Write handler should produce docData with server fields
    check("docData['display name']" in cf or "docData['displayName']" in cf,
          "CF write handler writes 'display name' to docData")
    check("docData['internal ts']" in cf or "docData['internalTs']" in cf,
          "CF write handler writes server-only 'internal ts' to docData (via transform)")
    # Write handler should NOT write client-only fields to Firestore
    check("docData['computed score']" not in cf and "docData['computedScore']" not in cf,
          "CF write handler does NOT write client-only 'computed score'")

    print("\n--- Write transforms ---")
    check(".trim()" in cf,
          "CF write handler applies trim transform to display name")
    check("Timestamp.now()" in cf,
          "CF write handler has Timestamp.now() for server-only internal ts")

    close_preview(page)

    browser.close()

# ── Summary ───────────────────────────────────────────────────────────────────
if ERRORS:
    print(f"\n>> {len(ERRORS)} visibility test(s) failed:")
    for e in ERRORS:
        print(f"  x {e}")
    sys.exit(1)
else:
    print("\n>> All visibility code generation tests passed!")
