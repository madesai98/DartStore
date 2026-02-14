// Re-export transformer types
export type {
    FieldVisibility,
    TransformDirection,
    TransformMode,
    TransformNodeType,
    TransformNodeConfig,
    TransformNodeData,
    TransformEdgeData,
    CollectionTransformConfig,
    ProjectTransformConfig,
} from './transformer';
export {
    createDefaultFieldVisibility,
    createDefaultCollectionTransformConfig,
    createDefaultProjectTransformConfig,
    FIELD_TYPE_COLORS,
    TRANSFORM_NODE_REGISTRY,
} from './transformer';

// Firestore field types
export type FirestoreFieldType =
    | 'string'
    | 'number'
    | 'boolean'
    | 'timestamp'
    | 'geopoint'
    | 'reference'
    | 'array'
    | 'map'
    | 'null';

// Dart type mappings
export type DartType =
    | 'String'
    | 'int'
    | 'double'
    | 'bool'
    | 'DateTime'
    | 'GeoPoint'
    | 'DocumentReference'
    | 'List'
    | 'Map<String, dynamic>'
    | 'dynamic';

// Default value presets per type
export type DefaultValuePreset =
    | 'none'
    | 'string-empty'
    | 'string-uuid'
    | 'number-zero'
    | 'number-random'
    | 'boolean-true'
    | 'boolean-false'
    | 'timestamp-now'
    | 'timestamp-created'
    | 'timestamp-updated'
    | 'array-empty'
    | 'map-empty'
    | 'geopoint-zero'
    | 'reference-null'
    | 'custom';

export interface FirestoreField {
    id: string;
    name: string;
    type: FirestoreFieldType;
    isRequired: boolean;
    description?: string;
    // Default value configuration
    defaultPreset?: DefaultValuePreset;
    defaultValue?: string;
    // For arrays and maps
    arrayItemType?: FirestoreFieldType;
    mapValueType?: FirestoreFieldType;
    // For references - array of collection IDs that this reference can point to
    referenceCollections?: string[];
    /** Where this field exists: client (Dart model), server (Firestore), or both */
    visibility?: { client: boolean; server: boolean };
}

// Validation rule operator types per data type
export type StringOperator = 'equals' | 'notEquals' | 'contains' | 'startsWith' | 'endsWith' | 'matches' | 'isEmpty' | 'isNotEmpty' | 'minLength' | 'maxLength';
export type NumberOperator = 'equals' | 'notEquals' | 'greaterThan' | 'greaterThanOrEqual' | 'lessThan' | 'lessThanOrEqual' | 'between';
export type BooleanOperator = 'equals' | 'notEquals';
export type TimestampOperator = 'before' | 'after' | 'between' | 'equals' | 'notEquals';
export type ArrayOperator = 'isEmpty' | 'isNotEmpty' | 'minLength' | 'maxLength' | 'contains';
export type MapOperator = 'isEmpty' | 'isNotEmpty' | 'hasKey' | 'minLength' | 'maxLength';
export type GeopointOperator = 'withinRadius';
export type ReferenceOperator = 'isNull' | 'isNotNull';
export type NullOperator = 'isNull' | 'isNotNull';

export type ValidationOperator =
    | StringOperator
    | NumberOperator
    | BooleanOperator
    | TimestampOperator
    | ArrayOperator
    | MapOperator
    | GeopointOperator
    | ReferenceOperator
    | NullOperator;

export type ValidationGroupType = 'AND' | 'OR';

export interface ValidationCondition {
    id: string;
    fieldId: string;
    operator: ValidationOperator;
    value: string;
    secondaryValue?: string; // For 'between' operators
    enabled: boolean;
}

export interface ValidationGroup {
    id: string;
    type: ValidationGroupType;
    conditions: ValidationCondition[];
    groups: ValidationGroup[]; // Nested sub-groups
    enabled: boolean;
}

export interface ValidationRules {
    clientEnabled: boolean;
    serverEnabled: boolean;
    rootGroup: ValidationGroup;
}

export interface FirestoreCollection {
    id: string;
    name: string;
    description?: string;
    fields: FirestoreField[];
    subcollections: FirestoreCollection[];
    validationRules?: ValidationRules;
}

export interface FirestoreProject {
    id: string;
    name: string;
    description?: string;
    collections: FirestoreCollection[];
    createdAt: string;
    updatedAt: string;
}

export interface AppState {
    project: FirestoreProject | null;
    selectedCollection: string | null;
    selectedField: string | null;
}

// ─── Security Rules Types ───────────────────────────────────────────────────────

export type SecurityRuleOperation = 'read' | 'get' | 'list' | 'write' | 'create' | 'update' | 'delete';

export type SecurityConditionType =
    | 'authenticated'
    | 'owner'
    | 'emailVerified'
    | 'customClaim'
    | 'fieldEquals'
    | 'fieldExists'
    | 'fieldType'
    | 'documentExists'
    | 'resourceField'
    | 'requestField'
    | 'timeLimit'
    | 'rateLimit'
    | 'custom';

export type SecurityFieldTypeCheck = 'string' | 'int' | 'float' | 'bool' | 'list' | 'map' | 'timestamp' | 'path' | 'latlng';

export interface SecurityCondition {
    id: string;
    type: SecurityConditionType;
    enabled: boolean;
    // For 'owner': which field holds the user ID
    ownerField?: string;
    // For 'customClaim': claim key & expected value
    claimKey?: string;
    claimValue?: string;
    // For 'fieldEquals': field path, expected value, and target (resource/request)
    fieldPath?: string;
    fieldValue?: string;
    fieldTarget?: 'resource' | 'request';
    // For 'fieldExists': field path and target
    existsFieldPath?: string;
    existsTarget?: 'resource' | 'request';
    // For 'fieldType': field path and expected type
    typeFieldPath?: string;
    typeCheck?: SecurityFieldTypeCheck;
    typeTarget?: 'resource' | 'request';
    // For 'documentExists': path expression
    documentPath?: string;
    // For 'resourceField' / 'requestField': comparison expression
    resourceExpression?: string;
    // For 'timeLimit': max age in hours for writes
    timeLimitHours?: number;
    // For 'rateLimit': (comment-only hint)
    rateLimitInfo?: string;
    // For 'custom': raw expression
    customExpression?: string;
}

export type SecurityGroupType = 'AND' | 'OR';

export interface SecurityConditionGroup {
    id: string;
    type: SecurityGroupType;
    conditions: SecurityCondition[];
    groups: SecurityConditionGroup[];
    enabled: boolean;
}

export interface SecurityRule {
    id: string;
    operations: SecurityRuleOperation[];
    conditionGroup: SecurityConditionGroup;
    enabled: boolean;
    description?: string;
}

export interface CollectionSecurityRules {
    enabled: boolean;
    rules: SecurityRule[];
    /** If true, adds a match for subcollection documents: /{document=**} */
    applyToSubcollections: boolean;
}

export interface ProjectSecurityRules {
    enabled: boolean;
    /** Global rules version comment */
    firestoreVersion: '1' | '2';
    /** Per-collection rules, keyed by collection ID */
    collectionRules: Record<string, CollectionSecurityRules>;
}
