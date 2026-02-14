import type { FirestoreFieldType, FirestoreField, FirestoreCollection, FirestoreProject, ValidationGroup, ValidationCondition, CollectionTransformConfig, TransformNodeData, TransformEdgeData, ProjectTransformConfig } from '../types';
import { TRANSFORM_NODE_REGISTRY } from '../types/transformer';

/** Whether a field is visible on the client (Dart model) */
function isClientField(field: FirestoreField): boolean {
    return field.visibility?.client !== false; // default true
}

/** Whether a field is visible on the server (Firestore document) */
function isServerField(field: FirestoreField): boolean {
    return field.visibility?.server !== false; // default true
}

export function firestoreToDartType(
    firestoreType: FirestoreFieldType,
    isOptional: boolean = false,
    arrayItemType?: FirestoreFieldType,
    mapValueType?: FirestoreFieldType
): string {
    let dartType: string;

    switch (firestoreType) {
        case 'string':
            dartType = 'String';
            break;
        case 'number':
            dartType = 'double';
            break;
        case 'boolean':
            dartType = 'bool';
            break;
        case 'timestamp':
            dartType = 'DateTime';
            break;
        case 'geopoint':
            dartType = 'GeoPoint';
            break;
        case 'reference':
            dartType = 'DocumentReference';
            break;
        case 'array': {
            const itemType = arrayItemType ? firestoreToDartType(arrayItemType, false) : 'dynamic';
            dartType = `List<${itemType}>`;
            break;
        }
        case 'map': {
            const valueType = mapValueType ? firestoreToDartType(mapValueType, false) : 'dynamic';
            dartType = `Map<String, ${valueType}>`;
            break;
        }
        case 'null':
            dartType = 'dynamic';
            break;
        default:
            dartType = 'dynamic';
    }

    return isOptional ? `${dartType}?` : dartType;
}

// ─── Transform chain → Dart expression ──────────────────────────────────────────

/**
 * Topologically sort transform nodes so that dependencies come first.
 */
function topologicalSortTransforms(nodes: TransformNodeData[], edges: TransformEdgeData[]): TransformNodeData[] {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    for (const n of nodes) {
        inDegree.set(n.id, 0);
        adjList.set(n.id, []);
    }

    for (const e of edges) {
        if (nodeMap.has(e.sourceNodeId) && nodeMap.has(e.targetNodeId)) {
            adjList.get(e.sourceNodeId)!.push(e.targetNodeId);
            inDegree.set(e.targetNodeId, (inDegree.get(e.targetNodeId) || 0) + 1);
        }
    }

    const queue = nodes.filter(n => (inDegree.get(n.id) || 0) === 0);
    const sorted: TransformNodeData[] = [];

    while (queue.length > 0) {
        const node = queue.shift()!;
        sorted.push(node);
        for (const neighbor of adjList.get(node.id) || []) {
            const deg = (inDegree.get(neighbor) || 1) - 1;
            inDegree.set(neighbor, deg);
            if (deg === 0) {
                const n = nodeMap.get(neighbor);
                if (n) queue.push(n);
            }
        }
    }

    return sorted;
}

/**
 * Convert a TransformNodeType + its input expression(s) into an inline Dart expression.
 * Returns the Dart expression string, or null if the type isn't supported inline.
 */
function dartTransformExpression(
    nodeType: string,
    inputExpr: string,
    inputExprB: string | undefined,
    params: Record<string, string>,
): string | null {
    switch (nodeType) {
        // String
        case 'string-toUpperCase': return `${inputExpr}.toUpperCase()`;
        case 'string-toLowerCase': return `${inputExpr}.toLowerCase()`;
        case 'string-trim': return `${inputExpr}.trim()`;
        case 'string-split': return `${inputExpr}.split('${params.delimiter || ','}')`;
        case 'string-join': return `(${inputExpr}).join('${params.delimiter || ','}')`;
        case 'string-replace': return `${inputExpr}.replaceAll('${params.search || ''}', '${params.replace || ''}')`;
        case 'string-slice': return `${inputExpr}.substring(${params.start || 0}${params.end ? ', ' + params.end : ''})`;
        // Number
        case 'number-round': return `${inputExpr}.round().toDouble()`;
        case 'number-floor': return `${inputExpr}.floor().toDouble()`;
        case 'number-ceil': return `${inputExpr}.ceil().toDouble()`;
        case 'number-abs': return `${inputExpr}.abs()`;
        case 'number-clamp': return `${inputExpr}.clamp(${params.min || 0}, ${params.max || 100}).toDouble()`;
        case 'number-add': return `(${inputExpr}) + (${inputExprB || '0'})`;
        case 'number-subtract': return `(${inputExpr}) - (${inputExprB || '0'})`;
        case 'number-multiply': return `(${inputExpr}) * (${inputExprB || '1'})`;
        case 'number-divide': return `(${inputExprB || '1'}) != 0 ? (${inputExpr}) / (${inputExprB || '1'}) : 0`;
        case 'number-modulo': return `(${inputExprB || '1'}) != 0 ? (${inputExpr}) % (${inputExprB || '1'}) : 0`;
        // Boolean
        case 'boolean-not': return `!(${inputExpr})`;
        case 'boolean-and': return `(${inputExpr}) && (${inputExprB || 'false'})`;
        case 'boolean-or': return `(${inputExpr}) || (${inputExprB || 'false'})`;
        // Conversion
        case 'convert-toString': return `(${inputExpr}).toString()`;
        case 'convert-toNumber': return `double.tryParse((${inputExpr}).toString()) ?? 0`;
        case 'convert-toBoolean': return `(${inputExpr}) != null && (${inputExpr}) != false && (${inputExpr}) != 0`;
        // Array
        case 'array-flatten': return `(${inputExpr}).expand((e) => e is List ? e : [e]).toList()`;
        case 'array-unique': return `(${inputExpr}).toSet().toList()`;
        case 'array-reverse': return `(${inputExpr}).reversed.toList()`;
        case 'array-length': return `(${inputExpr}).length`;
        // Constants
        case 'constant-string': return `'${params.value || ''}'`;
        case 'constant-number': return `${params.value || '0'}`;
        case 'constant-boolean': return `${params.value || 'true'}`;
        // Logic
        case 'logic-nullCoalesce': return `(${inputExpr}) ?? (${inputExprB || 'null'})`;
        case 'logic-isNull': return `(${inputExpr}) == null`;
        default: return null;
    }
}

