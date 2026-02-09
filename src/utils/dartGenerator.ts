import type { FirestoreFieldType, FirestoreField, FirestoreCollection, FirestoreProject, ValidationGroup, ValidationCondition } from '../types';

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
        case 'array':
            const itemType = arrayItemType ? firestoreToDartType(arrayItemType, false) : 'dynamic';
            dartType = `List<${itemType}>`;
            break;
        case 'map':
            const valueType = mapValueType ? firestoreToDartType(mapValueType, false) : 'dynamic';
            dartType = `Map<String, ${valueType}>`;
            break;
        case 'null':
            dartType = 'dynamic';
            break;
        default:
            dartType = 'dynamic';
    }

    return isOptional ? `${dartType}?` : dartType;
}

export function generateDartClass(collection: FirestoreCollection): string {
    const className = toPascalCase(collection.name);
    const fields = collection.fields.map(field => generateFieldDeclaration(field)).join('\n  ');
    const constructor = generateConstructor(className, collection.fields);
    const fromFirestore = generateFromFirestore(className, collection.fields);
    const toFirestore = generateToFirestore(collection.fields);
    const copyWith = generateCopyWith(className, collection.fields);
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
        const defaultValue = hasDefault ? getDefaultValueForPreset(field.defaultPreset, field.type) : '';
        const defaultPart = defaultValue ? ` = ${defaultValue}` : '';
        // Required fields need 'required' keyword unless they have a default value
        const needsRequired = field.isRequired && !hasDefault;
        return `${needsRequired ? 'required ' : ''}this.${fieldName}${defaultPart}`;
    }).join(',\n    ');

    return `${className}({\n    ${params},\n  });`;
}

function generateFromFirestore(className: string, fields: FirestoreField[]): string {
    const fieldParsing = fields.map(field => {
        const fieldName = toCamelCase(field.name);
        const parseLogic = generateParseLogic(field);

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
        case 'array':
            const itemType = field.arrayItemType ? firestoreToDartType(field.arrayItemType, false) : 'dynamic';
            return `(data?['${fieldName}'] as List${isOptional ? '?' : ''})${isOptional ? '?' : ''}.cast<${itemType}>()`;
        case 'map':
            const valueType = field.mapValueType ? firestoreToDartType(field.mapValueType, false) : 'dynamic';
            return `(data?['${fieldName}'] as Map<String, dynamic>${isOptional ? '?' : ''})${isOptional ? '?' : ''}.cast<String, ${valueType}>()`;
        default:
            return `data?['${fieldName}']`;
    }
}

function generateToFirestore(fields: FirestoreField[]): string {
    const requiredFields = fields.filter(f => f.isRequired);
    const optionalFields = fields.filter(f => !f.isRequired);

    const requiredMapping = requiredFields.map(field => {
        const fieldName = toCamelCase(field.name);
        const mapKey = field.name;
        return `      '${mapKey}': ${fieldName}`;
    });

    const optionalMapping = optionalFields.map(field => {
        const fieldName = toCamelCase(field.name);
        const mapKey = field.name;
        return `      if (${fieldName} != null) '${mapKey}': ${fieldName}`;
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

export function generateFullDartFile(project: FirestoreProject): string {
    const imports = `import 'package:cloud_firestore/cloud_firestore.dart';

`;

    const allCollections = flattenCollections(project.collections);
    const classes = allCollections.map(collection =>
        generateDartClass(collection)
    ).join('\n\n');

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

export function getDefaultValueForPreset(preset: string | undefined, _fieldType: FirestoreFieldType): string {
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
