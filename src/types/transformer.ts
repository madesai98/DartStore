import type { FirestoreFieldType } from './index';

// ─── Field Visibility ───────────────────────────────────────────────────────────

/** Controls where a field is accessible: client (Dart ORM), server (Firestore), or both */
export interface FieldVisibility {
    /** Field exists in the Dart model */
    client: boolean;
    /** Field exists in the Firestore document */
    server: boolean;
}

// ─── Transformer Direction ──────────────────────────────────────────────────────

export type TransformDirection = 'read' | 'write';

// ─── Transform Node Types ───────────────────────────────────────────────────────

/**
 * Categories of transform operations.
 * Each operation takes typed inputs and produces typed outputs.
 */
export type TransformNodeType =
    // String operations
    | 'string-toUpperCase'
    | 'string-toLowerCase'
    | 'string-trim'
    | 'string-split'
    | 'string-join'
    | 'string-replace'
    | 'string-slice'
    | 'string-template'
    | 'string-regex'
    | 'string-hash'
    // Number operations
    | 'number-round'
    | 'number-floor'
    | 'number-ceil'
    | 'number-abs'
    | 'number-clamp'
    | 'number-add'
    | 'number-subtract'
    | 'number-multiply'
    | 'number-divide'
    | 'number-modulo'
    // Boolean operations
    | 'boolean-not'
    | 'boolean-and'
    | 'boolean-or'
    // Type conversion
    | 'convert-toString'
    | 'convert-toNumber'
    | 'convert-toBoolean'
    | 'convert-toTimestamp'
    | 'convert-parseJSON'
    | 'convert-stringifyJSON'
    // Timestamp operations
    | 'timestamp-now'
    | 'timestamp-addDuration'
    | 'timestamp-subtractDuration'
    | 'timestamp-format'
    | 'timestamp-toEpoch'
    | 'timestamp-fromEpoch'
    | 'timestamp-diff'
    // Array operations
    | 'array-map'
    | 'array-filter'
    | 'array-flatten'
    | 'array-unique'
    | 'array-sort'
    | 'array-reverse'
    | 'array-length'
    | 'array-includes'
    | 'array-push'
    | 'array-slice'
    // Map operations
    | 'map-get'
    | 'map-set'
    | 'map-delete'
    | 'map-keys'
    | 'map-values'
    | 'map-entries'
    | 'map-merge'
    | 'map-pick'
    | 'map-omit'
    // GeoPoint operations
    | 'geopoint-distance'
    | 'geopoint-create'
    | 'geopoint-getLat'
    | 'geopoint-getLng'
    // Reference operations
    | 'reference-getPath'
    | 'reference-getId'
    | 'reference-create'
    // Logic / flow
    | 'logic-condition'
    | 'logic-switch'
    | 'logic-nullCoalesce'
    | 'logic-isNull'
    // Constants
    | 'constant-string'
    | 'constant-number'
    | 'constant-boolean'
    // Custom
    | 'custom-expression';

// ─── Transform Port Definition ──────────────────────────────────────────────────

/** A single input or output port on a transform node */
export interface TransformPort {
    id: string;
    label: string;
    type: FirestoreFieldType;
}

// ─── Transform Node Config ─────────────────────────────────────────────────────

export interface TransformNodeConfig {
    /** Display name in palette */
    label: string;
    /** Category for grouping in palette */
    category: 'string' | 'number' | 'boolean' | 'conversion' | 'timestamp' | 'array' | 'map' | 'geopoint' | 'reference' | 'logic' | 'constant' | 'custom';
    /** Accent color for the node */
    color: string;
    /** Input ports */
    inputs: TransformPort[];
    /** Output ports */
    outputs: TransformPort[];
    /** Configuration parameters */
    params?: TransformParam[];
}

export interface TransformParam {
    key: string;
    label: string;
    type: 'string' | 'number' | 'boolean' | 'select';
    defaultValue: string;
    options?: { label: string; value: string }[];
}

// ─── Persisted Transform Node ───────────────────────────────────────────────────

/** A transform node as stored in project state */
export interface TransformNodeData {
    id: string;
    type: TransformNodeType;
    position: { x: number; y: number };
    /** User-configured parameter values */
    params: Record<string, string>;
}

