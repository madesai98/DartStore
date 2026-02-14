"""Test 18: Direct field-to-field transforms (no intermediate transform node).

The scenario: A collection with 3 fields:
  - shared (both-visible string)
  - se (server-only string)
  - cl (client-only string)

Read transforms: shared→shared, se→cl (direct edge, no transform node)
Write transforms: shared→shared, cl→se (direct edge, no transform node)

Expected Dart output:
  - fromFirestore: cl = data?['se'] (reads server-only field for client-only property)
  - toFirestore: 'se' = cl (writes client-only property to server-only field)

Expected CF output:
  - Read handler: result['cl'] = se (assigns server variable to client result)
  - Write handler: docData['se'] = cl (assigns client body value to server doc field)
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


# ──────────────────────────────────────────────────────────────────────────────
# Project: collection with direct field-to-field connections
# ──────────────────────────────────────────────────────────────────────────────

PROJECT = {
    "name": "DirectFields",
    "description": "Test direct field-to-field transforms",
    "collections": [
        {
            "id": "c1",
            "name": "col",
            "description": "Test collection",
            "subcollections": [],
            "fields": [
                {
                    "id": "f1", "name": "shared", "type": "string",
                    "isRequired": False, "description": "",
                    "visibility": {"client": True, "server": True},
                },
                {
                    "id": "f2", "name": "se", "type": "string",
                    "isRequired": False, "description": "Server only",
                    "visibility": {"client": False, "server": True},
                },
                {
                    "id": "f3", "name": "cl", "type": "string",
                    "isRequired": False, "description": "Client only",
                    "visibility": {"client": True, "server": False},
                },
            ],
        }
    ],
}

# Read edges: no transform nodes, just direct connections
#   server:f1 (shared) → client:f1 (shared)  — passthrough
#   server:f2 (se)     → client:f3 (cl)      — cross-visibility direct
# Write edges: no transform nodes, just direct connections
#   client:f1 (shared) → server:f1 (shared)  — passthrough
#   client:f3 (cl)     → server:f2 (se)      — cross-visibility direct

SHARED_READ_NODES = []
SHARED_READ_EDGES = [
    {"id": "re1", "sourceNodeId": "server-node", "sourcePortId": "f1",
     "targetNodeId": "client-node", "targetPortId": "f1"},
    {"id": "re2", "sourceNodeId": "server-node", "sourcePortId": "f2",
     "targetNodeId": "client-node", "targetPortId": "f3"},
]
SHARED_WRITE_NODES = []
SHARED_WRITE_EDGES = [
    {"id": "we1", "sourceNodeId": "client-node", "sourcePortId": "f1",
     "targetNodeId": "server-node", "targetPortId": "f1"},
    {"id": "we2", "sourceNodeId": "client-node", "sourcePortId": "f3",
     "targetNodeId": "server-node", "targetPortId": "f2"},
]

TRANSFORM_CLIENT = {
    "endpointName": "dataTransformer",
    "collectionConfigs": {
        "c1": {
            "readTransformMode": "client",
            "writeTransformMode": "client",
            "readNodes": SHARED_READ_NODES,
            "readEdges": SHARED_READ_EDGES,
            "writeNodes": SHARED_WRITE_NODES,
            "writeEdges": SHARED_WRITE_EDGES,
        }
    },
}

TRANSFORM_SERVER = {
    "endpointName": "dataTransformer",
    "collectionConfigs": {
        "c1": {
            "readTransformMode": "server",
            "writeTransformMode": "server",
            "readNodes": SHARED_READ_NODES,
            "readEdges": SHARED_READ_EDGES,
            "writeNodes": SHARED_WRITE_NODES,
            "writeEdges": SHARED_WRITE_EDGES,
        }
    },
}


# ──────────────────────────────────────────────────────────────────────────────
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto(BASE)
    page.wait_for_load_state("networkidle")

    # ═══════════════════════════════════════════════════════════════════════
    # PART 1: Dart code (client mode)
    # ═══════════════════════════════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("PART 1: Dart — direct field-to-field transforms")
    print("=" * 70)

    seed(page, PROJECT, TRANSFORM_CLIENT)

    dart = get_code(page, "dart")
    check(len(dart) > 100, f"Dart code generated ({len(dart)} chars)")

    # -- Class fields --
    print("\n--- Class fields ---")
    check("shared" in dart, "'shared' in Dart class")
    check("String? cl" in dart, "Client-only 'cl' in Dart class")
    # se should NOT be in the class (server-only)
    # Look for 'String? se' — but 'se' is very short, check carefully
    lines = dart.split('\n')
    se_as_field = any("String" in l and " se;" in l for l in lines)
    check(not se_as_field, "Server-only 'se' NOT a Dart class field")

    # -- fromFirestore --
    print("\n--- _fromFirestore: direct field-to-field ---")
    from_idx = dart.find("_fromFirestore")
    to_idx = dart.find("_toFirestore")
    from_section = dart[from_idx:to_idx] if from_idx > 0 and to_idx > from_idx else ""
    check(len(from_section) > 0, "_fromFirestore section found")

    # shared should read from data normally
    check("data?['shared']" in from_section,
          "shared reads from data?['shared']")

    # cl should read from server-only field 'se' via direct edge
    cl_lines = [l for l in from_section.split('\n') if 'cl:' in l]
    if cl_lines:
        cl_line = cl_lines[0]
        # Should contain data?['se'] — reading from server-only field
        check("data?['se']" in cl_line,
              "cl reads from data?['se'] (server-only field via direct edge)")
        check("null" not in cl_line.lower() or "data?['se']" in cl_line,
              "cl is NOT null — gets value from direct edge")
    else:
        check(False, "cl reads from data?['se'] (server-only field via direct edge)")
        check(False, "cl is NOT null — gets value from direct edge")

    # -- toFirestore --
    print("\n--- _toFirestore: direct field-to-field ---")
    to_section = dart[to_idx:to_idx + 2000] if to_idx > 0 else ""
    check(len(to_section) > 0, "_toFirestore section found")

    # 'shared' should write normally
    check("'shared'" in to_section, "toFirestore writes 'shared' key")

    # 'se' should get value from cl (client-only property via direct edge)
    se_lines = [l for l in to_section.split('\n') if "'se'" in l]
    if se_lines:
        se_line = se_lines[0]
        check("cl" in se_line,
              "'se' gets value from 'cl' (client-only field via direct edge)")
    else:
        check(False, "'se' gets value from 'cl' (client-only field via direct edge)")

    close_preview(page)

    # ═══════════════════════════════════════════════════════════════════════
    # PART 2: Cloud Function code (server mode)
    # ═══════════════════════════════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("PART 2: Cloud Function — direct field-to-field transforms")
    print("=" * 70)

    seed(page, PROJECT, TRANSFORM_SERVER)

    cf = get_code(page, "cloud-function")
    check(len(cf) > 200, f"Cloud function generated ({len(cf)} chars)")

    # -- Read handler --
    print("\n--- CF read handler: direct field-to-field ---")
    # Server fields should be extracted
    check("data['shared']" in cf, "CF reads 'shared' from Firestore")
    check("data['se']" in cf, "CF reads server-only 'se' from Firestore")

    # result['cl'] should be set to 'se' (direct edge)
    cl_result_lines = [l for l in cf.split('\n') if "result['cl']" in l]
    if cl_result_lines:
        cl_result_line = cl_result_lines[0]
        check("se" in cl_result_line and "null" not in cl_result_line.lower(),
              "result['cl'] = se (NOT null)")
    else:
        check(False, "result['cl'] = se (NOT null)")

    # result['shared'] should be set to shared
    check("result['shared']" in cf, "result['shared'] is set")

    # -- Write handler --
    print("\n--- CF write handler: direct field-to-field ---")
    # Client-only 'cl' should be extracted from body
    check("body['cl']" in cf,
          "CF write handler extracts client-only 'cl' from body")

    # docData['se'] should be set to cl (direct edge)
    se_doc_lines = [l for l in cf.split('\n') if "docData['se']" in l]
    if se_doc_lines:
        se_doc_line = se_doc_lines[0]
        check("cl" in se_doc_line,
              "docData['se'] = cl (client-only field via direct edge)")
    else:
        check(False, "docData['se'] = cl (client-only field via direct edge)")

    # docData['shared'] should be set normally
    check("docData['shared']" in cf, "docData['shared'] is set")

    # No client-only fields in docData
    check("docData['cl']" not in cf, "docData['cl'] NOT in server doc")

    close_preview(page)
    browser.close()

# ── Summary ───────────────────────────────────────────────────────────────────
if ERRORS:
    print(f"\n>> {len(ERRORS)} direct field transform test(s) failed:")
    for e in ERRORS:
        print(f"  x {e}")
    sys.exit(1)
else:
    print("\n>> All direct field-to-field transform tests passed!")
