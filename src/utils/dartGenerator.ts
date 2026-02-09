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
    _sourceNodeId: string,
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

    // The source of the final edge should be a transform node
    const lastTransformNode = nodes.find(n => n.id === finalEdge.sourceNodeId);
    if (!lastTransformNode) return null;

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
                    expr = toCamelCase(srcField.name);
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

export function generateDartClass(collection: FirestoreCollection, transformConfig?: CollectionTransformConfig): string {
    const className = toPascalCase(collection.name);
    const clientFields = collection.fields.filter(isClientField);
    const fields = clientFields.map(field => generateFieldDeclaration(field)).join('\n  ');
    const constructor = generateConstructor(className, clientFields);
    const fromFirestore = generateFromFirestore(className, collection.fields, transformConfig);
    const toFirestore = generateToFirestore(collection.fields, transformConfig);
    const copyWith = generateCopyWith(className, clientFields);
    const validate = generateValidateMethod(collection);

    return `/// ${collection.description || `Model for ${collection.name} collection`}
class ${className} {
  ${fields}

  ${constructor}

  ${fromFirestore}

  ${toFirestore}

  ${copyWith}
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
    return `${comment}final ${dartType} ${toCamelCase(field.name)};`;
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
        // Client-only fields don't exist in Firestore — use null/default
        if (!isServerField(field)) {
            return `      ${fieldName}: null`;
        }
        let parseLogic = generateParseLogic(field);

        // Apply read transforms (Firestore → Client) if configured
        if (transformConfig?.clientEnabled && transformConfig.readNodes.length > 0) {
            const transformed = buildTransformedExpression(
                field.id,
                parseLogic,
                'server-node',
                'client-node',
                transformConfig.readNodes,
                transformConfig.readEdges,
                fields,
            );
            if (transformed) {
                parseLogic = transformed;
            }
        }

        return `      ${fieldName}: ${parseLogic}`;
    }).join(',\n');

    return `/// Create ${className} from Firestore document
  factory ${className}.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> snapshot,
    SnapshotOptions? options,
  ) {
    final data = snapshot.data();
    return ${className}(
${fieldParsing},
    );
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
    // Only serialize fields that exist in Firestore (server-visible)
    const serverFields = fields.filter(f => isServerField(f) && isClientField(f));
    const requiredFields = serverFields.filter(f => f.isRequired);
    const optionalFields = serverFields.filter(f => !f.isRequired);

    const requiredMapping = requiredFields.map(field => {
        const fieldName = toCamelCase(field.name);
        const mapKey = field.name;
        let valueExpr = fieldName;

        // Apply write transforms (Client → Firestore) if configured
        if (transformConfig?.clientEnabled && transformConfig.writeNodes.length > 0) {
            const transformed = buildTransformedExpression(
                field.id,
                fieldName,
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
        let valueExpr = fieldName;

        // Apply write transforms (Client → Firestore) if configured
        if (transformConfig?.clientEnabled && transformConfig.writeNodes.length > 0) {
            const transformed = buildTransformedExpression(
                field.id,
                fieldName,
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

        return `      if (${fieldName} != null) '${mapKey}': ${valueExpr}`;
    });

    const allMappings = [...requiredMapping, ...optionalMapping].join(',\n');

    return `/// Convert to Firestore document\n  /// Optional fields set to null are omitted to avoid storing null values\n  Map<String, dynamic> toFirestore() {\n    return {\n${allMappings},\n    };\n  }`;
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

export function generateFullDartFile(project: FirestoreProject, transformConfig?: ProjectTransformConfig): string {
    const imports = `import 'package:cloud_firestore/cloud_firestore.dart';

`;

    const allCollections = flattenCollections(project.collections);
    const classes = allCollections.map(collection => {
        const collConfig = transformConfig?.collectionConfigs[collection.id];
        return generateDartClass(collection, collConfig);
    }).join('\n\n');

    const header = `// Generated by DartStore Firestore Modeler
// Project: ${project.name}
// Generated: ${new Date().toISOString()}
${project.description ? `// Description: ${project.description}` : ''}

`;

    return header + imports + classes;
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
