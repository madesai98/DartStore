import { useState, useCallback } from 'react';
import {
    Plus, Trash2, ChevronDown, ChevronRight, ToggleLeft, ToggleRight,
    Shield, ShieldX, GitBranch, Copy, Eye, EyeOff, HelpCircle,
} from 'lucide-react';
import type {
    FirestoreCollection,
    FirestoreProject,
    ProjectSecurityRules,
    CollectionSecurityRules,
    SecurityRule,
    SecurityRuleOperation,
    SecurityConditionGroup,
    SecurityCondition,
    SecurityConditionType,
    SecurityGroupType,
    SecurityFieldTypeCheck,
} from '../types';
import { generateId } from '../utils/storage';
import {
    createDefaultCollectionSecurityRules,
    createDefaultSecurityRule,
    createDefaultSecurityConditionGroup,
    createDefaultSecurityCondition,
    CONDITION_TYPE_OPTIONS,
    OPERATION_OPTIONS,
    SECURITY_FIELD_TYPES,
} from '../utils/securityRulesGenerator';

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

function countTotalConditions(group: SecurityConditionGroup): number {
    return group.conditions.length + group.groups.reduce((sum, g) => sum + countTotalConditions(g), 0);
}

// ─── Main Component ─────────────────────────────────────────────────────────────

interface SecurityRulesBuilderProps {
    project: FirestoreProject;
    securityRules: ProjectSecurityRules;
    onChange: (rules: ProjectSecurityRules) => void;
    onShowPreview: () => void;
    selectedCollectionId: string | null;
}

