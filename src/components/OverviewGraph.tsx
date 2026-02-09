import { useMemo, useCallback, memo, useState, createContext, useContext } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    Handle,
    type Node,
    type Edge,
    type NodeProps,
    type NodeTypes,
    type EdgeTypes,
    Position,
    BaseEdge,
    getSmoothStepPath,
    ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import {
    Shield, ShieldCheck, CheckCircle2,
    Type, Hash, ToggleLeft, Clock, MapPin, Link2, List, Braces, Ban,
    Info, X,
} from 'lucide-react';
import type {
    FirestoreCollection,
    FirestoreField,
    FirestoreFieldType,
    ProjectSecurityRules,
    SecurityRuleOperation,
    SecurityConditionGroup,
    SecurityCondition,
    ValidationRules,
    ValidationGroup,
} from '../types';
import { getOperatorsForType } from '../utils/validationOperators';

// ─── Constants ──────────────────────────────────────────────────────────────────

const NODE_WIDTH = 340;
const DAGRE_RANKSEP = 120;
const DAGRE_NODESEP = 60;

// ─── Type Icons ─────────────────────────────────────────────────────────────────

function fieldTypeIcon(type: FirestoreFieldType) {
    const cls = 'w-3 h-3 shrink-0';
    switch (type) {
        case 'string': return <Type className={`${cls} text-emerald-400`} />;
        case 'number': return <Hash className={`${cls} text-blue-400`} />;
        case 'boolean': return <ToggleLeft className={`${cls} text-amber-400`} />;
        case 'timestamp': return <Clock className={`${cls} text-orange-400`} />;
        case 'geopoint': return <MapPin className={`${cls} text-pink-400`} />;
        case 'reference': return <Link2 className={`${cls} text-cyan-400`} />;
        case 'array': return <List className={`${cls} text-violet-400`} />;
        case 'map': return <Braces className={`${cls} text-rose-400`} />;
        case 'null': return <Ban className={`${cls} text-white/30`} />;
        default: return <Type className={`${cls} text-white/30`} />;
    }
}

function fieldTypeBadge(field: FirestoreField): string {
    let label: string = field.type;
    if (field.type === 'array' && field.arrayItemType) label = `array<${field.arrayItemType}>`;
    if (field.type === 'map' && field.mapValueType) label = `map<${field.mapValueType}>`;
    if (field.type === 'reference') label = 'reference';
    return label;
}

// ─── Highlight Context ──────────────────────────────────────────────────────────

interface HighlightCtx {
    highlightedEdgeIds: Set<string>;
    setHighlightedEdgeIds: (ids: Set<string>) => void;
    allEdges: Edge[];
}

const HighlightContext = createContext<HighlightCtx>({
    highlightedEdgeIds: new Set(),
    setHighlightedEdgeIds: () => { },
    allEdges: [],
});

// ─── Validation Helpers ─────────────────────────────────────────────────────────

function getFieldValidations(fieldId: string, rules: ValidationRules | undefined, fields: FirestoreField[]): string[] {
    if (!rules || !rules.enabled) return [];
    return collectConditionsForField(rules.rootGroup, fieldId, fields);
}

function collectConditionsForField(group: ValidationGroup, fieldId: string, fields: FirestoreField[]): string[] {
    const result: string[] = [];
    for (const c of group.conditions) {
        if (!c.enabled || c.fieldId !== fieldId) continue;
        const field = fields.find(f => f.id === fieldId);
        if (!field) continue;
        const ops = getOperatorsForType(field.type);
        const op = ops.find(o => o.value === c.operator);
        const opLabel = op?.label ?? c.operator;
        let desc = opLabel;
        if (op?.needsValue && c.value) desc += ` ${c.value}`;
        if (op?.needsSecondary && c.secondaryValue) desc += ` – ${c.secondaryValue}`;
        result.push(desc);
    }
    for (const sub of group.groups) {
        result.push(...collectConditionsForField(sub, fieldId, fields));
    }
    return result;
}

// ─── Security Helpers ───────────────────────────────────────────────────────────

