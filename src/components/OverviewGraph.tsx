import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
    ZoomIn, ZoomOut, Maximize2,
    Shield, ShieldCheck, CheckCircle2,
    Type, Hash, ToggleLeft, Clock, MapPin, Link2, List, Braces, Ban,
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
const NODE_HEADER_HEIGHT = 44;
const FIELD_ROW_HEIGHT = 28;
const VALIDATION_ROW_HEIGHT = 22;
const SECURITY_HEADER_HEIGHT = 32;
const SECURITY_RULE_HEIGHT = 24;
const NODE_PADDING_BOTTOM = 12;
const NODE_GAP_X = 100;
const NODE_GAP_Y = 60;

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
    if (field.type === 'reference' && field.referenceCollection) label = `ref → ${field.referenceCollection}`;
    return label;
}

// ─── Validation Helpers ─────────────────────────────────────────────────────────

function getFieldValidations(fieldId: string, rules: ValidationRules | undefined, fields: FirestoreField[]): string[] {
    if (!rules || !rules.enabled) return [];
    const items = collectConditionsForField(rules.rootGroup, fieldId, fields);
    return items;
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

// ─── Layout Engine ──────────────────────────────────────────────────────────────

interface NodeLayout {
    collection: FirestoreCollection;
    x: number;
    y: number;
    width: number;
    height: number;
    parentId: string | null;
    depth: number;
    path: string;
}

function computeNodeHeight(
    collection: FirestoreCollection,
    securityRules: ProjectSecurityRules,
): number {
    let h = NODE_HEADER_HEIGHT;

    // Fields
    for (const field of collection.fields) {
        h += FIELD_ROW_HEIGHT;
        // Validation rows per field
        const vals = getFieldValidations(field.id, collection.validationRules, collection.fields);
        h += vals.length * VALIDATION_ROW_HEIGHT;
    }

    // Security rules section
    const collRules = securityRules.collectionRules[collection.id];
    if (collRules && collRules.enabled && collRules.rules.length > 0) {
        h += SECURITY_HEADER_HEIGHT;
        for (const rule of collRules.rules) {
            if (!rule.enabled) continue;
            h += SECURITY_RULE_HEIGHT;
            // One line per distinct condition
            const condCount = countConditions(rule.conditionGroup);
            h += Math.min(condCount, 4) * VALIDATION_ROW_HEIGHT;
        }
    }

    h += NODE_PADDING_BOTTOM;
    return Math.max(h, 80);
}

function layoutCollections(
    collections: FirestoreCollection[],
    securityRules: ProjectSecurityRules,
    parentId: string | null = null,
    depth: number = 0,
    startY: number = 40,
    path: string = '',
): { nodes: NodeLayout[]; totalHeight: number } {
    const nodes: NodeLayout[] = [];
    let currentY = startY;
    const x = 40 + depth * (NODE_WIDTH + NODE_GAP_X);

    for (const collection of collections) {
        const collPath = path ? `${path}/${collection.name}` : collection.name;
        const height = computeNodeHeight(collection, securityRules);
        nodes.push({ collection, x, y: currentY, width: NODE_WIDTH, height, parentId, depth, path: collPath });

        let childMaxY = currentY + height + NODE_GAP_Y;

        if (collection.subcollections.length > 0) {
            const { nodes: childNodes, totalHeight: childH } = layoutCollections(
                collection.subcollections,
                securityRules,
                collection.id,
                depth + 1,
                currentY,
                collPath,
            );
            nodes.push(...childNodes);
            childMaxY = Math.max(childMaxY, currentY + childH);
        }

        currentY = childMaxY;
    }

    return { nodes, totalHeight: currentY - startY };
}

// ─── Edge Drawing ───────────────────────────────────────────────────────────────

interface Edge {
    fromId: string;
    toId: string;
}

function computeEdges(collections: FirestoreCollection[], parentId: string | null = null): Edge[] {
    const edges: Edge[] = [];
    for (const c of collections) {
        if (parentId) edges.push({ fromId: parentId, toId: c.id });
        if (c.subcollections.length > 0) edges.push(...computeEdges(c.subcollections, c.id));
    }
    return edges;
}

function renderEdgePath(from: NodeLayout, to: NodeLayout): string {
    const x1 = from.x + from.width;
    const y1 = from.y + NODE_HEADER_HEIGHT / 2;
    const x2 = to.x;
    const y2 = to.y + NODE_HEADER_HEIGHT / 2;
    const cx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
}

// ─── Component ──────────────────────────────────────────────────────────────────

interface OverviewGraphProps {
    project: {
        collections: FirestoreCollection[];
        name: string;
    };
    securityRules: ProjectSecurityRules;
}

export default function OverviewGraph({ project, securityRules }: OverviewGraphProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [dragging, setDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

    // Layout
    const { nodes, edges, canvasWidth, canvasHeight } = useMemo(() => {
        const { nodes } = layoutCollections(project.collections, securityRules);
        const edges = computeEdges(project.collections);
        const canvasWidth = nodes.reduce((m, n) => Math.max(m, n.x + n.width), 0) + 80;
        const canvasHeight = nodes.reduce((m, n) => Math.max(m, n.y + n.height), 0) + 80;
        return { nodes, edges, canvasWidth, canvasHeight };
    }, [project.collections, securityRules]);

    // Auto-fit on first load
    useEffect(() => {
        if (containerRef.current && nodes.length > 0) {
            const cw = containerRef.current.clientWidth;
            const ch = containerRef.current.clientHeight;
            const scaleX = cw / (canvasWidth + 40);
            const scaleY = ch / (canvasHeight + 40);
            const scale = Math.min(scaleX, scaleY, 1);
            const offsetX = (cw - canvasWidth * scale) / 2;
            const offsetY = (ch - canvasHeight * scale) / 2;
            setZoom(scale);
            setPan({ x: offsetX, y: offsetY });
        }
    }, [nodes.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // Pan handlers
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;
        setDragging(true);
        dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }, [pan]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!dragging) return;
        setPan({
            x: dragStart.current.panX + (e.clientX - dragStart.current.x),
            y: dragStart.current.panY + (e.clientY - dragStart.current.y),
        });
    }, [dragging]);

    const handleMouseUp = useCallback(() => setDragging(false), []);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom(z => Math.min(Math.max(z * delta, 0.15), 3));
    }, []);

    const handleZoomIn = () => setZoom(z => Math.min(z * 1.2, 3));
    const handleZoomOut = () => setZoom(z => Math.max(z * 0.8, 0.15));
    const handleFitView = () => {
        if (!containerRef.current) return;
        const cw = containerRef.current.clientWidth;
        const ch = containerRef.current.clientHeight;
        const scaleX = cw / (canvasWidth + 40);
        const scaleY = ch / (canvasHeight + 40);
        const scale = Math.min(scaleX, scaleY, 1);
        const offsetX = (cw - canvasWidth * scale) / 2;
        const offsetY = (ch - canvasHeight * scale) / 2;
        setZoom(scale);
        setPan({ x: offsetX, y: offsetY });
    };

    const nodeMap = useMemo(() => {
        const m = new Map<string, NodeLayout>();
        nodes.forEach(n => m.set(n.collection.id, n));
        return m;
    }, [nodes]);

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
        <div className="h-full flex flex-col relative select-none">
            {/* Toolbar */}
            <div className="absolute top-4 left-4 z-20 flex items-center gap-1 bg-[#1e1e3a]/90 backdrop-blur-sm rounded-lg border border-white/[0.06] p-1">
                <button onClick={handleZoomIn} className="p-1.5 text-white/50 hover:text-white/80 hover:bg-white/[0.06] rounded-md transition" title="Zoom In">
                    <ZoomIn className="w-4 h-4" />
                </button>
                <button onClick={handleZoomOut} className="p-1.5 text-white/50 hover:text-white/80 hover:bg-white/[0.06] rounded-md transition" title="Zoom Out">
                    <ZoomOut className="w-4 h-4" />
                </button>
                <div className="w-px h-5 bg-white/10 mx-0.5" />
                <button onClick={handleFitView} className="p-1.5 text-white/50 hover:text-white/80 hover:bg-white/[0.06] rounded-md transition" title="Fit View">
                    <Maximize2 className="w-4 h-4" />
                </button>
                <div className="w-px h-5 bg-white/10 mx-0.5" />
                <span className="text-[11px] text-white/30 px-2 font-mono">{Math.round(zoom * 100)}%</span>
            </div>

            {/* Legend */}
            <div className="absolute top-4 right-4 z-20 flex items-center gap-3 bg-[#1e1e3a]/90 backdrop-blur-sm rounded-lg border border-white/[0.06] px-3 py-2">
                <span className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">Legend</span>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-violet-500" /><span className="text-[11px] text-white/40">Collection</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-cyan-500" /><span className="text-[11px] text-white/40">Subcollection</span></div>
                <div className="flex items-center gap-1.5"><ShieldCheck className="w-3 h-3 text-amber-400" /><span className="text-[11px] text-white/40">Security Rules</span></div>
                <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-emerald-400" /><span className="text-[11px] text-white/40">Validation</span></div>
            </div>

            {/* Canvas */}
            <div
                ref={containerRef}
                className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
            >
                <div
                    style={{
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                        transformOrigin: '0 0',
                        width: canvasWidth,
                        height: canvasHeight,
                        position: 'relative',
                    }}
                >
                    {/* SVG Edges */}
                    <svg
                        width={canvasWidth}
                        height={canvasHeight}
                        className="absolute inset-0 pointer-events-none"
                        style={{ overflow: 'visible' }}
                    >
                        <defs>
                            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                                <polygon points="0 0, 8 3, 0 6" fill="rgba(139,92,246,0.35)" />
                            </marker>
                        </defs>
                        {edges.map(edge => {
                            const from = nodeMap.get(edge.fromId);
                            const to = nodeMap.get(edge.toId);
                            if (!from || !to) return null;
                            return (
                                <path
                                    key={`${edge.fromId}-${edge.toId}`}
                                    d={renderEdgePath(from, to)}
                                    fill="none"
                                    stroke="rgba(139,92,246,0.25)"
                                    strokeWidth={2}
                                    markerEnd="url(#arrowhead)"
                                />
                            );
                        })}
                    </svg>

                    {/* Nodes */}
                    {nodes.map(node => (
                        <CollectionNode
                            key={node.collection.id}
                            node={node}
                            securityRules={securityRules}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Collection Node ────────────────────────────────────────────────────────────

function CollectionNode({
    node,
    securityRules,
}: {
    node: NodeLayout;
    securityRules: ProjectSecurityRules;
}) {
    const { collection, x, y, width, height, depth, path } = node;
    const isRoot = depth === 0;
    const collRules = securityRules.collectionRules[collection.id];
    const hasSecurityRules = collRules && collRules.enabled && collRules.rules.some(r => r.enabled);
    const hasValidation = collection.validationRules?.enabled && collection.fields.length > 0;

    return (
        <div
            className="absolute rounded-xl border overflow-hidden"
            style={{
                left: x,
                top: y,
                width,
                minHeight: height,
                borderColor: isRoot ? 'rgba(139,92,246,0.25)' : 'rgba(34,211,238,0.2)',
                background: 'linear-gradient(170deg, rgba(30,30,58,0.95) 0%, rgba(22,22,42,0.98) 100%)',
                boxShadow: `0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 ${isRoot ? 'rgba(139,92,246,0.12)' : 'rgba(34,211,238,0.1)'}`,
            }}
        >
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

                                {/* Field description */}
                                {field.description && (
                                    <div className="ml-7 mb-0.5">
                                        <p className="text-[10px] text-white/20 italic truncate">{field.description}</p>
                                    </div>
                                )}

                                {/* Default value */}
                                {field.defaultPreset && field.defaultPreset !== 'none' && (
                                    <div className="ml-7 mb-0.5 flex items-center gap-1">
                                        <span className="text-[9px] text-blue-400/50">default:</span>
                                        <span className="text-[10px] text-blue-300/40 font-mono">
                                            {field.defaultPreset === 'custom' ? field.defaultValue : field.defaultPreset.replace(/^\w+-/, '')}
                                        </span>
                                    </div>
                                )}

                                {/* Per-field validations */}
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

            {/* Collection description */}
            {collection.description && (
                <div className="border-t border-white/[0.04] px-3 py-1.5">
                    <p className="text-[10px] text-white/20 italic">{collection.description}</p>
                </div>
            )}
        </div>
    );
}