/** A connection between a source port and a target port */
export interface TransformEdgeData {
    id: string;
    sourceNodeId: string;
    sourcePortId: string;
    targetNodeId: string;
    targetPortId: string;
}

// ─── Collection Transformer Config ──────────────────────────────────────────────

export interface CollectionTransformConfig {
    /** Enable server-side (Cloud Function) transformations */
    serverEnabled: boolean;
    /** Enable client-side (Dart) transformations */
    clientEnabled: boolean;
    /** Transform nodes for read direction (Firestore → Client) */
    readNodes: TransformNodeData[];
    readEdges: TransformEdgeData[];
    /** Transform nodes for write direction (Client → Firestore) */
    writeNodes: TransformNodeData[];
    writeEdges: TransformEdgeData[];
}

/** Project-wide transformer settings */
export interface ProjectTransformConfig {
    /** Cloud function endpoint name */
    endpointName: string;
    /** Per-collection transform configs, keyed by collection ID */
    collectionConfigs: Record<string, CollectionTransformConfig>;
}

// ─── Defaults ───────────────────────────────────────────────────────────────────

export function createDefaultFieldVisibility(): FieldVisibility {
    return { client: true, server: true };
}

export function createDefaultCollectionTransformConfig(): CollectionTransformConfig {
    return {
        serverEnabled: false,
        clientEnabled: false,
        readNodes: [],
        readEdges: [],
        writeNodes: [],
        writeEdges: [],
    };
}

export function createDefaultProjectTransformConfig(): ProjectTransformConfig {
    return {
        endpointName: 'dataTransformer',
        collectionConfigs: {},
    };
}

// ─── Datatype Colors ────────────────────────────────────────────────────────────

/** Color per Firestore field type — used for handles and edges */
export const FIELD_TYPE_COLORS: Record<FirestoreFieldType, string> = {
    string: '#34d399',    // emerald-400
    number: '#60a5fa',    // blue-400
    boolean: '#fbbf24',   // amber-400
    timestamp: '#fb923c', // orange-400
    geopoint: '#f472b6',  // pink-400
    reference: '#22d3ee', // cyan-400
    array: '#a78bfa',     // violet-400
    map: '#fb7185',       // rose-400
    null: '#94a3b8',      // slate-400
};

// ─── Transform Node Registry ────────────────────────────────────────────────────

