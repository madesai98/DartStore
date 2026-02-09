import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
    Users,
    Wifi,
    WifiOff,
    Copy,
    Check,
    ChevronDown,
    ChevronUp,
    LogOut,
    Radio,
    MousePointer2,
    Eye,
    Navigation,
} from 'lucide-react';
import type { PeerUser, SessionStatus, AppView } from '../types/collaboration';

interface CollaborationPanelProps {
    status: SessionStatus;
    sessionId: string | null;
    localUser: PeerUser | null;
    peers: PeerUser[];
    onHost: (username: string) => void;
    onDisconnect: () => void;
    onJumpToUser?: (user: PeerUser) => void;
}

const VIEW_LABELS: Record<AppView, string> = {
    'editor': 'Editor',
    'security-rules': 'Security Rules',
    'data-transformer': 'Transforms',
    'overview': 'Overview',
};

export default function CollaborationPanel({
    status,
    sessionId,
    localUser,
    peers,
    onHost,
    onDisconnect,
    onJumpToUser,
}: CollaborationPanelProps) {
    const [isCollapsed, setIsCollapsed] = useState(true);
    const [username, setUsername] = useState('');
    const [showHostForm, setShowHostForm] = useState(false);
    const [copied, setCopied] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-expand when connected
    useEffect(() => {
        if (status === 'hosting' || status === 'connected') {
            setIsCollapsed(false);
        }
    }, [status]);

    const handleHost = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        if (username.trim()) {
            onHost(username.trim());
            setShowHostForm(false);
        }
    }, [username, onHost]);

    const handleCopyId = useCallback(() => {
        if (sessionId) {
            navigator.clipboard.writeText(sessionId);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }, [sessionId]);

    const allUsers = useMemo(() => {
        const users: PeerUser[] = [];
        if (localUser) users.push(localUser);
        users.push(...peers);
        return users;
    }, [localUser, peers]);

    const isConnected = status === 'hosting' || status === 'connected';
    const statusColor = status === 'hosting' ? 'text-emerald-400' : status === 'connected' ? 'text-blue-400' : status === 'connecting' ? 'text-amber-400' : 'text-white/30';
    const statusLabel = status === 'hosting' ? 'Hosting' : status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting...' : 'Offline';

    return (
        <div className="border-t border-white/[0.06] bg-white/[0.02]">
            {/* Toggle header */}
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.04] transition-all group"
            >
                <div className="flex items-center gap-2">
                    {isConnected ? (
                        <Wifi className={`w-3.5 h-3.5 ${statusColor}`} />
                    ) : (
                        <WifiOff className="w-3.5 h-3.5 text-white/20" />
                    )}
                    <span className="text-[11px] font-semibold text-white/30 uppercase tracking-widest">
                        Collaboration
                    </span>
                    {isConnected && (
                        <span className="text-[10px] bg-white/[0.06] text-white/40 px-1.5 py-0.5 rounded-full">
                            {allUsers.length}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-[10px] ${statusColor}`}>{statusLabel}</span>
                    {isCollapsed ? (
                        <ChevronUp className="w-3.5 h-3.5 text-white/20 group-hover:text-white/40 transition-colors" />
                    ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-white/20 group-hover:text-white/40 transition-colors" />
                    )}
                </div>
            </button>

            {/* Collapsible body */}
            {!isCollapsed && (
                <div className="px-3 pb-3 space-y-3">
                    {/* Not connected: show host option */}
                    {!isConnected && status !== 'connecting' && (
                        <div className="space-y-2">
                            {!showHostForm ? (
                                <button
                                    onClick={() => { setShowHostForm(true); setTimeout(() => inputRef.current?.focus(), 50); }}
                                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs bg-violet-500/20 text-violet-300 rounded-lg hover:bg-violet-500/30 transition-all"
                                >
                                    <Radio className="w-3.5 h-3.5" />
                                    Host Session
                                </button>
                            ) : (
                                <form onSubmit={handleHost} className="space-y-2">
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        placeholder="Your name"
                                        className="w-full px-3 py-2 text-xs bg-white/[0.06] border-0 rounded-lg text-white/80 placeholder-white/20 focus:ring-1 focus:ring-violet-500/30 transition-all"
                                        maxLength={20}
                                        data-collab-ignore
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setShowHostForm(false)}
                                            className="flex-1 px-3 py-1.5 text-xs text-white/40 rounded-lg hover:bg-white/[0.04] hover:text-white/60 transition-all"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={!username.trim()}
                                            className="flex-1 px-3 py-1.5 text-xs bg-violet-500/80 text-white rounded-lg hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                        >
                                            Start hosting
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    )}

                    {/* Connecting state */}
                    {status === 'connecting' && (
                        <div className="flex items-center justify-center gap-2 py-3">
                            <div className="w-3 h-3 border-2 border-amber-400/40 border-t-amber-400 rounded-full animate-spin" />
                            <span className="text-xs text-amber-400/70">Connecting...</span>
                        </div>
                    )}

                    {/* Connected: show session info and users */}
                    {isConnected && (
                        <div className="space-y-3">
                            {/* Session ID */}
                            <div className="flex items-center gap-2 p-2 bg-white/[0.04] rounded-lg">
                                <span className="text-[10px] text-white/30 uppercase tracking-wider">Session</span>
                                <span className="flex-1 text-xs font-mono text-white/70 tracking-widest">{sessionId}</span>
                                <button
                                    onClick={handleCopyId}
                                    className="p-1 hover:bg-white/[0.06] rounded transition-all"
                                    title="Copy session ID"
                                >
                                    {copied ? (
                                        <Check className="w-3 h-3 text-emerald-400" />
                                    ) : (
                                        <Copy className="w-3 h-3 text-white/30 hover:text-white/60" />
                                    )}
                                </button>
                            </div>

                            {/* Connected users */}
                            <div className="space-y-1">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                    <Users className="w-3 h-3 text-white/25" />
                                    <span className="text-[10px] text-white/25 uppercase tracking-wider">
                                        Users ({allUsers.length})
                                    </span>
                                </div>

                                {allUsers.map((user) => {
                                    const isLocal = user.id === localUser?.id;
                                    return (
                                        <div
                                            key={user.id}
                                            className="flex items-center gap-2 p-2 bg-white/[0.03] rounded-lg group"
                                        >
                                            {/* Color dot */}
                                            <div
                                                className="w-2 h-2 rounded-full shrink-0"
                                                style={{ backgroundColor: user.color }}
                                            />

                                            {/* User info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-xs text-white/70 truncate">
                                                        {user.username}
                                                    </span>
                                                    {isLocal && (
                                                        <span className="text-[9px] bg-white/[0.06] text-white/30 px-1 py-0.5 rounded">
                                                            you
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Details */}
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] text-white/20 flex items-center gap-0.5">
                                                        <Eye className="w-2.5 h-2.5" />
                                                        {VIEW_LABELS[user.activeView]}
                                                    </span>
                                                    {user.focusedInput && (
                                                        <span className="text-[10px] text-white/20 flex items-center gap-0.5 truncate max-w-[80px]" title={user.focusedInput.label}>
                                                            <Navigation className="w-2.5 h-2.5" />
                                                            {user.focusedInput.label}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Jump to cursor */}
                                            {!isLocal && user.cursor.elementPath && onJumpToUser && (
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => onJumpToUser(user)}
                                                        className="p-0.5 hover:bg-white/[0.06] rounded transition-all"
                                                        title={`Jump to ${user.username}'s location`}
                                                    >
                                                        <MousePointer2 className="w-3 h-3 text-white/30 hover:text-white/60" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Disconnect button */}
                            <button
                                onClick={onDisconnect}
                                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-red-400/70 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                            >
                                <LogOut className="w-3.5 h-3.5" />
                                Disconnect
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