function groupOps(operations: SecurityRuleOperation[]): string {
    const hasGet = operations.includes('get');
    const hasList = operations.includes('list');
    const hasCreate = operations.includes('create');
    const hasUpdate = operations.includes('update');
    const hasDelete = operations.includes('delete');
    const hasRead = operations.includes('read');
    const hasWrite = operations.includes('write');

    const ops: string[] = [];
    if (hasRead || (hasGet && hasList)) ops.push('read');
    else { if (hasGet) ops.push('get'); if (hasList) ops.push('list'); }
    if (hasWrite || (hasCreate && hasUpdate && hasDelete)) ops.push('write');
    else { if (hasCreate) ops.push('create'); if (hasUpdate) ops.push('update'); if (hasDelete) ops.push('delete'); }
    return ops.join(', ');
}

function countConditions(group: SecurityConditionGroup): number {
    return group.conditions.filter(c => c.enabled).length
        + group.groups.reduce((s, g) => s + countConditions(g), 0);
}

function describeCondition(cond: SecurityCondition): string {
    if (!cond.enabled) return '';
    switch (cond.type) {
        case 'authenticated': return 'auth ≠ null';
        case 'owner': return `owner(${cond.ownerField ?? 'userId'})`;
        case 'emailVerified': return 'email verified';
        case 'customClaim': return `claim: ${cond.claimKey ?? 'role'}=${cond.claimValue ?? ''}`;
        case 'fieldEquals': return `${cond.fieldTarget === 'request' ? 'req' : 'res'}.${cond.fieldPath ?? ''} = ${cond.fieldValue ?? ''}`;
        case 'fieldExists': return `${cond.existsTarget === 'request' ? 'req' : 'res'} has ${cond.existsFieldPath ?? ''}`;
        case 'fieldType': return `${cond.typeFieldPath ?? ''} is ${cond.typeCheck ?? ''}`;
        case 'documentExists': return `exists(${cond.documentPath ?? '...'})`;
        case 'resourceField': return cond.resourceExpression ?? 'resource expr';
        case 'requestField': return cond.resourceExpression ?? 'request expr';
        case 'timeLimit': return `time < ${cond.timeLimitHours ?? 0}h`;
        case 'rateLimit': return `rate: ${cond.rateLimitInfo ?? ''}`;
        case 'custom': return cond.customExpression ?? 'custom';
        default: return cond.type;
    }
}

function getConditionDescriptions(group: SecurityConditionGroup, join: string = ' && '): string {
    const parts: string[] = [];
    for (const c of group.conditions) {
        if (!c.enabled) continue;
        parts.push(describeCondition(c));
    }
    for (const sub of group.groups) {
        const inner = getConditionDescriptions(sub, sub.type === 'AND' ? ' && ' : ' || ');
        if (inner) parts.push(`(${inner})`);
    }
    return parts.join(join);
}

// ─── Flatten Collections ────────────────────────────────────────────────────────

interface FlatCollection {
    collection: FirestoreCollection;
    parentId: string | null;
    depth: number;
    path: string;
}

function flattenCollections(
    collections: FirestoreCollection[],
    parentId: string | null = null,
    depth: number = 0,
    path: string = '',
): FlatCollection[] {
    const result: FlatCollection[] = [];
    for (const c of collections) {
        const p = path ? `${path}/${c.name}` : c.name;
        result.push({ collection: c, parentId, depth, path: p });
        if (c.subcollections.length > 0) {
            result.push(...flattenCollections(c.subcollections, c.id, depth + 1, p));
        }
    }
    return result;
}

// ─── Compute Node Height ────────────────────────────────────────────────────────

const NODE_HEADER_HEIGHT = 44;
const NODE_HEADER_HEIGHT_WITH_PATH = 58;
const FIELD_ROW_HEIGHT = 28;
const VALIDATION_ROW_HEIGHT = 22;
const SECURITY_HEADER_HEIGHT = 32;
const SECURITY_RULE_HEIGHT = 24;
const NODE_PADDING_BOTTOM = 12;

