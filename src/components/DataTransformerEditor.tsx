import { useState, useMemo, useCallback, memo, useEffect, useRef } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    Handle,
    Position,
    BaseEdge,
    getBezierPath,
    ReactFlowProvider,
    useReactFlow,
    type Node,
    type Edge,
    type NodeTypes,
    type EdgeTypes,
    type NodeProps,
    type Connection,
    type OnNodesChange,
    type OnEdgesChange,
    type OnConnect,
    type IsValidConnection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
    Monitor, Server, BookOpen, Pencil, Search, X, Plus, GripVertical,
    Type, Hash, ToggleLeft, Clock, MapPin, Link2, List, Braces, Ban,
} from 'lucide-react';
import type {
    FirestoreCollection,
    FirestoreField,
    FirestoreFieldType,
    CollectionTransformConfig,
    TransformNodeType,
    TransformNodeData,
    TransformEdgeData,
} from '../types';
import {
    FIELD_TYPE_COLORS,
    TRANSFORM_NODE_REGISTRY,
} from '../types/transformer';
import type { TransformNodeConfig, TransformDirection } from '../types/transformer';
import { generateId } from '../utils/storage';

// ─── Constants ──────────────────────────────────────────────────────────────────

const FIELD_NODE_WIDTH = 280;
const FIELD_ROW_HEIGHT = 32;

// ─── Helpers ────────────────────────────────────────────────────────────────────

function isClientField(field: FirestoreField): boolean {
    return field.visibility?.client !== false;
}

function isServerField(field: FirestoreField): boolean {
    return field.visibility?.server !== false;
}

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

function getHandleColor(type: FirestoreFieldType): string {
    return FIELD_TYPE_COLORS[type] || '#94a3b8';
}



// ─── FieldsNode — displays all fields for one side ─────────────────────────────

interface FieldsNodeData {
    label: string;
    side: 'client' | 'server';
    fields: FirestoreField[];
    direction: TransformDirection;
    isSource: boolean;  // Whether handles are outputs (right side)
    [key: string]: unknown;
}

