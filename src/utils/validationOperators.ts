import type { FirestoreFieldType, ValidationOperator } from '../types';

export interface OperatorOption {
    value: ValidationOperator;
    label: string;
    needsValue: boolean;
    needsSecondary: boolean;
}

export function getOperatorsForType(type: FirestoreFieldType): OperatorOption[] {
    switch (type) {
        case 'string':
            return [
                { value: 'equals', label: '=', needsValue: true, needsSecondary: false },
                { value: 'notEquals', label: '≠', needsValue: true, needsSecondary: false },
                { value: 'contains', label: 'contains', needsValue: true, needsSecondary: false },
                { value: 'startsWith', label: 'starts with', needsValue: true, needsSecondary: false },
                { value: 'endsWith', label: 'ends with', needsValue: true, needsSecondary: false },
                { value: 'matches', label: 'matches regex', needsValue: true, needsSecondary: false },
                { value: 'isEmpty', label: 'is empty', needsValue: false, needsSecondary: false },
                { value: 'isNotEmpty', label: 'is not empty', needsValue: false, needsSecondary: false },
                { value: 'minLength', label: 'min length', needsValue: true, needsSecondary: false },
                { value: 'maxLength', label: 'max length', needsValue: true, needsSecondary: false },
            ];
        case 'number':
            return [
                { value: 'equals', label: '=', needsValue: true, needsSecondary: false },
                { value: 'notEquals', label: '≠', needsValue: true, needsSecondary: false },
                { value: 'greaterThan', label: '>', needsValue: true, needsSecondary: false },
                { value: 'greaterThanOrEqual', label: '≥', needsValue: true, needsSecondary: false },
                { value: 'lessThan', label: '<', needsValue: true, needsSecondary: false },
                { value: 'lessThanOrEqual', label: '≤', needsValue: true, needsSecondary: false },
                { value: 'between', label: 'between', needsValue: true, needsSecondary: true },
            ];
        case 'boolean':
            return [
                { value: 'equals', label: '=', needsValue: true, needsSecondary: false },
                { value: 'notEquals', label: '≠', needsValue: true, needsSecondary: false },
            ];
        case 'timestamp':
            return [
                { value: 'equals', label: '=', needsValue: true, needsSecondary: false },
                { value: 'notEquals', label: '≠', needsValue: true, needsSecondary: false },
                { value: 'before', label: '<', needsValue: true, needsSecondary: false },
                { value: 'after', label: '>', needsValue: true, needsSecondary: false },
                { value: 'between', label: 'between', needsValue: true, needsSecondary: true },
            ];
        case 'array':
            return [
                { value: 'isEmpty', label: 'is empty', needsValue: false, needsSecondary: false },
                { value: 'isNotEmpty', label: 'is not empty', needsValue: false, needsSecondary: false },
                { value: 'minLength', label: 'min length', needsValue: true, needsSecondary: false },
                { value: 'maxLength', label: 'max length', needsValue: true, needsSecondary: false },
                { value: 'contains', label: 'contains', needsValue: true, needsSecondary: false },
            ];
        case 'map':
            return [
                { value: 'isEmpty', label: 'is empty', needsValue: false, needsSecondary: false },
                { value: 'isNotEmpty', label: 'is not empty', needsValue: false, needsSecondary: false },
                { value: 'hasKey', label: 'has key', needsValue: true, needsSecondary: false },
                { value: 'minLength', label: 'min keys', needsValue: true, needsSecondary: false },
                { value: 'maxLength', label: 'max keys', needsValue: true, needsSecondary: false },
            ];
        case 'geopoint':
            return [
                { value: 'withinRadius', label: 'within radius (km)', needsValue: true, needsSecondary: false },
            ];
        case 'reference':
            return [
                { value: 'isNull', label: 'is null', needsValue: false, needsSecondary: false },
                { value: 'isNotNull', label: 'is not null', needsValue: false, needsSecondary: false },
            ];
        case 'null':
        default:
            return [
                { value: 'isNull', label: 'is null', needsValue: false, needsSecondary: false },
                { value: 'isNotNull', label: 'is not null', needsValue: false, needsSecondary: false },
            ];
    }
}

/** Returns the first (default) operator for a given field type. */
export function getDefaultOperatorForType(type: FirestoreFieldType): ValidationOperator {
    return getOperatorsForType(type)[0].value;
}