/**
 * For a given field, trace through the transform graph to find the chain of
 * transform nodes that connect from the source field node to the target field node.
 * Returns a Dart expression wrapping the base expression through those transforms,
 * or null if no transforms apply.
 */
function buildTransformedExpression(
    fieldId: string,
    baseExpr: string,
    sourceNodeId: string,
    targetNodeId: string,
    nodes: TransformNodeData[],
    edges: TransformEdgeData[],
    fields: FirestoreField[],
): string | null {
    // Check if there's a transform edge that targets the target-side field
    // Field node handles use raw field IDs (no prefix)
    const finalEdge = edges.find(
        e => e.targetNodeId === targetNodeId && e.targetPortId === fieldId,
    );
    if (!finalEdge) return null;

    // The source of the final edge is either a transform node or a direct field-to-field connection
    const lastTransformNode = nodes.find(n => n.id === finalEdge.sourceNodeId);
    if (!lastTransformNode) {
        // Direct field-to-field edge (no intermediate transform node)
        // e.g. server-node:fieldA → client-node:fieldB
        const srcField = fields.find(f => f.id === finalEdge.sourcePortId);
        if (srcField) {
            if (sourceNodeId === 'server-node') {
                return generateParseLogic(srcField);
            } else {
                return toCamelCase(srcField.name);
            }
        }
        return null;
    }

    // Topologically sort and compute expressions for each node
    const sorted = topologicalSortTransforms(nodes, edges);
    const nodeExpressions = new Map<string, string>();

    for (const node of sorted) {
        const cfg = TRANSFORM_NODE_REGISTRY[node.type];
        if (!cfg) continue;

        // Resolve input expressions
        // Transform node handles are stored as 'in-{portId}' and 'out-{portId}'
        let inputA: string | undefined;
        let inputB: string | undefined;

        for (const input of cfg.inputs) {
            const handleId = `in-${input.id}`;
            const edge = edges.find(e => e.targetNodeId === node.id && e.targetPortId === handleId);
            if (!edge) continue;

            let expr: string;
            const sourceTransformNode = nodes.find(n => n.id === edge.sourceNodeId);
            if (sourceTransformNode) {
                // Source is another transform node — use its computed expression
                expr = nodeExpressions.get(sourceTransformNode.id) || baseExpr;
            } else {
                // Source is a field node — resolve to base expression or another field
                const srcField = fields.find(f => f.id === edge.sourcePortId);
                if (srcField && srcField.id === fieldId) {
                    expr = baseExpr;
                } else if (srcField) {
                    // Cross-field transform: a different field feeds into this one.
                    // For READ (sourceNodeId === 'server-node'): the source field
                    // lives in Firestore data, so use the parse expression.
                    // For WRITE (sourceNodeId === 'client-node'): the source field
                    // is a Dart class property, so use its camelCase name.
                    if (sourceNodeId === 'server-node') {
                        // Wrap in parens so cast / method chains compose correctly
                        expr = `(${generateParseLogic(srcField)})`;
                    } else {
                        expr = toCamelCase(srcField.name);
                    }
                } else {
                    expr = baseExpr;
                }
            }

            if (input.id === 'in' || input.id === 'a' || input.id === 'condition' || input.id === 'value') {
                inputA = expr;
            } else if (input.id === 'b' || input.id === 'fallback' || input.id === 'ms' || input.id === 'item') {
                inputB = expr;
            }
        }

        if (!inputA) inputA = baseExpr;

        const dartExpr = dartTransformExpression(node.type, inputA, inputB, node.params);
        if (dartExpr) {
            nodeExpressions.set(node.id, dartExpr);
        }
    }

    return nodeExpressions.get(lastTransformNode.id) || null;
}

export function generateDartClass(
    collection: FirestoreCollection,
    transformConfig?: CollectionTransformConfig,
    serverRoute?: string,
    _endpointName?: string,
    collectionPath?: string,
): string {
    const className = toPascalCase(collection.name);
    const clientFields = collection.fields.filter(isClientField);
    const fields = clientFields.map(field => generateFieldDeclaration(field)).join('\n  ');
    const constructor = generateConstructor(className, clientFields);
    const fromFirestore = generateFromFirestore(className, collection.fields, transformConfig);
    const toFirestore = generateToFirestore(collection.fields, transformConfig);
    const copyWith = generateCopyWith(className, clientFields);
    const validate = generateValidateMethod(collection);

    const hasServerRead = transformConfig?.readTransformMode === 'server';
    const hasServerWrite = transformConfig?.writeTransformMode === 'server';
    const needsServerMethods = (hasServerRead || hasServerWrite) && serverRoute;

    // fromJson / toJson (always useful, required for server mode)
    const fromJson = generateFromJson(className, clientFields);
    const toJson = generateToJson(clientFields);

    // Server-mode methods (private)
    const serverMethods = needsServerMethods
        ? generateServerMethods(className, serverRoute, hasServerRead!, hasServerWrite!)
        : '';

    // Collection path for Firestore operations (defaults to collection name)
    const path = collectionPath || collection.name;

    // ORM public API methods
    const uploadMethod = generateUploadMethod(className, collection, path, hasServerRead || false, hasServerWrite || false, !!needsServerMethods);
    const downloadMethod = generateDownloadMethod(className, path, hasServerRead || false, !!needsServerMethods);
    const deleteRemoteMethod = generateDeleteRemoteMethod(path);
    const fetchAllMethod = generateFetchAllMethod(className, path, hasServerRead || false, !!needsServerMethods);

    // _updateFrom helper for download
    const updateFrom = generateUpdateFrom(clientFields);

    return `/// ${collection.description || `Model for ${collection.name} collection`}
class ${className} {
  ${fields}

  /// Internal Firestore document ID — set after upload or download.
  String? _remoteId;

  /// The paired Firestore document ID, or null if not yet synced.
  String? get remoteId => _remoteId;

  ${constructor}

  ${fromFirestore}

  ${toFirestore}

  ${fromJson}

  ${toJson}

  ${copyWith}
${serverMethods}${uploadMethod}
${downloadMethod}
${deleteRemoteMethod}
${fetchAllMethod}
${updateFrom}
${validate}}`;
}

function generateFieldDeclaration(field: FirestoreField): string {
    const isOptional = !field.isRequired;
    const dartType = firestoreToDartType(
        field.type,
        isOptional,
        field.arrayItemType,
        field.mapValueType
    );
    const comment = field.description ? `/// ${field.description}\n  ` : '';
    return `${comment}${dartType} ${toCamelCase(field.name)};`;
}