const FieldsNode = memo(({ data }: NodeProps<Node<FieldsNodeData>>) => {
    const { label, side, fields, isSource } = data;
    const isServer = side === 'server';
    const accentColor = isServer ? 'rgba(52, 211, 153, 0.8)' : 'rgba(139, 92, 246, 0.8)';

    return (
        <div
            className="rounded-xl border relative"
            style={{
                width: FIELD_NODE_WIDTH,
                borderColor: isServer ? 'rgba(52, 211, 153, 0.2)' : 'rgba(139, 92, 246, 0.2)',
                background: 'linear-gradient(170deg, rgba(30,30,58,0.95) 0%, rgba(22,22,42,0.98) 100%)',
                boxShadow: `0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 ${isServer ? 'rgba(52,211,153,0.1)' : 'rgba(139,92,246,0.1)'}`,
            }}
        >
            <div className="overflow-hidden rounded-xl">
                {/* Header */}
                <div
                    className="flex items-center gap-2 px-3 py-3"
                    style={{
                        background: `linear-gradient(90deg, ${isServer ? 'rgba(52,211,153,0.12)' : 'rgba(139,92,246,0.12)'} 0%, transparent 100%)`,
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}
                >
                    {isServer ? <Server className="w-4 h-4" style={{ color: accentColor }} /> : <Monitor className="w-4 h-4" style={{ color: accentColor }} />}
                    <h3 className="text-sm font-semibold text-white/90">{label}</h3>
                    <span className="text-[10px] text-white/25 ml-auto">{fields.length} fields</span>
                </div>

                {/* Fields */}
                {fields.length > 0 ? (
                    <div className="px-1 py-1.5">
                        {fields.map((field) => {
                            const handleColor = getHandleColor(field.type);
                            return (
                                <div key={field.id} className="relative flex items-center" style={{ height: FIELD_ROW_HEIGHT }}>
                                    <Handle
                                        type={isSource ? 'source' : 'target'}
                                        position={isSource ? Position.Right : Position.Left}
                                        id={field.id}
                                        style={{
                                            background: handleColor,
                                            border: `2px solid ${handleColor}`,
                                            width: 10,
                                            height: 10,
                                            zIndex: 10,
                                            top: '50%',
                                        }}
                                        className="!rounded-full !min-w-0 !min-h-0"
                                    />
                                    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-white/[0.03] w-full">
                                        {fieldTypeIcon(field.type)}
                                        <span className="text-xs text-white/70 font-medium truncate flex-1">{field.name}</span>
                                        <span
                                            className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                                            style={{ color: handleColor, background: `${handleColor}15` }}
                                        >
                                            {field.type}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="px-3 py-3">
                        <p className="text-[11px] text-white/15 italic">No fields on this side</p>
                    </div>
                )}
            </div>
        </div>
    );
});
FieldsNode.displayName = 'FieldsNode';

// ─── TransformNode — a single transform operation ──────────────────────────────

interface TransformNodeFlowData {
    transformType: TransformNodeType;
    config: TransformNodeConfig;
    params: Record<string, string>;
    onParamChange: (nodeId: string, key: string, value: string) => void;
    onDelete: (nodeId: string) => void;
    [key: string]: unknown;
}

const TransformNode = memo(({ id, data }: NodeProps<Node<TransformNodeFlowData>>) => {
    const { config, params, onParamChange, onDelete } = data;

    return (
        <div
            className="rounded-xl border relative group"
            style={{
                minWidth: 200,
                borderColor: `${config.color}33`,
                background: 'linear-gradient(170deg, rgba(30,30,58,0.95) 0%, rgba(22,22,42,0.98) 100%)',
                boxShadow: `0 2px 12px rgba(0,0,0,0.2), inset 0 1px 0 ${config.color}18`,
            }}
        >
            {/* Drag handle + header */}
            <div
                className="flex items-center gap-2 px-3 py-2 cursor-grab active:cursor-grabbing"
                style={{
                    background: `linear-gradient(90deg, ${config.color}18 0%, transparent 100%)`,
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '12px 12px 0 0',
                }}
            >
                <GripVertical className="w-3 h-3 text-white/20" />
                <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: config.color }}
                />
                <span className="text-xs font-semibold text-white/80 flex-1 truncate">{config.label}</span>
                <span className="text-[9px] text-white/20 uppercase tracking-wider">{config.category}</span>
                <button
                    onClick={() => onDelete(id)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-white/20 hover:text-red-400 transition-all rounded"
                >
                    <X className="w-3 h-3" />
                </button>
            </div>

            {/* Ports with inline handles */}
            <div className="px-2 py-1">
                {config.inputs.map(input => {
                    const handleColor = getHandleColor(input.type);
                    return (
                        <div key={input.id} className="relative flex items-center gap-1.5 py-1 pl-2" style={{ height: 28 }}>
                            <Handle
                                type="target"
                                position={Position.Left}
                                id={`in-${input.id}`}
                                style={{
                                    background: handleColor,
                                    border: `2px solid ${handleColor}`,
                                    width: 10,
                                    height: 10,
                                    top: '50%',
                                }}
                                className="!rounded-full !min-w-0 !min-h-0"
                            />
                            <span className="text-[10px] text-white/35">←</span>
                            <span className="text-[10px] text-white/50">{input.label}</span>
                        </div>
                    );
                })}
                {config.outputs.map(output => {
                    const handleColor = getHandleColor(output.type);
                    return (
                        <div key={output.id} className="relative flex items-center gap-1.5 py-1 pr-2 justify-end" style={{ height: 28 }}>
                            <Handle
                                type="source"
                                position={Position.Right}
                                id={`out-${output.id}`}
                                style={{
                                    background: handleColor,
                                    border: `2px solid ${handleColor}`,
                                    width: 10,
                                    height: 10,
                                    top: '50%',
                                }}
                                className="!rounded-full !min-w-0 !min-h-0"
                            />
                            <span className="text-[10px] text-white/50">{output.label}</span>
                            <span className="text-[10px] text-white/35">→</span>
                        </div>
                    );
                })}
            </div>

            {/* Params */}
            {config.params && config.params.length > 0 && (
                <div className="px-2 pb-2 space-y-1.5 border-t border-white/[0.04] pt-1.5 mx-1">
                    {config.params.map(param => (
                        <div key={param.key}>
                            <label className="text-[9px] text-white/30 uppercase tracking-wider">{param.label}</label>
                            {param.type === 'select' ? (
                                <select
                                    value={params[param.key] ?? param.defaultValue}
                                    onChange={(e) => onParamChange(id, param.key, e.target.value)}
                                    className="w-full text-[11px] px-1.5 py-1 bg-white/[0.04] border-0 rounded text-white/70 focus:ring-1 focus:ring-white/10"
                                >
                                    {param.options?.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    type={param.type === 'number' ? 'number' : 'text'}
                                    value={params[param.key] ?? param.defaultValue}
                                    onChange={(e) => onParamChange(id, param.key, e.target.value)}
                                    className="w-full text-[11px] px-1.5 py-1 bg-white/[0.04] border-0 rounded text-white/70 placeholder-white/20 focus:ring-1 focus:ring-white/10"
                                    placeholder={param.defaultValue}
                                />
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
});
TransformNode.displayName = 'TransformNode';

// ─── Custom typed edge ──────────────────────────────────────────────────────────

function TypedEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
}: {
    id: string;
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    sourcePosition: Position;
    targetPosition: Position;
    data?: { color?: string };
}) {
    const [edgePath] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    const color = data?.color || '#666';

    return (
        <BaseEdge
            id={id}
            path={edgePath}
            style={{
                stroke: color,
                strokeWidth: 2,
                filter: `drop-shadow(0 0 3px ${color}40)`,
            }}
        />
    );
}

// ─── Node / Edge type registrations ─────────────────────────────────────────────

const nodeTypes: NodeTypes = {
    fieldsNode: FieldsNode,
    transformNode: TransformNode,
};

const edgeTypes: EdgeTypes = {
    typed: TypedEdge,
};

// ─── Node Palette ───────────────────────────────────────────────────────────────

const CATEGORIES = [
    'string', 'number', 'boolean', 'conversion', 'timestamp',
    'array', 'map', 'geopoint', 'reference', 'logic', 'constant', 'custom',
] as const;

const CATEGORY_LABELS: Record<string, string> = {
    string: 'String',
    number: 'Number',
    boolean: 'Boolean',
    conversion: 'Conversion',
    timestamp: 'Timestamp',
    array: 'Array',
    map: 'Map',
    geopoint: 'GeoPoint',
    reference: 'Reference',
    logic: 'Logic',
    constant: 'Constant',
    custom: 'Custom',
};

interface NodePaletteProps {
    onAddNode: (type: TransformNodeType) => void;
    onClose: () => void;
    /** When set, only show nodes whose first input matches this type */
    filterType?: FirestoreFieldType;
}

function NodePalette({ onAddNode, onClose, filterType }: NodePaletteProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const backdropRef = useRef<HTMLDivElement>(null);

    // Auto-focus search input on mount
    useEffect(() => {
        // Small timeout to ensure the modal is rendered before focusing
        const t = setTimeout(() => searchRef.current?.focus(), 50);
        return () => clearTimeout(t);
    }, []);

    const filteredEntries = useMemo(() => {
        const entries = Object.entries(TRANSFORM_NODE_REGISTRY) as [TransformNodeType, TransformNodeConfig][];
        let result = entries;
        // Filter by compatible input type if dragging from a handle
        if (filterType) {
            result = result.filter(([, cfg]) => {
                if (cfg.inputs.length === 0) return false;
                const firstInputType = cfg.inputs[0].type;
                return firstInputType === filterType || firstInputType === 'null' || filterType === 'null';
            });
        }
        if (!searchQuery) return result;
        const q = searchQuery.toLowerCase();
        return result.filter(([, cfg]) =>
            cfg.label.toLowerCase().includes(q) || cfg.category.toLowerCase().includes(q)
        );
    }, [searchQuery, filterType]);

    const grouped = useMemo(() => {
        const map = new Map<string, [TransformNodeType, TransformNodeConfig][]>();
        for (const entry of filteredEntries) {
            const cat = entry[1].category;
            if (!map.has(cat)) map.set(cat, []);
            map.get(cat)!.push(entry);
        }
        return map;
    }, [filteredEntries]);

    const handleAdd = useCallback((type: TransformNodeType) => {
        onAddNode(type);
        onClose();
    }, [onAddNode, onClose]);

    return (
        <div
            ref={backdropRef}
            className="absolute inset-0 z-50 flex items-start justify-center pt-20"
            style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
            onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
        >
            <div
                className="w-80 max-h-[60vh] flex flex-col rounded-xl border border-white/[0.08] shadow-2xl overflow-hidden"
                style={{ background: 'linear-gradient(170deg, rgba(30,30,58,0.98) 0%, rgba(22,22,42,0.99) 100%)' }}
            >
                {/* Search */}
                <div className="px-3 py-2.5 border-b border-white/[0.06]">
                    <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25" />
                        <input
                            ref={searchRef}
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
                            placeholder="Search transforms…"
                            className="w-full pl-8 pr-8 py-2 text-sm bg-white/[0.06] border-0 rounded-lg text-white/80 placeholder-white/25 focus:ring-1 focus:ring-violet-500/30 focus:outline-none"
                        />
                        <button
                            onClick={onClose}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-white/20 hover:text-white/50 transition-colors"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Categories */}
                <div className="flex-1 overflow-y-auto px-2 py-1">
                    {CATEGORIES.map(cat => {
                        const items = grouped.get(cat);
                        if (!items || items.length === 0) return null;
                        const isExpanded = expandedCategory === cat || !!searchQuery;

                        return (
                            <div key={cat} className="mb-1">
                                <button
                                    onClick={() => setExpandedCategory(isExpanded && !searchQuery ? null : cat)}
                                    className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold text-white/40 hover:text-white/60 uppercase tracking-wider transition-colors"
                                >
                                    <div
                                        className="w-1.5 h-1.5 rounded-full"
                                        style={{ background: items[0][1].color }}
                                    />
                                    {CATEGORY_LABELS[cat]}
                                    <span className="text-white/15 ml-auto">{items.length}</span>
                                </button>
                                {isExpanded && (
                                    <div className="space-y-0.5 ml-1 mb-1">
                                        {items.map(([type, cfg]) => (
                                            <button
                                                key={type}
                                                onClick={() => handleAdd(type)}
                                                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-white/60 hover:text-white/80 hover:bg-white/[0.04] rounded-lg transition-all group"
                                            >
                                                <Plus className="w-3 h-3 text-white/15 group-hover:text-white/40 transition-colors" />
                                                <span className="truncate">{cfg.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Footer hint */}
                <div className="px-3 py-1.5 border-t border-white/[0.04] text-center">
                    <span className="text-[10px] text-white/20">Press <kbd className="px-1 py-0.5 rounded bg-white/[0.06] text-white/30 font-mono text-[9px]">Space</kbd> to open · <kbd className="px-1 py-0.5 rounded bg-white/[0.06] text-white/30 font-mono text-[9px]">Esc</kbd> to close</span>
                </div>
            </div>
        </div>
    );
}

// ─── Inner Flow Editor ──────────────────────────────────────────────────────────

interface FlowEditorInnerProps {
    collection: FirestoreCollection;
    direction: TransformDirection;
    config: CollectionTransformConfig;
    onConfigChange: (config: CollectionTransformConfig) => void;
}

function FlowEditorInner({ collection, direction, config, onConfigChange }: FlowEditorInnerProps) {
    const reactFlow = useReactFlow();
    const nodesKey = direction === 'read' ? 'readNodes' as const : 'writeNodes' as const;
    const edgesKey = direction === 'read' ? 'readEdges' as const : 'writeEdges' as const;
    const [showPalette, setShowPalette] = useState(false);
    const [pendingSourceType, setPendingSourceType] = useState<FirestoreFieldType | undefined>(undefined);
    const flowWrapperRef = useRef<HTMLDivElement>(null);

    /** Tracks a pending connection when user drags from an output handle and drops on empty canvas */
    const pendingConnectionRef = useRef<{
        sourceNodeId: string;
        sourceHandleId: string;
        sourceType: FirestoreFieldType;
    } | null>(null);

    const transformNodes = config[nodesKey];
    const transformEdges = config[edgesKey];

    // Determine which fields go on which side
    const serverFields = collection.fields.filter(isServerField);
    const clientFields = collection.fields.filter(isClientField);

    // In read mode: server (left/source) → client (right/target)
    // In write mode: client (left/source) → server (right/target)
    const leftFields = direction === 'read' ? serverFields : clientFields;
    const rightFields = direction === 'read' ? clientFields : serverFields;
    const leftSide = direction === 'read' ? 'server' : 'client';
    const rightSide = direction === 'read' ? 'client' : 'server';
    const leftLabel = direction === 'read' ? 'Firestore (Source)' : 'Client (Source)';
    const rightLabel = direction === 'read' ? 'Client (Target)' : 'Firestore (Target)';

    // Spacebar to open palette
    useEffect(() => {
        const wrapper = flowWrapperRef.current;
        if (!wrapper) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't trigger if user is typing in an input/textarea/select
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if (e.code === 'Space' && !showPalette) {
                e.preventDefault();
                setShowPalette(true);
            }
        };
        wrapper.addEventListener('keydown', handleKeyDown);
        return () => wrapper.removeEventListener('keydown', handleKeyDown);
    }, [showPalette]);

    // Field-node positions — stored in a simple ref-backed state per direction
    const [fieldNodePositions, setFieldNodePositions] = useState<Record<string, { x: number; y: number }>>({});
    const posKey = `${direction}-fieldPositions`;

    // Param change handler
    const handleParamChange = useCallback((nodeId: string, key: string, value: string) => {
        const updatedNodes = config[nodesKey].map(n =>
            n.id === nodeId ? { ...n, params: { ...n.params, [key]: value } } : n
        );
        onConfigChange({ ...config, [nodesKey]: updatedNodes });
    }, [config, nodesKey, onConfigChange]);

    // Delete transform node
    const handleDeleteNode = useCallback((nodeId: string) => {
        const updatedNodes = config[nodesKey].filter(n => n.id !== nodeId);
        const updatedEdges = config[edgesKey].filter(
            e => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId
        );
        onConfigChange({ ...config, [nodesKey]: updatedNodes, [edgesKey]: updatedEdges });
    }, [config, nodesKey, edgesKey, onConfigChange]);

    // Build React Flow nodes
    const flowNodes = useMemo<Node[]>(() => {
        const nodes: Node[] = [];
        const leftNodePos = fieldNodePositions[`${posKey}-left`] ?? { x: 50, y: 50 };
        const rightNodePos = fieldNodePositions[`${posKey}-right`] ?? { x: 700, y: 50 };

        // Left (source) node — draggable
        nodes.push({
            id: `${leftSide}-node`,
            type: 'fieldsNode',
            position: leftNodePos,
            data: {
                label: leftLabel,
                side: leftSide,
                fields: leftFields,
                direction,
                isSource: true,
            } satisfies FieldsNodeData,
        });

        // Right (target) node — draggable
        nodes.push({
            id: `${rightSide}-node`,
            type: 'fieldsNode',
            position: rightNodePos,
            data: {
                label: rightLabel,
                side: rightSide,
                fields: rightFields,
                direction,
                isSource: false,
            } satisfies FieldsNodeData,
        });

        // Transform nodes
        for (const tn of transformNodes) {
            const cfg = TRANSFORM_NODE_REGISTRY[tn.type];
            if (!cfg) continue;
            nodes.push({
                id: tn.id,
                type: 'transformNode',
                position: tn.position,
                data: {
                    transformType: tn.type,
                    config: cfg,
                    params: tn.params,
                    onParamChange: handleParamChange,
                    onDelete: handleDeleteNode,
                } satisfies TransformNodeFlowData,
            });
        }

        return nodes;
    }, [leftSide, rightSide, leftLabel, rightLabel, leftFields, rightFields, direction, transformNodes, handleParamChange, handleDeleteNode, fieldNodePositions, posKey]);

    // Build React Flow edges
    const flowEdges = useMemo<Edge[]>(() => {
        const edges: Edge[] = [];

        // Default edges: connect matching fields between server ↔ client if both sides have the field
        const rightIds = new Set(rightFields.map(f => f.id));

        // Check if there are user-defined edges that override defaults
        const userEdgeTargets = new Set(transformEdges.map(e => `${e.targetNodeId}:${e.targetPortId}`));

        // Default direct field-to-field connections (for fields that exist on both sides)
        for (const field of leftFields) {
            if (rightIds.has(field.id)) {
                const targetKey = `${rightSide}-node:${field.id}`;
                // Only show default edge if no user edge targets this field
                if (!userEdgeTargets.has(targetKey)) {
                    edges.push({
                        id: `default-${field.id}`,
                        source: `${leftSide}-node`,
                        sourceHandle: field.id,
                        target: `${rightSide}-node`,
                        targetHandle: field.id,
                        type: 'typed',
                        data: { color: getHandleColor(field.type) },
                        animated: true,
                    });
                }
            }
        }

        // User-defined edges
        for (const te of transformEdges) {
            // Determine color from source port type
            let color = '#666';
            const sourceNode = transformNodes.find(n => n.id === te.sourceNodeId);
            if (sourceNode) {
                const cfg = TRANSFORM_NODE_REGISTRY[sourceNode.type];
                const port = cfg?.outputs.find(p => p.id === te.sourcePortId.replace('out-', ''));
                if (port) color = getHandleColor(port.type);
            } else {
                // Source is a field node
                const field = [...leftFields, ...rightFields].find(f => f.id === te.sourcePortId);
                if (field) color = getHandleColor(field.type);
            }

            edges.push({
                id: te.id,
                source: te.sourceNodeId,
                sourceHandle: te.sourcePortId,
                target: te.targetNodeId,
                targetHandle: te.targetPortId,
                type: 'typed',
                data: { color },
            });
        }

        return edges;
    }, [leftFields, rightFields, leftSide, rightSide, transformEdges, transformNodes]);

    // Handle node position changes — persist positions for ALL nodes including field nodes
    const onNodesChange: OnNodesChange = useCallback((changes) => {
        let transformNodesUpdated = false;
        const updatedNodes = [...config[nodesKey]];
        const fieldPosUpdates: Record<string, { x: number; y: number }> = {};

        for (const change of changes) {
            if (change.type !== 'position' || !change.position) continue;

            if (change.id === `${leftSide}-node`) {
                fieldPosUpdates[`${posKey}-left`] = change.position;
            } else if (change.id === `${rightSide}-node`) {
                fieldPosUpdates[`${posKey}-right`] = change.position;
            } else {
                const idx = updatedNodes.findIndex(n => n.id === change.id);
                if (idx >= 0) {
                    updatedNodes[idx] = { ...updatedNodes[idx], position: change.position };
                    transformNodesUpdated = true;
                }
            }
        }

        if (Object.keys(fieldPosUpdates).length > 0) {
            setFieldNodePositions((prev: Record<string, { x: number; y: number }>) => ({ ...prev, ...fieldPosUpdates }));
        }
        if (transformNodesUpdated) {
            onConfigChange({ ...config, [nodesKey]: updatedNodes });
        }
    }, [config, nodesKey, onConfigChange, leftSide, rightSide, posKey]);

    const onEdgesChange: OnEdgesChange = useCallback((changes) => {
        // Handle edge removal
        const removeChanges = changes.filter(c => c.type === 'remove');
        if (removeChanges.length > 0) {
            const removeIds = new Set(removeChanges.map(c => c.id));
            const updatedEdges = config[edgesKey].filter(e => !removeIds.has(e.id));
            onConfigChange({ ...config, [edgesKey]: updatedEdges });
        }
    }, [config, edgesKey, onConfigChange]);

    // Double-click edge to delete it
    const onEdgeDoubleClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
        const updatedEdges = config[edgesKey].filter(e => e.id !== edge.id);
        onConfigChange({ ...config, [edgesKey]: updatedEdges });
    }, [config, edgesKey, onConfigChange]);

    const onConnect: OnConnect = useCallback((connection: Connection) => {
        if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return;

        // Single-input constraint: remove any existing edge to the same target handle
        const existingEdges = config[edgesKey].filter(
            e => !(e.targetNodeId === connection.target && e.targetPortId === connection.targetHandle)
        );

        const newEdge: TransformEdgeData = {
            id: `edge-${generateId()}`,
            sourceNodeId: connection.source,
            sourcePortId: connection.sourceHandle,
            targetNodeId: connection.target,
            targetPortId: connection.targetHandle,
        };

        const updatedEdges = [...existingEdges, newEdge];
        onConfigChange({ ...config, [edgesKey]: updatedEdges });
    }, [config, edgesKey, onConfigChange]);

    // Connection validation — only same data types can connect (null type acts as wildcard "any")
    const isValidConnection: IsValidConnection = useCallback((connection) => {
        if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return false;
        // Don't allow self-connections
        if (connection.source === connection.target) return false;

        // Determine types
        let sourceType: FirestoreFieldType | undefined;
        let targetType: FirestoreFieldType | undefined;

        // Source type
        if (connection.source === `${leftSide}-node`) {
            const field = leftFields.find(f => f.id === connection.sourceHandle);
            sourceType = field?.type;
        } else {
            const node = transformNodes.find(n => n.id === connection.source);
            if (node) {
                const cfg = TRANSFORM_NODE_REGISTRY[node.type];
                const portId = connection.sourceHandle?.replace('out-', '');
                const port = cfg?.outputs.find(p => p.id === portId);
                sourceType = port?.type;
            }
        }

        // Target type
        if (connection.target === `${rightSide}-node`) {
            const field = rightFields.find(f => f.id === connection.targetHandle);
            targetType = field?.type;
        } else {
            const node = transformNodes.find(n => n.id === connection.target);
            if (node) {
                const cfg = TRANSFORM_NODE_REGISTRY[node.type];
                const portId = connection.targetHandle?.replace('in-', '');
                const port = cfg?.inputs.find(p => p.id === portId);
                targetType = port?.type;
            }
        }

        if (!sourceType || !targetType) return false;
        // Null type = wildcard, accepts anything
        if (sourceType === 'null' || targetType === 'null') return true;
        return sourceType === targetType;
    }, [leftSide, rightSide, leftFields, rightFields, transformNodes]);

    // Track the source info when a connection drag starts
    const onConnectStart = useCallback((_event: MouseEvent | TouchEvent, params: { nodeId: string | null; handleId: string | null; handleType: string | null }) => {
        if (!params.nodeId || !params.handleId || params.handleType !== 'source') {
            pendingConnectionRef.current = null;
            setPendingSourceType(undefined);
            return;
        }

        // Determine the source port type
        let sourceType: FirestoreFieldType | undefined;
        if (params.nodeId === `${leftSide}-node`) {
            const field = leftFields.find(f => f.id === params.handleId);
            sourceType = field?.type;
        } else {
            const node = transformNodes.find(n => n.id === params.nodeId);
            if (node) {
                const cfg = TRANSFORM_NODE_REGISTRY[node.type];
                const portId = params.handleId?.replace('out-', '');
                const port = cfg?.outputs.find(p => p.id === portId);
                sourceType = port?.type;
            }
        }

        if (sourceType) {
            pendingConnectionRef.current = {
                sourceNodeId: params.nodeId,
                sourceHandleId: params.handleId,
                sourceType,
            };
            setPendingSourceType(sourceType);
        } else {
            pendingConnectionRef.current = null;
            setPendingSourceType(undefined);
        }
    }, [leftSide, leftFields, transformNodes]);

    // When a connection drag ends on empty space, open the palette
    const onConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
        const pending = pendingConnectionRef.current;
        if (!pending) return;

        // Check if the drop target is the canvas pane (empty space), not a handle or node
        const target = event.target as HTMLElement;
        const isPane = target.closest('.react-flow__pane') !== null;
        // If connected to a valid target, onConnect will fire and we shouldn't open the palette
        // We detect "dropped on nothing" by checking if target is the pane background
        if (isPane) {
            setShowPalette(true);
        } else {
            pendingConnectionRef.current = null;
            setPendingSourceType(undefined);
        }
    }, []);

    // Add transform node (with optional auto-connect from pending connection)
    const handleAddNode = useCallback((type: TransformNodeType) => {
        const viewport = reactFlow.getViewport();
        const newNode: TransformNodeData = {
            id: generateId(),
            type,
            position: {
                x: (400 - viewport.x) / viewport.zoom,
                y: (200 - viewport.y) / viewport.zoom,
            },
            params: {},
        };
        // Set default params
        const cfg = TRANSFORM_NODE_REGISTRY[type];
        if (cfg?.params) {
            for (const p of cfg.params) {
                newNode.params[p.key] = p.defaultValue;
            }
        }

        let updatedEdges = config[edgesKey];

        // If there's a pending connection from a drag, auto-connect to the new node's first input
        const pending = pendingConnectionRef.current;
        if (pending) {
            const nodeCfg = TRANSFORM_NODE_REGISTRY[type];
            if (nodeCfg && nodeCfg.inputs.length > 0) {
                const targetHandleId = `in-${nodeCfg.inputs[0].id}`;
                // Remove any existing edge to the same target handle
                updatedEdges = updatedEdges.filter(
                    e => !(e.targetNodeId === newNode.id && e.targetPortId === targetHandleId)
                );
                const newEdge: TransformEdgeData = {
                    id: `edge-${generateId()}`,
                    sourceNodeId: pending.sourceNodeId,
                    sourcePortId: pending.sourceHandleId,
                    targetNodeId: newNode.id,
                    targetPortId: targetHandleId,
                };
                updatedEdges = [...updatedEdges, newEdge];
            }
            pendingConnectionRef.current = null;
            setPendingSourceType(undefined);
        }

        onConfigChange({
            ...config,
            [nodesKey]: [...config[nodesKey], newNode],
            [edgesKey]: updatedEdges,
        });
    }, [config, nodesKey, edgesKey, onConfigChange, reactFlow]);

    return (
        <div ref={flowWrapperRef} className="relative h-full w-full" tabIndex={0}>
            {/* React Flow canvas */}
            <ReactFlow
                nodes={flowNodes}
                edges={flowEdges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onConnectStart={onConnectStart}
                onConnectEnd={onConnectEnd}
                onEdgeDoubleClick={onEdgeDoubleClick}
                isValidConnection={isValidConnection}
                fitView
                fitViewOptions={{ padding: 0.2, duration: 300 }}
                panOnScroll
                zoomOnDoubleClick={false}
                minZoom={0.3}
                maxZoom={2}
                proOptions={{ hideAttribution: true }}
                colorMode="dark"
                defaultEdgeOptions={{ type: 'typed' }}
                snapToGrid
                snapGrid={[10, 10]}
            >
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
                    nodeColor={() => 'rgba(139, 92, 246, 0.5)'}
                    maskColor="rgba(0, 0, 0, 0.6)"
                    className="!bg-[#1e1e3a]/80 !border-white/[0.06] !rounded-lg"
                    pannable
                    zoomable
                />
            </ReactFlow>

            {/* Floating palette modal — triggered by spacebar */}
            {showPalette && (
                <NodePalette
                    onAddNode={handleAddNode}
                    onClose={() => {
                        setShowPalette(false);
                        pendingConnectionRef.current = null;
                        setPendingSourceType(undefined);
                    }}
                    filterType={pendingSourceType}
                />
            )}
        </div>
    );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

interface DataTransformerEditorProps {
    collection: FirestoreCollection;
    transformConfig: CollectionTransformConfig;
    onTransformConfigChange: (config: CollectionTransformConfig) => void;
}

export default function DataTransformerEditor({
    collection,
    transformConfig,
    onTransformConfigChange,
}: DataTransformerEditorProps) {
    const [direction, setDirection] = useState<TransformDirection>('read');
    const config = transformConfig;

    return (
        <div className="h-full flex flex-col">
            {/* Toolbar */}
            <div className="px-4 py-2.5 border-b border-white/[0.04] flex items-center gap-4 flex-wrap">
                {/* Collection name */}
                <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-violet-500" />
                    <span className="text-sm font-semibold text-white/80">{collection.name}</span>
                </div>

                <div className="w-px h-5 bg-white/[0.06]" />

                {/* Read / Write switcher */}
                <div className="flex items-center bg-white/[0.04] rounded-lg overflow-hidden">
                    <button
                        onClick={() => setDirection('read')}
                        className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium transition-all duration-200 ${direction === 'read'
                            ? 'bg-emerald-500/80 text-white'
                            : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
                            }`}
                    >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Read</span>
                    </button>
                    <button
                        onClick={() => setDirection('write')}
                        className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium transition-all duration-200 ${direction === 'write'
                            ? 'bg-orange-500/80 text-white'
                            : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
                            }`}
                    >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Write</span>
                    </button>
                </div>

                <div className="flex-1" />

                {/* Client / Server toggles */}
                <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                        <button
                            onClick={() => onTransformConfigChange({ ...config, clientEnabled: !config.clientEnabled })}
                            className={`w-8 h-4.5 rounded-full transition-colors duration-200 relative ${config.clientEnabled ? 'bg-violet-500' : 'bg-white/[0.1]'
                                }`}
                        >
                            <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform duration-200 ${config.clientEnabled ? 'translate-x-4' : 'translate-x-0.5'
                                }`} />
                        </button>
                        <Monitor className="w-3.5 h-3.5 text-violet-400/70" />
                        <span className="text-xs text-white/50">Client</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                        <button
                            onClick={() => onTransformConfigChange({ ...config, serverEnabled: !config.serverEnabled })}
                            className={`w-8 h-4.5 rounded-full transition-colors duration-200 relative ${config.serverEnabled ? 'bg-emerald-500' : 'bg-white/[0.1]'
                                }`}
                        >
                            <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform duration-200 ${config.serverEnabled ? 'translate-x-4' : 'translate-x-0.5'
                                }`} />
                        </button>
                        <Server className="w-3.5 h-3.5 text-emerald-400/70" />
                        <span className="text-xs text-white/50">Server</span>
                    </label>
                </div>
            </div>

            {/* Flow editor */}
            <div className="flex-1 overflow-hidden">
                <ReactFlowProvider>
                    <FlowEditorInner
                        collection={collection}
                        direction={direction}
                        config={config}
                        onConfigChange={onTransformConfigChange}
                    />
                </ReactFlowProvider>
            </div>
        </div>
    );
}