function computeNodeHeight(
    collection: FirestoreCollection,
    securityRules: ProjectSecurityRules,
    depth: number = 0,
): number {
    let h = depth > 0 ? NODE_HEADER_HEIGHT_WITH_PATH : NODE_HEADER_HEIGHT;

    for (const field of collection.fields) {
        h += FIELD_ROW_HEIGHT;
        if (field.description) h += 14;
        if (field.defaultPreset && field.defaultPreset !== 'none') h += 14;
        const vals = getFieldValidations(field.id, collection.validationRules, collection.fields);
        h += vals.length * VALIDATION_ROW_HEIGHT;
    }

    const collRules = securityRules.collectionRules[collection.id];
    if (collRules && collRules.enabled && collRules.rules.length > 0) {
        h += SECURITY_HEADER_HEIGHT;
        for (const rule of collRules.rules) {
            if (!rule.enabled) continue;
            h += SECURITY_RULE_HEIGHT;
            const condCount = countConditions(rule.conditionGroup);
            h += Math.min(condCount, 4) * VALIDATION_ROW_HEIGHT;
        }
    }

    h += NODE_PADDING_BOTTOM;
    return Math.max(h, 80);
}

const FIELD_AREA_PADDING_TOP = 6;

function computeFieldYOffsets(collection: FirestoreCollection, depth: number = 0): Map<string, number> {
    const map = new Map<string, number>();
    const headerH = depth > 0 ? NODE_HEADER_HEIGHT_WITH_PATH : NODE_HEADER_HEIGHT;
    let y = headerH + FIELD_AREA_PADDING_TOP;

    for (const field of collection.fields) {
        map.set(field.id, y + FIELD_ROW_HEIGHT / 2);
        y += FIELD_ROW_HEIGHT;
        if (field.description) y += 14;
        if (field.defaultPreset && field.defaultPreset !== 'none') y += 14;
        const vals = getFieldValidations(field.id, collection.validationRules, collection.fields);
        y += vals.length * VALIDATION_ROW_HEIGHT;
    }

    return map;
}

// ─── Reference Edge Discovery ───────────────────────────────────────────────────

interface ReferenceEdgeData {
    fromFieldId: string;
    fromCollectionId: string;
    toCollectionId: string;
    fieldName: string;
}

function computeReferenceEdges(collections: FirestoreCollection[]): ReferenceEdgeData[] {
    const edges: ReferenceEdgeData[] = [];
    const traverse = (list: FirestoreCollection[]) => {
        for (const collection of list) {
            for (const field of collection.fields) {
                if (field.type === 'reference' && field.referenceCollections && field.referenceCollections.length > 0) {
                    for (const refCollId of field.referenceCollections) {
                        edges.push({
                            fromFieldId: field.id,
                            fromCollectionId: collection.id,
                            toCollectionId: refCollId,
                            fieldName: field.name,
                        });
                    }
                }
            }
            if (collection.subcollections.length > 0) traverse(collection.subcollections);
        }
    };
    traverse(collections);
    return edges;
}

// ─── Dagre Auto-Layout ──────────────────────────────────────────────────────────

function getLayoutedElements(
    nodes: Node[],
    edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
        rankdir: 'TB',
        ranksep: DAGRE_RANKSEP,
        nodesep: DAGRE_NODESEP,
        marginx: 40,
        marginy: 40,
    });

    for (const node of nodes) {
        g.setNode(node.id, {
            width: node.measured?.width ?? NODE_WIDTH,
            height: node.measured?.height ?? (node.data.nodeHeight as number) ?? 100,
        });
    }

    for (const edge of edges) {
        g.setEdge(edge.source, edge.target);
    }

    dagre.layout(g);

    const layoutedNodes = nodes.map(node => {
        const dagNode = g.node(node.id);
        const width = node.measured?.width ?? NODE_WIDTH;
        const height = node.measured?.height ?? (node.data.nodeHeight as number) ?? 100;
        return {
            ...node,
            position: {
                x: dagNode.x - width / 2,
                y: dagNode.y - height / 2,
            },
        };
    });

    return { nodes: layoutedNodes, edges };
}

// ─── Custom Reference Edge ──────────────────────────────────────────────────────

function ReferenceEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
}: {
    id: string;
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    sourcePosition: Position;
    targetPosition: Position;
}) {
    const { highlightedEdgeIds, setHighlightedEdgeIds } = useContext(HighlightContext);
    const highlighted = highlightedEdgeIds.has(id);

    const [edgePath] = getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 16,
    });

    const handleMouseEnter = useCallback(() => {
        setHighlightedEdgeIds(new Set([id]));
    }, [id, setHighlightedEdgeIds]);

    const handleMouseLeave = useCallback(() => {
        setHighlightedEdgeIds(new Set());
    }, [setHighlightedEdgeIds]);

    return (
        <g
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{ pointerEvents: 'all', cursor: 'pointer' }}
        >
            {/* Invisible wider hit area */}
            <path
                d={edgePath}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                style={{ pointerEvents: 'stroke' }}
            />
            <BaseEdge
                id={id}
                path={edgePath}
                style={{
                    stroke: highlighted ? '#22d3ee' : '#0e7490',
                    strokeWidth: highlighted ? 2.5 : 1.5,
                    strokeDasharray: '6 4',
                    transition: 'stroke 0.15s ease, stroke-width 0.15s ease',
                    filter: highlighted ? 'drop-shadow(0 0 4px rgba(34,211,238,0.5))' : 'none',
                    pointerEvents: 'none',
                }}
                markerEnd={highlighted ? 'url(#reference-arrow-highlight)' : 'url(#reference-arrow)'}
            />
        </g>
    );
}

// ─── Custom Hierarchy Edge ──────────────────────────────────────────────────────

function HierarchyEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
}: {
    id: string;
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    sourcePosition: Position;
    targetPosition: Position;
}) {
    const { highlightedEdgeIds, setHighlightedEdgeIds } = useContext(HighlightContext);
    const highlighted = highlightedEdgeIds.has(id);

    const [edgePath] = getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 16,
    });

    const handleMouseEnter = useCallback(() => {
        setHighlightedEdgeIds(new Set([id]));
    }, [id, setHighlightedEdgeIds]);

    const handleMouseLeave = useCallback(() => {
        setHighlightedEdgeIds(new Set());
    }, [setHighlightedEdgeIds]);

    return (
        <g
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{ pointerEvents: 'all', cursor: 'pointer' }}
        >
            {/* Invisible wider hit area */}
            <path
                d={edgePath}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                style={{ pointerEvents: 'stroke' }}
            />
            <BaseEdge
                id={id}
                path={edgePath}
                style={{
                    stroke: highlighted ? '#8b5cf6' : '#5b21b6',
                    strokeWidth: highlighted ? 3 : 2,
                    transition: 'stroke 0.15s ease, stroke-width 0.15s ease',
                    filter: highlighted ? 'drop-shadow(0 0 4px rgba(139,92,246,0.5))' : 'none',
                    pointerEvents: 'none',
                }}
                markerEnd={highlighted ? 'url(#hierarchy-arrow-highlight)' : 'url(#hierarchy-arrow)'}
            />
        </g>
    );
}

// ─── Custom Collection Node ─────────────────────────────────────────────────────

interface CollectionNodeData {
    collection: FirestoreCollection;
    securityRules: ProjectSecurityRules;
    depth: number;
    path: string;
    nodeHeight: number;
    fieldYOffsets: Record<string, number>;
    hasSubcollections: boolean;
    [key: string]: unknown;
}

