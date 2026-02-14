import type {
    FirestoreProject,
    FirestoreCollection,
    FirestoreField,
    ProjectTransformConfig,
    CollectionTransformConfig,
    TransformNodeData,
    TransformEdgeData,
} from '../types';
import { TRANSFORM_NODE_REGISTRY } from '../types/transformer';
import { toPascalCase, toCamelCase } from './dartGenerator';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function flattenCollections(collections: FirestoreCollection[]): FirestoreCollection[] {
    const result: FirestoreCollection[] = [];
    const walk = (items: FirestoreCollection[]) => {
        items.forEach((c) => {
            result.push(c);
            if (c.subcollections.length > 0) walk(c.subcollections);
        });
    };
    walk(collections);
    return result;
}

function isServerField(field: FirestoreField): boolean {
    return field.visibility?.server !== false;
}

function isClientField(field: FirestoreField): boolean {
    return field.visibility?.client !== false;
}

function firestoreTypeToTS(type: string): string {
    switch (type) {
        case 'string': return 'string';
        case 'number': return 'number';
        case 'boolean': return 'boolean';
        case 'timestamp': return 'admin.firestore.Timestamp';
        case 'geopoint': return 'admin.firestore.GeoPoint';
        case 'reference': return 'admin.firestore.DocumentReference';
        case 'array': return 'any[]';
        case 'map': return 'Record<string, any>';
        case 'null': return 'any';
        default: return 'any';
    }
}

// ─── Build collection path helper ───────────────────────────────────────────────

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

// ─── Transform chain code generation ────────────────────────────────────────────

function generateTransformChainCode(
    nodes: TransformNodeData[],
    edges: TransformEdgeData[],
    fields: FirestoreField[],
    indent: string,
): string {
    if (nodes.length === 0) return '';

    const lines: string[] = [];

    // Topological sort of transform nodes
    const sorted = topologicalSort(nodes, edges);

    for (const node of sorted) {
        const config = TRANSFORM_NODE_REGISTRY[node.type];
        if (!config) continue;

        const varName = `t_${node.id.replace(/[^a-zA-Z0-9]/g, '_')}`;

        // Find incoming edges for each input port
        // Transform node handles are stored as 'in-{portId}' and 'out-{portId}'
        const inputVars: Record<string, string> = {};
        for (const input of config.inputs) {
            const handleId = `in-${input.id}`;
            const edge = edges.find(e => e.targetNodeId === node.id && e.targetPortId === handleId);
            if (edge) {
                // Check if source is another transform node or a field node
                const sourceNode = nodes.find(n => n.id === edge.sourceNodeId);
                if (sourceNode) {
                    // Strip the 'out-' prefix from sourcePortId for the variable name
                    const cleanPortId = edge.sourcePortId.replace(/^out-/, '');
                    inputVars[input.id] = `t_${edge.sourceNodeId.replace(/[^a-zA-Z0-9]/g, '_')}_${cleanPortId}`;
                } else {
                    // Source is a field node — resolve field ID to actual field accessor
                    const field = fields.find(f => f.id === edge.sourcePortId);
                    if (field) {
                        inputVars[input.id] = toCamelCase(field.name);
                    } else {
                        inputVars[input.id] = edge.sourcePortId;
                    }
                }
            }
        }

        const code = generateNodeCode(node, inputVars, varName, indent);
        if (code) lines.push(code);
    }

    return lines.join('\n');
}