function generateConstructor(className: string, fields: FirestoreField[]): string {
    const params = fields.map(field => {
        const fieldName = toCamelCase(field.name);
        const hasDefault = field.defaultPreset && field.defaultPreset !== 'none' && field.defaultPreset !== 'custom';
        const defaultValue = hasDefault ? getDefaultValueForPreset(field.defaultPreset) : '';
        const defaultPart = defaultValue ? ` = ${defaultValue}` : '';
        // Required fields need 'required' keyword unless they have a default value
        const needsRequired = field.isRequired && !hasDefault;
        return `${needsRequired ? 'required ' : ''}this.${fieldName}${defaultPart}`;
    }).join(',\n    ');

    return `${className}({\n    ${params},\n  });`;
}

function generateFromFirestore(className: string, fields: FirestoreField[], transformConfig?: CollectionTransformConfig): string {
    // Only parse fields that exist both client-side (to assign) and server-side (to read from)
    const clientFields = fields.filter(isClientField);
    const fieldParsing = clientFields.map(field => {
        const fieldName = toCamelCase(field.name);

        // Check for read transforms first (Firestore → Client)
        // Even client-only fields may receive a value from a transform (e.g. constant)
        if (transformConfig?.readTransformMode === 'client' && (transformConfig.readNodes.length > 0 || transformConfig.readEdges.length > 0)) {
            const baseExpr = isServerField(field) ? generateParseLogic(field) : 'null';
            const transformed = buildTransformedExpression(
                field.id,
                baseExpr,
                'server-node',
                'client-node',
                transformConfig.readNodes,
                transformConfig.readEdges,
                fields,
            );
            if (transformed) {
                return `      ${fieldName}: ${transformed}`;
            }
        }

        // Client-only fields don't exist in Firestore — use null/default
        if (!isServerField(field)) {
            return `      ${fieldName}: null`;
        }

        const parseLogic = generateParseLogic(field);
        return `      ${fieldName}: ${parseLogic}`;
    }).join(',\n');

    return `/// Create ${className} from Firestore document (internal)
  factory ${className}._fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> snapshot,
    SnapshotOptions? options,
  ) {
    final data = snapshot.data();
    final instance = ${className}(
${fieldParsing},
    );
    instance._remoteId = snapshot.id;
    return instance;
  }`;
}

function generateParseLogic(field: FirestoreField): string {
    const isOptional = !field.isRequired;
    const fieldName = field.name;

    switch (field.type) {
        case 'string':
            return `data?['${fieldName}'] as String${isOptional ? '?' : ''}`;
        case 'number':
            return `(data?['${fieldName}'] as num${isOptional ? '?' : ''})${isOptional ? '?' : ''}.toDouble()`;
        case 'boolean':
            return `data?['${fieldName}'] as bool${isOptional ? '?' : ''}`;
        case 'timestamp':
            return `(data?['${fieldName}'] as Timestamp${isOptional ? '?' : ''})${isOptional ? '?' : ''}.toDate()`;
        case 'geopoint':
            return `data?['${fieldName}'] as GeoPoint${isOptional ? '?' : ''}`;
        case 'reference':
            return `data?['${fieldName}'] as DocumentReference${isOptional ? '?' : ''}`;
        case 'array': {
            const itemType = field.arrayItemType ? firestoreToDartType(field.arrayItemType, false) : 'dynamic';
            return `(data?['${fieldName}'] as List${isOptional ? '?' : ''})${isOptional ? '?' : ''}.cast<${itemType}>()`;
        }
        case 'map': {
            const valueType = field.mapValueType ? firestoreToDartType(field.mapValueType, false) : 'dynamic';
            return `(data?['${fieldName}'] as Map<String, dynamic>${isOptional ? '?' : ''})${isOptional ? '?' : ''}.cast<String, ${valueType}>()`;
        }
        default:
            return `data?['${fieldName}']`;
    }
}

function generateToFirestore(fields: FirestoreField[], transformConfig?: CollectionTransformConfig): string {
    // Serialize fields that exist in Firestore (server-visible)
    // Include both-visible fields directly, and server-only fields that have write transforms
    const bothVisibleFields = fields.filter(f => isServerField(f) && isClientField(f));

    // Server-only fields that have a write transform targeting them
    const serverOnlyWithTransform = (transformConfig?.writeTransformMode === 'client' && (transformConfig.writeNodes.length > 0 || transformConfig.writeEdges.length > 0))
        ? fields.filter(f => isServerField(f) && !isClientField(f)).filter(f => {
            return transformConfig.writeEdges.some(
                e => e.targetNodeId === 'server-node' && e.targetPortId === f.id,
            );
        })
        : [];

    const allServerFields = [...bothVisibleFields, ...serverOnlyWithTransform];
    const requiredFields = allServerFields.filter(f => f.isRequired);
    const optionalFields = allServerFields.filter(f => !f.isRequired);

    const requiredMapping = requiredFields.map(field => {
        const fieldName = toCamelCase(field.name);
        const mapKey = field.name;
        let valueExpr = isClientField(field) ? fieldName : 'null /* server-only */';

        // Apply write transforms (Client → Firestore) if configured
        if (transformConfig?.writeTransformMode === 'client' && (transformConfig.writeNodes.length > 0 || transformConfig.writeEdges.length > 0)) {
            const transformed = buildTransformedExpression(
                field.id,
                isClientField(field) ? fieldName : 'null',
                'client-node',
                'server-node',
                transformConfig.writeNodes,
                transformConfig.writeEdges,
                fields,
            );
            if (transformed) {
                valueExpr = transformed;
            }
        }

        return `      '${mapKey}': ${valueExpr}`;
    });

    const optionalMapping = optionalFields.map(field => {
        const fieldName = toCamelCase(field.name);
        const mapKey = field.name;
        let valueExpr = isClientField(field) ? fieldName : 'null /* server-only */';
        let hasTransform = false;

        // Apply write transforms (Client → Firestore) if configured
        if (transformConfig?.writeTransformMode === 'client' && (transformConfig.writeNodes.length > 0 || transformConfig.writeEdges.length > 0)) {
            const transformed = buildTransformedExpression(
                field.id,
                isClientField(field) ? fieldName : 'null',
                'client-node',
                'server-node',
                transformConfig.writeNodes,
                transformConfig.writeEdges,
                fields,
            );
            if (transformed) {
                valueExpr = transformed;
                hasTransform = true;
            }
        }

        // Server-only fields with transforms are always written (no null guard needed)
        if (!isClientField(field) && hasTransform) {
            return `      '${mapKey}': ${valueExpr}`;
        }
        return `      if (${fieldName} != null) '${mapKey}': ${valueExpr}`;
    });

    const allMappings = [...requiredMapping, ...optionalMapping].join(',\n');

    return `/// Convert to Firestore document (internal)\n  /// Optional fields set to null are omitted to avoid storing null values\n  Map<String, dynamic> _toFirestore() {\n    return {\n${allMappings},\n    };\n  }`;
}