export const TRANSFORM_NODE_REGISTRY: Record<TransformNodeType, TransformNodeConfig> = {
    // ── String ─────────────────────
    'string-toUpperCase': {
        label: 'To Upper Case',
        category: 'string',
        color: '#34d399',
        inputs: [{ id: 'in', label: 'string', type: 'string' }],
        outputs: [{ id: 'out', label: 'string', type: 'string' }],
    },
    'string-toLowerCase': {
        label: 'To Lower Case',
        category: 'string',
        color: '#34d399',
        inputs: [{ id: 'in', label: 'string', type: 'string' }],
        outputs: [{ id: 'out', label: 'string', type: 'string' }],
    },
    'string-trim': {
        label: 'Trim',
        category: 'string',
        color: '#34d399',
        inputs: [{ id: 'in', label: 'string', type: 'string' }],
        outputs: [{ id: 'out', label: 'string', type: 'string' }],
    },
    'string-split': {
        label: 'Split',
        category: 'string',
        color: '#34d399',
        inputs: [{ id: 'in', label: 'string', type: 'string' }],
        outputs: [{ id: 'out', label: 'array', type: 'array' }],
        params: [{ key: 'delimiter', label: 'Delimiter', type: 'string', defaultValue: ',' }],
    },
    'string-join': {
        label: 'Join',
        category: 'string',
        color: '#34d399',
        inputs: [{ id: 'in', label: 'array', type: 'array' }],
        outputs: [{ id: 'out', label: 'string', type: 'string' }],
        params: [{ key: 'delimiter', label: 'Delimiter', type: 'string', defaultValue: ',' }],
    },
    'string-replace': {
        label: 'Replace',
        category: 'string',
        color: '#34d399',
        inputs: [{ id: 'in', label: 'string', type: 'string' }],
        outputs: [{ id: 'out', label: 'string', type: 'string' }],
        params: [
            { key: 'search', label: 'Search', type: 'string', defaultValue: '' },
            { key: 'replace', label: 'Replace', type: 'string', defaultValue: '' },
        ],
    },
    'string-slice': {
        label: 'Slice',
        category: 'string',
        color: '#34d399',
        inputs: [{ id: 'in', label: 'string', type: 'string' }],
        outputs: [{ id: 'out', label: 'string', type: 'string' }],
        params: [
            { key: 'start', label: 'Start', type: 'number', defaultValue: '0' },
            { key: 'end', label: 'End', type: 'number', defaultValue: '' },
        ],
    },
    'string-template': {
        label: 'Template',
        category: 'string',
        color: '#34d399',
        inputs: [
            { id: 'a', label: 'A', type: 'string' },
            { id: 'b', label: 'B', type: 'string' },
        ],
        outputs: [{ id: 'out', label: 'string', type: 'string' }],
        params: [{ key: 'template', label: 'Template', type: 'string', defaultValue: '${a} ${b}' }],
    },
    'string-regex': {
        label: 'Regex Match',
        category: 'string',
        color: '#34d399',
        inputs: [{ id: 'in', label: 'string', type: 'string' }],
        outputs: [{ id: 'match', label: 'boolean', type: 'boolean' }, { id: 'result', label: 'string', type: 'string' }],
        params: [{ key: 'pattern', label: 'Pattern', type: 'string', defaultValue: '.*' }],
    },
    'string-hash': {
        label: 'Hash (SHA256)',
        category: 'string',
        color: '#34d399',
        inputs: [{ id: 'in', label: 'string', type: 'string' }],
        outputs: [{ id: 'out', label: 'string', type: 'string' }],
    },
    // ── Number ─────────────────────
    'number-round': {
        label: 'Round',
        category: 'number',
        color: '#60a5fa',
        inputs: [{ id: 'in', label: 'number', type: 'number' }],
        outputs: [{ id: 'out', label: 'number', type: 'number' }],
    },
    'number-floor': {
        label: 'Floor',
        category: 'number',
        color: '#60a5fa',
        inputs: [{ id: 'in', label: 'number', type: 'number' }],
        outputs: [{ id: 'out', label: 'number', type: 'number' }],
    },
    'number-ceil': {
        label: 'Ceil',
        category: 'number',
        color: '#60a5fa',
        inputs: [{ id: 'in', label: 'number', type: 'number' }],
        outputs: [{ id: 'out', label: 'number', type: 'number' }],
    },
    'number-abs': {
        label: 'Absolute',
        category: 'number',
        color: '#60a5fa',
        inputs: [{ id: 'in', label: 'number', type: 'number' }],
        outputs: [{ id: 'out', label: 'number', type: 'number' }],
    },
    'number-clamp': {
        label: 'Clamp',
        category: 'number',
        color: '#60a5fa',
        inputs: [{ id: 'in', label: 'number', type: 'number' }],
        outputs: [{ id: 'out', label: 'number', type: 'number' }],
        params: [
            { key: 'min', label: 'Min', type: 'number', defaultValue: '0' },
            { key: 'max', label: 'Max', type: 'number', defaultValue: '100' },
        ],
    },
    'number-add': {
        label: 'Add',
        category: 'number',
        color: '#60a5fa',
        inputs: [
            { id: 'a', label: 'A', type: 'number' },
            { id: 'b', label: 'B', type: 'number' },
        ],
        outputs: [{ id: 'out', label: 'number', type: 'number' }],
    },
    'number-subtract': {
        label: 'Subtract',
        category: 'number',
        color: '#60a5fa',
        inputs: [
            { id: 'a', label: 'A', type: 'number' },
            { id: 'b', label: 'B', type: 'number' },
        ],
        outputs: [{ id: 'out', label: 'number', type: 'number' }],
    },
    'number-multiply': {
        label: 'Multiply',
        category: 'number',
        color: '#60a5fa',
        inputs: [
            { id: 'a', label: 'A', type: 'number' },
            { id: 'b', label: 'B', type: 'number' },
        ],
        outputs: [{ id: 'out', label: 'number', type: 'number' }],
    },
    'number-divide': {
        label: 'Divide',
        category: 'number',
        color: '#60a5fa',
        inputs: [
            { id: 'a', label: 'A', type: 'number' },
            { id: 'b', label: 'B', type: 'number' },
        ],
        outputs: [{ id: 'out', label: 'number', type: 'number' }],
    },
    'number-modulo': {
        label: 'Modulo',
        category: 'number',
        color: '#60a5fa',
        inputs: [
            { id: 'a', label: 'A', type: 'number' },
            { id: 'b', label: 'B', type: 'number' },
        ],
        outputs: [{ id: 'out', label: 'number', type: 'number' }],
    },
    // ── Boolean ────────────────────
    'boolean-not': {
        label: 'NOT',
        category: 'boolean',
        color: '#fbbf24',
        inputs: [{ id: 'in', label: 'boolean', type: 'boolean' }],
        outputs: [{ id: 'out', label: 'boolean', type: 'boolean' }],
    },
    'boolean-and': {
        label: 'AND',
        category: 'boolean',
        color: '#fbbf24',
        inputs: [
            { id: 'a', label: 'A', type: 'boolean' },
            { id: 'b', label: 'B', type: 'boolean' },
        ],
        outputs: [{ id: 'out', label: 'boolean', type: 'boolean' }],
    },
    'boolean-or': {
        label: 'OR',
        category: 'boolean',
        color: '#fbbf24',
        inputs: [
            { id: 'a', label: 'A', type: 'boolean' },
            { id: 'b', label: 'B', type: 'boolean' },
        ],
        outputs: [{ id: 'out', label: 'boolean', type: 'boolean' }],
    },
    // ── Conversion ─────────────────
    'convert-toString': {
        label: 'To String',
        category: 'conversion',
        color: '#c084fc',
        inputs: [{ id: 'in', label: 'any', type: 'null' }],
        outputs: [{ id: 'out', label: 'string', type: 'string' }],
    },
    'convert-toNumber': {
        label: 'To Number',
        category: 'conversion',
        color: '#c084fc',
        inputs: [{ id: 'in', label: 'any', type: 'null' }],
        outputs: [{ id: 'out', label: 'number', type: 'number' }],
    },
    'convert-toBoolean': {
        label: 'To Boolean',
        category: 'conversion',
        color: '#c084fc',
        inputs: [{ id: 'in', label: 'any', type: 'null' }],
        outputs: [{ id: 'out', label: 'boolean', type: 'boolean' }],
    },
    'convert-toTimestamp': {
        label: 'To Timestamp',
        category: 'conversion',
        color: '#c084fc',
        inputs: [{ id: 'in', label: 'any', type: 'null' }],
        outputs: [{ id: 'out', label: 'timestamp', type: 'timestamp' }],
    },
    'convert-parseJSON': {
        label: 'Parse JSON',
        category: 'conversion',
        color: '#c084fc',
        inputs: [{ id: 'in', label: 'string', type: 'string' }],
        outputs: [{ id: 'out', label: 'map', type: 'map' }],
    },
    'convert-stringifyJSON': {
        label: 'Stringify JSON',
        category: 'conversion',
        color: '#c084fc',
        inputs: [{ id: 'in', label: 'map', type: 'map' }],
        outputs: [{ id: 'out', label: 'string', type: 'string' }],
    },
    // ── Timestamp ──────────────────
    'timestamp-now': {
        label: 'Now',
        category: 'timestamp',
        color: '#fb923c',
        inputs: [],
        outputs: [{ id: 'out', label: 'timestamp', type: 'timestamp' }],
    },
    'timestamp-addDuration': {
        label: 'Add Duration',
        category: 'timestamp',
        color: '#fb923c',
        inputs: [
            { id: 'in', label: 'timestamp', type: 'timestamp' },
            { id: 'ms', label: 'ms', type: 'number' },
        ],
        outputs: [{ id: 'out', label: 'timestamp', type: 'timestamp' }],
    },
    'timestamp-subtractDuration': {
        label: 'Subtract Duration',
        category: 'timestamp',
        color: '#fb923c',
        inputs: [
            { id: 'in', label: 'timestamp', type: 'timestamp' },
            { id: 'ms', label: 'ms', type: 'number' },
        ],
        outputs: [{ id: 'out', label: 'timestamp', type: 'timestamp' }],
    },
    'timestamp-format': {
        label: 'Format',
        category: 'timestamp',
        color: '#fb923c',
        inputs: [{ id: 'in', label: 'timestamp', type: 'timestamp' }],
        outputs: [{ id: 'out', label: 'string', type: 'string' }],
        params: [{ key: 'format', label: 'Format', type: 'string', defaultValue: 'ISO' }],
    },
    'timestamp-toEpoch': {
        label: 'To Epoch (ms)',
        category: 'timestamp',
        color: '#fb923c',
        inputs: [{ id: 'in', label: 'timestamp', type: 'timestamp' }],
        outputs: [{ id: 'out', label: 'number', type: 'number' }],
    },
    'timestamp-fromEpoch': {
        label: 'From Epoch (ms)',
        category: 'timestamp',
        color: '#fb923c',
        inputs: [{ id: 'in', label: 'number', type: 'number' }],
        outputs: [{ id: 'out', label: 'timestamp', type: 'timestamp' }],
    },
    'timestamp-diff': {
        label: 'Difference (ms)',
        category: 'timestamp',
        color: '#fb923c',
        inputs: [
            { id: 'a', label: 'A', type: 'timestamp' },
            { id: 'b', label: 'B', type: 'timestamp' },
        ],
        outputs: [{ id: 'out', label: 'number', type: 'number' }],
    },
    // ── Array ──────────────────────
    'array-map': {
        label: 'Map',
        category: 'array',
        color: '#a78bfa',
        inputs: [{ id: 'in', label: 'array', type: 'array' }],
        outputs: [{ id: 'out', label: 'array', type: 'array' }],
        params: [{ key: 'expression', label: 'Expression (item => …)', type: 'string', defaultValue: 'item' }],
    },
    'array-filter': {
        label: 'Filter',
        category: 'array',
        color: '#a78bfa',
        inputs: [{ id: 'in', label: 'array', type: 'array' }],
        outputs: [{ id: 'out', label: 'array', type: 'array' }],
        params: [{ key: 'expression', label: 'Condition (item => …)', type: 'string', defaultValue: 'true' }],
    },
    'array-flatten': {
        label: 'Flatten',
        category: 'array',
        color: '#a78bfa',
        inputs: [{ id: 'in', label: 'array', type: 'array' }],
        outputs: [{ id: 'out', label: 'array', type: 'array' }],
    },
    'array-unique': {
        label: 'Unique',
        category: 'array',
        color: '#a78bfa',
        inputs: [{ id: 'in', label: 'array', type: 'array' }],
        outputs: [{ id: 'out', label: 'array', type: 'array' }],
    },
    'array-sort': {
        label: 'Sort',
        category: 'array',
        color: '#a78bfa',
        inputs: [{ id: 'in', label: 'array', type: 'array' }],
        outputs: [{ id: 'out', label: 'array', type: 'array' }],
        params: [{ key: 'direction', label: 'Direction', type: 'select', defaultValue: 'asc', options: [{ label: 'Ascending', value: 'asc' }, { label: 'Descending', value: 'desc' }] }],
    },
    'array-reverse': {
        label: 'Reverse',
        category: 'array',
        color: '#a78bfa',
        inputs: [{ id: 'in', label: 'array', type: 'array' }],
        outputs: [{ id: 'out', label: 'array', type: 'array' }],
    },
    'array-length': {
        label: 'Length',
        category: 'array',
        color: '#a78bfa',
        inputs: [{ id: 'in', label: 'array', type: 'array' }],
        outputs: [{ id: 'out', label: 'number', type: 'number' }],
    },
    'array-includes': {
        label: 'Includes',
        category: 'array',
        color: '#a78bfa',
        inputs: [{ id: 'in', label: 'array', type: 'array' }],
        outputs: [{ id: 'out', label: 'boolean', type: 'boolean' }],
        params: [{ key: 'value', label: 'Value', type: 'string', defaultValue: '' }],
    },
    'array-push': {
        label: 'Push',
        category: 'array',
        color: '#a78bfa',
        inputs: [
            { id: 'in', label: 'array', type: 'array' },
            { id: 'item', label: 'item', type: 'null' },
        ],
        outputs: [{ id: 'out', label: 'array', type: 'array' }],
    },
    'array-slice': {
        label: 'Slice',
        category: 'array',
        color: '#a78bfa',
        inputs: [{ id: 'in', label: 'array', type: 'array' }],
        outputs: [{ id: 'out', label: 'array', type: 'array' }],
        params: [
            { key: 'start', label: 'Start', type: 'number', defaultValue: '0' },
            { key: 'end', label: 'End', type: 'number', defaultValue: '' },
        ],
    },
    // ── Map ────────────────────────
    'map-get': {
        label: 'Get Key',
        category: 'map',
        color: '#fb7185',
        inputs: [{ id: 'in', label: 'map', type: 'map' }],
        outputs: [{ id: 'out', label: 'any', type: 'null' }],
        params: [{ key: 'key', label: 'Key', type: 'string', defaultValue: '' }],
    },
    'map-set': {
        label: 'Set Key',
        category: 'map',
        color: '#fb7185',
        inputs: [
            { id: 'in', label: 'map', type: 'map' },
            { id: 'value', label: 'value', type: 'null' },
        ],
        outputs: [{ id: 'out', label: 'map', type: 'map' }],
        params: [{ key: 'key', label: 'Key', type: 'string', defaultValue: '' }],
    },
    'map-delete': {
        label: 'Delete Key',
        category: 'map',
        color: '#fb7185',
        inputs: [{ id: 'in', label: 'map', type: 'map' }],
        outputs: [{ id: 'out', label: 'map', type: 'map' }],
        params: [{ key: 'key', label: 'Key', type: 'string', defaultValue: '' }],
    },
    'map-keys': {
        label: 'Keys',
        category: 'map',
        color: '#fb7185',
        inputs: [{ id: 'in', label: 'map', type: 'map' }],
        outputs: [{ id: 'out', label: 'array', type: 'array' }],
    },
    'map-values': {
        label: 'Values',
        category: 'map',
        color: '#fb7185',
        inputs: [{ id: 'in', label: 'map', type: 'map' }],
        outputs: [{ id: 'out', label: 'array', type: 'array' }],
    },
    'map-entries': {
        label: 'Entries',
        category: 'map',
        color: '#fb7185',
        inputs: [{ id: 'in', label: 'map', type: 'map' }],
        outputs: [{ id: 'out', label: 'array', type: 'array' }],
    },
    'map-merge': {
        label: 'Merge',
        category: 'map',
        color: '#fb7185',
        inputs: [
            { id: 'a', label: 'A', type: 'map' },
            { id: 'b', label: 'B', type: 'map' },
        ],
        outputs: [{ id: 'out', label: 'map', type: 'map' }],
    },
    'map-pick': {
        label: 'Pick Keys',
        category: 'map',
        color: '#fb7185',
        inputs: [{ id: 'in', label: 'map', type: 'map' }],
        outputs: [{ id: 'out', label: 'map', type: 'map' }],
        params: [{ key: 'keys', label: 'Keys (comma-separated)', type: 'string', defaultValue: '' }],
    },
    'map-omit': {
        label: 'Omit Keys',
        category: 'map',
        color: '#fb7185',
        inputs: [{ id: 'in', label: 'map', type: 'map' }],
        outputs: [{ id: 'out', label: 'map', type: 'map' }],
        params: [{ key: 'keys', label: 'Keys (comma-separated)', type: 'string', defaultValue: '' }],
    },
    // ── GeoPoint ───────────────────
    'geopoint-distance': {
        label: 'Distance (km)',
        category: 'geopoint',
        color: '#f472b6',
        inputs: [
            { id: 'a', label: 'A', type: 'geopoint' },
            { id: 'b', label: 'B', type: 'geopoint' },
        ],
        outputs: [{ id: 'out', label: 'number', type: 'number' }],
    },
    'geopoint-create': {
        label: 'Create GeoPoint',
        category: 'geopoint',
        color: '#f472b6',
        inputs: [
            { id: 'lat', label: 'lat', type: 'number' },
            { id: 'lng', label: 'lng', type: 'number' },
        ],
        outputs: [{ id: 'out', label: 'geopoint', type: 'geopoint' }],
    },
    'geopoint-getLat': {
        label: 'Get Latitude',
        category: 'geopoint',
        color: '#f472b6',
        inputs: [{ id: 'in', label: 'geopoint', type: 'geopoint' }],
        outputs: [{ id: 'out', label: 'number', type: 'number' }],
    },
    'geopoint-getLng': {
        label: 'Get Longitude',
        category: 'geopoint',
        color: '#f472b6',
        inputs: [{ id: 'in', label: 'geopoint', type: 'geopoint' }],
        outputs: [{ id: 'out', label: 'number', type: 'number' }],
    },
    // ── Reference ──────────────────
    'reference-getPath': {
        label: 'Get Path',
        category: 'reference',
        color: '#22d3ee',
        inputs: [{ id: 'in', label: 'reference', type: 'reference' }],
        outputs: [{ id: 'out', label: 'string', type: 'string' }],
    },
    'reference-getId': {
        label: 'Get ID',
        category: 'reference',
        color: '#22d3ee',
        inputs: [{ id: 'in', label: 'reference', type: 'reference' }],
        outputs: [{ id: 'out', label: 'string', type: 'string' }],
    },
    'reference-create': {
        label: 'Create Reference',
        category: 'reference',
        color: '#22d3ee',
        inputs: [{ id: 'path', label: 'path', type: 'string' }],
        outputs: [{ id: 'out', label: 'reference', type: 'reference' }],
    },
    // ── Logic ──────────────────────
    'logic-condition': {
        label: 'If / Else',
        category: 'logic',
        color: '#94a3b8',
        inputs: [
            { id: 'condition', label: 'condition', type: 'boolean' },
            { id: 'then', label: 'then', type: 'null' },
            { id: 'else', label: 'else', type: 'null' },
        ],
        outputs: [{ id: 'out', label: 'result', type: 'null' }],
    },
    'logic-switch': {
        label: 'Switch',
        category: 'logic',
        color: '#94a3b8',
        inputs: [
            { id: 'value', label: 'value', type: 'null' },
            { id: 'default', label: 'default', type: 'null' },
        ],
        outputs: [{ id: 'out', label: 'result', type: 'null' }],
        params: [{ key: 'cases', label: 'Cases (val:result, …)', type: 'string', defaultValue: '' }],
    },
    'logic-nullCoalesce': {
        label: 'Null Coalesce (??)',
        category: 'logic',
        color: '#94a3b8',
        inputs: [
            { id: 'value', label: 'value', type: 'null' },
            { id: 'fallback', label: 'fallback', type: 'null' },
        ],
        outputs: [{ id: 'out', label: 'result', type: 'null' }],
    },
    'logic-isNull': {
        label: 'Is Null',
        category: 'logic',
        color: '#94a3b8',
        inputs: [{ id: 'in', label: 'any', type: 'null' }],
        outputs: [{ id: 'out', label: 'boolean', type: 'boolean' }],
    },
    // ── Constants ──────────────────
    'constant-string': {
        label: 'String Constant',
        category: 'constant',
        color: '#34d399',
        inputs: [],
        outputs: [{ id: 'out', label: 'string', type: 'string' }],
        params: [{ key: 'value', label: 'Value', type: 'string', defaultValue: '' }],
    },
    'constant-number': {
        label: 'Number Constant',
        category: 'constant',
        color: '#60a5fa',
        inputs: [],
        outputs: [{ id: 'out', label: 'number', type: 'number' }],
        params: [{ key: 'value', label: 'Value', type: 'number', defaultValue: '0' }],
    },
    'constant-boolean': {
        label: 'Boolean Constant',
        category: 'constant',
        color: '#fbbf24',
        inputs: [],
        outputs: [{ id: 'out', label: 'boolean', type: 'boolean' }],
        params: [{ key: 'value', label: 'Value', type: 'select', defaultValue: 'true', options: [{ label: 'true', value: 'true' }, { label: 'false', value: 'false' }] }],
    },
    // ── Custom ─────────────────────
    'custom-expression': {
        label: 'Custom Expression',
        category: 'custom',
        color: '#e879f9',
        inputs: [{ id: 'in', label: 'any', type: 'null' }],
        outputs: [{ id: 'out', label: 'any', type: 'null' }],
        params: [{ key: 'expression', label: 'Expression', type: 'string', defaultValue: 'value' }],
    },
};
