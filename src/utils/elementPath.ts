/**
 * Utility for building and resolving stable DOM element paths.
 *
 * Paths are index-based (e.g. "0/1/3/0/2") representing the child index
 * at each level from <body> down to the target element. Since all peers
 * run the same React app with synced data, the DOM structure is identical,
 * making these paths resolve to the same logical element on every screen
 * regardless of viewport size.
 */

/** Tags that are too generic to be useful as cursor targets */
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'HEAD', 'HTML', 'BR', 'HR']);

/** Minimum size for an element to be a valid cursor target */
const MIN_SIZE = 8;

/**
 * Build a stable path string from document.body to the given element.
 * The path is a slash-separated list of child indices.
 */
export function buildElementPath(el: HTMLElement): string {
    const indices: number[] = [];
    let current: HTMLElement | null = el;

    while (current && current !== document.body && current.parentElement) {
        const parent: HTMLElement = current.parentElement;
        const children = Array.from(parent.children);
        const index = children.indexOf(current);
        if (index === -1) break;
        indices.unshift(index);
        current = parent;
    }

    return indices.join('/');
}

/**
 * Resolve a path string back to a DOM element.
 * Returns null if any step in the path is invalid.
 */
export function resolveElementPath(path: string): HTMLElement | null {
    if (!path) return null;

    const indices = path.split('/').map(Number);
    let current: Element = document.body;

    for (const index of indices) {
        const child = current.children[index];
        if (!child) return null;
        current = child;
    }

    return current as HTMLElement;
}

/**
 * Walk up from a raw mouseover target to find the nearest "meaningful"
 * element — one that's visible, has a reasonable size, and isn't a
 * skip-listed tag. This prevents the cursor from targeting invisible
 * wrapper divs or tiny inline elements.
 */
export function findMeaningfulElement(el: HTMLElement): HTMLElement {
    let current: HTMLElement | null = el;

    while (current && current !== document.body) {
        // Skip elements that are part of the cursor overlay
        if (current.hasAttribute('data-collab-cursors')) {
            current = current.parentElement;
            continue;
        }

        if (SKIP_TAGS.has(current.tagName)) {
            current = current.parentElement;
            continue;
        }

        const rect = current.getBoundingClientRect();
        if (rect.width >= MIN_SIZE && rect.height >= MIN_SIZE) {
            return current;
        }

        current = current.parentElement;
    }

    return document.body;
}