function generateCopyWith(className: string, fields: FirestoreField[]): string {
    const params = fields.map(field => {
        const fieldName = toCamelCase(field.name);
        const isOptional = !field.isRequired;
        const dartType = firestoreToDartType(
            field.type,
            isOptional,
            field.arrayItemType,
            field.mapValueType
        );
        // All copyWith params are nullable so they can be omitted
        return `    ${dartType}${isOptional ? '' : '?'} ${fieldName}`;
    }).join(',\n');

    const assignments = fields.map(field => {
        const fieldName = toCamelCase(field.name);
        return `      ${fieldName}: ${fieldName} ?? this.${fieldName}`;
    }).join(',\n');

    return `/// Create a copy with optional new values
  ${className} copyWith({
${params},
  }) {
    return ${className}(
${assignments},
    );
  }`;
}

function generateFromJson(className: string, clientFields: FirestoreField[]): string {
    const parsing = clientFields.map(field => {
        const fieldName = toCamelCase(field.name);
        const mapKey = field.name;
        return `      ${fieldName}: ${generateJsonParseLogic(field, mapKey)}`;
    }).join(',\n');

    return `/// Create ${className} from JSON map (internal)
  factory ${className}._fromJson(Map<String, dynamic> json) {
    return ${className}(
${parsing},
    );
  }`;
}

function generateJsonParseLogic(field: FirestoreField, key: string): string {
    const isOptional = !field.isRequired;
    switch (field.type) {
        case 'string':
            return `json['${key}'] as String${isOptional ? '?' : ''}`;
        case 'number':
            return `(json['${key}'] as num${isOptional ? '?' : ''})${isOptional ? '?' : ''}.toDouble()`;
        case 'boolean':
            return `json['${key}'] as bool${isOptional ? '?' : ''}`;
        case 'timestamp':
            if (isOptional) {
                return `json['${key}'] != null ? DateTime.parse(json['${key}'] as String) : null`;
            }
            return `DateTime.parse(json['${key}'] as String)`;
        case 'geopoint':
            if (isOptional) {
                return `json['${key}'] != null ? GeoPoint((json['${key}']['latitude'] as num).toDouble(), (json['${key}']['longitude'] as num).toDouble()) : null`;
            }
            return `GeoPoint((json['${key}']['latitude'] as num).toDouble(), (json['${key}']['longitude'] as num).toDouble())`;
        case 'reference':
            if (isOptional) {
                return `json['${key}'] != null ? FirebaseFirestore.instance.doc(json['${key}'] as String) : null`;
            }
            return `FirebaseFirestore.instance.doc(json['${key}'] as String)`;
        case 'array': {
            const itemType = field.arrayItemType ? firestoreToDartType(field.arrayItemType, false) : 'dynamic';
            return `(json['${key}'] as List<dynamic>${isOptional ? '?' : ''})${isOptional ? '?' : ''}.cast<${itemType}>()`;
        }
        case 'map': {
            const valueType = field.mapValueType ? firestoreToDartType(field.mapValueType, false) : 'dynamic';
            return `(json['${key}'] as Map<String, dynamic>${isOptional ? '?' : ''})${isOptional ? '?' : ''}.cast<String, ${valueType}>()`;
        }
        default:
            return `json['${key}']`;
    }
}

function generateToJson(clientFields: FirestoreField[]): string {
    const entries = clientFields.map(field => {
        const fieldName = toCamelCase(field.name);
        const mapKey = field.name;
        const valueExpr = generateJsonSerializeExpr(field, fieldName);
        if (!field.isRequired) {
            return `      if (${fieldName} != null) '${mapKey}': ${valueExpr}`;
        }
        return `      '${mapKey}': ${valueExpr}`;
    }).join(',\n');

    return `/// Convert to JSON map (internal)
  Map<String, dynamic> _toJson() {
    return {
${entries},
    };
  }`;
}

function generateJsonSerializeExpr(field: FirestoreField, varName: string): string {
    switch (field.type) {
        case 'timestamp':
            return field.isRequired
                ? `${varName}.toIso8601String()`
                : `${varName}?.toIso8601String()`;
        case 'geopoint':
            return field.isRequired
                ? `{'latitude': ${varName}.latitude, 'longitude': ${varName}.longitude}`
                : `${varName} != null ? {'latitude': ${varName}!.latitude, 'longitude': ${varName}!.longitude} : null`;
        case 'reference':
            return field.isRequired
                ? `${varName}.path`
                : `${varName}?.path`;
        default:
            return varName;
    }
}