function generateNodeCode(
    node: TransformNodeData,
    inputVars: Record<string, string>,
    varName: string,
    indent: string,
): string {
    const inVar = inputVars['in'] || inputVars['a'] || 'undefined';
    const inVarB = inputVars['b'] || 'undefined';
    const p = node.params;

    switch (node.type) {
        // String
        case 'string-toUpperCase': return `${indent}const ${varName}_out = (${inVar} as string)?.toUpperCase();`;
        case 'string-toLowerCase': return `${indent}const ${varName}_out = (${inVar} as string)?.toLowerCase();`;
        case 'string-trim': return `${indent}const ${varName}_out = (${inVar} as string)?.trim();`;
        case 'string-split': return `${indent}const ${varName}_out = (${inVar} as string)?.split('${p.delimiter || ','}');`;
        case 'string-join': return `${indent}const ${varName}_out = Array.isArray(${inVar}) ? ${inVar}.join('${p.delimiter || ','}') : '';`;
        case 'string-replace': return `${indent}const ${varName}_out = (${inVar} as string)?.replace(/${p.search || ''}/g, '${p.replace || ''}');`;
        case 'string-slice': return `${indent}const ${varName}_out = (${inVar} as string)?.slice(${p.start || 0}${p.end ? ', ' + p.end : ''});`;
        case 'string-template': return `${indent}const ${varName}_out = \`${(p.template || '').replace(/\$\{a\}/g, '${' + inVar + '}').replace(/\$\{b\}/g, '${' + inVarB + '}')}\`;`;
        case 'string-regex': {
            return [
                `${indent}const ${varName}_re = new RegExp('${p.pattern || '.*'}');`,
                `${indent}const ${varName}_match = ${varName}_re.test(${inVar} as string);`,
                `${indent}const ${varName}_result = ((${inVar} as string)?.match(${varName}_re) || [''])[0];`,
            ].join('\n');
        }
        case 'string-hash': return `${indent}const ${varName}_out = require('crypto').createHash('sha256').update(String(${inVar})).digest('hex');`;
        // Number
        case 'number-round': return `${indent}const ${varName}_out = Math.round(${inVar} as number);`;
        case 'number-floor': return `${indent}const ${varName}_out = Math.floor(${inVar} as number);`;
        case 'number-ceil': return `${indent}const ${varName}_out = Math.ceil(${inVar} as number);`;
        case 'number-abs': return `${indent}const ${varName}_out = Math.abs(${inVar} as number);`;
        case 'number-clamp': return `${indent}const ${varName}_out = Math.min(Math.max(${inVar} as number, ${p.min || 0}), ${p.max || 100});`;
        case 'number-add': return `${indent}const ${varName}_out = (${inVar} as number) + (${inVarB} as number);`;
        case 'number-subtract': return `${indent}const ${varName}_out = (${inVar} as number) - (${inVarB} as number);`;
        case 'number-multiply': return `${indent}const ${varName}_out = (${inVar} as number) * (${inVarB} as number);`;
        case 'number-divide': return `${indent}const ${varName}_out = (${inVarB} as number) !== 0 ? (${inVar} as number) / (${inVarB} as number) : 0;`;
        case 'number-modulo': return `${indent}const ${varName}_out = (${inVarB} as number) !== 0 ? (${inVar} as number) % (${inVarB} as number) : 0;`;
        // Boolean
        case 'boolean-not': return `${indent}const ${varName}_out = !(${inVar});`;
        case 'boolean-and': return `${indent}const ${varName}_out = Boolean(${inVar}) && Boolean(${inVarB});`;
        case 'boolean-or': return `${indent}const ${varName}_out = Boolean(${inVar}) || Boolean(${inVarB});`;
        // Conversion
        case 'convert-toString': return `${indent}const ${varName}_out = String(${inVar} ?? '');`;
        case 'convert-toNumber': return `${indent}const ${varName}_out = Number(${inVar}) || 0;`;
        case 'convert-toBoolean': return `${indent}const ${varName}_out = Boolean(${inVar});`;
        case 'convert-toTimestamp': return `${indent}const ${varName}_out = admin.firestore.Timestamp.fromDate(new Date(${inVar} as any));`;
        case 'convert-parseJSON': return `${indent}const ${varName}_out = JSON.parse(${inVar} as string);`;
        case 'convert-stringifyJSON': return `${indent}const ${varName}_out = JSON.stringify(${inVar});`;
        // Timestamp
        case 'timestamp-now': return `${indent}const ${varName}_out = admin.firestore.Timestamp.now();`;
        case 'timestamp-addDuration': return `${indent}const ${varName}_out = admin.firestore.Timestamp.fromMillis((${inVar} as admin.firestore.Timestamp).toMillis() + (${inputVars['ms'] || '0'} as number));`;
        case 'timestamp-subtractDuration': return `${indent}const ${varName}_out = admin.firestore.Timestamp.fromMillis((${inVar} as admin.firestore.Timestamp).toMillis() - (${inputVars['ms'] || '0'} as number));`;
        case 'timestamp-format': return `${indent}const ${varName}_out = (${inVar} as admin.firestore.Timestamp).toDate().toISOString();`;
        case 'timestamp-toEpoch': return `${indent}const ${varName}_out = (${inVar} as admin.firestore.Timestamp).toMillis();`;
        case 'timestamp-fromEpoch': return `${indent}const ${varName}_out = admin.firestore.Timestamp.fromMillis(${inVar} as number);`;
        case 'timestamp-diff': return `${indent}const ${varName}_out = (${inVar} as admin.firestore.Timestamp).toMillis() - (${inVarB} as admin.firestore.Timestamp).toMillis();`;
        // Array
        case 'array-map': return `${indent}const ${varName}_out = (${inVar} as any[])?.map((item: any) => ${p.expression || 'item'});`;
        case 'array-filter': return `${indent}const ${varName}_out = (${inVar} as any[])?.filter((item: any) => ${p.expression || 'true'});`;
        case 'array-flatten': return `${indent}const ${varName}_out = (${inVar} as any[])?.flat();`;
        case 'array-unique': return `${indent}const ${varName}_out = [...new Set(${inVar} as any[])];`;
        case 'array-sort': return `${indent}const ${varName}_out = [...(${inVar} as any[])].sort(${p.direction === 'desc' ? '(a, b) => (a > b ? -1 : 1)' : '(a, b) => (a > b ? 1 : -1)'});`;
        case 'array-reverse': return `${indent}const ${varName}_out = [...(${inVar} as any[])].reverse();`;
        case 'array-length': return `${indent}const ${varName}_out = (${inVar} as any[])?.length ?? 0;`;
        case 'array-includes': return `${indent}const ${varName}_out = (${inVar} as any[])?.includes(${p.value || 'undefined'});`;
        case 'array-push': return `${indent}const ${varName}_out = [...(${inVar} as any[]), ${inputVars['item'] || 'undefined'}];`;
        case 'array-slice': return `${indent}const ${varName}_out = (${inVar} as any[])?.slice(${p.start || 0}${p.end ? ', ' + p.end : ''});`;
        // Map
        case 'map-get': return `${indent}const ${varName}_out = (${inVar} as Record<string, any>)?.['${p.key || ''}'];`;
        case 'map-set': return `${indent}const ${varName}_out = { ...(${inVar} as Record<string, any>), ['${p.key || ''}']: ${inputVars['value'] || 'undefined'} };`;
        case 'map-delete': return `${indent}const { ['${p.key || ''}']: _${varName}_del, ...${varName}_out } = (${inVar} as Record<string, any>) || {};`;
        case 'map-keys': return `${indent}const ${varName}_out = Object.keys(${inVar} as Record<string, any> || {});`;
        case 'map-values': return `${indent}const ${varName}_out = Object.values(${inVar} as Record<string, any> || {});`;
        case 'map-entries': return `${indent}const ${varName}_out = Object.entries(${inVar} as Record<string, any> || {});`;
        case 'map-merge': return `${indent}const ${varName}_out = { ...(${inVar} as Record<string, any>), ...(${inVarB} as Record<string, any>) };`;
        case 'map-pick': {
            const keys = (p.keys || '').split(',').map((k: string) => `'${k.trim()}'`).join(', ');
            return `${indent}const ${varName}_out = Object.fromEntries(Object.entries(${inVar} as Record<string, any> || {}).filter(([k]) => [${keys}].includes(k)));`;
        }
        case 'map-omit': {
            const keys = (p.keys || '').split(',').map((k: string) => `'${k.trim()}'`).join(', ');
            return `${indent}const ${varName}_out = Object.fromEntries(Object.entries(${inVar} as Record<string, any> || {}).filter(([k]) => ![${keys}].includes(k)));`;
        }
        // GeoPoint
        case 'geopoint-distance': return `${indent}// Haversine distance\n${indent}const ${varName}_out = (() => { const [lat1, lon1] = [(${inVar} as any)?.latitude || 0, (${inVar} as any)?.longitude || 0]; const [lat2, lon2] = [(${inVarB} as any)?.latitude || 0, (${inVarB} as any)?.longitude || 0]; const R = 6371; const d = Math.acos(Math.sin(lat1*Math.PI/180)*Math.sin(lat2*Math.PI/180) + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.cos((lon2-lon1)*Math.PI/180))*R; return d; })();`;
        case 'geopoint-create': return `${indent}const ${varName}_out = new admin.firestore.GeoPoint(${inputVars['lat'] || '0'} as number, ${inputVars['lng'] || '0'} as number);`;
        case 'geopoint-getLat': return `${indent}const ${varName}_out = (${inVar} as admin.firestore.GeoPoint)?.latitude ?? 0;`;
        case 'geopoint-getLng': return `${indent}const ${varName}_out = (${inVar} as admin.firestore.GeoPoint)?.longitude ?? 0;`;
        // Reference
        case 'reference-getPath': return `${indent}const ${varName}_out = (${inVar} as admin.firestore.DocumentReference)?.path ?? '';`;
        case 'reference-getId': return `${indent}const ${varName}_out = (${inVar} as admin.firestore.DocumentReference)?.id ?? '';`;
        case 'reference-create': return `${indent}const ${varName}_out = admin.firestore().doc(${inputVars['path'] || "''"} as string);`;
        // Logic
        case 'logic-condition': return `${indent}const ${varName}_out = (${inputVars['condition'] || 'false'}) ? ${inputVars['then'] || 'undefined'} : ${inputVars['else'] || 'undefined'};`;
        case 'logic-nullCoalesce': return `${indent}const ${varName}_out = ${inputVars['value'] || 'undefined'} ?? ${inputVars['fallback'] || 'undefined'};`;
        case 'logic-isNull': return `${indent}const ${varName}_out = ${inVar} == null;`;
        case 'logic-switch': return `${indent}const ${varName}_out = ${inputVars['default'] || 'undefined'}; // TODO: implement switch cases`;
        // Constants
        case 'constant-string': return `${indent}const ${varName}_out = '${p.value || ''}';`;
        case 'constant-number': return `${indent}const ${varName}_out = ${p.value || '0'};`;
        case 'constant-boolean': return `${indent}const ${varName}_out = ${p.value || 'true'};`;
        // Custom
        case 'custom-expression': return `${indent}const ${varName}_out = ${p.expression || 'undefined'}; // custom expression`;
        default: return `${indent}// Unknown transform: ${node.type}`;
    }
}

