import { useState, useEffect, useRef, useCallback } from 'react';
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import type {
    PeerUser,
    CursorPosition,
    FocusInfo,
    CollabMessage,
    SyncedAppState,
    SessionStatus,
    AppView,
    UserJoinPayload,
    CursorMovePayload,
    FocusChangePayload,
    StateSyncPayload,
    FullPeerListPayload,
    UserUpdatePayload,
} from '../types/collaboration';
import { getColorForIndex } from '../types/collaboration';
import type { FirestoreProject, ProjectSecurityRules } from '../types';

const CURSOR_THROTTLE_MS = 50;
const HEARTBEAT_INTERVAL_MS = 5000;
const PEER_TIMEOUT_MS = 15000;

function generateSessionId(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 6; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
}

interface UseCollaborationOptions {
    project: FirestoreProject | null;
    securityRules: ProjectSecurityRules;
    selectedCollectionId: string | null;
    activeView: AppView;
    onRemoteStateSync: (state: SyncedAppState) => void;
}

interface UseCollaborationReturn {
    status: SessionStatus;
    sessionId: string | null;
    localUser: PeerUser | null;
    peers: PeerUser[];
    hostSession: (username: string) => void;
    joinSession: (sessionId: string, username: string) => void;
    disconnect: () => void;
    updateCursor: (position: CursorPosition) => void;
    updateFocus: (focus: FocusInfo | null) => void;
    broadcastState: () => void;
}