function generateServerMethods(
    className: string,
    serverRoute: string,
    hasServerRead: boolean,
    hasServerWrite: boolean,
): string {
    const lines: string[] = [];

    if (hasServerRead) {
        lines.push(`  /// Fetch a ${className} by ID from the server transform endpoint (internal).`);
        lines.push(`  static Future<${className}> _fromServer(String docId) async {`);
        lines.push(`    final uri = Uri.parse('\${DartStoreClient.baseUrl}${serverRoute}/\$docId');`);
        lines.push(`    final response = await http.get(uri, headers: DartStoreClient.headers);`);
        lines.push(`    if (response.statusCode != 200) {`);
        lines.push(`      throw DartStoreException('GET', uri, response.statusCode, response.body);`);
        lines.push(`    }`);
        lines.push(`    final instance = ${className}._fromJson(jsonDecode(response.body) as Map<String, dynamic>);`);
        lines.push(`    instance._remoteId = docId;`);
        lines.push(`    return instance;`);
        lines.push(`  }`);
        lines.push('');
    }

    if (hasServerWrite) {
        lines.push(`  /// Save this ${className} to the server transform endpoint (internal).`);
        lines.push(`  Future<Map<String, dynamic>> _saveToServer({String? docId}) async {`);
        lines.push(`    final body = jsonEncode(_toJson());`);
        lines.push(`    final http.Response response;`);
        lines.push(`    if (docId != null) {`);
        lines.push(`      final uri = Uri.parse('\${DartStoreClient.baseUrl}${serverRoute}/\$docId');`);
        lines.push(`      response = await http.put(uri, headers: {...DartStoreClient.headers, 'Content-Type': 'application/json'}, body: body);`);
        lines.push(`    } else {`);
        lines.push(`      final uri = Uri.parse('\${DartStoreClient.baseUrl}${serverRoute}');`);
        lines.push(`      response = await http.post(uri, headers: {...DartStoreClient.headers, 'Content-Type': 'application/json'}, body: body);`);
        lines.push(`    }`);
        lines.push(`    if (response.statusCode != 200) {`);
        lines.push(`      throw DartStoreException(docId != null ? 'PUT' : 'POST', Uri.parse('\${DartStoreClient.baseUrl}${serverRoute}'), response.statusCode, response.body);`);
        lines.push(`    }`);
        lines.push(`    return jsonDecode(response.body) as Map<String, dynamic>;`);
        lines.push(`  }`);
        lines.push('');
    }

    return lines.length > 0 ? '\n' + lines.join('\n') + '\n' : '';
}

// ─── ORM public API generators ──────────────────────────────────────────────

function generateUpdateFrom(clientFields: FirestoreField[]): string {
    const assignments = clientFields.map(field => {
        const fieldName = toCamelCase(field.name);
        return `    ${fieldName} = other.${fieldName};`;
    }).join('\n');

    return `  /// Copy all field values from another instance (used by download).
  void _updateFrom(dynamic other) {
${assignments}
    _remoteId = other._remoteId;
  }`;
}

function generateUploadMethod(
    className: string,
    collection: FirestoreCollection,
    collectionPath: string,
    _hasServerRead: boolean,
    hasServerWrite: boolean,
    hasServerMethods: boolean,
): string {
    const hasClientValidation = collection.validationRules?.clientEnabled;
    const lines: string[] = [];

    lines.push(`  /// Upload this ${className} to Firestore.`);
    lines.push(`  /// Creates a new document or updates the existing one if [remoteId] is set.`);
    lines.push(`  /// Returns a list of validation errors, or an empty list on success.`);
    lines.push(`  Future<List<String>> upload() async {`);

    // Validation gate
    if (hasClientValidation) {
        lines.push(`    final errors = validate();`);
        lines.push(`    if (errors.isNotEmpty) return errors;`);
    }

    if (hasServerWrite && hasServerMethods) {
        // Server-mode write: delegate to _saveToServer
        lines.push(`    final result = await _saveToServer(docId: _remoteId);`);
        lines.push(`    _remoteId = result['id'] as String? ?? _remoteId;`);
    } else {
        // Direct Firestore write
        lines.push(`    final ref = _remoteId != null`);
        lines.push(`        ? FirebaseFirestore.instance.collection('${collectionPath}').doc(_remoteId)`);
        lines.push(`        : FirebaseFirestore.instance.collection('${collectionPath}').doc();`);
        lines.push(`    await ref.set(_toFirestore());`);
        lines.push(`    _remoteId = ref.id;`);
    }

    lines.push(`    return [];`);
    lines.push(`  }`);

    return lines.join('\n');
}

function generateDownloadMethod(
    className: string,
    collectionPath: string,
    hasServerRead: boolean,
    hasServerMethods: boolean,
): string {
    const lines: string[] = [];

    lines.push(`  /// Download the paired Firestore document and update local data.`);
    lines.push(`  /// Requires [remoteId] to be set (via a prior upload or manual assignment).`);
    lines.push(`  Future<void> download() async {`);
    lines.push(`    assert(_remoteId != null, 'Cannot download without a remoteId');`);

    if (hasServerRead && hasServerMethods) {
        // Server-mode read: delegate to _fromServer
        lines.push(`    final fresh = await ${className}._fromServer(_remoteId!);`);
    } else {
        // Direct Firestore read
        lines.push(`    final snapshot = await FirebaseFirestore.instance`);
        lines.push(`        .collection('${collectionPath}')`);
        lines.push(`        .doc(_remoteId)`);
        lines.push(`        .get();`);
        lines.push(`    final fresh = ${className}._fromFirestore(snapshot, null);`);
    }

    lines.push(`    _updateFrom(fresh);`);
    lines.push(`  }`);

    return lines.join('\n');
}

function generateDeleteRemoteMethod(
    collectionPath: string,
): string {
    const lines: string[] = [];

    lines.push(`  /// Delete the paired Firestore document.`);
    lines.push(`  /// Requires [remoteId] to be set.`);
    lines.push(`  Future<void> deleteRemote() async {`);
    lines.push(`    assert(_remoteId != null, 'Cannot delete without a remoteId');`);
    lines.push(`    await FirebaseFirestore.instance`);
    lines.push(`        .collection('${collectionPath}')`);
    lines.push(`        .doc(_remoteId)`);
    lines.push(`        .delete();`);
    lines.push(`    _remoteId = null;`);
    lines.push(`  }`);

    return lines.join('\n');
}

function generateFetchAllMethod(
    className: string,
    collectionPath: string,
    hasServerRead: boolean,
    hasServerMethods: boolean,
): string {
    const lines: string[] = [];

    lines.push(`  /// Fetch all ${className} documents from Firestore.`);
    lines.push(`  static Future<List<${className}>> fetchAll() async {`);

    if (hasServerRead && hasServerMethods) {
        // Server-mode: use the list endpoint
        lines.push(`    final uri = Uri.parse('\${DartStoreClient.baseUrl}/${toCamelCase(collectionPath.split('/').pop() || collectionPath)}');`);
        lines.push(`    final response = await http.get(uri, headers: DartStoreClient.headers);`);
        lines.push(`    if (response.statusCode != 200) {`);
        lines.push(`      throw DartStoreException('GET', uri, response.statusCode, response.body);`);
        lines.push(`    }`);
        lines.push(`    final list = jsonDecode(response.body) as List<dynamic>;`);
        lines.push(`    return list.map((item) {`);
        lines.push(`      final instance = ${className}._fromJson(item as Map<String, dynamic>);`);
        lines.push(`      instance._remoteId = item['id'] as String?;`);
        lines.push(`      return instance;`);
        lines.push(`    }).toList();`);
    } else {
        // Direct Firestore query
        lines.push(`    final snapshot = await FirebaseFirestore.instance`);
        lines.push(`        .collection('${collectionPath}')`);
        lines.push(`        .get();`);
        lines.push(`    return snapshot.docs`);
        lines.push(`        .map((doc) => ${className}._fromFirestore(doc, null))`);
        lines.push(`        .toList();`);
    }

    lines.push(`  }`);

    return lines.join('\n');
}

