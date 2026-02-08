import { useState } from 'react';
import { Plus, Trash2, FolderOpen, ShieldCheck, ShieldX } from 'lucide-react';
import type { FirestoreCollection, ProjectSecurityRules, CollectionSecurityRules } from '../types';
import type { PeerUser, SessionStatus } from '../types/collaboration';
import { generateId } from '../utils/storage';
import CollaborationPanel from './CollaborationPanel';

interface CollaborationProps {
    status: SessionStatus;
    sessionId: string | null;
    localUser: PeerUser | null;
    peers: PeerUser[];
    onHost: (username: string) => void;
    onDisconnect: () => void;
    onJumpToUser?: (user: PeerUser) => void;
}

type SidebarMode = 'default' | 'security-rules';

interface SidebarProps {
    collections: FirestoreCollection[];
    selectedCollectionId: string | null;
    onSelectCollection: (id: string) => void;
    onAddCollection?: (collection: FirestoreCollection) => void;
    onAddSubcollection?: (parentId: string, collection: FirestoreCollection) => void;
    onDeleteCollection?: (id: string) => void;
    collaboration?: CollaborationProps;
    readOnly?: boolean;
    title?: string;
    mode?: SidebarMode;
    securityRules?: ProjectSecurityRules;
}

export default function Sidebar({
    collections,
    selectedCollectionId,
    onSelectCollection,
    onAddCollection,
    onAddSubcollection,
    onDeleteCollection,
    collaboration,
    readOnly = false,
    title = 'Collections',
    mode = 'default',
    securityRules,
}: SidebarProps) {
    const isSecurityMode = mode === 'security-rules';
    const [showNewCollection, setShowNewCollection] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState('');
    const [newCollectionDesc, setNewCollectionDesc] = useState('');
    const [showNewSubcollectionFor, setShowNewSubcollectionFor] = useState<string | null>(null);
    const [newSubcollectionName, setNewSubcollectionName] = useState('');
    const [newSubcollectionDesc, setNewSubcollectionDesc] = useState('');

    const handleCreateCollection = (e: React.FormEvent) => {
        e.preventDefault();
        if (newCollectionName.trim() && onAddCollection) {
            const collection: FirestoreCollection = {
                id: generateId(),
                name: newCollectionName.trim(),
                description: newCollectionDesc.trim() || undefined,
                fields: [],
                subcollections: [],
            };
            onAddCollection(collection);
            setNewCollectionName('');
            setNewCollectionDesc('');
            setShowNewCollection(false);
        }
    };

    const handleCreateSubcollection = (e: React.FormEvent, parentId: string) => {
        e.preventDefault();
        if (newSubcollectionName.trim() && onAddSubcollection) {
            const collection: FirestoreCollection = {
                id: generateId(),
                name: newSubcollectionName.trim(),
                description: newSubcollectionDesc.trim() || undefined,
                fields: [],
                subcollections: [],
            };
            onAddSubcollection(parentId, collection);
            setNewSubcollectionName('');
            setNewSubcollectionDesc('');
            setShowNewSubcollectionFor(null);
        }
    };

    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const handleDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirmDeleteId === id) {
            onDeleteCollection?.(id);
            setConfirmDeleteId(null);
        } else {
            setConfirmDeleteId(id);
        }
    };

    const getCollectionRuleStatus = (collectionId: string): { hasRules: boolean; ruleCount: number; applyToSub: boolean } => {
        if (!securityRules) return { hasRules: false, ruleCount: 0, applyToSub: false };
        const rules: CollectionSecurityRules | undefined = securityRules.collectionRules[collectionId];
        if (!rules || !rules.enabled) return { hasRules: false, ruleCount: 0, applyToSub: rules?.applyToSubcollections ?? false };
        const ruleCount = rules.rules.filter(r => r.enabled).length;
        return { hasRules: ruleCount > 0, ruleCount, applyToSub: rules.applyToSubcollections };
    };

    const renderCollectionNode = (collection: FirestoreCollection, depth: number) => {
        const isSelected = selectedCollectionId === collection.id;
        const subcollectionCount = collection.subcollections.length;
        const ruleStatus = isSecurityMode ? getCollectionRuleStatus(collection.id) : null;

        return (
            <div key={collection.id}>
                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectCollection(collection.id)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onSelectCollection(collection.id);
                        }
                    }}
                    className={`w-full text-left rounded-xl transition-all duration-200 group cursor-pointer ${isSelected
                        ? 'bg-white/[0.08] text-white/90'
                        : 'hover:bg-white/[0.04] text-white/50'
                        }`}
                    style={{ paddingLeft: 14 + depth * 12, paddingRight: 12, paddingTop: 10, paddingBottom: 10 }}
                >
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                                {isSecurityMode && ruleStatus && (
                                    ruleStatus.hasRules ? (
                                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400/60 flex-shrink-0" />
                                    ) : (
                                        <ShieldX className="w-3.5 h-3.5 text-white/15 flex-shrink-0" />
                                    )
                                )}
                                <span className="font-medium truncate text-sm">{collection.name}</span>
                                {isSecurityMode && ruleStatus && ruleStatus.ruleCount > 0 && (
                                    <span className="text-[10px] font-medium bg-amber-500/15 text-amber-300/60 px-1.5 py-0.5 rounded-md flex-shrink-0">
                                        {ruleStatus.ruleCount}
                                    </span>
                                )}
                            </div>
                            {collection.description && (
                                <div className="text-xs text-white/25 truncate mt-0.5">
                                    {collection.description}
                                </div>
                            )}
                            {!isSecurityMode && (
                                <div className="text-xs text-white/20 mt-1">
                                    {collection.fields.length} field{collection.fields.length !== 1 ? 's' : ''}
                                    {subcollectionCount > 0 && (
                                        <span> · {subcollectionCount} subcollection{subcollectionCount !== 1 ? 's' : ''}</span>
                                    )}
                                </div>
                            )}
                        </div>
                        {!readOnly && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowNewSubcollectionFor(collection.id);
                                        setNewSubcollectionName('');
                                        setNewSubcollectionDesc('');
                                    }}
                                    className="p-1 hover:bg-white/[0.06] text-violet-400/70 rounded-lg transition-all"
                                    title="Add subcollection"
                                    type="button"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={(e) => handleDelete(e, collection.id)}
                                    onBlur={() => setConfirmDeleteId(null)}
                                    className={`p-1 rounded-lg transition-all ${confirmDeleteId === collection.id
                                        ? 'bg-red-500/20 text-red-400'
                                        : 'hover:bg-red-500/10 text-red-400/60'
                                        }`}
                                    title={confirmDeleteId === collection.id ? 'Click again to confirm' : 'Delete collection'}
                                    type="button"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {!readOnly && showNewSubcollectionFor === collection.id && (
                    <form
                        onSubmit={(e) => handleCreateSubcollection(e, collection.id)}
                        className="mt-2 ml-4 mr-2 space-y-2 p-3 bg-white/[0.04] rounded-xl"
                    >
                        <input
                            type="text"
                            value={newSubcollectionName}
                            onChange={(e) => setNewSubcollectionName(e.target.value)}
                            placeholder="Subcollection name"
                            className="w-full px-3 py-2 text-sm bg-white/[0.06] border-0 rounded-lg text-white/80 placeholder-white/20 focus:ring-1 focus:ring-violet-500/30 transition-all"
                            autoFocus
                        />
                        <input
                            type="text"
                            value={newSubcollectionDesc}
                            onChange={(e) => setNewSubcollectionDesc(e.target.value)}
                            placeholder="Description (optional)"
                            className="w-full px-3 py-2 text-sm bg-white/[0.06] border-0 rounded-lg text-white/80 placeholder-white/20 focus:ring-1 focus:ring-violet-500/30 transition-all"
                        />
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowNewSubcollectionFor(null);
                                    setNewSubcollectionName('');
                                    setNewSubcollectionDesc('');
                                }}
                                className="flex-1 px-3 py-1.5 text-sm text-white/40 rounded-lg hover:bg-white/[0.04] hover:text-white/60 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="flex-1 px-3 py-1.5 text-sm bg-violet-500/80 text-white rounded-lg hover:bg-violet-500 transition-all"
                            >
                                Create
                            </button>
                        </div>
                    </form>
                )}

                {collection.subcollections.length > 0 && !(isSecurityMode && ruleStatus?.applyToSub) && (
                    <div className="mt-1 ml-3 pl-2 border-l border-white/5 space-y-0.5">
                        {collection.subcollections.map((subcollection) => renderCollectionNode(subcollection, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <aside className="w-64 bg-white/[0.02] flex flex-col">
            <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-widest">
                        {title}
                    </h2>
                    {!readOnly && onAddCollection && (
                        <button
                            onClick={() => setShowNewCollection(true)}
                            className="p-1.5 hover:bg-white/[0.06] text-violet-400/70 rounded-lg transition-all duration-200"
                            title="Add Collection"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {!readOnly && showNewCollection && (
                    <form onSubmit={handleCreateCollection} className="space-y-2 mb-3 p-3 bg-white/[0.04] rounded-xl">
                        <input
                            type="text"
                            value={newCollectionName}
                            onChange={(e) => setNewCollectionName(e.target.value)}
                            placeholder="Collection name"
                            className="w-full px-3 py-2 text-sm bg-white/[0.06] border-0 rounded-lg text-white/80 placeholder-white/20 focus:ring-1 focus:ring-violet-500/30 transition-all"
                            autoFocus
                        />
                        <input
                            type="text"
                            value={newCollectionDesc}
                            onChange={(e) => setNewCollectionDesc(e.target.value)}
                            placeholder="Description (optional)"
                            className="w-full px-3 py-2 text-sm bg-white/[0.06] border-0 rounded-lg text-white/80 placeholder-white/20 focus:ring-1 focus:ring-violet-500/30 transition-all"
                        />
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowNewCollection(false);
                                    setNewCollectionName('');
                                    setNewCollectionDesc('');
                                }}
                                className="flex-1 px-3 py-1.5 text-sm text-white/40 rounded-lg hover:bg-white/[0.04] hover:text-white/60 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="flex-1 px-3 py-1.5 text-sm bg-violet-500/80 text-white rounded-lg hover:bg-violet-500 transition-all"
                            >
                                Create
                            </button>
                        </div>
                    </form>
                )}
            </div>

            <div className="flex-1 overflow-y-auto px-2">
                {collections.length === 0 ? (
                    <div className="p-8 text-center">
                        <FolderOpen className="w-10 h-10 mx-auto mb-3 text-white/10" />
                        <p className="text-sm text-white/25">No collections yet</p>
                        <p className="text-xs mt-1 text-white/15">Click + to create one</p>
                    </div>
                ) : (
                    <div className="space-y-0.5">
                        {collections.map((collection) => renderCollectionNode(collection, 0))}
                    </div>
                )}
            </div>

            {/* Collaboration panel pinned to bottom */}
            {collaboration && (
                <CollaborationPanel
                    status={collaboration.status}
                    sessionId={collaboration.sessionId}
                    localUser={collaboration.localUser}
                    peers={collaboration.peers}
                    onHost={collaboration.onHost}
                    onDisconnect={collaboration.onDisconnect}
                    onJumpToUser={collaboration.onJumpToUser}
                />
            )}
        </aside>
    );
}
