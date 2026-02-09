import { useState, useCallback, useRef, useEffect } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, ToggleLeft, ToggleRight, GitBranch, Monitor, Server } from 'lucide-react';
import type {
    FirestoreField,
    FirestoreFieldType,
    ValidationRules,
    ValidationGroup,
    ValidationGroupType,
    ValidationCondition,
    ValidationOperator,
} from '../types';
import { generateId } from '../utils/storage';
import { getOperatorsForType } from '../utils/validationOperators';

// ─── Constants ──────────────────────────────────────────────────────────────────

const LINE_COLORS = [
    { active: '#7c3aed', hover: '#8b5cf6' },   // violet
    { active: '#4f46e5', hover: '#6366f1' },    // indigo
    { active: '#0891b2', hover: '#06b6d4' },    // cyan
    { active: '#059669', hover: '#10b981' },    // emerald
    { active: '#d97706', hover: '#f59e0b' },    // amber
    { active: '#db2777', hover: '#ec4899' },    // pink
];

const DISABLED_COLOR = '#3f3f46';
const DISABLED_HOVER = '#52525b';

const VERT_LINE_LEFT = 14; // px – where the vertical line sits
const HORIZ_ARM_WIDTH = 20; // px – horizontal arm length
const CONTENT_LEFT = VERT_LINE_LEFT + HORIZ_ARM_WIDTH + 4; // px – content indentation
const CURVE_RADIUS = 8; // px – bottom-most arm curve radius
const ARM_TOP = 18; // px – fixed vertical offset for horizontal arms (centers on AND/OR selector & condition rows)

// ─── Helpers ────────────────────────────────────────────────────────────────────

function getValuePlaceholder(type: FirestoreFieldType, operator: ValidationOperator): string {
    if (operator === 'minLength' || operator === 'maxLength') return 'e.g. 10';
    if (operator === 'matches') return 'e.g. ^[a-z]+$';
    if (operator === 'withinRadius') return 'radius in km';
    switch (type) {
        case 'string': return 'value';
        case 'number': return 'e.g. 42';
        case 'boolean': return 'true / false';
        case 'timestamp': return 'YYYY-MM-DD';
        case 'array': return 'value';
        case 'map': return 'key name';
        default: return 'value';
    }
}

function createEmptyCondition(fields: FirestoreField[]): ValidationCondition {
    const firstField = fields[0];
    const operators = firstField ? getOperatorsForType(firstField.type) : [];
    return {
        id: generateId(),
        fieldId: firstField?.id ?? '',
        operator: operators[0]?.value ?? 'equals',
        value: '',
        enabled: true,
    };
}

function createEmptyGroup(): ValidationGroup {
    return {
        id: generateId(),
        type: 'AND',
        conditions: [],
        groups: [],
        enabled: true,
    };
}

export function createDefaultValidationRules(): ValidationRules {
    return {
        clientEnabled: false,
        serverEnabled: false,
        rootGroup: {
            id: generateId(),
            type: 'AND',
            conditions: [],
            groups: [],
            enabled: true,
        },
    };
}

function updateGroupRecursive(
    group: ValidationGroup,
    targetId: string,
    updater: (g: ValidationGroup) => ValidationGroup
): ValidationGroup {
    if (group.id === targetId) return updater(group);
    return {
        ...group,
        groups: group.groups.map((g) => updateGroupRecursive(g, targetId, updater)),
    };
}

function removeGroupRecursive(group: ValidationGroup, targetId: string): ValidationGroup {
    return {
        ...group,
        groups: group.groups
            .filter((g) => g.id !== targetId)
            .map((g) => removeGroupRecursive(g, targetId)),
    };
}

function countConditions(group: ValidationGroup): number {
    return group.conditions.length + group.groups.reduce((sum, g) => sum + countConditions(g), 0);
}

// ─── Main Component ─────────────────────────────────────────────────────────────

interface ValidationRuleBuilderProps {
    fields: FirestoreField[];
    validationRules?: ValidationRules;
    onChange: (rules: ValidationRules) => void;
}

