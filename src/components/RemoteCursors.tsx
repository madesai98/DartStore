import { useEffect, useRef, useCallback } from 'react';
import type { PeerUser } from '../types/collaboration';
import { resolveElementPath } from '../utils/elementPath';

interface RemoteCursorsProps {
    peers: PeerUser[];
    localUserId: string | null;
}

export default function RemoteCursors({ peers, localUserId }: RemoteCursorsProps) {
    const cursorsRef = useRef<Map<string, HTMLDivElement>>(new Map());

    const updatePositions = useCallback(() => {
        peers.forEach((peer) => {
            if (peer.id === localUserId) return;
            const cursorEl = cursorsRef.current.get(peer.id);
            if (!cursorEl) return;

            const target = resolveElementPath(peer.cursor.elementPath);
            if (target) {
                const rect = target.getBoundingClientRect();
                const x = rect.right;
                const y = rect.bottom;
                cursorEl.style.transform = `translate(${x}px, ${y}px)`;
                cursorEl.style.display = '';
            } else {
                cursorEl.style.display = 'none';
            }
        });
    }, [peers, localUserId]);

    // Update on peer changes
    useEffect(() => {
        updatePositions();
    }, [updatePositions]);

    // Also update on window resize / scroll so positions stay correct
    useEffect(() => {
        window.addEventListener('resize', updatePositions);
        window.addEventListener('scroll', updatePositions, true);
        return () => {
            window.removeEventListener('resize', updatePositions);
            window.removeEventListener('scroll', updatePositions, true);
        };
    }, [updatePositions]);

    const remotePeers = peers.filter((p) => p.id !== localUserId);

    if (remotePeers.length === 0) return null;

    return (
        <div
            className="pointer-events-none fixed inset-0"
            style={{ zIndex: 9999 }}
            data-collab-cursors
            aria-hidden="true"
        >
            {remotePeers.map((peer) => (
                <div
                    key={peer.id}
                    ref={(el) => {
                        if (el) cursorsRef.current.set(peer.id, el);
                        else cursorsRef.current.delete(peer.id);
                    }}
                    className="absolute top-0 left-0 transition-transform duration-75 ease-out"
                >
                    {/* Cursor arrow SVG */}
                    <svg
                        width="16"
                        height="20"
                        viewBox="0 0 16 20"
                        fill="none"
                        className="drop-shadow-lg"
                        style={{ filter: `drop-shadow(0 1px 2px ${peer.color}40)` }}
                    >
                        <path
                            d="M1 1L1 15L5.5 11L10.5 19L13 17.5L8 9.5L14 8.5L1 1Z"
                            fill={peer.color}
                            stroke="rgba(0,0,0,0.3)"
                            strokeWidth="1"
                            strokeLinejoin="round"
                        />
                    </svg>

                    {/* Username label */}
                    <div
                        className="absolute left-4 top-4 px-2 py-0.5 rounded-md text-[10px] font-medium text-white whitespace-nowrap shadow-lg"
                        style={{ backgroundColor: peer.color }}
                    >
                        {peer.username}
                    </div>
                </div>
            ))}
        </div>
    );
}
