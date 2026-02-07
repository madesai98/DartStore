import { useEffect, useCallback, useRef } from 'react';
import type { FocusInfo, CursorPosition } from '../types/collaboration';
import { buildElementPath } from '../utils/elementPath';

/**
 * Hook that tracks which input/textarea/select is currently focused
 * and reports it via the callback. Elements with [data-collab-ignore]
 * are excluded (e.g. the collaboration panel's own inputs).
 * Also moves the collaboration cursor to the focused element.
 */
export function useFocusTracking(
    isActive: boolean,
    onFocusChange: (focus: FocusInfo | null) => void,
    onCursorUpdate?: (cursor: CursorPosition) => void
) {
    const lastFocusRef = useRef<string | null>(null);

    const getLabel = useCallback((el: Element): string => {
        // Try data-collab-label first
        const collabLabel = el.getAttribute('data-collab-label');
        if (collabLabel) return collabLabel;

        // Try placeholder
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            if (el.placeholder) return el.placeholder;
        }

        // Try aria-label
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) return ariaLabel;

        // Try associated label
        const id = el.getAttribute('id');
        if (id) {
            const label = document.querySelector(`label[for="${id}"]`);
            if (label?.textContent) return label.textContent.trim();
        }

        // Try name attribute
        const name = el.getAttribute('name');
        if (name) return name;

        // Try parent label content
        const parentLabel = el.closest('label');
        if (parentLabel?.textContent) {
            const text = parentLabel.textContent.trim();
            if (text.length < 40) return text;
        }

        // Fallback
        return el.tagName.toLowerCase();
    }, []);

    useEffect(() => {
        if (!isActive) return;

        const handleFocusIn = (e: FocusEvent) => {
            const target = e.target as Element;
            if (!target) return;

            // Skip non-input elements
            const isInput = target.matches('input, textarea, select, [contenteditable]');
            if (!isInput) return;

            // Skip collaboration panel's own inputs
            if (target.closest('[data-collab-ignore]') || target.hasAttribute('data-collab-ignore')) return;

            const path = buildElementPath(target as HTMLElement);
            if (path === lastFocusRef.current) return;

            lastFocusRef.current = path;
            onFocusChange({
                selector: path,
                label: getLabel(target),
            });

            // Also move the cursor to the focused element
            onCursorUpdate?.({ elementPath: path });
        };

        const handleFocusOut = () => {
            // Small delay to check if focus moved to another tracked input
            setTimeout(() => {
                const active = document.activeElement;
                if (!active || !active.matches('input, textarea, select, [contenteditable]')) {
                    if (lastFocusRef.current !== null) {
                        lastFocusRef.current = null;
                        onFocusChange(null);
                    }
                }
            }, 50);
        };

        document.addEventListener('focusin', handleFocusIn, true);
        document.addEventListener('focusout', handleFocusOut, true);

        return () => {
            document.removeEventListener('focusin', handleFocusIn, true);
            document.removeEventListener('focusout', handleFocusOut, true);
        };
    }, [isActive, onFocusChange, onCursorUpdate, getLabel]);
}