export default function ValidationRuleBuilder({ fields, validationRules, onChange }: ValidationRuleBuilderProps) {
    const rules = validationRules ?? createDefaultValidationRules();
    const isAnyEnabled = rules.clientEnabled || rules.serverEnabled;
    const [expandedSection, setExpandedSection] = useState(isAnyEnabled);

    const handleToggleClient = () => {
        const updated = { ...rules, clientEnabled: !rules.clientEnabled };
        onChange(updated);
        if (!rules.clientEnabled) setExpandedSection(true);
    };

    const handleToggleServer = () => {
        const updated = { ...rules, serverEnabled: !rules.serverEnabled };
        onChange(updated);
        if (!rules.serverEnabled) setExpandedSection(true);
    };

    const handleUpdateRoot = (rootGroup: ValidationGroup) => {
        onChange({ ...rules, rootGroup });
    };

    const hasContent = rules.rootGroup.conditions.length > 0 || rules.rootGroup.groups.length > 0;

    return (
        <div className="mt-6">
            {/* Section Header */}
            <div className="flex items-center justify-between mb-3">
                <button
                    onClick={() => setExpandedSection(!expandedSection)}
                    className="flex items-center gap-2 group"
                >
                    {expandedSection ? (
                        <ChevronDown className="w-4 h-4 text-white/30 group-hover:text-white/50 transition-colors" />
                    ) : (
                        <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-white/50 transition-colors" />
                    )}
                    <GitBranch className="w-4 h-4 text-violet-400/60" />
                    <h3 className="text-lg font-semibold text-white/70">Validation Rules</h3>
                    {hasContent && !expandedSection && (
                        <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-violet-500/15 text-violet-300/70 rounded-md">
                            {countConditions(rules.rootGroup)} rule{countConditions(rules.rootGroup) !== 1 ? 's' : ''}
                        </span>
                    )}
                </button>
                <div className="flex items-center gap-3">
                    {/* Client-side validation toggle */}
                    <button
                        onClick={handleToggleClient}
                        className="flex items-center gap-1.5 text-sm transition-colors"
                        title={rules.clientEnabled ? 'Disable client-side validation (Dart)' : 'Enable client-side validation (Dart)'}
                    >
                        <Monitor className="w-3.5 h-3.5 text-white/30" />
                        {rules.clientEnabled ? (
                            <ToggleRight className="w-5 h-5 text-violet-400" />
                        ) : (
                            <ToggleLeft className="w-5 h-5 text-white/20" />
                        )}
                        <span className={rules.clientEnabled ? 'text-violet-300/70' : 'text-white/20'}>
                            Client
                        </span>
                    </button>
                    {/* Server-side validation toggle */}
                    <button
                        onClick={handleToggleServer}
                        className="flex items-center gap-1.5 text-sm transition-colors"
                        title={rules.serverEnabled ? 'Disable server-side validation (Security Rules)' : 'Enable server-side validation (Security Rules)'}
                    >
                        <Server className="w-3.5 h-3.5 text-white/30" />
                        {rules.serverEnabled ? (
                            <ToggleRight className="w-5 h-5 text-emerald-400" />
                        ) : (
                            <ToggleLeft className="w-5 h-5 text-white/20" />
                        )}
                        <span className={rules.serverEnabled ? 'text-emerald-300/70' : 'text-white/20'}>
                            Server
                        </span>
                    </button>
                </div>
            </div>

            {/* Builder */}
            {expandedSection && (
                <div className={`transition-opacity duration-200 ${isAnyEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                    <GroupNode
                        group={rules.rootGroup}
                        fields={fields}
                        depth={0}
                        isRoot
                        parentDisabled={false}
                        onUpdate={handleUpdateRoot}
                        onDelete={() => {/* Root cannot be deleted */ }}
                    />
                </div>
            )}
        </div>
    );
}

// ─── Group Node ─────────────────────────────────────────────────────────────────

interface GroupNodeProps {
    group: ValidationGroup;
    fields: FirestoreField[];
    depth: number;
    isRoot?: boolean;
    parentDisabled: boolean;
    onUpdate: (group: ValidationGroup) => void;
    onDelete: () => void;
}

function GroupNode({ group, fields, depth, isRoot, parentDisabled, onUpdate, onDelete }: GroupNodeProps) {
    const [collapsed, setCollapsed] = useState(false);
    const [hovered, setHovered] = useState(false);
    const childrenRef = useRef<HTMLDivElement>(null);
    const [vertLineBottom, setVertLineBottom] = useState(16);

    const childCount = group.conditions.length + group.groups.length;
    const isEmpty = childCount === 0;

    // Measure where the vertical line should end — at the last child's arm position
    useEffect(() => {
        if (collapsed || childCount === 0) return;
        const container = childrenRef.current;
        if (!container) return;
        const measure = () => {
            const allChildren = container.querySelectorAll(':scope > [data-connected-child]');
            const lastChild = allChildren[allChildren.length - 1] as HTMLElement | null;
            if (!lastChild) return;
            const containerRect = container.getBoundingClientRect();
            const lastChildRect = lastChild.getBoundingClientRect();
            // The arm sits at ARM_TOP px from the top of the last child,
            // but the curved L-shape covers the last CURVE_RADIUS px, so stop there.
            const armY = lastChildRect.top + ARM_TOP - CURVE_RADIUS;
            const lineBottom = containerRect.bottom - armY;
            setVertLineBottom(Math.max(0, lineBottom));
        };
        // Measure initially and on any resize / layout shift
        measure();
        const raf = requestAnimationFrame(measure);
        const observer = new ResizeObserver(measure);
        observer.observe(container);
        // Also observe each connected child so subgroup expand/collapse triggers remeasure
        const children = container.querySelectorAll(':scope > [data-connected-child]');
        children.forEach((child) => observer.observe(child));
        return () => { observer.disconnect(); cancelAnimationFrame(raf); };
    }, [collapsed, childCount, group.conditions.length, group.groups.length]);

    const effectivelyDisabled = parentDisabled || !group.enabled;
    const palette = LINE_COLORS[depth % LINE_COLORS.length];
    const lineColor = effectivelyDisabled ? DISABLED_COLOR : palette.active;
    const lineHoverColor = effectivelyDisabled ? DISABLED_HOVER : palette.hover;
    const currentLineColor = hovered ? lineHoverColor : lineColor;
    const lineThickness = hovered ? 3 : 2;

    const handleToggleType = (type: ValidationGroupType) => {
        onUpdate({ ...group, type });
    };

    const handleAddCondition = () => {
        if (fields.length === 0) return;
        onUpdate({
            ...group,
            conditions: [...group.conditions, createEmptyCondition(fields)],
        });
    };

    const handleAddGroup = () => {
        onUpdate({
            ...group,
            groups: [...group.groups, createEmptyGroup()],
        });
    };

    const handleUpdateCondition = (conditionId: string, updates: Partial<ValidationCondition>) => {
        onUpdate({
            ...group,
            conditions: group.conditions.map((c) =>
                c.id === conditionId ? { ...c, ...updates } : c
            ),
        });
    };

    const handleDeleteCondition = (conditionId: string) => {
        onUpdate({
            ...group,
            conditions: group.conditions.filter((c) => c.id !== conditionId),
        });
    };

    const handleUpdateSubGroup = useCallback((subGroupId: string, updated: ValidationGroup) => {
        onUpdate(updateGroupRecursive(group, subGroupId, () => updated));
    }, [group, onUpdate]);

    const handleDeleteSubGroup = useCallback((subGroupId: string) => {
        onUpdate(removeGroupRecursive(group, subGroupId));
    }, [group, onUpdate]);

    const handleToggleEnabled = () => {
        onUpdate({ ...group, enabled: !group.enabled });
    };

    return (
        <div className="relative">
            {/* AND / OR toggle + controls */}
            <div className="flex items-center gap-2 mb-0">
                <div className="flex rounded-lg overflow-hidden bg-white/[0.04]">
                    <button
                        onClick={() => handleToggleType('AND')}
                        className={`px-3 py-1 text-xs font-bold tracking-wide transition-all ${group.type === 'AND'
                                ? 'bg-violet-500/80 text-white'
                                : 'text-white/30 hover:text-white/50 hover:bg-white/[0.04]'
                            }`}
                    >
                        AND
                    </button>
                    <button
                        onClick={() => handleToggleType('OR')}
                        className={`px-3 py-1 text-xs font-bold tracking-wide transition-all ${group.type === 'OR'
                                ? 'bg-violet-500/80 text-white'
                                : 'text-white/30 hover:text-white/50 hover:bg-white/[0.04]'
                            }`}
                    >
                        OR
                    </button>
                </div>

                {!isRoot && (
                    <>
                        <button
                            onClick={handleToggleEnabled}
                            className="p-1 transition-colors"
                            title={group.enabled ? 'Disable group' : 'Enable group'}
                        >
                            {group.enabled ? (
                                <ToggleRight className="w-4 h-4 text-violet-400/70" />
                            ) : (
                                <ToggleLeft className="w-4 h-4 text-white/20" />
                            )}
                        </button>
                        <button
                            onClick={onDelete}
                            className="p-1 text-red-400/40 hover:text-red-400/70 transition-colors"
                            title="Delete group"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </>
                )}

                {!isEmpty && (
                    <button
                        onClick={() => setCollapsed(!collapsed)}
                        className="p-1 text-white/20 hover:text-white/50 transition-colors"
                        title={collapsed ? 'Expand group' : 'Collapse group'}
                    >
                        {collapsed ? (
                            <ChevronRight className="w-3.5 h-3.5" />
                        ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                        )}
                    </button>
                )}

                {collapsed && (
                    <span className="text-xs text-white/25">
                        {countConditions(group)} rule{countConditions(group) !== 1 ? 's' : ''}
                    </span>
                )}

                {/* Add condition / group icon buttons */}
                <button
                    onClick={handleAddCondition}
                    disabled={fields.length === 0}
                    className="p-1 text-violet-300/40 hover:text-violet-300/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Add condition"
                >
                    <Plus className="w-3.5 h-3.5" />
                </button>
                {depth < 3 && (
                    <button
                        onClick={handleAddGroup}
                        className="p-1 text-indigo-300/40 hover:text-indigo-300/80 transition-colors"
                        title="Add group"
                    >
                        <GitBranch className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {/* Children area with vertical line */}
            {!collapsed && (
                <div ref={childrenRef} className="relative" style={{ paddingLeft: CONTENT_LEFT }}>
                    {/* Vertical line — from below the AND/OR toggle to the last child */}
                    {childCount > 0 && (
                        <div
                            className="absolute select-none"
                            style={{
                                left: VERT_LINE_LEFT,
                                top: 4,
                                bottom: vertLineBottom,
                                width: lineThickness,
                                backgroundColor: currentLineColor,
                                borderRadius: lineThickness,
                                cursor: 'pointer',
                                transition: 'width 0.15s, background-color 0.15s',
                                zIndex: 1,
                            }}
                            onMouseEnter={() => setHovered(true)}
                            onMouseLeave={() => setHovered(false)}
                            onClick={() => setCollapsed(true)}
                            title="Click to collapse"
                        />
                    )}

                    {/* Condition rows */}
                    {group.conditions.map((condition, idx) => {
                        const isLast = idx === group.conditions.length - 1 && group.groups.length === 0;
                        const condDisabled = effectivelyDisabled || !condition.enabled;
                        return (
                            <ConnectedChild
                                key={condition.id}
                                isLast={isLast}
                                disabled={condDisabled}
                                parentHovered={hovered}
                                parentLineColor={currentLineColor}
                                lineThickness={lineThickness}
                            >
                                <ConditionRow
                                    condition={condition}
                                    fields={fields}
                                    onUpdate={(updates) => handleUpdateCondition(condition.id, updates)}
                                    onDelete={() => handleDeleteCondition(condition.id)}
                                />
                            </ConnectedChild>
                        );
                    })}

                    {/* Sub-groups */}
                    {group.groups.map((subGroup, idx) => {
                        const isLast = idx === group.groups.length - 1;
                        const subDisabled = effectivelyDisabled || !subGroup.enabled;
                        return (
                            <ConnectedChild
                                key={subGroup.id}
                                isLast={isLast}
                                disabled={subDisabled}
                                parentHovered={hovered}
                                parentLineColor={currentLineColor}
                                lineThickness={lineThickness}
                            >
                                <GroupNode
                                    group={subGroup}
                                    fields={fields}
                                    depth={depth + 1}
                                    parentDisabled={effectivelyDisabled}
                                    onUpdate={(updated) => handleUpdateSubGroup(subGroup.id, updated)}
                                    onDelete={() => handleDeleteSubGroup(subGroup.id)}
                                />
                            </ConnectedChild>
                        );
                    })}

                    {/* Empty state */}
                    {isEmpty && (
                        <div className="py-4 text-center text-white/20 text-sm">
                            No conditions yet — add a condition or nested group
                        </div>
                    )}

                </div>
            )}
        </div>
    );
}

// ─── Connected Child (horizontal arm + optional curve) ──────────────────────────

interface ConnectedChildProps {
    isLast: boolean;
    disabled: boolean;
    parentHovered: boolean;
    parentLineColor: string;
    lineThickness: number;
    children: React.ReactNode;
}

function ConnectedChild({ isLast, disabled, parentHovered, parentLineColor, lineThickness, children }: ConnectedChildProps) {
    const armColor = disabled
        ? (parentHovered ? DISABLED_HOVER : DISABLED_COLOR)
        : parentLineColor;

    return (
        <div
            className="relative"
            data-connected-child
            style={{
                minHeight: 36,
                paddingTop: 6,
                paddingBottom: 6,
            }}
        >
            {/* Horizontal arm */}
            {isLast ? (
                /* Curved L-shape for the last child */
                <div
                    style={{
                        position: 'absolute',
                        left: -(CONTENT_LEFT - VERT_LINE_LEFT),
                        top: 0,
                        width: HORIZ_ARM_WIDTH + (lineThickness - 2) / 2,
                        height: ARM_TOP,
                        borderLeft: `${lineThickness}px solid ${armColor}`,
                        borderBottom: `${lineThickness}px solid ${armColor}`,
                        borderBottomLeftRadius: CURVE_RADIUS,
                        borderRight: 'none',
                        borderTop: 'none',
                        transition: 'border-color 0.15s, border-width 0.15s',
                        pointerEvents: 'none',
                    }}
                />
            ) : (
                /* Straight horizontal arm */
                <div
                    style={{
                        position: 'absolute',
                        left: -(CONTENT_LEFT - VERT_LINE_LEFT) + lineThickness / 2,
                        top: ARM_TOP,
                        width: HORIZ_ARM_WIDTH - lineThickness / 2 + (lineThickness - 2) / 2,
                        height: lineThickness,
                        backgroundColor: armColor,
                        borderRadius: lineThickness,
                        transform: 'translateY(-50%)',
                        transition: 'background-color 0.15s, height 0.15s',
                        pointerEvents: 'none',
                    }}
                />
            )}

            {/* Content */}
            <div style={{ position: 'relative' }}>
                {children}
            </div>
        </div>
    );
}

// ─── Condition Row ──────────────────────────────────────────────────────────────

interface ConditionRowProps {
    condition: ValidationCondition;
    fields: FirestoreField[];
    onUpdate: (updates: Partial<ValidationCondition>) => void;
    onDelete: () => void;
}

function ConditionRow({ condition, fields, onUpdate, onDelete }: ConditionRowProps) {
    const selectedField = fields.find((f) => f.id === condition.fieldId);
    const fieldType = selectedField?.type ?? 'string';
    const operators = getOperatorsForType(fieldType);
    const currentOp = operators.find((o) => o.value === condition.operator) ?? operators[0];

    const handleFieldChange = (fieldId: string) => {
        const field = fields.find((f) => f.id === fieldId);
        const newOps = getOperatorsForType(field?.type ?? 'string');
        onUpdate({
            fieldId,
            operator: newOps[0]?.value ?? 'equals',
            value: '',
            secondaryValue: undefined,
        });
    };

    const rowOpacity = condition.enabled ? 'opacity-100' : 'opacity-40';

    return (
        <div className={`flex items-center gap-2 group/row ${rowOpacity}`}>
            {/* Field select */}
            <select
                value={condition.fieldId}
                onChange={(e) => handleFieldChange(e.target.value)}
                className="px-2.5 py-1.5 bg-white/[0.06] border-0 rounded-lg text-white/70 text-sm focus:ring-1 focus:ring-violet-500/30 transition-all min-w-[120px]"
            >
                {fields.map((f) => (
                    <option key={f.id} value={f.id}>
                        {f.name}
                    </option>
                ))}
            </select>

            {/* Operator select */}
            <select
                value={condition.operator}
                onChange={(e) =>
                    onUpdate({
                        operator: e.target.value as ValidationOperator,
                        value: '',
                        secondaryValue: undefined,
                    })
                }
                className="px-2.5 py-1.5 bg-violet-500/15 border-0 rounded-lg text-violet-300/80 text-sm font-medium focus:ring-1 focus:ring-violet-500/30 transition-all min-w-[80px]"
            >
                {operators.map((op) => (
                    <option key={op.value} value={op.value}>
                        {op.label}
                    </option>
                ))}
            </select>

            {/* Value input(s) */}
            {currentOp?.needsValue && (
                <>
                    {fieldType === 'boolean' ? (
                        <select
                            value={condition.value}
                            onChange={(e) => onUpdate({ value: e.target.value })}
                            className="px-2.5 py-1.5 bg-white/[0.06] border-0 rounded-lg text-white/70 text-sm focus:ring-1 focus:ring-violet-500/30 transition-all min-w-[80px]"
                        >
                            <option value="">select...</option>
                            <option value="true">true</option>
                            <option value="false">false</option>
                        </select>
                    ) : fieldType === 'timestamp' ? (
                        <input
                            type="date"
                            value={condition.value}
                            onChange={(e) => onUpdate({ value: e.target.value })}
                            className="px-2.5 py-1.5 bg-white/[0.06] border-0 rounded-lg text-white/70 text-sm focus:ring-1 focus:ring-violet-500/30 transition-all min-w-[130px]"
                        />
                    ) : (
                        <input
                            type="text"
                            value={condition.value}
                            onChange={(e) => onUpdate({ value: e.target.value })}
                            placeholder={getValuePlaceholder(fieldType, condition.operator)}
                            className="px-2.5 py-1.5 bg-white/[0.06] border-0 rounded-lg text-white/70 text-sm placeholder-white/15 focus:ring-1 focus:ring-violet-500/30 transition-all min-w-[100px] flex-1 max-w-[180px]"
                        />
                    )}

                    {currentOp.needsSecondary && (
                        <>
                            <span className="text-white/20 text-xs">and</span>
                            {fieldType === 'timestamp' ? (
                                <input
                                    type="date"
                                    value={condition.secondaryValue ?? ''}
                                    onChange={(e) => onUpdate({ secondaryValue: e.target.value })}
                                    className="px-2.5 py-1.5 bg-white/[0.06] border-0 rounded-lg text-white/70 text-sm focus:ring-1 focus:ring-violet-500/30 transition-all min-w-[130px]"
                                />
                            ) : (
                                <input
                                    type="text"
                                    value={condition.secondaryValue ?? ''}
                                    onChange={(e) => onUpdate({ secondaryValue: e.target.value })}
                                    placeholder="max"
                                    className="px-2.5 py-1.5 bg-white/[0.06] border-0 rounded-lg text-white/70 text-sm placeholder-white/15 focus:ring-1 focus:ring-violet-500/30 transition-all min-w-[80px] max-w-[120px]"
                                />
                            )}
                        </>
                    )}
                </>
            )}

            {/* Toggle + Delete */}
            <div className="flex items-center gap-1 ml-auto opacity-0 group-hover/row:opacity-100 transition-opacity">
                <button
                    onClick={() => onUpdate({ enabled: !condition.enabled })}
                    className="p-1 transition-colors"
                    title={condition.enabled ? 'Disable rule' : 'Enable rule'}
                >
                    {condition.enabled ? (
                        <ToggleRight className="w-4 h-4 text-violet-400/60" />
                    ) : (
                        <ToggleLeft className="w-4 h-4 text-white/20" />
                    )}
                </button>
                <button
                    onClick={onDelete}
                    className="p-1 text-red-400/40 hover:text-red-400/70 transition-colors"
                    title="Delete condition"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}