export default function SecurityRulesBuilder({ project, securityRules, onChange, onShowPreview, selectedCollectionId }: SecurityRulesBuilderProps) {
    const allCollections = flattenCollections(project.collections);

    const handleToggleEnabled = () => {
        onChange({ ...securityRules, enabled: !securityRules.enabled });
    };

    const handleVersionChange = (version: '1' | '2') => {
        onChange({ ...securityRules, firestoreVersion: version });
    };

    const getCollectionRules = (collectionId: string): CollectionSecurityRules => {
        return securityRules.collectionRules[collectionId] || createDefaultCollectionSecurityRules();
    };

    const updateCollectionRules = useCallback((collectionId: string, rules: CollectionSecurityRules) => {
        onChange({
            ...securityRules,
            collectionRules: {
                ...securityRules.collectionRules,
                [collectionId]: rules,
            },
        });
    }, [securityRules, onChange]);

    const selectedCollection = allCollections.find(c => c.id === selectedCollectionId) || null;
    const selectedRules = selectedCollectionId ? getCollectionRules(selectedCollectionId) : null;

    return (
        <div className="h-full flex flex-col">
            {/* Compact toolbar */}
            <div className="px-6 py-3 border-b border-white/[0.04]">
                <div className="max-w-5xl mx-auto flex items-center justify-between gap-4 flex-wrap">
                    {/* Left: version picker */}
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-white/40">Rules Version</span>
                        <div className="flex rounded-lg overflow-hidden bg-white/[0.04]">
                            <button
                                onClick={() => handleVersionChange('1')}
                                className={`px-3 py-1 text-xs font-bold tracking-wide transition-all ${securityRules.firestoreVersion === '1'
                                    ? 'bg-amber-500/80 text-white'
                                    : 'text-white/30 hover:text-white/50 hover:bg-white/[0.04]'
                                    }`}
                            >
                                v1
                            </button>
                            <button
                                onClick={() => handleVersionChange('2')}
                                className={`px-3 py-1 text-xs font-bold tracking-wide transition-all ${securityRules.firestoreVersion === '2'
                                    ? 'bg-amber-500/80 text-white'
                                    : 'text-white/30 hover:text-white/50 hover:bg-white/[0.04]'
                                    }`}
                            >
                                v2
                            </button>
                        </div>
                        <div className="relative group">
                            <HelpCircle className="w-3.5 h-3.5 text-white/20 cursor-help" />
                            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden group-hover:block w-52 px-3 py-2 rounded-lg bg-[#1a1a40]/95 border border-white/[0.08] shadow-xl text-[11px] text-white/50 z-[9999] pointer-events-none">
                                {securityRules.firestoreVersion === '2'
                                    ? 'Recommended — supports recursive wildcards & more'
                                    : 'Legacy — limited features'}
                            </div>
                        </div>
                    </div>

                    {/* Right: preview + active toggle */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onShowPreview}
                            className="flex items-center gap-2 px-3.5 py-1.5 text-amber-300/80 hover:text-amber-200 hover:bg-white/[0.05] rounded-lg transition-all duration-200"
                        >
                            <Eye className="w-4 h-4" />
                            <span className="font-medium text-sm">Preview Rules</span>
                        </button>
                        <button
                            onClick={handleToggleEnabled}
                            className="flex items-center gap-1.5 text-sm transition-colors"
                            title={securityRules.enabled ? 'Disable security rules' : 'Enable security rules'}
                        >
                            {securityRules.enabled ? (
                                <ToggleRight className="w-5 h-5 text-amber-400" />
                            ) : (
                                <ToggleLeft className="w-5 h-5 text-white/20" />
                            )}
                            <span className={securityRules.enabled ? 'text-amber-300/70' : 'text-white/20'}>
                                {securityRules.enabled ? 'Active' : 'Inactive'}
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Body */}
            <div className={`flex-1 overflow-y-auto p-6 transition-opacity duration-200 ${securityRules.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                <div className="max-w-5xl mx-auto">

                    {allCollections.length === 0 ? (
                        <div className="text-center py-16">
                            <ShieldX className="w-12 h-12 mx-auto mb-4 text-white/10" />
                            <p className="text-lg text-white/30">No collections yet</p>
                            <p className="text-sm mt-2 text-white/20">
                                Add collections to your project first, then configure security rules
                            </p>
                        </div>
                    ) : selectedCollection && selectedRules ? (
                        <CollectionRuleEditor
                            collection={selectedCollection}
                            rules={selectedRules}
                            onChange={(rules) => updateCollectionRules(selectedCollection.id, rules)}
                        />
                    ) : (
                        <div className="flex items-center justify-center h-64">
                            <div className="text-center">
                                <Shield className="w-10 h-10 mx-auto mb-3 text-white/10" />
                                <p className="text-white/30">Select a collection</p>
                                <p className="text-sm mt-1 text-white/20">
                                    Choose a collection from the sidebar to configure its security rules
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Collection Rule Editor ─────────────────────────────────────────────────────

interface CollectionRuleEditorProps {
    collection: FirestoreCollection;
    rules: CollectionSecurityRules;
    onChange: (rules: CollectionSecurityRules) => void;
}

function CollectionRuleEditor({ collection, rules, onChange }: CollectionRuleEditorProps) {
    const handleToggle = () => {
        onChange({ ...rules, enabled: !rules.enabled });
    };

    const handleToggleSubcollections = () => {
        onChange({ ...rules, applyToSubcollections: !rules.applyToSubcollections });
    };

    const handleAddRule = () => {
        const newRule: SecurityRule = {
            ...createDefaultSecurityRule(),
            id: generateId(),
            conditionGroup: { ...createDefaultSecurityConditionGroup(), id: generateId() },
        };
        onChange({ ...rules, rules: [...rules.rules, newRule] });
    };

    const handleUpdateRule = useCallback((ruleId: string, updated: SecurityRule) => {
        onChange({
            ...rules,
            rules: rules.rules.map(r => r.id === ruleId ? updated : r),
        });
    }, [rules, onChange]);

    const handleDeleteRule = useCallback((ruleId: string) => {
        onChange({
            ...rules,
            rules: rules.rules.filter(r => r.id !== ruleId),
        });
    }, [rules, onChange]);

    const handleDuplicateRule = useCallback((ruleId: string) => {
        const source = rules.rules.find(r => r.id === ruleId);
        if (!source) return;

        const cloneGroup = (g: SecurityConditionGroup): SecurityConditionGroup => ({
            ...g,
            id: generateId(),
            conditions: g.conditions.map(c => ({ ...c, id: generateId() })),
            groups: g.groups.map(cloneGroup),
        });

        const cloned: SecurityRule = {
            ...source,
            id: generateId(),
            description: source.description ? `${source.description} (copy)` : 'Copied rule',
            conditionGroup: cloneGroup(source.conditionGroup),
        };

        const idx = rules.rules.findIndex(r => r.id === ruleId);
        const newRules = [...rules.rules];
        newRules.splice(idx + 1, 0, cloned);
        onChange({ ...rules, rules: newRules });
    }, [rules, onChange]);

    return (
        <div>
            {/* Collection Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-white/80">{collection.name}</h3>
                    <button
                        onClick={handleToggle}
                        className="flex items-center gap-1.5 text-sm transition-colors"
                        title={rules.enabled ? 'Disable collection rules' : 'Enable collection rules'}
                    >
                        {rules.enabled ? (
                            <ToggleRight className="w-5 h-5 text-amber-400" />
                        ) : (
                            <ToggleLeft className="w-5 h-5 text-white/20" />
                        )}
                        <span className={rules.enabled ? 'text-amber-300/70' : 'text-white/20'}>
                            {rules.enabled ? 'Active' : 'Inactive'}
                        </span>
                    </button>
                </div>
                <button
                    onClick={handleAddRule}
                    className="flex items-center gap-2 px-3.5 py-1.5 bg-amber-500/80 text-white rounded-lg hover:bg-amber-500 transition-all duration-200 text-sm"
                >
                    <Plus className="w-4 h-4" />
                    <span>Add Rule</span>
                </button>
            </div>

            {/* Options */}
            <div className={`transition-opacity duration-200 ${rules.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                <label className="flex items-center gap-2 mb-4 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={rules.applyToSubcollections}
                        onChange={handleToggleSubcollections}
                        className="rounded border-0 bg-white/[0.1] text-amber-500 focus:ring-amber-500/30"
                    />
                    <span className="text-sm text-white/40">
                        Apply rules to all subcollection documents
                    </span>
                </label>

                {/* Rules */}
                {rules.rules.length === 0 ? (
                    <div className="text-center py-12 bg-white/[0.02] rounded-2xl">
                        <ShieldX className="w-10 h-10 mx-auto mb-3 text-white/10" />
                        <p className="text-white/30">No rules defined</p>
                        <p className="text-sm mt-1 text-white/20">All access is denied by default in Firestore</p>
                        <button
                            onClick={handleAddRule}
                            className="mt-4 px-4 py-2 bg-amber-500/80 text-white rounded-lg hover:bg-amber-500 transition-all text-sm"
                        >
                            Add First Rule
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {rules.rules.map((rule) => (
                            <SecurityRuleCard
                                key={rule.id}
                                rule={rule}
                                collection={collection}
                                onUpdate={(updated) => handleUpdateRule(rule.id, updated)}
                                onDelete={() => handleDeleteRule(rule.id)}
                                onDuplicate={() => handleDuplicateRule(rule.id)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Security Rule Card ─────────────────────────────────────────────────────────

interface SecurityRuleCardProps {
    rule: SecurityRule;
    collection: FirestoreCollection;
    onUpdate: (rule: SecurityRule) => void;
    onDelete: () => void;
    onDuplicate: () => void;
}

function SecurityRuleCard({ rule, collection, onUpdate, onDelete, onDuplicate }: SecurityRuleCardProps) {
    const [expanded, setExpanded] = useState(true);
    const [editingDesc, setEditingDesc] = useState(false);
    const [tempDesc, setTempDesc] = useState(rule.description || '');

    const conditionCount = countTotalConditions(rule.conditionGroup);

    const handleToggleOperation = (op: SecurityRuleOperation) => {
        const current = rule.operations;
        let newOps: SecurityRuleOperation[];

        if (current.includes(op)) {
            newOps = current.filter(o => o !== op);
        } else {
            // If selecting 'read', remove 'get' and 'list'
            if (op === 'read') {
                newOps = [...current.filter(o => o !== 'get' && o !== 'list'), op];
            } else if (op === 'write') {
                newOps = [...current.filter(o => o !== 'create' && o !== 'update' && o !== 'delete'), op];
            } else if (op === 'get' || op === 'list') {
                newOps = [...current.filter(o => o !== 'read'), op];
            } else {
                newOps = [...current.filter(o => o !== 'write'), op];
            }
        }

        onUpdate({ ...rule, operations: newOps });
    };

    const handleSaveDesc = () => {
        onUpdate({ ...rule, description: tempDesc.trim() || undefined });
        setEditingDesc(false);
    };

    return (
        <div className={`bg-white/[0.03] rounded-2xl overflow-hidden transition-all duration-200 ${!rule.enabled ? 'opacity-40' : ''}`}>
            {/* Rule Header */}
            <div className="px-5 py-3.5 flex items-center gap-3">
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="p-0.5 text-white/20 hover:text-white/50 transition-colors"
                >
                    {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>

                <Shield className={`w-4 h-4 flex-shrink-0 ${rule.enabled ? 'text-amber-400/60' : 'text-white/15'}`} />

                {/* Operations tags */}
                <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                    {rule.operations.length > 0 ? (
                        rule.operations.map(op => (
                            <span
                                key={op}
                                className="px-2 py-0.5 text-xs font-medium bg-amber-500/15 text-amber-300/80 rounded-md"
                            >
                                {op}
                            </span>
                        ))
                    ) : (
                        <span className="text-xs text-white/25 italic">No operations selected</span>
                    )}

                    {rule.description && !editingDesc && (
                        <span className="text-xs text-white/30 ml-1">— {rule.description}</span>
                    )}
                </div>

                {conditionCount > 0 && !expanded && (
                    <span className="text-xs text-white/20">
                        {conditionCount} condition{conditionCount !== 1 ? 's' : ''}
                    </span>
                )}

                <div className="flex items-center gap-1">
                    <button
                        onClick={onDuplicate}
                        className="p-1.5 text-white/20 hover:text-white/50 hover:bg-white/[0.05] rounded-lg transition-all"
                        title="Duplicate rule"
                    >
                        <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => onUpdate({ ...rule, enabled: !rule.enabled })}
                        className="p-1 transition-colors"
                        title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                    >
                        {rule.enabled ? (
                            <ToggleRight className="w-4 h-4 text-amber-400/70" />
                        ) : (
                            <ToggleLeft className="w-4 h-4 text-white/20" />
                        )}
                    </button>
                    <button
                        onClick={onDelete}
                        className="p-1.5 text-red-400/40 hover:text-red-400/70 hover:bg-white/[0.05] rounded-lg transition-all"
                        title="Delete rule"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Expanded Content */}
            {expanded && rule.enabled && (
                <div className="px-5 pb-5 space-y-4">
                    {/* Description */}
                    <div>
                        {editingDesc ? (
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={tempDesc}
                                    onChange={(e) => setTempDesc(e.target.value)}
                                    placeholder="Rule description (optional)"
                                    className="flex-1 px-3 py-1.5 bg-white/[0.06] border-0 rounded-lg text-white/70 text-sm placeholder-white/20 focus:ring-1 focus:ring-amber-500/30 transition-all"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveDesc();
                                        if (e.key === 'Escape') {
                                            setTempDesc(rule.description || '');
                                            setEditingDesc(false);
                                        }
                                    }}
                                />
                                <button onClick={handleSaveDesc} className="px-3 py-1.5 text-sm bg-amber-500/80 text-white rounded-lg hover:bg-amber-500 transition-all">
                                    Save
                                </button>
                                <button onClick={() => { setTempDesc(rule.description || ''); setEditingDesc(false); }} className="px-3 py-1.5 text-sm text-white/40 hover:text-white/60 transition-all">
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => { setTempDesc(rule.description || ''); setEditingDesc(true); }}
                                className="text-xs text-white/20 hover:text-white/40 transition-colors"
                            >
                                {rule.description ? `📝 ${rule.description}` : '+ Add description'}
                            </button>
                        )}
                    </div>

                    {/* Operations */}
                    <div>
                        <label className="block text-sm font-medium text-white/40 mb-2">Operations</label>
                        <div className="flex flex-wrap gap-2">
                            {OPERATION_OPTIONS.map(op => {
                                const isActive = rule.operations.includes(op.value);
                                // Disable get/list when 'read' is selected, and create/update/delete when 'write' is selected
                                const isDisabled =
                                    ((op.value === 'get' || op.value === 'list') && rule.operations.includes('read')) ||
                                    ((op.value === 'create' || op.value === 'update' || op.value === 'delete') && rule.operations.includes('write'));

                                return (
                                    <button
                                        key={op.value}
                                        onClick={() => handleToggleOperation(op.value)}
                                        disabled={isDisabled}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${isActive
                                            ? 'bg-amber-500/80 text-white'
                                            : 'bg-white/[0.04] text-white/30 hover:text-white/50 hover:bg-white/[0.06]'
                                            } ${isDisabled ? 'opacity-20 cursor-not-allowed' : ''}`}
                                        title={op.description}
                                    >
                                        {op.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Conditions */}
                    <div>
                        <label className="block text-sm font-medium text-white/40 mb-2">Conditions</label>
                        <SecurityConditionGroupNode
                            group={rule.conditionGroup}
                            collection={collection}
                            depth={0}
                            isRoot
                            parentDisabled={false}
                            onUpdate={(updated) => onUpdate({ ...rule, conditionGroup: updated })}
                            onDelete={() => { }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Condition Group Node ───────────────────────────────────────────────────────

interface SecurityConditionGroupNodeProps {
    group: SecurityConditionGroup;
    collection: FirestoreCollection;
    depth: number;
    isRoot?: boolean;
    parentDisabled: boolean;
    onUpdate: (group: SecurityConditionGroup) => void;
    onDelete: () => void;
}

function SecurityConditionGroupNode({ group, collection, depth, isRoot, parentDisabled, onUpdate, onDelete }: SecurityConditionGroupNodeProps) {
    const [collapsed, setCollapsed] = useState(false);
    const effectivelyDisabled = parentDisabled || !group.enabled;

    const childCount = group.conditions.length + group.groups.length;
    const isEmpty = childCount === 0;

    const handleToggleType = (type: SecurityGroupType) => {
        onUpdate({ ...group, type });
    };

    const handleAddCondition = () => {
        const newCondition: SecurityCondition = {
            ...createDefaultSecurityCondition(),
            id: generateId(),
        };
        onUpdate({ ...group, conditions: [...group.conditions, newCondition] });
    };

    const handleAddGroup = () => {
        const newGroup: SecurityConditionGroup = {
            ...createDefaultSecurityConditionGroup(),
            id: generateId(),
        };
        onUpdate({ ...group, groups: [...group.groups, newGroup] });
    };

    const handleUpdateCondition = (conditionId: string, updates: Partial<SecurityCondition>) => {
        onUpdate({
            ...group,
            conditions: group.conditions.map(c =>
                c.id === conditionId ? { ...c, ...updates } : c
            ),
        });
    };

    const handleDeleteCondition = (conditionId: string) => {
        onUpdate({
            ...group,
            conditions: group.conditions.filter(c => c.id !== conditionId),
        });
    };

    const handleUpdateSubGroup = useCallback((subGroupId: string, updated: SecurityConditionGroup) => {
        onUpdate({
            ...group,
            groups: group.groups.map(g => g.id === subGroupId ? updated : g),
        });
    }, [group, onUpdate]);

    const handleDeleteSubGroup = useCallback((subGroupId: string) => {
        onUpdate({
            ...group,
            groups: group.groups.filter(g => g.id !== subGroupId),
        });
    }, [group, onUpdate]);

    return (
        <div className={`relative ${effectivelyDisabled ? 'opacity-40' : ''}`}>
            {/* AND / OR toggle + controls */}
            <div className="flex items-center gap-2 mb-1">
                <div className="flex rounded-lg overflow-hidden bg-white/[0.04]">
                    <button
                        onClick={() => handleToggleType('AND')}
                        className={`px-3 py-1 text-xs font-bold tracking-wide transition-all ${group.type === 'AND'
                            ? 'bg-amber-500/80 text-white'
                            : 'text-white/30 hover:text-white/50 hover:bg-white/[0.04]'
                            }`}
                    >
                        AND
                    </button>
                    <button
                        onClick={() => handleToggleType('OR')}
                        className={`px-3 py-1 text-xs font-bold tracking-wide transition-all ${group.type === 'OR'
                            ? 'bg-amber-500/80 text-white'
                            : 'text-white/30 hover:text-white/50 hover:bg-white/[0.04]'
                            }`}
                    >
                        OR
                    </button>
                </div>

                {!isRoot && (
                    <>
                        <button
                            onClick={() => onUpdate({ ...group, enabled: !group.enabled })}
                            className="p-1 transition-colors"
                            title={group.enabled ? 'Disable group' : 'Enable group'}
                        >
                            {group.enabled ? (
                                <ToggleRight className="w-4 h-4 text-amber-400/70" />
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
                        {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                )}

                {collapsed && (
                    <span className="text-xs text-white/25">
                        {countTotalConditions(group)} condition{countTotalConditions(group) !== 1 ? 's' : ''}
                    </span>
                )}

                <button
                    onClick={handleAddCondition}
                    className="p-1 text-amber-300/40 hover:text-amber-300/80 transition-colors"
                    title="Add condition"
                >
                    <Plus className="w-3.5 h-3.5" />
                </button>
                {depth < 3 && (
                    <button
                        onClick={handleAddGroup}
                        className="p-1 text-indigo-300/40 hover:text-indigo-300/80 transition-colors"
                        title="Add nested group"
                    >
                        <GitBranch className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {/* Children */}
            {!collapsed && (
                <div className="pl-6 border-l-2 border-white/[0.06] ml-3 space-y-1.5">
                    {group.conditions.map((condition) => (
                        <SecurityConditionRow
                            key={condition.id}
                            condition={condition}
                            collection={collection}
                            onUpdate={(updates) => handleUpdateCondition(condition.id, updates)}
                            onDelete={() => handleDeleteCondition(condition.id)}
                        />
                    ))}

                    {group.groups.map((subGroup) => (
                        <div key={subGroup.id} className="pt-1">
                            <SecurityConditionGroupNode
                                group={subGroup}
                                collection={collection}
                                depth={depth + 1}
                                parentDisabled={effectivelyDisabled}
                                onUpdate={(updated) => handleUpdateSubGroup(subGroup.id, updated)}
                                onDelete={() => handleDeleteSubGroup(subGroup.id)}
                            />
                        </div>
                    ))}

                    {isEmpty && (
                        <div className="py-3 text-center text-white/20 text-sm">
                            No conditions — rule will evaluate to <code className="px-1.5 py-0.5 bg-white/[0.05] rounded text-xs text-amber-300/60">true</code>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Condition Row ──────────────────────────────────────────────────────────────

interface SecurityConditionRowProps {
    condition: SecurityCondition;
    collection: FirestoreCollection;
    onUpdate: (updates: Partial<SecurityCondition>) => void;
    onDelete: () => void;
}

function SecurityConditionRow({ condition, collection, onUpdate, onDelete }: SecurityConditionRowProps) {
    const rowOpacity = condition.enabled ? 'opacity-100' : 'opacity-40';
    const typeOption = CONDITION_TYPE_OPTIONS.find(o => o.value === condition.type);

    const handleTypeChange = (newType: SecurityConditionType) => {
        // Reset all type-specific fields when changing type
        const reset: Partial<SecurityCondition> = {
            type: newType,
            ownerField: undefined,
            claimKey: undefined,
            claimValue: undefined,
            fieldPath: undefined,
            fieldValue: undefined,
            fieldTarget: undefined,
            existsFieldPath: undefined,
            existsTarget: undefined,
            typeFieldPath: undefined,
            typeCheck: undefined,
            typeTarget: undefined,
            documentPath: undefined,
            resourceExpression: undefined,
            timeLimitHours: undefined,
            rateLimitInfo: undefined,
            customExpression: undefined,
        };
        onUpdate(reset);
    };

    return (
        <div className={`flex items-start gap-2 py-1.5 group/row ${rowOpacity}`}>
            {/* Type icon */}
            <span className="text-sm mt-0.5 select-none w-5 text-center flex-shrink-0" title={typeOption?.description}>
                {typeOption?.icon || '❓'}
            </span>

            {/* Condition type */}
            <select
                value={condition.type}
                onChange={(e) => handleTypeChange(e.target.value as SecurityConditionType)}
                className="px-2.5 py-1.5 bg-white/[0.06] border-0 rounded-lg text-white/70 text-sm focus:ring-1 focus:ring-amber-500/30 transition-all min-w-[140px]"
            >
                {CONDITION_TYPE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>

            {/* Type-specific inputs */}
            <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                {condition.type === 'owner' && (
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs text-white/25">field:</span>
                        <select
                            value={condition.ownerField || ''}
                            onChange={(e) => onUpdate({ ownerField: e.target.value })}
                            className="px-2.5 py-1.5 bg-white/[0.06] border-0 rounded-lg text-white/70 text-sm focus:ring-1 focus:ring-amber-500/30 transition-all min-w-[120px]"
                        >
                            <option value="">Select field…</option>
                            {collection.fields.map(f => (
                                <option key={f.id} value={f.name}>{f.name}</option>
                            ))}
                            <option value="userId">userId (custom)</option>
                            <option value="uid">uid (custom)</option>
                            <option value="ownerId">ownerId (custom)</option>
                            <option value="createdBy">createdBy (custom)</option>
                        </select>
                    </div>
                )}

                {condition.type === 'customClaim' && (
                    <>
                        <input
                            type="text"
                            value={condition.claimKey || ''}
                            onChange={(e) => onUpdate({ claimKey: e.target.value })}
                            placeholder="Claim key (e.g. role)"
                            className="px-2.5 py-1.5 bg-white/[0.06] border-0 rounded-lg text-white/70 text-sm placeholder-white/15 focus:ring-1 focus:ring-amber-500/30 transition-all w-36"
                        />
                        <span className="text-xs text-white/25">=</span>
                        <input
                            type="text"
                            value={condition.claimValue || ''}
                            onChange={(e) => onUpdate({ claimValue: e.target.value })}
                            placeholder="Value (e.g. admin)"
                            className="px-2.5 py-1.5 bg-white/[0.06] border-0 rounded-lg text-white/70 text-sm placeholder-white/15 focus:ring-1 focus:ring-amber-500/30 transition-all w-36"
                        />
                    </>
                )}

                {condition.type === 'fieldEquals' && (
                    <>
                        <select
                            value={condition.fieldTarget || 'resource'}
                            onChange={(e) => onUpdate({ fieldTarget: e.target.value as 'resource' | 'request' })}
                            className="px-2 py-1.5 bg-amber-500/15 border-0 rounded-lg text-amber-300/80 text-xs font-medium focus:ring-1 focus:ring-amber-500/30 transition-all"
                        >
                            <option value="resource">resource</option>
                            <option value="request">request</option>
                        </select>
                        <input
                            type="text"
                            value={condition.fieldPath || ''}
                            onChange={(e) => onUpdate({ fieldPath: e.target.value })}
                            placeholder="field.path"
                            className="px-2.5 py-1.5 bg-white/[0.06] border-0 rounded-lg text-white/70 text-sm placeholder-white/15 focus:ring-1 focus:ring-amber-500/30 transition-all w-32"
                        />
                        <span className="text-xs text-white/25">=</span>
                        <input
                            type="text"
                            value={condition.fieldValue || ''}
                            onChange={(e) => onUpdate({ fieldValue: e.target.value })}
                            placeholder="value"
                            className="px-2.5 py-1.5 bg-white/[0.06] border-0 rounded-lg text-white/70 text-sm placeholder-white/15 focus:ring-1 focus:ring-amber-500/30 transition-all w-32"
                        />
                    </>
                )}

                {condition.type === 'fieldExists' && (
                    <>
                        <select
                            value={condition.existsTarget || 'resource'}
                            onChange={(e) => onUpdate({ existsTarget: e.target.value as 'resource' | 'request' })}
                            className="px-2 py-1.5 bg-amber-500/15 border-0 rounded-lg text-amber-300/80 text-xs font-medium focus:ring-1 focus:ring-amber-500/30 transition-all"
                        >
                            <option value="resource">resource</option>
                            <option value="request">request</option>
                        </select>
                        <input
                            type="text"
                            value={condition.existsFieldPath || ''}
                            onChange={(e) => onUpdate({ existsFieldPath: e.target.value })}
                            placeholder="field name"
                            className="px-2.5 py-1.5 bg-white/[0.06] border-0 rounded-lg text-white/70 text-sm placeholder-white/15 focus:ring-1 focus:ring-amber-500/30 transition-all w-40"
                        />
                    </>
                )}

                {condition.type === 'fieldType' && (
                    <>
                        <select
                            value={condition.typeTarget || 'resource'}
                            onChange={(e) => onUpdate({ typeTarget: e.target.value as 'resource' | 'request' })}
                            className="px-2 py-1.5 bg-amber-500/15 border-0 rounded-lg text-amber-300/80 text-xs font-medium focus:ring-1 focus:ring-amber-500/30 transition-all"
                        >
                            <option value="resource">resource</option>
                            <option value="request">request</option>
                        </select>
                        <input
                            type="text"
                            value={condition.typeFieldPath || ''}
                            onChange={(e) => onUpdate({ typeFieldPath: e.target.value })}
                            placeholder="field.path"
                            className="px-2.5 py-1.5 bg-white/[0.06] border-0 rounded-lg text-white/70 text-sm placeholder-white/15 focus:ring-1 focus:ring-amber-500/30 transition-all w-32"
                        />
                        <span className="text-xs text-white/25">is</span>
                        <select
                            value={condition.typeCheck || 'string'}
                            onChange={(e) => onUpdate({ typeCheck: e.target.value as SecurityFieldTypeCheck })}
                            className="px-2.5 py-1.5 bg-white/[0.06] border-0 rounded-lg text-white/70 text-sm focus:ring-1 focus:ring-amber-500/30 transition-all"
                        >
                            {SECURITY_FIELD_TYPES.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                    </>
                )}

                {condition.type === 'documentExists' && (
                    <input
                        type="text"
                        value={condition.documentPath || ''}
                        onChange={(e) => onUpdate({ documentPath: e.target.value })}
                        placeholder="/users/$(request.auth.uid)"
                        className="px-2.5 py-1.5 bg-white/[0.06] border-0 rounded-lg text-white/70 text-sm placeholder-white/15 focus:ring-1 focus:ring-amber-500/30 transition-all flex-1 min-w-[250px] font-mono"
                    />
                )}

                {(condition.type === 'resourceField' || condition.type === 'requestField') && (
                    <input
                        type="text"
                        value={condition.resourceExpression || ''}
                        onChange={(e) => onUpdate({ resourceExpression: e.target.value })}
                        placeholder={condition.type === 'resourceField'
                            ? 'resource.data.status == "active"'
                            : 'request.resource.data.size() <= 5'}
                        className="px-2.5 py-1.5 bg-white/[0.06] border-0 rounded-lg text-white/70 text-sm placeholder-white/15 focus:ring-1 focus:ring-amber-500/30 transition-all flex-1 min-w-[250px] font-mono"
                    />
                )}

                {condition.type === 'timeLimit' && (
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs text-white/25">within</span>
                        <input
                            type="number"
                            value={condition.timeLimitHours || 24}
                            onChange={(e) => onUpdate({ timeLimitHours: parseInt(e.target.value) || 24 })}
                            className="px-2.5 py-1.5 bg-white/[0.06] border-0 rounded-lg text-white/70 text-sm focus:ring-1 focus:ring-amber-500/30 transition-all w-20"
                            min={1}
                        />
                        <span className="text-xs text-white/25">hours of creation</span>
                    </div>
                )}

                {condition.type === 'custom' && (
                    <input
                        type="text"
                        value={condition.customExpression || ''}
                        onChange={(e) => onUpdate({ customExpression: e.target.value })}
                        placeholder="request.auth != null && resource.data.field == 'value'"
                        className="px-2.5 py-1.5 bg-white/[0.06] border-0 rounded-lg text-white/70 text-sm placeholder-white/15 focus:ring-1 focus:ring-amber-500/30 transition-all flex-1 min-w-[300px] font-mono"
                    />
                )}

                {/* No extra inputs for authenticated, emailVerified */}
            </div>

            {/* Toggle + Delete */}
            <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity flex-shrink-0">
                <button
                    onClick={() => onUpdate({ enabled: !condition.enabled })}
                    className="p-1 transition-colors"
                    title={condition.enabled ? 'Disable condition' : 'Enable condition'}
                >
                    {condition.enabled ? (
                        <EyeOff className="w-3.5 h-3.5 text-amber-400/50" />
                    ) : (
                        <Eye className="w-3.5 h-3.5 text-white/20" />
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