function flattenCollections(collections: FirestoreCollection[]): FirestoreCollection[] {
    const result: FirestoreCollection[] = [];

    const walk = (items: FirestoreCollection[]) => {
        items.forEach((collection) => {
            result.push(collection);
            if (collection.subcollections.length > 0) {
                walk(collection.subcollections);
            }
        });
    };

    walk(collections);
    return result;
}

function buildParentMap(collections: FirestoreCollection[], parentId?: string): Map<string, string> {
    const map = new Map<string, string>();
    for (const c of collections) {
        if (parentId) map.set(c.id, parentId);
        if (c.subcollections.length > 0) {
            const subMap = buildParentMap(c.subcollections, c.id);
            subMap.forEach((v, k) => map.set(k, v));
        }
    }
    return map;
}

function getCollectionPath(
    collection: FirestoreCollection,
    allCollections: FirestoreCollection[],
    parentMap: Map<string, string>,
): string {
    const parts: string[] = [];
    let current: string | undefined = collection.id;
    while (current) {
        const coll = allCollections.find(c => c.id === current);
        if (coll) parts.unshift(coll.name);
        current = parentMap.get(current!);
    }
    return parts.join('/');
}

function generateDartStoreBaseClass(): string {
    return `/// Base client configuration for DartStore server transforms.
/// Set [baseUrl] to your Cloud Function endpoint before using server methods.
///
/// \`\`\`dart
/// DartStoreClient.baseUrl = 'https://us-central1-my-project.cloudfunctions.net/dataTransformer';
/// \`\`\`
class DartStoreClient {
  DartStoreClient._();

  /// The base URL of the Cloud Function endpoint.
  /// Must be set before calling any server-backed \`upload\` or \`download\` methods.
  static String baseUrl = '';

  /// Optional headers sent with every request (e.g. auth tokens).
  static Map<String, String> headers = {};
}

/// Exception thrown when a DartStore server request fails.
class DartStoreException implements Exception {
  final String method;
  final Uri uri;
  final int statusCode;
  final String body;

  DartStoreException(this.method, this.uri, this.statusCode, this.body);

  @override
  String toString() => 'DartStoreException: \$method \$uri returned \$statusCode — \$body';
}`;
}

