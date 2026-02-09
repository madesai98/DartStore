import type {
    FirestoreProject,
    FirestoreCollection,
    FirestoreField,
    ProjectSecurityRules,
    CollectionSecurityRules,
    SecurityRule,
    SecurityConditionGroup,
    SecurityCondition,
    SecurityRuleOperation,
    ValidationGroup,
    ValidationCondition,
} from '../types';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function indent(level: number): string {
    return '  '.repeat(level);
}

function groupOperations(operations: SecurityRuleOperation[]): string {
    // Firestore collapses read/write when both sub-ops are present
    const hasGet = operations.includes('get');
    const hasList = operations.includes('list');
    const hasCreate = operations.includes('create');
    const hasUpdate = operations.includes('update');
    const hasDelete = operations.includes('delete');
    const hasRead = operations.includes('read');
    const hasWrite = operations.includes('write');

    const ops: string[] = [];

    // read shorthand
    if (hasRead || (hasGet && hasList)) {
        ops.push('read');
    } else {
        if (hasGet) ops.push('get');
        if (hasList) ops.push('list');
    }

    // write shorthand
    if (hasWrite || (hasCreate && hasUpdate && hasDelete)) {
        ops.push('write');
    } else {
        if (hasCreate) ops.push('create');
        if (hasUpdate) ops.push('update');
        if (hasDelete) ops.push('delete');
    }

    return ops.join(', ');
}

// ─── Condition Expression Generation ────────────────────────────────────────────

function generateConditionExpression(condition: SecurityCondition): string | null {
    if (!condition.enabled) return null;

    switch (condition.type) {
        case 'authenticated':
            return 'request.auth != null';

        case 'owner': {
            const field = condition.ownerField || 'userId';
            return `request.auth != null && request.auth.uid == resource.data.${field}`;
        }

        case 'emailVerified':
            return 'request.auth != null && request.auth.token.email_verified == true';

        case 'customClaim': {
            const key = condition.claimKey || 'role';
            const value = condition.claimValue || 'admin';
            // If value looks like a boolean or number, don't quote it
            const isLiteral = value === 'true' || value === 'false' || !isNaN(Number(value));
            const formatted = isLiteral ? value : `'${value}'`;
            return `request.auth != null && request.auth.token.${key} == ${formatted}`;
        }

        case 'fieldEquals': {
            const path = condition.fieldPath || 'status';
            const val = condition.fieldValue || '';
            const target = condition.fieldTarget === 'request' ? 'request.resource.data' : 'resource.data';
            const isLiteral = val === 'true' || val === 'false' || val === 'null' || !isNaN(Number(val));
            const formatted = isLiteral ? val : `'${val}'`;
            return `${target}.${path} == ${formatted}`;
        }

        case 'fieldExists': {
            const path = condition.existsFieldPath || 'name';
            const target = condition.existsTarget === 'request' ? 'request.resource.data' : 'resource.data';
            return `'${path}' in ${target}`;
        }

        case 'fieldType': {
            const path = condition.typeFieldPath || 'name';
            const typeCheck = condition.typeCheck || 'string';
            const target = condition.typeTarget === 'request' ? 'request.resource.data' : 'resource.data';
            return `${target}.${path} is ${typeCheck}`;
        }

        case 'documentExists': {
            const docPath = condition.documentPath || '/users/$(request.auth.uid)';
            return `exists(${docPath})`;
        }

        case 'resourceField': {
            return condition.resourceExpression || 'resource.data.field == value';
        }

        case 'requestField': {
            return condition.resourceExpression || 'request.resource.data.field == value';
        }

        case 'timeLimit': {
            const hours = condition.timeLimitHours || 24;
            return `request.time < resource.data.createdAt + duration.value(${hours}, 'h')`;
        }

        case 'rateLimit': {
            // Rate limiting is only achievable through cloud functions, add as comment
            return null;
        }

        case 'custom': {
            return condition.customExpression || 'true';
        }

        default:
            return null;
    }
}

function generateGroupExpression(group: SecurityConditionGroup): string | null {
    if (!group.enabled) return null;

    const parts: string[] = [];

    for (const condition of group.conditions) {
        const expr = generateConditionExpression(condition);
        if (expr) parts.push(expr);
    }

    for (const subGroup of group.groups) {
        const subExpr = generateGroupExpression(subGroup);
        if (subExpr) parts.push(`(${subExpr})`);
    }

    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0];

    const joiner = group.type === 'AND' ? ' && ' : ' || ';
    return parts.join(joiner);
}

