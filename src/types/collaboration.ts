import type { FirestoreProject, ProjectSecurityRules } from './index';

// ─── Collaboration Types ────────────────────────────────────────────────────────

export type AppView = 'editor' | 'security-rules' | 'overview' | 'data-transformer';

/** Cursor position tracked for each peer via DOM element path */
export interface CursorPosition {
    /** Stable DOM path identifying which element the cursor is at */
    elementPath: string;
}

/** Information about a focused input element */
export interface FocusInfo {
    /** CSS selector or descriptive label for the focused element */
    selector: string;
    /** Human-readable label */
    label: string;
}

/** Full state of a connected peer */
export interface PeerUser {
    id: string;
    username: string;
    color: string;
    cursor: CursorPosition;
    activeView: AppView;
    focusedInput: FocusInfo | null;
    selectedCollectionId: string | null;
    lastSeen: number;
}

/** The full synced app state sent between peers */
export interface SyncedAppState {
    project: FirestoreProject;
    securityRules: ProjectSecurityRules;
}

// ─── P2P Message Types ──────────────────────────────────────────────────────────

export type CollabMessageType =
    | 'user-join'
    | 'user-leave'
    | 'user-update'
    | 'cursor-move'
    | 'focus-change'
    | 'state-sync'
    | 'state-request'
    | 'full-peer-list';

export interface CollabMessage {
    type: CollabMessageType;
    senderId: string;
    timestamp: number;
    payload: unknown;
}

export interface UserJoinPayload {
    user: PeerUser;
}

export interface UserLeavePayload {
    userId: string;
}

export interface UserUpdatePayload {
    user: Partial<PeerUser> & { id: string };
}

export interface CursorMovePayload {
    userId: string;
    cursor: CursorPosition;
}

export interface FocusChangePayload {
    userId: string;
    focusedInput: FocusInfo | null;
}

export interface StateSyncPayload {
    state: SyncedAppState;
}

export interface FullPeerListPayload {
    users: PeerUser[];
}

// ─── Session State ──────────────────────────────────────────────────────────────

export type SessionStatus = 'disconnected' | 'connecting' | 'hosting' | 'connected';

export interface CollaborationSession {
    status: SessionStatus;
    sessionId: string | null;
    localUser: PeerUser | null;
    peers: Map<string, PeerUser>;
}

// ─── Color palette for peer cursors ─────────────────────────────────────────────

export const PEER_COLORS = [
    '#f472b6', // pink
    '#60a5fa', // blue
    '#34d399', // emerald
    '#fbbf24', // amber
    '#a78bfa', // violet
    '#fb923c', // orange
    '#2dd4bf', // teal
    '#f87171', // red
    '#818cf8', // indigo
    '#4ade80', // green
];

export function getColorForIndex(index: number): string {
    return PEER_COLORS[index % PEER_COLORS.length];
}