const CollectionNode = memo(({ data }: NodeProps<Node<CollectionNodeData>>) => {
    const { collection, securityRules, depth, path } = data;
    const { allEdges, setHighlightedEdgeIds } = useContext(HighlightContext);
    const isRoot = depth === 0;
    const collRules = securityRules.collectionRules[collection.id];
    const hasSecurityRules = collRules && collRules.enabled && collRules.rules.some(r => r.enabled);
    const hasValidation = collection.validationRules?.enabled && collection.fields.length > 0;

    const headerH = depth > 0 ? NODE_HEADER_HEIGHT_WITH_PATH : NODE_HEADER_HEIGHT;
    const headerCenterY = headerH / 2;
    const { fieldYOffsets, hasSubcollections } = data;

    // Collect reference fields for per-field handles
    const refFields = collection.fields.filter(
        f => f.type === 'reference' && f.referenceCollections && f.referenceCollections.length > 0
    );

    // Handle hover: highlight all edges connected to a specific handle
    const handleHandleMouseEnter = useCallback((handleId: string) => {
        const connected = allEdges.filter(
            e => (e.source === collection.id && e.sourceHandle === handleId) ||
                (e.target === collection.id && e.targetHandle === handleId)
        );
        setHighlightedEdgeIds(new Set(connected.map(e => e.id)));
    }, [allEdges, collection.id, setHighlightedEdgeIds]);

    const handleHandleMouseLeave = useCallback(() => {
        setHighlightedEdgeIds(new Set());
    }, [setHighlightedEdgeIds]);

    return (
        <div
            className="rounded-xl border relative"
            style={{
                width: NODE_WIDTH,
                borderColor: isRoot ? 'rgba(139,92,246,0.25)' : 'rgba(34,211,238,0.2)',
                background: 'linear-gradient(170deg, rgba(30,30,58,0.95) 0%, rgba(22,22,42,0.98) 100%)',
                boxShadow: `0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 ${isRoot ? 'rgba(139,92,246,0.12)' : 'rgba(34,211,238,0.1)'}`,
            }}
        >
            {/* ── Hierarchy handles (outside overflow clip) ── */}
            {depth > 0 && (
                <div
                    onMouseEnter={() => handleHandleMouseEnter('hierarchy-target')}
                    onMouseLeave={handleHandleMouseLeave}
                >
                    <Handle
                        type="target"
                        position={Position.Top}
                        id="hierarchy-target"
                        className="!w-2.5 !h-2.5 !rounded-full !border-2 !border-violet-500 !bg-violet-500/40 !min-w-0 !min-h-0 hover:!bg-violet-400/80 hover:!border-violet-400 hover:!scale-150 !transition-all !duration-150"
                    />
                </div>
            )}
            {hasSubcollections && (
                <div
                    onMouseEnter={() => handleHandleMouseEnter('hierarchy-source')}
                    onMouseLeave={handleHandleMouseLeave}
                >
                    <Handle
                        type="source"
                        position={Position.Bottom}
                        id="hierarchy-source"
                        className="!w-2.5 !h-2.5 !rounded-full !border-2 !border-violet-500 !bg-violet-500/40 !min-w-0 !min-h-0 hover:!bg-violet-400/80 hover:!border-violet-400 hover:!scale-150 !transition-all !duration-150"
                    />
                </div>
            )}

            {/* ── Reference handles (outside overflow clip) ── */}
            <div
                onMouseEnter={() => handleHandleMouseEnter('ref-target')}
                onMouseLeave={handleHandleMouseLeave}
            >
                <Handle
                    type="target"
                    position={Position.Left}
                    id="ref-target"
                    style={{ top: headerCenterY }}
                    className="!w-2.5 !h-2.5 !rounded-full !border-2 !border-cyan-400 !bg-cyan-400/40 !min-w-0 !min-h-0 hover:!bg-cyan-300/80 hover:!border-cyan-300 hover:!scale-150 !transition-all !duration-150"
                />
            </div>
            {refFields.map(field => {
                const fieldY = fieldYOffsets[field.id];
                if (fieldY === undefined) return null;
                const handleId = `ref-source-${field.id}`;
                return (
                    <div
                        key={`ref-src-${field.id}`}
                        onMouseEnter={() => handleHandleMouseEnter(handleId)}
                        onMouseLeave={handleHandleMouseLeave}
                    >
                        <Handle
                            type="source"
                            position={Position.Right}
                            id={handleId}
                            style={{ top: fieldY }}
                            className="!w-2.5 !h-2.5 !rounded-full !border-2 !border-cyan-400 !bg-cyan-400/40 !min-w-0 !min-h-0 hover:!bg-cyan-300/80 hover:!border-cyan-300 hover:!scale-150 !transition-all !duration-150"
                        />
                    </div>
                );
            })}

            {/* ── Inner content (clipped to rounded corners) ── */}
            <div className="overflow-hidden rounded-xl">

                {/* Header */}
                <div
                    className="flex items-center gap-2 px-3 py-2.5"
                    style={{
                        background: isRoot
                            ? 'linear-gradient(90deg, rgba(139,92,246,0.15) 0%, rgba(139,92,246,0.04) 100%)'
                            : 'linear-gradient(90deg, rgba(34,211,238,0.12) 0%, rgba(34,211,238,0.03) 100%)',
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}
                >
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isRoot ? 'bg-violet-500' : 'bg-cyan-500'}`} />
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-white/90 truncate">{collection.name}</h3>
                        {path.includes('/') && (
                            <p className="text-[10px] text-white/25 font-mono truncate">{path}</p>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        {hasSecurityRules && <ShieldCheck className="w-3.5 h-3.5 text-amber-400/70" />}
                        {hasValidation && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/70" />}
                    </div>
                </div>

                {/* Fields */}
                {collection.fields.length > 0 && (
                    <div className="px-2 py-1.5">
                        {collection.fields.map(field => {
                            const validations = getFieldValidations(field.id, collection.validationRules, collection.fields);
                            return (
                                <div key={field.id}>
                                    <div className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-white/[0.03] group">
                                        {fieldTypeIcon(field.type)}
                                        <span className="text-xs text-white/70 font-medium truncate flex-1">{field.name}</span>
                                        <span className="text-[10px] text-white/25 font-mono">{fieldTypeBadge(field)}</span>
                                        {!field.isRequired && (
                                            <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400/60 font-medium">?</span>
                                        )}
                                        {field.isRequired && (
                                            <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/10 text-red-400/60 font-medium">!</span>
                                        )}
                                    </div>

                                    {field.description && (
                                        <div className="ml-7 mb-0.5">
                                            <p className="text-[10px] text-white/20 italic truncate">{field.description}</p>
                                        </div>
                                    )}

                                    {field.defaultPreset && field.defaultPreset !== 'none' && (
                                        <div className="ml-7 mb-0.5 flex items-center gap-1">
                                            <span className="text-[9px] text-blue-400/50">default:</span>
                                            <span className="text-[10px] text-blue-300/40 font-mono">
                                                {field.defaultPreset === 'custom' ? field.defaultValue : field.defaultPreset.replace(/^\w+-/, '')}
                                            </span>
                                        </div>
                                    )}

                                    {validations.length > 0 && (
                                        <div className="ml-7 mb-1 space-y-0.5">
                                            {validations.map((v, i) => (
                                                <div key={i} className="flex items-center gap-1.5">
                                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500/50 shrink-0" />
                                                    <span className="text-[10px] text-emerald-300/50 font-mono truncate">{v}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {collection.fields.length === 0 && (
                    <div className="px-3 py-2">
                        <p className="text-[11px] text-white/15 italic">No fields defined</p>
                    </div>
                )}

                {/* Security Rules */}
                {hasSecurityRules && (
                    <div className="border-t border-white/[0.05]">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/[0.04]">
                            <Shield className="w-3 h-3 text-amber-400/60" />
                            <span className="text-[10px] text-amber-300/60 font-semibold uppercase tracking-wider">Security Rules</span>
                        </div>
                        <div className="px-2 pb-1.5">
                            {collRules!.rules.filter(r => r.enabled).map(rule => {
                                const opsLabel = groupOps(rule.operations);
                                const condDesc = getConditionDescriptions(rule.conditionGroup, rule.conditionGroup.type === 'AND' ? ' && ' : ' || ');
                                return (
                                    <div key={rule.id} className="px-1.5 py-1">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] font-semibold text-amber-400/70 uppercase">{opsLabel}</span>
                                            {rule.description && (
                                                <span className="text-[10px] text-white/20 truncate">— {rule.description}</span>
                                            )}
                                        </div>
                                        {condDesc && (
                                            <p className="text-[10px] text-amber-200/30 font-mono mt-0.5 truncate ml-0.5" title={condDesc}>
                                                if: {condDesc}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {collection.description && (
                    <div className="border-t border-white/[0.04] px-3 py-1.5">
                        <p className="text-[10px] text-white/20 italic">{collection.description}</p>
                    </div>
                )}
            </div>{/* end inner clipping div */}
        </div>
    );
});

CollectionNode.displayName = 'CollectionNode';

// ─── Node / Edge Type Registrations ─────────────────────────────────────────────

const nodeTypes: NodeTypes = {
    collection: CollectionNode,
};

const edgeTypes: EdgeTypes = {
    reference: ReferenceEdge,
    hierarchy: HierarchyEdge,
};

// ─── Build React Flow Nodes & Edges from Project Data ───────────────────────────

function buildFlowElements(
    collections: FirestoreCollection[],
    securityRules: ProjectSecurityRules,
): { nodes: Node[]; edges: Edge[] } {
    const flat = flattenCollections(collections);
    const collectionIdSet = new Set(flat.map(f => f.collection.id));

    // Build a set of collections that have subcollections
    const hasSubcollectionsSet = new Set<string>();
    for (const f of flat) {
        if (f.parentId) hasSubcollectionsSet.add(f.parentId);
    }

    // Build nodes
    const nodes: Node[] = flat.map(f => {
        const nodeHeight = computeNodeHeight(f.collection, securityRules, f.depth);
        const offsets = computeFieldYOffsets(f.collection, f.depth);
        // Convert Map to plain object for serialization
        const fieldYOffsets: Record<string, number> = {};
        offsets.forEach((v, k) => { fieldYOffsets[k] = v; });

        return {
            id: f.collection.id,
            type: 'collection',
            position: { x: 0, y: 0 }, // dagre will set this
            data: {
                collection: f.collection,
                securityRules,
                depth: f.depth,
                path: f.path,
                nodeHeight,
                fieldYOffsets,
                hasSubcollections: hasSubcollectionsSet.has(f.collection.id),
            } satisfies CollectionNodeData,
        };
    });

    const edges: Edge[] = [];

    // Hierarchy edges: bottom of parent → top of child
    for (const f of flat) {
        if (f.parentId) {
            edges.push({
                id: `hierarchy-${f.parentId}-${f.collection.id}`,
                source: f.parentId,
                sourceHandle: 'hierarchy-source',
                target: f.collection.id,
                targetHandle: 'hierarchy-target',
                type: 'hierarchy',
                animated: false,
            });
        }
    }

    // Reference edges: right of field → left of target header
    const refEdges = computeReferenceEdges(collections);
    for (let i = 0; i < refEdges.length; i++) {
        const ref = refEdges[i];
        if (!collectionIdSet.has(ref.toCollectionId)) continue;

        edges.push({
            id: `ref-${i}-${ref.fromCollectionId}-${ref.toCollectionId}`,
            source: ref.fromCollectionId,
            sourceHandle: `ref-source-${ref.fromFieldId}`,
            target: ref.toCollectionId,
            targetHandle: 'ref-target',
            type: 'reference',
            animated: false,
        });
    }

    return { nodes, edges };
}

// ─── Main Component (Inner, needs ReactFlowProvider) ────────────────────────────

const FIT_VIEW_OPTIONS = { padding: 0.15, duration: 300 };

function OverviewGraphInner({
    project,
    securityRules,
}: {
    project: { collections: FirestoreCollection[]; name: string };
    securityRules: ProjectSecurityRules;
}) {
    const [highlightedEdgeIds, setHighlightedEdgeIds] = useState<Set<string>>(new Set());
    const [legendOpen, setLegendOpen] = useState(true);

    // Build nodes & edges, then auto-layout with dagre
    const { nodes, edges } = useMemo(() => {
        const { nodes: rawNodes, edges: rawEdges } = buildFlowElements(
            project.collections,
            securityRules,
        );
        if (rawNodes.length === 0) return { nodes: rawNodes, edges: rawEdges };
        return getLayoutedElements(rawNodes, rawEdges);
    }, [project.collections, securityRules]);

    const highlightCtx = useMemo<HighlightCtx>(() => ({
        highlightedEdgeIds,
        setHighlightedEdgeIds,
        allEdges: edges,
    }), [highlightedEdgeIds, edges]);

    const handleNodesChange = useCallback(() => {
        // Readonly — no state changes
    }, []);

    const handleEdgesChange = useCallback(() => {
        // Readonly — no state changes
    }, []);

    if (project.collections.length === 0) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-center">
                    <p className="text-lg text-white/30">No collections yet</p>
                    <p className="text-sm mt-2 text-white/20">Add collections in the Models tab to see them here</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full w-full overview-graph relative">
            <HighlightContext.Provider value={highlightCtx}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    onNodesChange={handleNodesChange}
                    onEdgesChange={handleEdgesChange}
                    fitView
                    fitViewOptions={FIT_VIEW_OPTIONS}
                    nodesDraggable={false}
                    nodesConnectable={false}
                    elementsSelectable={false}
                    edgesFocusable={false}
                    nodesFocusable={false}
                    panOnScroll
                    zoomOnDoubleClick={false}
                    minZoom={0.1}
                    maxZoom={2}
                    proOptions={{ hideAttribution: true }}
                    colorMode="dark"
                >
                    {/* SVG defs for arrow markers */}
                    <svg>
                        <defs>
                            <marker
                                id="reference-arrow"
                                markerWidth="8"
                                markerHeight="6"
                                refX="8"
                                refY="3"
                                orient="auto"
                            >
                                <polygon points="0 0, 8 3, 0 6" fill="#0e7490" />
                            </marker>
                            <marker
                                id="reference-arrow-highlight"
                                markerWidth="8"
                                markerHeight="6"
                                refX="8"
                                refY="3"
                                orient="auto"
                            >
                                <polygon points="0 0, 8 3, 0 6" fill="#22d3ee" />
                            </marker>
                            <marker
                                id="hierarchy-arrow"
                                markerWidth="8"
                                markerHeight="6"
                                refX="8"
                                refY="3"
                                orient="auto"
                            >
                                <polygon points="0 0, 8 3, 0 6" fill="#5b21b6" />
                            </marker>
                            <marker
                                id="hierarchy-arrow-highlight"
                                markerWidth="8"
                                markerHeight="6"
                                refX="8"
                                refY="3"
                                orient="auto"
                            >
                                <polygon points="0 0, 8 3, 0 6" fill="#8b5cf6" />
                            </marker>
                        </defs>
                    </svg>
                    <Background
                        gap={20}
                        size={1}
                        color="rgba(255,255,255,0.03)"
                    />
                    <Controls
                        showInteractive={false}
                        className="!bg-[#1e1e3a]/90 !border-white/[0.06] !rounded-lg !shadow-lg [&>button]:!bg-transparent [&>button]:!border-white/[0.06] [&>button]:!text-white/50 [&>button:hover]:!text-white/80 [&>button:hover]:!bg-white/[0.06]"
                    />
                    <MiniMap
                        nodeColor={(node) => {
                            const depth = (node.data as CollectionNodeData)?.depth ?? 0;
                            return depth === 0 ? 'rgba(139, 92, 246, 0.6)' : 'rgba(34, 211, 238, 0.5)';
                        }}
                        maskColor="rgba(0, 0, 0, 0.6)"
                        className="!bg-[#1e1e3a]/80 !border-white/[0.06] !rounded-lg"
                        pannable
                        zoomable
                    />
                </ReactFlow>
            </HighlightContext.Provider>

            {/* Legend overlay — positioned relative to this container */}
            {legendOpen ? (
                <div className="absolute top-3 right-3 z-20 flex items-center gap-3 bg-[#1e1e3a]/90 backdrop-blur-sm rounded-lg border border-white/[0.06] px-3 py-2">
                    <span className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">Legend</span>
                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-violet-500" /><span className="text-[11px] text-white/40">Collection</span></div>
                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-cyan-500" /><span className="text-[11px] text-white/40">Subcollection</span></div>
                    <div className="flex items-center gap-1.5">
                        <svg width="16" height="6"><line x1="0" y1="3" x2="16" y2="3" stroke="rgba(34,211,238,0.5)" strokeWidth="1.5" strokeDasharray="3,2" /></svg>
                        <span className="text-[11px] text-white/40">Reference</span>
                    </div>
                    <div className="flex items-center gap-1.5"><ShieldCheck className="w-3 h-3 text-amber-400" /><span className="text-[11px] text-white/40">Security Rules</span></div>
                    <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-emerald-400" /><span className="text-[11px] text-white/40">Validation</span></div>
                    <button onClick={() => setLegendOpen(false)} className="ml-1 p-0.5 text-white/20 hover:text-white/50 transition-colors rounded">
                        <X className="w-3 h-3" />
                    </button>
                </div>
            ) : (
                <button
                    onClick={() => setLegendOpen(true)}
                    className="absolute top-3 right-3 z-20 p-2 bg-[#1e1e3a]/90 backdrop-blur-sm rounded-lg border border-white/[0.06] text-white/30 hover:text-white/60 transition-colors"
                    title="Show legend"
                >
                    <Info className="w-4 h-4" />
                </button>
            )}
        </div>
    );
}

// ─── Wrapper with Provider ──────────────────────────────────────────────────────

interface OverviewGraphProps {
    project: {
        collections: FirestoreCollection[];
        name: string;
    };
    securityRules: ProjectSecurityRules;
}

export default function OverviewGraph({ project, securityRules }: OverviewGraphProps) {
    return (
        <ReactFlowProvider>
            <OverviewGraphInner project={project} securityRules={securityRules} />
        </ReactFlowProvider>
    );
}