// ─── Rule Line Generation ───────────────────────────────────────────────────────

function generateRuleLine(rule: SecurityRule, baseIndent: number, hasValidation: boolean = false): string | null {
    if (!rule.enabled || rule.operations.length === 0) return null;

    const ops = groupOperations(rule.operations);
    const expression = generateGroupExpression(rule.conditionGroup);

    // Determine if validation should be appended (only for write operations)
    const isWriteOp = rule.operations.some(op =>
        op === 'write' || op === 'create' || op === 'update'
    );
    const appendValidation = hasValidation && isWriteOp;

    const lines: string[] = [];

    if (rule.description) {
        lines.push(`${indent(baseIndent)}// ${rule.description}`);
    }

    if (expression && appendValidation) {
        lines.push(`${indent(baseIndent)}allow ${ops}: if ${expression} && isValid();`);
    } else if (expression) {
        lines.push(`${indent(baseIndent)}allow ${ops}: if ${expression};`);
    } else if (appendValidation) {
        lines.push(`${indent(baseIndent)}allow ${ops}: if isValid();`);
    } else {
        lines.push(`${indent(baseIndent)}allow ${ops}: if true;`);
    }

    return lines.join('\n');
}

// ─── Validation Rules → Security Rules ──────────────────────────────────────────

function generateValidationConditionExpression(
    condition: ValidationCondition,
    fields: FirestoreField[]
): string | null {
    if (!condition.enabled) return null;

    const field = fields.find((f) => f.id === condition.fieldId);
    if (!field) return null;

    const name = field.name;
    const data = `request.resource.data.${name}`;
    const val = condition.value;
    const val2 = condition.secondaryValue ?? '';

    switch (field.type) {
        case 'string': {
            switch (condition.operator) {
                case 'equals': return `${data} == '${val}'`;
                case 'notEquals': return `${data} != '${val}'`;
                case 'contains': return `${data}.matches('.*${val}.*')`;
                case 'startsWith': return `${data}.matches('^${val}.*')`;
                case 'endsWith': return `${data}.matches('.*${val}$')`;
                case 'matches': return `${data}.matches('${val}')`;
                case 'isEmpty': return `${data}.size() == 0`;
                case 'isNotEmpty': return `${data}.size() > 0`;
                case 'minLength': return `${data}.size() >= ${val}`;
                case 'maxLength': return `${data}.size() <= ${val}`;
                default: return null;
            }
        }
        case 'number': {
            switch (condition.operator) {
                case 'equals': return `${data} == ${val}`;
                case 'notEquals': return `${data} != ${val}`;
                case 'greaterThan': return `${data} > ${val}`;
                case 'greaterThanOrEqual': return `${data} >= ${val}`;
                case 'lessThan': return `${data} < ${val}`;
                case 'lessThanOrEqual': return `${data} <= ${val}`;
                case 'between': return `${data} >= ${val} && ${data} <= ${val2}`;
                default: return null;
            }
        }
        case 'boolean': {
            switch (condition.operator) {
                case 'equals': return `${data} == ${val}`;
                case 'notEquals': return `${data} != ${val}`;
                default: return null;
            }
        }
        case 'timestamp': {
            switch (condition.operator) {
                case 'before': return `${data} < timestamp.date(${val.replace(/-/g, ', ')})`;
                case 'after': return `${data} > timestamp.date(${val.replace(/-/g, ', ')})`;
                case 'between': return `${data} > timestamp.date(${val.replace(/-/g, ', ')}) && ${data} < timestamp.date(${val2.replace(/-/g, ', ')})`;
                case 'equals': return `${data} == timestamp.date(${val.replace(/-/g, ', ')})`;
                case 'notEquals': return `${data} != timestamp.date(${val.replace(/-/g, ', ')})`;
                default: return null;
            }
        }
        case 'array': {
            switch (condition.operator) {
                case 'isEmpty': return `${data}.size() == 0`;
                case 'isNotEmpty': return `${data}.size() > 0`;
                case 'minLength': return `${data}.size() >= ${val}`;
                case 'maxLength': return `${data}.size() <= ${val}`;
                case 'contains': return `${val} in ${data}`;
                default: return null;
            }
        }
        case 'map': {
            switch (condition.operator) {
                case 'isEmpty': return `${data}.size() == 0`;
                case 'isNotEmpty': return `${data}.size() > 0`;
                case 'hasKey': return `'${val}' in ${data}`;
                case 'minLength': return `${data}.size() >= ${val}`;
                case 'maxLength': return `${data}.size() <= ${val}`;
                default: return null;
            }
        }
        case 'reference': {
            switch (condition.operator) {
                case 'isNull': return `${data} == null`;
                case 'isNotNull': return `${data} != null`;
                default: return null;
            }
        }
        default: return null;
    }
}