function topologicalSort(nodes: TransformNodeData[], edges: TransformEdgeData[]): TransformNodeData[] {
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

// ─── Generate read handler for a collection ─────────────────────────────────────

function generateReadHandler(
    collection: FirestoreCollection,
    config: CollectionTransformConfig,
    collectionPath: string,
    indent: string,
): string {
    const lines: string[] = [];
    const serverFields = collection.fields.filter(isServerField);
    const clientFields = collection.fields.filter(isClientField);

    lines.push(`${indent}// Read: Firestore → Client`);
    lines.push(`${indent}const docId = req.params.docId;`);
    lines.push(`${indent}if (!docId) { res.status(400).json({ error: 'Missing docId' }); return; }`);
    lines.push(`${indent}const snap = await admin.firestore().collection('${collectionPath}').doc(docId).get();`);
    lines.push(`${indent}if (!snap.exists) { res.status(404).json({ error: 'Not found' }); return; }`);
    lines.push(`${indent}const data = snap.data()!;`);
    lines.push('');

    // Extract server fields
    for (const f of serverFields) {
        lines.push(`${indent}const ${toCamelCase(f.name)} = data['${f.name}'];`);
    }
    lines.push('');

    // Apply transform chain
    const transformCode = generateTransformChainCode(
        config.readNodes,
        config.readEdges,
        collection.fields,
        indent,
    );
    if (transformCode) {
        lines.push(`${indent}// Read transforms`);
        lines.push(transformCode);
        lines.push('');
    }

    // Build response with only client-visible fields
    lines.push(`${indent}const result: Record<string, any> = {};`);
    for (const f of clientFields) {
        // Find if any transform edge targets this field
        const overrideEdge = config.readEdges.find(
            e => e.targetNodeId === 'client-node' && e.targetPortId === f.id,
        );
        if (overrideEdge) {
            // Use the transform output
            const sourceNode = config.readNodes.find(n => n.id === overrideEdge.sourceNodeId);
            if (sourceNode) {
                const cleanPortId = overrideEdge.sourcePortId.replace(/^out-/, '');
                lines.push(`${indent}result['${f.name}'] = t_${overrideEdge.sourceNodeId.replace(/[^a-zA-Z0-9]/g, '_')}_${cleanPortId};`);
            } else {
                // Direct field-to-field edge (source is a field node, not a transform)
                const srcField = collection.fields.find(sf => sf.id === overrideEdge.sourcePortId);
                if (srcField) {
                    lines.push(`${indent}result['${f.name}'] = ${toCamelCase(srcField.name)};`);
                } else if (isServerField(f)) {
                    lines.push(`${indent}result['${f.name}'] = ${toCamelCase(f.name)};`);
                } else {
                    lines.push(`${indent}result['${f.name}'] = null; // client-only field`);
                }
            }
        } else if (isServerField(f)) {
            lines.push(`${indent}result['${f.name}'] = ${toCamelCase(f.name)};`);
        } else {
            lines.push(`${indent}result['${f.name}'] = null; // client-only field, no transform`);
        }
    }
    lines.push(`${indent}res.json({ id: snap.id, ...result });`);

    return lines.join('\n');
}

// ─── Generate write handler for a collection ────────────────────────────────────

function generateWriteHandler(
    collection: FirestoreCollection,
    config: CollectionTransformConfig,
    collectionPath: string,
    indent: string,
): string {
    const lines: string[] = [];
    const serverFields = collection.fields.filter(isServerField);
    const bothVisibleFields = collection.fields.filter(f => isClientField(f) && isServerField(f));

    lines.push(`${indent}// Write: Client → Firestore`);
    lines.push(`${indent}const body = req.body;`);
    lines.push(`${indent}if (!body) { res.status(400).json({ error: 'Missing body' }); return; }`);
    lines.push(`${indent}const docId = req.params.docId;`);
    lines.push('');

    // Extract client-sent fields (both-visible + client-only fields used in transforms)
    const clientOnlyInTransforms = collection.fields.filter(f => isClientField(f) && !isServerField(f))
        .filter(f => config.writeEdges.some(e => e.sourceNodeId === 'client-node' && e.sourcePortId === f.id));
    const fieldsToExtract = [...bothVisibleFields, ...clientOnlyInTransforms];
    for (const f of fieldsToExtract) {
        lines.push(`${indent}const ${toCamelCase(f.name)} = body['${f.name}'];`);
    }
    lines.push('');

    // Apply transform chain
    const transformCode = generateTransformChainCode(
        config.writeNodes,
        config.writeEdges,
        collection.fields,
        indent,
    );
    if (transformCode) {
        lines.push(`${indent}// Write transforms`);
        lines.push(transformCode);
        lines.push('');
    }

    // Build document data with server-visible fields
    lines.push(`${indent}const docData: Record<string, any> = {};`);
    for (const f of serverFields) {
        const overrideEdge = config.writeEdges.find(
            e => e.targetNodeId === 'server-node' && e.targetPortId === f.id,
        );
        if (overrideEdge) {
            const sourceNode = config.writeNodes.find(n => n.id === overrideEdge.sourceNodeId);
            if (sourceNode) {
                const cleanPortId = overrideEdge.sourcePortId.replace(/^out-/, '');
                lines.push(`${indent}docData['${f.name}'] = t_${overrideEdge.sourceNodeId.replace(/[^a-zA-Z0-9]/g, '_')}_${cleanPortId};`);
            } else {
                // Direct field-to-field edge (source is a field node, not a transform)
                const srcField = collection.fields.find(sf => sf.id === overrideEdge.sourcePortId);
                if (srcField) {
                    lines.push(`${indent}docData['${f.name}'] = ${toCamelCase(srcField.name)};`);
                } else if (isClientField(f)) {
                    lines.push(`${indent}docData['${f.name}'] = ${toCamelCase(f.name)};`);
                }
            }
        } else if (isClientField(f)) {
            lines.push(`${indent}docData['${f.name}'] = ${toCamelCase(f.name)};`);
        }
        // Server-only fields without transforms are omitted (no source for them)
    }
    lines.push('');
    lines.push(`${indent}if (docId) {`);
    lines.push(`${indent}  await admin.firestore().collection('${collectionPath}').doc(docId).set(docData, { merge: true });`);
    lines.push(`${indent}  res.json({ id: docId, ...docData });`);
    lines.push(`${indent}} else {`);
    lines.push(`${indent}  const ref = await admin.firestore().collection('${collectionPath}').add(docData);`);
    lines.push(`${indent}  res.json({ id: ref.id, ...docData });`);
    lines.push(`${indent}}`);

    return lines.join('\n');
}

// ─── Main Generator ─────────────────────────────────────────────────────────────

export function generateCloudFunction(
    project: FirestoreProject,
    transformConfig: ProjectTransformConfig,
): string {
    const allCollections = flattenCollections(project.collections);
    const parentMap = buildParentMap(project.collections);

    // Find collections that have server transforms enabled
    const activeCollections = allCollections.filter(c => {
        const config = transformConfig.collectionConfigs[c.id];
        return config && (config.readTransformMode === 'server' || config.writeTransformMode === 'server');
    });

    if (activeCollections.length === 0) {
        return `// No server-side transforms configured.\n// Enable server transforms on at least one collection in the Data Transformer tab.\n`;
    }

    const endpointName = transformConfig.endpointName || 'dataTransformer';

    const lines: string[] = [];

    // Header
    lines.push(`// Generated by DartStore Data Transformer`);
    lines.push(`// Project: ${project.name}`);
    lines.push(`// Generated: ${new Date().toISOString()}`);
    lines.push(`//`);
    lines.push(`// Drop this file into your Firebase Functions /src directory.`);
    lines.push(`// Requires: firebase-admin, firebase-functions, express, cors`);
    lines.push('');
    lines.push(`import * as functions from 'firebase-functions';`);
    lines.push(`import * as admin from 'firebase-admin';`);
    lines.push(`import express from 'express';`);
    lines.push(`import cors from 'cors';`);
    lines.push('');
    lines.push(`if (!admin.apps.length) admin.initializeApp();`);
    lines.push('');
    lines.push(`const app = express();`);
    lines.push(`app.use(cors({ origin: true }));`);
    lines.push(`app.use(express.json());`);
    lines.push('');

    // Generate routes for each active collection
    for (const collection of activeCollections) {
        const config = transformConfig.collectionConfigs[collection.id];
        const collPath = getCollectionPath(collection, allCollections, parentMap);
        const routeBase = `/${toCamelCase(collection.name)}`;
        const className = toPascalCase(collection.name);

        lines.push(`// ─── ${className} ──────────────────────────────────────────`);
        lines.push('');

        // Interfaces
        const sFields = collection.fields.filter(isServerField);
        const cFields = collection.fields.filter(isClientField);

        lines.push(`interface ${className}Server {`);
        for (const f of sFields) {
            lines.push(`  ${toCamelCase(f.name)}${f.isRequired ? '' : '?'}: ${firestoreTypeToTS(f.type)};`);
        }
        lines.push(`}`);
        lines.push('');

        lines.push(`interface ${className}Client {`);
        for (const f of cFields) {
            lines.push(`  ${toCamelCase(f.name)}${f.isRequired ? '' : '?'}: ${firestoreTypeToTS(f.type)};`);
        }
        lines.push(`}`);
        lines.push('');

        // Read route (only when read transforms are server-side)
        if (config.readTransformMode === 'server') {
            lines.push(`app.get('${routeBase}/:docId', async (req, res) => {`);
            lines.push(`  try {`);
            lines.push(generateReadHandler(collection, config, collPath, '    '));
            lines.push(`  } catch (err: any) {`);
            lines.push(`    console.error('Read ${className} error:', err);`);
            lines.push(`    res.status(500).json({ error: err.message });`);
            lines.push(`  }`);
            lines.push(`});`);
            lines.push('');
        }

        // Write routes (only when write transforms are server-side)
        if (config.writeTransformMode === 'server') {
            // Write route (create)
            lines.push(`app.post('${routeBase}', async (req, res) => {`);
            lines.push(`  try {`);
            lines.push(`    req.params.docId = '';`);
            lines.push(generateWriteHandler(collection, config, collPath, '    '));
            lines.push(`  } catch (err: any) {`);
            lines.push(`    console.error('Write ${className} error:', err);`);
            lines.push(`    res.status(500).json({ error: err.message });`);
            lines.push(`  }`);
            lines.push(`});`);
            lines.push('');

            // Write route (update)
            lines.push(`app.put('${routeBase}/:docId', async (req, res) => {`);
            lines.push(`  try {`);
            lines.push(generateWriteHandler(collection, config, collPath, '    '));
            lines.push(`  } catch (err: any) {`);
            lines.push(`    console.error('Update ${className} error:', err);`);
            lines.push(`    res.status(500).json({ error: err.message });`);
            lines.push(`  }`);
            lines.push(`});`);
            lines.push('');
        }
    }

    // Export
    lines.push(`// Export as a single Cloud Function endpoint`);
    lines.push(`export const ${endpointName} = functions.https.onRequest(app);`);
    lines.push('');

    return lines.join('\n');
}
