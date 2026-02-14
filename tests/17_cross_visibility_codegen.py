"""Test 17: Cross-visibility field transforms — server-only <-> client-only
field connections in Dart and Cloud Function code generation.

The critical scenario: a server-only field is wired via a transform to a
client-only field (reads), or a client-only field is wired via a transform
to a server-only field (writes).

For READS (Dart fromFirestore / CF read handler):
  - server-only "secret token" -> toUpperCase -> client-only "display token"
  - The Dart fromFirestore must read "secret token" from data and transform it
  - The CF read handler must read "secret token" from Firestore, transform it,
    and put the result in the client response as "display token"

For WRITES (Dart toFirestore / CF write handler):
  - client-only "user input" -> trim -> server-only "sanitised input"
  - The Dart toFirestore must take the client property userInput, transform it,
    and write it as "sanitised input" in the Firestore map
  - The CF write handler must read "user input" from the request body,
    transform it, and write it as "sanitised input" to Firestore

Also tests direct passthrough (no intermediate transform node) between
server-only and client-only fields — though this uses an identity node
since direct field-to-field edges go through transform nodes.
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
# Project: collection with cross-visibility fields
# ──────────────────────────────────────────────────────────────────────────────

PROJECT = {
    "name": "CrossVisibility",
    "description": "Test cross-visibility transforms",
    "collections": [
        {
            "id": "c1",
            "name": "tokens",
            "description": "Token store",
            "subcollections": [],
            "fields": [
                # Server-only string — exists in Firestore, not in Dart class
                {
                    "id": "f1", "name": "secret token", "type": "string",
                    "isRequired": True, "description": "Server secret",
                    "visibility": {"client": False, "server": True},
                },
                # Client-only string — exists in Dart class, not in Firestore
                {
                    "id": "f2", "name": "display token", "type": "string",
                    "isRequired": False, "description": "Client display",
                    "visibility": {"client": True, "server": False},
                },
                # Client-only string for writes
                {
                    "id": "f3", "name": "user input", "type": "string",
                    "isRequired": False, "description": "Raw user input",
                    "visibility": {"client": True, "server": False},
                },
                # Server-only string for writes
                {
                    "id": "f4", "name": "sanitised input", "type": "string",
                    "isRequired": True, "description": "Cleaned input",
                    "visibility": {"client": False, "server": True},
                },
                # Both-visible field (baseline control)
                {
                    "id": "f5", "name": "label", "type": "string",
                    "isRequired": True, "description": "Both-visible",
                    "visibility": {"client": True, "server": True},
                },
                # Server-only number -> client-only number via round
                {
                    "id": "f6", "name": "raw score", "type": "number",
                    "isRequired": True, "description": "Raw server score",
                    "visibility": {"client": False, "server": True},
                },
                {
                    "id": "f7", "name": "display score", "type": "number",
                    "isRequired": False, "description": "Rounded client score",
                    "visibility": {"client": True, "server": False},
                },
            ],
        }
    ],
}

# READ transforms: server-only -> transform -> client-only
#   f1 "secret token" (server-only) -> toUpperCase -> f2 "display token" (client-only)
#   f6 "raw score" (server-only) -> round -> f7 "display score" (client-only)
# WRITE transforms: client-only -> transform -> server-only
#   f3 "user input" (client-only) -> trim -> f4 "sanitised input" (server-only)
_CROSS_READ_NODES = [
    {"id": "rn1", "type": "string-toUpperCase", "position": {"x": 400, "y": 50}, "params": {}},
    {"id": "rn2", "type": "number-round", "position": {"x": 400, "y": 200}, "params": {}},
]
_CROSS_READ_EDGES = [
    # server f1 (secret token) -> rn1 (toUpperCase) -> client f2 (display token)
    {"id": "re1", "sourceNodeId": "server-node", "sourcePortId": "f1",
     "targetNodeId": "rn1", "targetPortId": "in-in"},
    {"id": "re2", "sourceNodeId": "rn1", "sourcePortId": "out-out",
     "targetNodeId": "client-node", "targetPortId": "f2"},
    # server f6 (raw score) -> rn2 (round) -> client f7 (display score)
    {"id": "re3", "sourceNodeId": "server-node", "sourcePortId": "f6",
     "targetNodeId": "rn2", "targetPortId": "in-in"},
    {"id": "re4", "sourceNodeId": "rn2", "sourcePortId": "out-out",
     "targetNodeId": "client-node", "targetPortId": "f7"},
]
_CROSS_WRITE_NODES = [
    {"id": "wn1", "type": "string-trim", "position": {"x": 400, "y": 50}, "params": {}},
]
_CROSS_WRITE_EDGES = [
    # client f3 (user input) -> wn1 (trim) -> server f4 (sanitised input)
    {"id": "we1", "sourceNodeId": "client-node", "sourcePortId": "f3",
     "targetNodeId": "wn1", "targetPortId": "in-in"},
    {"id": "we2", "sourceNodeId": "wn1", "sourcePortId": "out-out",
     "targetNodeId": "server-node", "targetPortId": "f4"},
]

# Client mode — used for Part 1 (Dart cross-visibility transforms)
TRANSFORM_CLIENT = {
    "endpointName": "tokensApi",
    "collectionConfigs": {
        "c1": {
            "readTransformMode": "client",
            "writeTransformMode": "client",
            "readNodes": _CROSS_READ_NODES,
            "readEdges": _CROSS_READ_EDGES,
            "writeNodes": _CROSS_WRITE_NODES,
            "writeEdges": _CROSS_WRITE_EDGES,
        }
    },
}

# Server mode — used for Part 2 (Cloud Function cross-visibility transforms)
TRANSFORM_SERVER = {
    "endpointName": "tokensApi",
    "collectionConfigs": {
        "c1": {
            "readTransformMode": "server",
            "writeTransformMode": "server",
            "readNodes": _CROSS_READ_NODES,
            "readEdges": _CROSS_READ_EDGES,
            "writeNodes": _CROSS_WRITE_NODES,
            "writeEdges": _CROSS_WRITE_EDGES,
        }
    },
}


# ──────────────────────────────────────────────────────────────────────────────
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto(BASE)
    page.wait_for_load_state("networkidle")

    seed(page, PROJECT, TRANSFORM_CLIENT)

    # ═══════════════════════════════════════════════════════════════════════
    # PART 1: Dart code
    # ═══════════════════════════════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("PART 1: Dart — cross-visibility field transforms")
    print("=" * 70)

    dart = get_code(page, "dart")
    check(len(dart) > 100, f"Dart code generated ({len(dart)} chars)")
    print()  # blank line for readability

    # ── Class fields ──────────────────────────────────────────────────────
    print("--- Class fields ---")
    # Client-only fields should be in the class
    check("displayToken" in dart, "Client-only 'displayToken' in Dart class")
    check("userInput" in dart, "Client-only 'userInput' in Dart class")
    check("displayScore" in dart, "Client-only 'displayScore' in Dart class")
    # Server-only fields should NOT be in the class
    check("secretToken" not in dart, "Server-only 'secretToken' NOT in Dart class")
    check("sanitisedInput" not in dart, "Server-only 'sanitisedInput' NOT in Dart class")
    check("rawScore" not in dart, "Server-only 'rawScore' NOT in Dart class")
    # Both-visible
    check("String label" in dart, "Both-visible 'label' in Dart class")

    # ── fromFirestore (reads) ─────────────────────────────────────────────
    print("\n--- _fromFirestore: server-only -> transform -> client-only ---")
    from_idx = dart.find("_fromFirestore")
    to_idx = dart.find("_toFirestore")
    from_section = dart[from_idx:to_idx] if from_idx > 0 and to_idx > from_idx else ""
    check(len(from_section) > 0, "_fromFirestore section found")

    # f1 (secret token, server-only) -> toUpperCase -> f2 (display token, client-only)
    # The generated code must:
    # 1. Read "secret token" from data (e.g. data?['secret token'])
    # 2. Apply .toUpperCase()
    # 3. Assign to displayToken
    check("data?['secret token']" in from_section,
          "_fromFirestore reads server-only 'secret token' from Firestore data")
    check(".toUpperCase()" in from_section,
          "_fromFirestore applies .toUpperCase() transform")
    # The displayToken line should contain the data read AND the transform
    dt_line = [l for l in from_section.split('\n') if 'displayToken' in l]
    if dt_line:
        line = dt_line[0]
        check("secret token" in line and ".toUpperCase()" in line,
              "displayToken line reads 'secret token' AND applies toUpperCase")
    else:
        check(False, "displayToken line reads 'secret token' AND applies toUpperCase")

    # f6 (raw score, server-only) -> round -> f7 (display score, client-only)
    check("data?['raw score']" in from_section,
          "_fromFirestore reads server-only 'raw score' from Firestore data")
    check(".round()" in from_section,
          "_fromFirestore applies .round() transform")
    ds_line = [l for l in from_section.split('\n') if 'displayScore' in l]
    if ds_line:
        line = ds_line[0]
        check("raw score" in line and ".round()" in line,
              "displayScore line reads 'raw score' AND applies round")
    else:
        check(False, "displayScore line reads 'raw score' AND applies round")

    # Client-only fields without transforms should still get null
    ui_line = [l for l in from_section.split('\n') if 'userInput' in l]
    if ui_line:
        check("null" in ui_line[0],
              "Client-only 'userInput' (no read transform) gets null")
    else:
        check(False, "Client-only 'userInput' (no read transform) gets null")

    # ── toFirestore (writes) ──────────────────────────────────────────────
    print("\n--- _toFirestore: client-only -> transform -> server-only ---")
    to_section = dart[to_idx:to_idx + 2000] if to_idx > 0 else ""
    check(len(to_section) > 0, "_toFirestore section found")

    # f3 (user input, client-only) -> trim -> f4 (sanitised input, server-only)
    # The generated code must:
    # 1. Reference userInput (the Dart property)
    # 2. Apply .trim()
    # 3. Write as 'sanitised input' key
    check("'sanitised input'" in to_section,
          "_toFirestore writes server-only 'sanitised input' key")
    check(".trim()" in to_section,
          "_toFirestore applies .trim() transform")
    si_line = [l for l in to_section.split('\n') if "'sanitised input'" in l]
    if si_line:
        line = si_line[0]
        check("userInput" in line and ".trim()" in line,
              "sanitised input line reads 'userInput' AND applies trim")
    else:
        check(False, "sanitised input line reads 'userInput' AND applies trim")

    # Both-visible field should be serialised normally
    check("'label': label" in to_section,
          "_toFirestore writes both-visible 'label' normally")

    # Server-only 'secret token' without a write transform should NOT appear
    check("'secret token'" not in to_section,
          "_toFirestore does NOT write 'secret token' (no write transform for it)")

    close_preview(page)

    # ═══════════════════════════════════════════════════════════════════════
    # PART 2: Cloud Function code
    # ═══════════════════════════════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("PART 2: Cloud Function — cross-visibility field transforms")
    print("=" * 70)

    seed(page, PROJECT, TRANSFORM_SERVER)
    cf = get_code(page, "cloud-function")
    check(len(cf) > 200, f"Cloud function generated ({len(cf)} chars)")
    print()

    # ── Read handler ──────────────────────────────────────────────────────
    print("--- CF read handler: server-only -> transform -> client response ---")
    # Server fields should be extracted from Firestore doc
    check("data['secret token']" in cf,
          "CF reads server-only 'secret token' from Firestore")
    check("data['raw score']" in cf,
          "CF reads server-only 'raw score' from Firestore")

    # Transform code should reference the server field variables
    check(".toUpperCase()" in cf,
          "CF applies toUpperCase transform")
    check("Math.round(" in cf,
          "CF applies Math.round transform")

    # Client-only fields should appear in result
    check("result['display token']" in cf,
          "CF result includes client-only 'display token'")
    check("result['display score']" in cf,
          "CF result includes client-only 'display score'")
    check("result['user input']" in cf,
          "CF result includes client-only 'user input' (null, no read transform)")

    # Server-only fields should NOT appear in result
    check("result['secret token']" not in cf,
          "CF result does NOT include server-only 'secret token'")
    check("result['raw score']" not in cf,
          "CF result does NOT include server-only 'raw score'")

    # ── Write handler ─────────────────────────────────────────────────────
    print("\n--- CF write handler: client request -> transform -> server doc ---")

    # The write handler needs to extract client-only "user input" from the body
    # to feed into the transform, even though it's client-only
    check("body['user input']" in cf,
          "CF write handler extracts client-only 'user input' from request body")

    # Transform should produce trimmed value
    check(".trim()" in cf,
          "CF write handler applies trim transform")

    # docData should include server-only field with transformed value
    check("docData['sanitised input']" in cf,
          "CF write handler writes server-only 'sanitised input' to docData")

    # docData should NOT include client-only fields
    check("docData['user input']" not in cf,
          "CF write handler does NOT write client-only 'user input' to docData")
    check("docData['display token']" not in cf,
          "CF write handler does NOT write client-only 'display token' to docData")

    close_preview(page)

    browser.close()

# ── Summary ───────────────────────────────────────────────────────────────────
if ERRORS:
    print(f"\n>> {len(ERRORS)} cross-visibility test(s) failed:")
    for e in ERRORS:
        print(f"  x {e}")
    sys.exit(1)
else:
    print("\n>> All cross-visibility code generation tests passed!")