function generateValidationGroupExpression(
    group: ValidationGroup,
    fields: FirestoreField[]
): string | null {
    if (!group.enabled) return null;

    const parts: string[] = [];

    for (const condition of group.conditions) {
        const expr = generateValidationConditionExpression(condition, fields);
        if (expr) parts.push(expr);
    }

    for (const subGroup of group.groups) {
        const subExpr = generateValidationGroupExpression(subGroup, fields);
        if (subExpr) parts.push(`(${subExpr})`);
    }

    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0];

    const joiner = group.type === 'AND' ? ' && ' : ' || ';
    return parts.join(joiner);
}

function generateValidationFunction(
    collection: FirestoreCollection,
    baseIndent: number
): string | null {
    const rules = collection.validationRules;
    if (!rules || !rules.serverEnabled) return null;

    const rootGroup = rules.rootGroup;
    if (rootGroup.conditions.length === 0 && rootGroup.groups.length === 0) return null;

    const expression = generateValidationGroupExpression(rootGroup, collection.fields);
    if (!expression) return null;

    const lines: string[] = [];
    lines.push(`${indent(baseIndent)}// Server-side validation rules`);
    lines.push(`${indent(baseIndent)}function isValid() {`);
    lines.push(`${indent(baseIndent + 1)}return ${expression};`);
    lines.push(`${indent(baseIndent)}}`);

    return lines.join('\n');
}

// ─── Collection Match Block ─────────────────────────────────────────────────────

function flattenCollections(collections: FirestoreCollection[], parentPath: string = ''): Array<{ collection: FirestoreCollection; path: string }> {
    const result: Array<{ collection: FirestoreCollection; path: string }> = [];

    for (const collection of collections) {
        const path = parentPath
            ? `${parentPath}/${collection.name}/{${collection.name}Id}`
            : `/${collection.name}/{${collection.name}Id}`;

        result.push({ collection, path });

        if (collection.subcollections.length > 0) {
            result.push(...flattenCollections(collection.subcollections, path));
        }
    }

    return result;
}

function generateCollectionBlock(
    collection: FirestoreCollection,
    path: string,
    collectionRules: CollectionSecurityRules | undefined,
    baseIndent: number
): string {
    const lines: string[] = [];

    lines.push(`${indent(baseIndent)}match ${path} {`);

    // Generate validation function if server-side validation is enabled
    const validationFn = generateValidationFunction(collection, baseIndent + 1);
    if (validationFn) {
        lines.push(validationFn);
        lines.push('');
    }

    if (!collectionRules || !collectionRules.enabled || collectionRules.rules.length === 0) {
        lines.push(`${indent(baseIndent + 1)}// No rules defined — access denied by default`);
    } else {
        const enabledRules = collectionRules.rules.filter(r => r.enabled);

        for (const rule of enabledRules) {
            const ruleLine = generateRuleLine(rule, baseIndent + 1, validationFn !== null);
            if (ruleLine) {
                lines.push(ruleLine);
            }
        }

        if (enabledRules.length === 0) {
            lines.push(`${indent(baseIndent + 1)}// All rules are disabled — access denied by default`);
        }
    }

    lines.push(`${indent(baseIndent)}}`);

    // Subcollection wildcard match
    if (collectionRules?.applyToSubcollections) {
        lines.push('');
        lines.push(`${indent(baseIndent)}match ${path}/{document=**} {`);
        const enabledRules = collectionRules.rules.filter(r => r.enabled);
        for (const rule of enabledRules) {
            const ruleLine = generateRuleLine(rule, baseIndent + 1);
            if (ruleLine) lines.push(ruleLine);
        }
        lines.push(`${indent(baseIndent)}}`);
    }

    return lines.join('\n');
}

// ─── Full Rules File Generation ─────────────────────────────────────────────────