export function useCollaboration({
    project,
    securityRules,
    selectedCollectionId,
    activeView,
    onRemoteStateSync,
}: UseCollaborationOptions): UseCollaborationReturn {
    const [status, setStatus] = useState<SessionStatus>('disconnected');
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [localUser, setLocalUser] = useState<PeerUser | null>(null);
    const [peers, setPeers] = useState<Map<string, PeerUser>>(new Map());

    const peerRef = useRef<Peer | null>(null);
    const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
    const localUserRef = useRef<PeerUser | null>(null);
    const peersRef = useRef<Map<string, PeerUser>>(new Map());
    const isHostRef = useRef(false);
    const skipBroadcastRef = useRef(false);
    const cursorThrottleRef = useRef<number>(0);
    const heartbeatRef = useRef<number | null>(null);
    const projectRef = useRef(project);
    const securityRulesRef = useRef(securityRules);

    // Keep refs in sync
    useEffect(() => { projectRef.current = project; }, [project]);
    useEffect(() => { securityRulesRef.current = securityRules; }, [securityRules]);
    useEffect(() => { localUserRef.current = localUser; }, [localUser]);
    useEffect(() => { peersRef.current = peers; }, [peers]);

    // Broadcast view/collection changes to peers
    useEffect(() => {
        if (!localUserRef.current || status === 'disconnected') return;
        const updated: Partial<PeerUser> & { id: string } = {
            id: localUserRef.current.id,
            activeView,
            selectedCollectionId,
        };
        setLocalUser(prev => prev ? { ...prev, activeView, selectedCollectionId } : prev);
        broadcast({ type: 'user-update', senderId: localUserRef.current.id, timestamp: Date.now(), payload: { user: updated } as UserUpdatePayload });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeView, selectedCollectionId]);

    // Auto-broadcast state changes (host and guests)
    useEffect(() => {
        if (status !== 'hosting' && status !== 'connected') return;
        if (!project) return;

        // Skip re-broadcasting when this update came from a remote sync
        if (skipBroadcastRef.current) {
            skipBroadcastRef.current = false;
            return;
        }

        const timer = window.setTimeout(() => {
            broadcastState();
        }, 300);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project, securityRules]);

    const broadcast = useCallback((message: CollabMessage) => {
        const data = JSON.stringify(message);
        connectionsRef.current.forEach((conn) => {
            if (conn.open) {
                conn.send(data);
            }
        });
    }, []);

    const sendTo = useCallback((connId: string, message: CollabMessage) => {
        const conn = connectionsRef.current.get(connId);
        if (conn?.open) {
            conn.send(JSON.stringify(message));
        }
    }, []);

    const broadcastState = useCallback(() => {
        if (!projectRef.current) return;
        const msg: CollabMessage = {
            type: 'state-sync',
            senderId: localUserRef.current?.id ?? '',
            timestamp: Date.now(),
            payload: {
                state: {
                    project: projectRef.current,
                    securityRules: securityRulesRef.current,
                },
            } as StateSyncPayload,
        };
        broadcast(msg);
    }, [broadcast]);

    const handleMessage = useCallback((data: string, fromConnId: string) => {
        let message: CollabMessage;
        try {
            message = JSON.parse(data) as CollabMessage;
        } catch {
            return;
        }

        switch (message.type) {
            case 'user-join': {
                const { user } = message.payload as UserJoinPayload;
                setPeers(prev => {
                    const next = new Map(prev);
                    next.set(user.id, user);
                    return next;
                });

                // If host, send full peer list and current state to the new peer
                if (isHostRef.current) {
                    const allUsers = Array.from(peersRef.current.values());
                    if (localUserRef.current) allUsers.push(localUserRef.current);
                    sendTo(fromConnId, {
                        type: 'full-peer-list',
                        senderId: localUserRef.current?.id ?? '',
                        timestamp: Date.now(),
                        payload: { users: allUsers } as FullPeerListPayload,
                    });

                    // Send current state
                    if (projectRef.current) {
                        sendTo(fromConnId, {
                            type: 'state-sync',
                            senderId: localUserRef.current?.id ?? '',
                            timestamp: Date.now(),
                            payload: {
                                state: {
                                    project: projectRef.current,
                                    securityRules: securityRulesRef.current,
                                },
                            } as StateSyncPayload,
                        });
                    }

                    // Tell existing peers about the new user
                    broadcast({
                        type: 'user-join',
                        senderId: user.id,
                        timestamp: Date.now(),
                        payload: { user } as UserJoinPayload,
                    });
                }
                break;
            }

            case 'user-leave': {
                const { userId } = message.payload as { userId: string };
                setPeers(prev => {
                    const next = new Map(prev);
                    next.delete(userId);
                    return next;
                });
                connectionsRef.current.delete(fromConnId);
                break;
            }

            case 'user-update': {
                const { user: updates } = message.payload as UserUpdatePayload;
                setPeers(prev => {
                    const next = new Map(prev);
                    const existing = next.get(updates.id);
                    if (existing) {
                        next.set(updates.id, { ...existing, ...updates, lastSeen: Date.now() });
                    }
                    return next;
                });
                // Host relays to all other peers
                if (isHostRef.current) {
                    connectionsRef.current.forEach((conn, id) => {
                        if (id !== fromConnId && conn.open) {
                            conn.send(JSON.stringify(message));
                        }
                    });
                }
                break;
            }

            case 'cursor-move': {
                const { userId, cursor } = message.payload as CursorMovePayload;
                setPeers(prev => {
                    const next = new Map(prev);
                    const existing = next.get(userId);
                    if (existing) {
                        next.set(userId, { ...existing, cursor, lastSeen: Date.now() });
                    }
                    return next;
                });
                // Host relays cursor moves
                if (isHostRef.current) {
                    connectionsRef.current.forEach((conn, id) => {
                        if (id !== fromConnId && conn.open) {
                            conn.send(JSON.stringify(message));
                        }
                    });
                }
                break;
            }

            case 'focus-change': {
                const { userId, focusedInput } = message.payload as FocusChangePayload;
                setPeers(prev => {
                    const next = new Map(prev);
                    const existing = next.get(userId);
                    if (existing) {
                        next.set(userId, { ...existing, focusedInput, lastSeen: Date.now() });
                    }
                    return next;
                });
                if (isHostRef.current) {
                    connectionsRef.current.forEach((conn, id) => {
                        if (id !== fromConnId && conn.open) {
                            conn.send(JSON.stringify(message));
                        }
                    });
                }
                break;
            }

            case 'state-sync': {
                const { state } = message.payload as StateSyncPayload;
                // Prevent re-broadcasting the state we just received
                skipBroadcastRef.current = true;
                onRemoteStateSync(state);
                // Host relays guest state changes to all other peers
                if (isHostRef.current) {
                    connectionsRef.current.forEach((conn, id) => {
                        if (id !== fromConnId && conn.open) {
                            conn.send(JSON.stringify(message));
                        }
                    });
                }
                break;
            }

            case 'state-request': {
                if (isHostRef.current) {
                    broadcastState();
                }
                break;
            }

            case 'full-peer-list': {
                const { users } = message.payload as FullPeerListPayload;
                setPeers(prev => {
                    const next = new Map(prev);
                    users.forEach(u => {
                        if (u.id !== localUserRef.current?.id) {
                            next.set(u.id, u);
                        }
                    });
                    return next;
                });
                break;
            }
        }
    }, [broadcast, broadcastState, onRemoteStateSync, sendTo]);

    const setupConnection = useCallback((conn: DataConnection) => {
        conn.on('open', () => {
            connectionsRef.current.set(conn.connectionId, conn);
        });

        conn.on('data', (data) => {
            handleMessage(data as string, conn.connectionId);
        });

        conn.on('close', () => {
            const peerId = conn.metadata?.userId as string | undefined;
            if (peerId) {
                setPeers(prev => {
                    const next = new Map(prev);
                    next.delete(peerId);
                    return next;
                });
            }
            connectionsRef.current.delete(conn.connectionId);
        });

        conn.on('error', (err) => {
            console.error('Connection error:', err);
        });
    }, [handleMessage]);

    const startHeartbeat = useCallback(() => {
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = window.setInterval(() => {
            // Prune stale peers
            setPeers(prev => {
                const now = Date.now();
                const next = new Map(prev);
                let changed = false;
                next.forEach((peer, id) => {
                    if (now - peer.lastSeen > PEER_TIMEOUT_MS) {
                        next.delete(id);
                        changed = true;
                    }
                });
                return changed ? next : prev;
            });

            // Send heartbeat update
            if (localUserRef.current) {
                broadcast({
                    type: 'user-update',
                    senderId: localUserRef.current.id,
                    timestamp: Date.now(),
                    payload: { user: { id: localUserRef.current.id, lastSeen: Date.now() } } as UserUpdatePayload,
                });
            }
        }, HEARTBEAT_INTERVAL_MS);
    }, [broadcast]);

    const createLocalUser = useCallback((username: string, peerId: string, colorIndex: number): PeerUser => {
        return {
            id: peerId,
            username,
            color: getColorForIndex(colorIndex),
            cursor: { elementPath: '' },
            activeView: activeView,
            focusedInput: null,
            selectedCollectionId: selectedCollectionId,
            lastSeen: Date.now(),
        };
    }, [activeView, selectedCollectionId]);

    const hostSession = useCallback((username: string) => {
        if (status !== 'disconnected') return;
        setStatus('connecting');

        const sid = generateSessionId();
        const peerId = `dartstore-${sid}`;

        const peer = new Peer(peerId, {
            debug: 1,
        });

        peer.on('open', (id) => {
            const user = createLocalUser(username, id, 0);
            setLocalUser(user);
            setSessionId(sid);
            setStatus('hosting');
            isHostRef.current = true;
            peerRef.current = peer;
            startHeartbeat();
        });

        peer.on('connection', (conn) => {
            setupConnection(conn);
        });

        peer.on('error', (err) => {
            console.error('Peer error:', err);
        });

        peer.on('disconnected', () => {
            // Try to reconnect
            if (peerRef.current && !peerRef.current.destroyed) {
                peerRef.current.reconnect();
            }
        });
    }, [status, createLocalUser, setupConnection, startHeartbeat]);

    const joinSession = useCallback((targetSessionId: string, username: string) => {
        if (status !== 'disconnected') return;
        setStatus('connecting');

        const hostPeerId = `dartstore-${targetSessionId.toUpperCase()}`;

        const peer = new Peer({
            debug: 1,
        });

        peer.on('open', (id) => {
            const peerCount = peersRef.current.size;
            const user = createLocalUser(username, id, peerCount + 1);
            setLocalUser(user);
            setSessionId(targetSessionId.toUpperCase());
            peerRef.current = peer;
            isHostRef.current = false;

            const conn = peer.connect(hostPeerId, {
                metadata: { userId: id },
                reliable: true,
            });

            conn.on('open', () => {
                connectionsRef.current.set(conn.connectionId, conn);
                setStatus('connected');
                startHeartbeat();

                // Announce ourselves
                conn.send(JSON.stringify({
                    type: 'user-join',
                    senderId: id,
                    timestamp: Date.now(),
                    payload: { user } as UserJoinPayload,
                } as CollabMessage));
            });

            conn.on('data', (data) => {
                handleMessage(data as string, conn.connectionId);
            });

            conn.on('close', () => {
                disconnect();
            });

            conn.on('error', (err) => {
                console.error('Connection error:', err);
                setStatus('disconnected');
            });
        });

        peer.on('error', (err) => {
            console.error('Peer error:', err);
            setStatus('disconnected');
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, createLocalUser, handleMessage, startHeartbeat]);

    const disconnect = useCallback(() => {
        // Notify peers
        if (localUserRef.current) {
            broadcast({
                type: 'user-leave',
                senderId: localUserRef.current.id,
                timestamp: Date.now(),
                payload: { userId: localUserRef.current.id },
            });
        }

        // Cleanup
        if (heartbeatRef.current) {
            clearInterval(heartbeatRef.current);
            heartbeatRef.current = null;
        }

        connectionsRef.current.forEach(conn => conn.close());
        connectionsRef.current.clear();

        if (peerRef.current) {
            peerRef.current.destroy();
            peerRef.current = null;
        }

        setStatus('disconnected');
        setSessionId(null);
        setLocalUser(null);
        setPeers(new Map());
        isHostRef.current = false;
    }, [broadcast]);

    const updateCursor = useCallback((position: CursorPosition) => {
        const now = Date.now();
        if (now - cursorThrottleRef.current < CURSOR_THROTTLE_MS) return;
        cursorThrottleRef.current = now;

        if (!localUserRef.current) return;

        setLocalUser(prev => prev ? { ...prev, cursor: position } : prev);
        broadcast({
            type: 'cursor-move',
            senderId: localUserRef.current.id,
            timestamp: now,
            payload: { userId: localUserRef.current.id, cursor: position } as CursorMovePayload,
        });
    }, [broadcast]);

    const updateFocus = useCallback((focus: FocusInfo | null) => {
        if (!localUserRef.current) return;

        setLocalUser(prev => prev ? { ...prev, focusedInput: focus } : prev);
        broadcast({
            type: 'focus-change',
            senderId: localUserRef.current.id,
            timestamp: Date.now(),
            payload: { userId: localUserRef.current.id, focusedInput: focus } as FocusChangePayload,
        });
    }, [broadcast]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
        status,
        sessionId,
        localUser,
        peers: Array.from(peers.values()),
        hostSession,
        joinSession,
        disconnect,
        updateCursor,
        updateFocus,
        broadcastState,
    };
}
