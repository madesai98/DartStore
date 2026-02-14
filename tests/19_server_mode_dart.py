"""Test 19: Server-mode Dart code generation - ORM API.

When readTransformMode='server' or writeTransformMode='server', the generated
Dart code should:
  1. Include dart:convert and package:http imports
  2. Include DartStoreClient base class with baseUrl and headers
  3. Include DartStoreException class
  4. Generate private _fromJson / _toJson on every class
  5. Generate private _fromServer when readTransformMode='server'
  6. Generate private _saveToServer when writeTransformMode='server'
  7. upload() delegates to _saveToServer or direct Firestore
  8. download() delegates to _fromServer or direct Firestore
  9. deleteRemote() always targets Firestore directly
  10. fetchAll() lists documents (server or direct)
  11. When only client transforms, NO base class / server imports
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


PROJECT = {
    "name": "ServerMode",
    "description": "Test server-mode Dart generation",
    "collections": [
        {
            "id": "c1",
            "name": "users",
            "description": "User collection",
            "subcollections": [],
            "fields": [
                {
                    "id": "f1", "name": "name", "type": "string",
                    "isRequired": True, "description": "User name",
                    "visibility": {"client": True, "server": True},
                },
                {
                    "id": "f2", "name": "score", "type": "number",
                    "isRequired": False, "description": "Score",
                    "visibility": {"client": True, "server": True},
                },
                {
                    "id": "f3", "name": "created", "type": "timestamp",
                    "isRequired": False, "description": "When created",
                    "visibility": {"client": True, "server": True},
                },
            ],
        },
        {
            "id": "c2",
            "name": "items",
            "description": "Items collection",
            "subcollections": [],
            "fields": [
                {
                    "id": "f4", "name": "title", "type": "string",
                    "isRequired": True, "description": "",
                    "visibility": {"client": True, "server": True},
                },
            ],
        },
    ],
}

READ_NODES = [
    {"id": "rn1", "type": "string-toUpperCase", "position": {"x": 400, "y": 50}, "params": {}},
]
READ_EDGES = [
    {"id": "re1", "sourceNodeId": "server-node", "sourcePortId": "f1",
     "targetNodeId": "rn1", "targetPortId": "in-in"},
    {"id": "re2", "sourceNodeId": "rn1", "sourcePortId": "out-out",
     "targetNodeId": "client-node", "targetPortId": "f1"},
]
WRITE_NODES = [
    {"id": "wn1", "type": "string-trim", "position": {"x": 400, "y": 50}, "params": {}},
]
WRITE_EDGES = [
    {"id": "we1", "sourceNodeId": "client-node", "sourcePortId": "f1",
     "targetNodeId": "wn1", "targetPortId": "in-in"},
    {"id": "we2", "sourceNodeId": "wn1", "sourcePortId": "out-out",
     "targetNodeId": "server-node", "targetPortId": "f1"},
]

TRANSFORM_SERVER_BOTH = {
    "endpointName": "dataTransformer",
    "collectionConfigs": {
        "c1": {
            "readTransformMode": "server",
            "writeTransformMode": "server",
            "readNodes": READ_NODES,
            "readEdges": READ_EDGES,
            "writeNodes": WRITE_NODES,
            "writeEdges": WRITE_EDGES,
        },
    },
}

TRANSFORM_SERVER_READ_ONLY = {
    "endpointName": "myApi",
    "collectionConfigs": {
        "c1": {
            "readTransformMode": "server",
            "writeTransformMode": "client",
            "readNodes": READ_NODES,
            "readEdges": READ_EDGES,
            "writeNodes": WRITE_NODES,
            "writeEdges": WRITE_EDGES,
        },
    },
}

TRANSFORM_CLIENT_ONLY = {
    "endpointName": "api",
    "collectionConfigs": {
        "c1": {
            "readTransformMode": "client",
            "writeTransformMode": "client",
            "readNodes": READ_NODES,
            "readEdges": READ_EDGES,
            "writeNodes": WRITE_NODES,
            "writeEdges": WRITE_EDGES,
        },
    },
}


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto(BASE)
    page.wait_for_load_state("networkidle")

    # PART 1: Server read + write on "users"
    print("\n" + "=" * 70)
    print("PART 1: Server transforms (read+write) on users")
    print("=" * 70)

    seed(page, PROJECT, TRANSFORM_SERVER_BOTH)
    dart = get_code(page, "dart")
    check(len(dart) > 200, f"Dart code generated ({len(dart)} chars)")

    print("\n--- Imports ---")
    check("import 'dart:convert';" in dart, "dart:convert import present")
    check("import 'package:http/http.dart' as http;" in dart,
          "package:http import present")
    check("import 'package:cloud_firestore/cloud_firestore.dart';" in dart,
          "cloud_firestore import still present")

    print("\n--- DartStoreClient base class ---")
    check("class DartStoreClient" in dart, "DartStoreClient class present")
    check("static String baseUrl" in dart, "baseUrl static field present")
    check("static Map<String, String> headers" in dart, "headers static field present")

    print("\n--- DartStoreException ---")
    check("class DartStoreException" in dart, "DartStoreException class present")
    check("implements Exception" in dart, "DartStoreException implements Exception")

    print("\n--- remoteId ---")
    check("String? _remoteId" in dart, "_remoteId private field present")
    check("String? get remoteId" in dart, "remoteId public getter present")

    print("\n--- _fromJson (private) ---")
    check("._fromJson(Map<String, dynamic> json)" in dart, "_fromJson private factory present")
    check("json['name']" in dart, "_fromJson parses name field")
    check("json['score']" in dart, "_fromJson parses score field")

    print("\n--- _toJson (private) ---")
    check("Map<String, dynamic> _toJson()" in dart, "_toJson private method present")
    check("'name': name" in dart, "_toJson serializes name")

    print("\n--- _fromServer (private, server read) ---")
    check("static Future<Users> _fromServer(String docId)" in dart,
          "_fromServer private static method present")
    check("DartStoreClient.baseUrl" in dart and "/users/" in dart,
          "_fromServer uses DartStoreClient.baseUrl + /users/ route")
    check("http.get(" in dart, "_fromServer uses http.get")
    check("._fromJson(jsonDecode(" in dart,
          "_fromServer decodes response with _fromJson + jsonDecode")
    check("DartStoreException(" in dart,
          "_fromServer throws DartStoreException on error")

    print("\n--- _saveToServer (private, server write) ---")
    check("Future<Map<String, dynamic>> _saveToServer({String? docId})" in dart,
          "_saveToServer private method present")
    check("jsonEncode(_toJson())" in dart,
          "_saveToServer serializes via _toJson + jsonEncode")
    check("http.put(" in dart, "_saveToServer uses http.put for updates")
    check("http.post(" in dart, "_saveToServer uses http.post for creates")

    print("\n--- upload() ---")
    check("Future<List<String>> upload()" in dart,
          "upload() returns Future<List<String>>")
    users_idx = dart.find("class Users")
    items_idx = dart.find("class Items")
    users_section = dart[users_idx:items_idx] if users_idx > 0 and items_idx > users_idx else dart[users_idx:]
    check("_saveToServer" in users_section, "upload() delegates to _saveToServer for server-write")

    print("\n--- download() ---")
    check("Future<void> download()" in dart, "download() method present")
    check("_fromServer" in users_section, "download() delegates to _fromServer for server-read")

    print("\n--- deleteRemote() ---")
    check("Future<void> deleteRemote()" in dart, "deleteRemote() method present")
    check(".delete()" in dart, "deleteRemote uses Firestore .delete()")

    print("\n--- fetchAll() ---")
    check("static Future<List<Users>> fetchAll()" in dart,
          "fetchAll() static method present")

    print("\n--- Items class (no server config) ---")
    check(items_idx > 0, "Items class exists")
    items_section = dart[items_idx:]
    check("_fromServer" not in items_section,
          "Items does NOT have _fromServer (no server config)")
    check("_saveToServer" not in items_section,
          "Items does NOT have _saveToServer (no server config)")
    check("_fromJson" in items_section, "Items still has _fromJson")
    check("_toJson" in items_section, "Items still has _toJson")
    check("upload()" in items_section, "Items has upload()")
    check("download()" in items_section, "Items has download()")
    check("deleteRemote()" in items_section, "Items has deleteRemote()")
    check("fetchAll()" in items_section, "Items has fetchAll()")
    check("FirebaseFirestore.instance" in items_section,
          "Items upload() uses direct Firestore")

    close_preview(page)

    # PART 2: Server read only, client write
    print("\n" + "=" * 70)
    print("PART 2: Server read only + client write")
    print("=" * 70)

    seed(page, PROJECT, TRANSFORM_SERVER_READ_ONLY)
    dart2 = get_code(page, "dart")
    check(len(dart2) > 200, f"Dart code generated ({len(dart2)} chars)")

    print("\n--- Server read only ---")
    users_idx2 = dart2.find("class Users")
    items_idx2 = dart2.find("class Items")
    users_section2 = dart2[users_idx2:items_idx2] if users_idx2 > 0 and items_idx2 > users_idx2 else dart2[users_idx2:]

    check("_fromServer" in users_section2,
          "_fromServer present (server read mode)")
    check("_saveToServer" not in users_section2,
          "_saveToServer NOT present (client write mode)")

    to_idx = users_section2.find("_toFirestore")
    if to_idx > 0:
        next_method = users_section2.find('\n  /// ', to_idx + 10)
        to_section = users_section2[to_idx:next_method] if next_method > to_idx else users_section2[to_idx:to_idx + 500]
        check(".trim()" in to_section,
              "_toFirestore applies client-side .trim() transform")

    close_preview(page)

    # PART 3: Client-only transforms
    print("\n" + "=" * 70)
    print("PART 3: Client-only transforms - no server boilerplate")
    print("=" * 70)

    seed(page, PROJECT, TRANSFORM_CLIENT_ONLY)
    dart3 = get_code(page, "dart")
    check(len(dart3) > 200, f"Dart code generated ({len(dart3)} chars)")

    check("dart:convert" not in dart3,
          "No dart:convert import for client-only transforms")
    check("package:http" not in dart3,
          "No package:http import for client-only transforms")
    check("DartStoreClient" not in dart3,
          "No DartStoreClient class for client-only transforms")
    check("DartStoreException" not in dart3,
          "No DartStoreException class for client-only transforms")
    check("_fromServer" not in dart3,
          "No _fromServer for client-only transforms")
    check("_saveToServer" not in dart3,
          "No _saveToServer for client-only transforms")
    check(".toUpperCase()" in dart3,
          "Client-side _fromFirestore transforms still apply")
    check(".trim()" in dart3,
          "Client-side _toFirestore transforms still apply")
    check("_fromJson" in dart3, "_fromJson still present in client-only mode")
    check("_toJson" in dart3, "_toJson still present in client-only mode")
    check("upload()" in dart3, "upload() present in client-only mode")
    check("download()" in dart3, "download() present in client-only mode")
    check("deleteRemote()" in dart3, "deleteRemote() present in client-only mode")
    check("fetchAll()" in dart3, "fetchAll() present in client-only mode")
    check("_remoteId" in dart3, "_remoteId present in client-only mode")

    close_preview(page)
    browser.close()

if ERRORS:
    print(f"\n>> {len(ERRORS)} server-mode Dart test(s) failed:")
    for e in ERRORS:
        print(f"  x {e}")
    sys.exit(1)
else:
    print("\n>> All server-mode Dart generation tests passed!")