export function generateFullDartFile(project: FirestoreProject, transformConfig?: ProjectTransformConfig): string {
    const allCollections = flattenCollections(project.collections);

    // Detect whether any collection uses server-side transforms
    const anyServerTransform = allCollections.some(c => {
        const cfg = transformConfig?.collectionConfigs[c.id];
        return cfg && (cfg.readTransformMode === 'server' || cfg.writeTransformMode === 'server');
    });

    // Build imports
    const importLines: string[] = [
        "import 'package:cloud_firestore/cloud_firestore.dart';",
    ];
    if (anyServerTransform) {
        importLines.push("import 'dart:convert';");
        importLines.push("import 'package:http/http.dart' as http;");
    }

    const endpointName = transformConfig?.endpointName || 'dataTransformer';

    // Build parent map for computing collection paths
    const parentMap = buildParentMap(project.collections);

    const classes = allCollections.map(collection => {
        const collConfig = transformConfig?.collectionConfigs[collection.id];
        const hasServer = collConfig && (collConfig.readTransformMode === 'server' || collConfig.writeTransformMode === 'server');
        const serverRoute = hasServer ? `/${toCamelCase(collection.name)}` : undefined;
        const collectionPath = getCollectionPath(collection, allCollections, parentMap);
        return generateDartClass(collection, collConfig, serverRoute, endpointName, collectionPath);
    }).join('\n\n');

    const header = `// Generated by DartStore Firestore Modeler
// Project: ${project.name}
// Generated: ${new Date().toISOString()}
${project.description ? `// Description: ${project.description}` : ''}

`;

    const imports = importLines.join('\n') + '\n\n';
    const baseClass = anyServerTransform ? generateDartStoreBaseClass() + '\n\n' : '';

    return header + imports + baseClass + classes;
}

// Helper functions
export function toCamelCase(str: string): string {
    return str
        .replace(/(?:^\w|[A-Z]|\b\w)/g, (letter, index) =>
            index === 0 ? letter.toLowerCase() : letter.toUpperCase()
        )
        .replace(/\s+/g, '')
        .replace(/[^a-zA-Z0-9]/g, '');
}

export function toPascalCase(str: string): string {
    return str
        .replace(/(?:^\w|[A-Z]|\b\w)/g, (letter) => letter.toUpperCase())
        .replace(/\s+/g, '')
        .replace(/[^a-zA-Z0-9]/g, '');
}

export function toSnakeCase(str: string): string {
    return str
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase()
        .replace(/^_/, '')
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
}

export function getDefaultValueForPreset(preset: string | undefined): string {
    if (!preset || preset === 'none' || preset === 'custom') {
        return '';
    }

    switch (preset) {
        case 'string-empty':
            return "''";
        case 'string-uuid':
            return "const Uuid().v4()";
        case 'number-zero':
            return '0';
        case 'number-random':
            return 'Random().nextDouble()';
        case 'boolean-true':
            return 'true';
        case 'boolean-false':
            return 'false';
        case 'timestamp-now':
        case 'timestamp-created':
        case 'timestamp-updated':
            return 'DateTime.now()';
        case 'array-empty':
            return '[]';
        case 'map-empty':
            return '{}';
        case 'geopoint-zero':
            return 'const GeoPoint(0, 0)';
        case 'reference-null':
            return 'null';
        default:
            return '';
    }
}

export function getDefaultValueComment(preset: string | undefined): string {
    if (!preset || preset === 'none' || preset === 'custom') {
        return '';
    }

    switch (preset) {
        case 'string-uuid':
            return '// Generated UUID';
        case 'number-random':
            return '// Random decimal 0.0-1.0';
        case 'timestamp-created':
            return '// Auto-filled on document creation';
        case 'timestamp-updated':
            return '// Auto-updated on document change';
        case 'timestamp-now':
            return '// Current timestamp';
        default:
            return '';
    }
}

export interface DefaultPresetOption {
    value: string;
    label: string;
    description: string;
}

export function getAvailablePresetsForType(fieldType: FirestoreFieldType): DefaultPresetOption[] {
    const baseOptions: DefaultPresetOption[] = [
        { value: 'none', label: 'No Default', description: 'No default value' },
        { value: 'custom', label: 'Custom Value', description: 'Manually specified' },
    ];

    switch (fieldType) {
        case 'string':
            return [
                ...baseOptions,
                { value: 'string-empty', label: 'Empty String', description: '""' },
                { value: 'string-uuid', label: 'Generated UUID', description: 'Auto-generate unique ID' },
            ];
        case 'number':
            return [
                ...baseOptions,
                { value: 'number-zero', label: 'Zero', description: '0' },
                { value: 'number-random', label: 'Random', description: 'Random decimal 0.0-1.0' },
            ];
        case 'boolean':
            return [
                ...baseOptions,
                { value: 'boolean-true', label: 'True', description: 'true' },
                { value: 'boolean-false', label: 'False', description: 'false' },
            ];
        case 'timestamp':
            return [
                ...baseOptions,
                { value: 'timestamp-now', label: 'Current Time', description: 'DateTime.now()' },
                { value: 'timestamp-created', label: 'Created At', description: 'Auto-filled when document is created' },
                { value: 'timestamp-updated', label: 'Updated At', description: 'Auto-updated when document changes' },
            ];
        case 'array':
            return [
                ...baseOptions,
                { value: 'array-empty', label: 'Empty Array', description: '[]' },
            ];
        case 'map':
            return [
                ...baseOptions,
                { value: 'map-empty', label: 'Empty Map', description: '{}' },
            ];
        case 'geopoint':
            return [
                ...baseOptions,
                { value: 'geopoint-zero', label: 'Zero Point', description: 'GeoPoint(0, 0)' },
            ];
        case 'reference':
            return [
                ...baseOptions,
                { value: 'reference-null', label: 'Null', description: 'null' },
            ];
        case 'null':
        default:
            return baseOptions;
    }
}

// ─── Validation code generation ─────────────────────────────────────────────────

function generateValidateMethod(collection: FirestoreCollection): string {
    const rules = collection.validationRules;
    if (!rules || !rules.clientEnabled) return '';

    const rootGroup = rules.rootGroup;
    if (rootGroup.conditions.length === 0 && rootGroup.groups.length === 0) return '';

    const body = generateGroupExpression(rootGroup, collection.fields, '    ');

    return `
  /// Validates this instance against the defined rules.
  /// Returns a list of error messages (empty if valid).
  List<String> validate() {
    final List<String> errors = [];
${body}
    return errors;
  }
`;
}

function generateGroupExpression(
    group: ValidationGroup,
    fields: FirestoreField[],
    indent: string
): string {
    if (!group.enabled) return '';

    const enabledConditions = group.conditions.filter((c) => c.enabled);
    const enabledGroups = group.groups.filter((g) => g.enabled);

    if (enabledConditions.length === 0 && enabledGroups.length === 0) return '';

    const lines: string[] = [];

    if (group.type === 'AND') {
        // AND: every condition must pass individually → each generates its own if-error
        for (const condition of enabledConditions) {
            const check = generateConditionCheck(condition, fields);
            if (check) {
                lines.push(`${indent}if (${check.expression}) {`);
                lines.push(`${indent}  errors.add('${check.message}');`);
                lines.push(`${indent}}`);
            }
        }
        for (const sub of enabledGroups) {
            const subCode = generateGroupExpression(sub, fields, indent);
            if (subCode) lines.push(subCode);
        }
    } else {
        // OR: at least one must pass → collect into a single block
        const allChecks: string[] = [];
        for (const condition of enabledConditions) {
            const check = generateConditionCheck(condition, fields);
            if (check) allChecks.push(`!(${check.expression})`);
        }
        for (const sub of enabledGroups) {
            const subChecks = collectGroupPassExpressions(sub, fields);
            if (subChecks) allChecks.push(`(${subChecks})`);
        }
        if (allChecks.length > 0) {
            const combined = allChecks.join(' && ');
            lines.push(`${indent}if (${combined}) {`);
            lines.push(`${indent}  errors.add('None of the OR conditions were met.');`);
            lines.push(`${indent}}`);
        }
    }

    return lines.join('\n');
}

function collectGroupPassExpressions(
    group: ValidationGroup,
    fields: FirestoreField[]
): string | null {
    if (!group.enabled) return null;

    const enabledConditions = group.conditions.filter((c) => c.enabled);
    const enabledGroups = group.groups.filter((g) => g.enabled);
    if (enabledConditions.length === 0 && enabledGroups.length === 0) return null;

    const parts: string[] = [];
    for (const condition of enabledConditions) {
        const check = generateConditionCheck(condition, fields);
        if (check) parts.push(`!(${check.expression})`);
    }
    for (const sub of enabledGroups) {
        const subExpr = collectGroupPassExpressions(sub, fields);
        if (subExpr) parts.push(`(${subExpr})`);
    }

    if (parts.length === 0) return null;
    const joiner = group.type === 'AND' ? ' || ' : ' && ';
    return parts.join(joiner);
}

interface ConditionCheck {
    expression: string;
    message: string;
}

function generateConditionCheck(
    condition: ValidationCondition,
    fields: FirestoreField[]
): ConditionCheck | null {
    const field = fields.find((f) => f.id === condition.fieldId);
    if (!field) return null;

    const name = toCamelCase(field.name);
    const val = condition.value;
    const val2 = condition.secondaryValue ?? '';
    const isOptional = !field.isRequired;
    const nullGuard = isOptional ? `${name} != null && ` : '';

    switch (field.type) {
        case 'string': {
            switch (condition.operator) {
                case 'equals':
                    return { expression: `${name} != '${val}'`, message: `${field.name} must equal '${val}'` };
                case 'notEquals':
                    return { expression: `${name} == '${val}'`, message: `${field.name} must not equal '${val}'` };
                case 'contains':
                    return { expression: `!${name}${isOptional ? '!' : ''}.contains('${val}')`, message: `${field.name} must contain '${val}'` };
                case 'startsWith':
                    return { expression: `!${name}${isOptional ? '!' : ''}.startsWith('${val}')`, message: `${field.name} must start with '${val}'` };
                case 'endsWith':
                    return { expression: `!${name}${isOptional ? '!' : ''}.endsWith('${val}')`, message: `${field.name} must end with '${val}'` };
                case 'matches':
                    return { expression: `!RegExp(r'${val}').hasMatch(${name}${isOptional ? '!' : ''})`, message: `${field.name} must match pattern '${val}'` };
                case 'isEmpty':
                    return { expression: `${nullGuard}${name}${isOptional ? '!' : ''}.isNotEmpty`, message: `${field.name} must be empty` };
                case 'isNotEmpty':
                    return { expression: `${isOptional ? `${name} == null || ` : ''}${name}${isOptional ? '!' : ''}.isEmpty`, message: `${field.name} must not be empty` };
                case 'minLength':
                    return { expression: `${nullGuard}${name}${isOptional ? '!' : ''}.length < ${val}`, message: `${field.name} must be at least ${val} characters` };
                case 'maxLength':
                    return { expression: `${nullGuard}${name}${isOptional ? '!' : ''}.length > ${val}`, message: `${field.name} must be at most ${val} characters` };
                default:
                    return null;
            }
        }
        case 'number': {
            switch (condition.operator) {
                case 'equals':
                    return { expression: `${name} != ${val}`, message: `${field.name} must equal ${val}` };
                case 'notEquals':
                    return { expression: `${name} == ${val}`, message: `${field.name} must not equal ${val}` };
                case 'greaterThan':
                    return { expression: `${nullGuard}${name}${isOptional ? '!' : ''} <= ${val}`, message: `${field.name} must be greater than ${val}` };
                case 'greaterThanOrEqual':
                    return { expression: `${nullGuard}${name}${isOptional ? '!' : ''} < ${val}`, message: `${field.name} must be at least ${val}` };
                case 'lessThan':
                    return { expression: `${nullGuard}${name}${isOptional ? '!' : ''} >= ${val}`, message: `${field.name} must be less than ${val}` };
                case 'lessThanOrEqual':
                    return { expression: `${nullGuard}${name}${isOptional ? '!' : ''} > ${val}`, message: `${field.name} must be at most ${val}` };
                case 'between':
                    return { expression: `${nullGuard}(${name}${isOptional ? '!' : ''} < ${val} || ${name}${isOptional ? '!' : ''} > ${val2})`, message: `${field.name} must be between ${val} and ${val2}` };
                default:
                    return null;
            }
        }
        case 'boolean': {
            switch (condition.operator) {
                case 'equals':
                    return { expression: `${name} != ${val}`, message: `${field.name} must be ${val}` };
                case 'notEquals':
                    return { expression: `${name} == ${val}`, message: `${field.name} must not be ${val}` };
                default:
                    return null;
            }
        }
        case 'timestamp': {
            switch (condition.operator) {
                case 'equals':
                    return { expression: `${nullGuard}${name}${isOptional ? '!' : ''} != DateTime.parse('${val}')`, message: `${field.name} must equal ${val}` };
                case 'notEquals':
                    return { expression: `${nullGuard}${name}${isOptional ? '!' : ''} == DateTime.parse('${val}')`, message: `${field.name} must not equal ${val}` };
                case 'before':
                    return { expression: `${nullGuard}!${name}${isOptional ? '!' : ''}.isBefore(DateTime.parse('${val}'))`, message: `${field.name} must be before ${val}` };
                case 'after':
                    return { expression: `${nullGuard}!${name}${isOptional ? '!' : ''}.isAfter(DateTime.parse('${val}'))`, message: `${field.name} must be after ${val}` };
                case 'between':
                    return { expression: `${nullGuard}(${name}${isOptional ? '!' : ''}.isBefore(DateTime.parse('${val}')) || ${name}${isOptional ? '!' : ''}.isAfter(DateTime.parse('${val2}')))`, message: `${field.name} must be between ${val} and ${val2}` };
                default:
                    return null;
            }
        }
        case 'array': {
            switch (condition.operator) {
                case 'isEmpty':
                    return { expression: `${nullGuard}${name}${isOptional ? '!' : ''}.isNotEmpty`, message: `${field.name} must be empty` };
                case 'isNotEmpty':
                    return { expression: `${isOptional ? `${name} == null || ` : ''}${name}${isOptional ? '!' : ''}.isEmpty`, message: `${field.name} must not be empty` };
                case 'minLength':
                    return { expression: `${nullGuard}${name}${isOptional ? '!' : ''}.length < ${val}`, message: `${field.name} must have at least ${val} items` };
                case 'maxLength':
                    return { expression: `${nullGuard}${name}${isOptional ? '!' : ''}.length > ${val}`, message: `${field.name} must have at most ${val} items` };
                case 'contains':
                    return { expression: `${nullGuard}!${name}${isOptional ? '!' : ''}.contains(${val})`, message: `${field.name} must contain ${val}` };
                default:
                    return null;
            }
        }
        case 'map': {
            switch (condition.operator) {
                case 'isEmpty':
                    return { expression: `${nullGuard}${name}${isOptional ? '!' : ''}.isNotEmpty`, message: `${field.name} must be empty` };
                case 'isNotEmpty':
                    return { expression: `${isOptional ? `${name} == null || ` : ''}${name}${isOptional ? '!' : ''}.isEmpty`, message: `${field.name} must not be empty` };
                case 'hasKey':
                    return { expression: `${nullGuard}!${name}${isOptional ? '!' : ''}.containsKey('${val}')`, message: `${field.name} must contain key '${val}'` };
                case 'minLength':
                    return { expression: `${nullGuard}${name}${isOptional ? '!' : ''}.length < ${val}`, message: `${field.name} must have at least ${val} keys` };
                case 'maxLength':
                    return { expression: `${nullGuard}${name}${isOptional ? '!' : ''}.length > ${val}`, message: `${field.name} must have at most ${val} keys` };
                default:
                    return null;
            }
        }
        case 'geopoint': {
            if (condition.operator === 'withinRadius') {
                return { expression: `/* TODO: implement geopoint within ${val}km radius check */false`, message: `${field.name} must be within ${val}km radius` };
            }
            return null;
        }
        case 'reference': {
            switch (condition.operator) {
                case 'isNull':
                    return { expression: `${name} != null`, message: `${field.name} must be null` };
                case 'isNotNull':
                    return { expression: `${name} == null`, message: `${field.name} must not be null` };
                default:
                    return null;
            }
        }
        default:
            return null;
    }
}