export function generateSecurityRules(project: FirestoreProject, securityRules: ProjectSecurityRules): string {
    const lines: string[] = [];

    lines.push(`rules_version = '${securityRules.firestoreVersion}';`);
    lines.push('');
    lines.push(`// Generated by DartStore Security Rules Builder`);
    lines.push(`// Project: ${project.name}`);
    lines.push(`// Generated: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('service cloud.firestore {');
    lines.push('  match /databases/{database}/documents {');
    lines.push('');

    if (!securityRules.enabled) {
        lines.push('    // Security rules are currently disabled');
        lines.push('    // Enable them in the Security Rules Builder');
        lines.push('');
    }

    const allCollections = flattenCollections(project.collections);

    if (allCollections.length === 0) {
        lines.push('    // No collections defined yet');
    } else {
        for (let i = 0; i < allCollections.length; i++) {
            const { collection, path } = allCollections[i];
            const collectionRules = securityRules.collectionRules[collection.id];

            const block = generateCollectionBlock(collection, path, collectionRules, 2);
            lines.push(block);

            if (i < allCollections.length - 1) {
                lines.push('');
            }
        }
    }

    lines.push('');
    lines.push('  }');
    lines.push('}');
    lines.push('');

    return lines.join('\n');
}

// ─── Default Factories ──────────────────────────────────────────────────────────

export function createDefaultProjectSecurityRules(): ProjectSecurityRules {
    return {
        enabled: true,
        firestoreVersion: '2',
        collectionRules: {},
    };
}

export function createDefaultCollectionSecurityRules(): CollectionSecurityRules {
    return {
        enabled: true,
        rules: [],
        applyToSubcollections: false,
    };
}

export function createDefaultSecurityRule(): SecurityRule {
    return {
        id: '',
        operations: ['read'],
        conditionGroup: createDefaultSecurityConditionGroup(),
        enabled: true,
    };
}

export function createDefaultSecurityConditionGroup(): SecurityConditionGroup {
    return {
        id: '',
        type: 'AND',
        conditions: [],
        groups: [],
        enabled: true,
    };
}

export function createDefaultSecurityCondition(): SecurityCondition {
    return {
        id: '',
        type: 'authenticated',
        enabled: true,
    };
}

// ─── Condition Type Labels & Descriptions ───────────────────────────────────────

export interface ConditionTypeOption {
    value: SecurityCondition['type'];
    label: string;
    description: string;
    icon: string;
}

export const CONDITION_TYPE_OPTIONS: ConditionTypeOption[] = [
    { value: 'authenticated', label: 'Authenticated', description: 'User is signed in', icon: '🔐' },
    { value: 'owner', label: 'Owner', description: 'User owns the document', icon: '👤' },
    { value: 'emailVerified', label: 'Email Verified', description: 'User has verified email', icon: '✉️' },
    { value: 'customClaim', label: 'Custom Claim', description: 'User has specific claim/role', icon: '🏷️' },
    { value: 'fieldEquals', label: 'Field Equals', description: 'Document field matches value', icon: '🔍' },
    { value: 'fieldExists', label: 'Field Exists', description: 'Document field exists', icon: '📋' },
    { value: 'fieldType', label: 'Field Type', description: 'Document field is specific type', icon: '🔠' },
    { value: 'documentExists', label: 'Document Exists', description: 'Another document exists', icon: '📄' },
    { value: 'resourceField', label: 'Resource Expression', description: 'Custom resource.data expression', icon: '📦' },
    { value: 'requestField', label: 'Request Expression', description: 'Custom request.resource expression', icon: '📨' },
    { value: 'timeLimit', label: 'Time Limit', description: 'Within time window of creation', icon: '⏱️' },
    { value: 'custom', label: 'Custom Expression', description: 'Raw Firestore rule expression', icon: '✏️' },
];

export const SECURITY_FIELD_TYPES: Array<{ value: string; label: string }> = [
    { value: 'string', label: 'string' },
    { value: 'int', label: 'int' },
    { value: 'float', label: 'float' },
    { value: 'bool', label: 'bool' },
    { value: 'list', label: 'list' },
    { value: 'map', label: 'map' },
    { value: 'timestamp', label: 'timestamp' },
    { value: 'path', label: 'path' },
    { value: 'latlng', label: 'latlng' },
];

export const OPERATION_OPTIONS: Array<{ value: SecurityRuleOperation; label: string; description: string }> = [
    { value: 'read', label: 'Read', description: 'get + list combined' },
    { value: 'get', label: 'Get', description: 'Single document reads' },
    { value: 'list', label: 'List', description: 'Queries and collection reads' },
    { value: 'write', label: 'Write', description: 'create + update + delete combined' },
    { value: 'create', label: 'Create', description: 'New document creation' },
    { value: 'update', label: 'Update', description: 'Existing document modification' },
    { value: 'delete', label: 'Delete', description: 'Document deletion' },
];
