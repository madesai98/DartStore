import type { FirestoreProject, FirestoreCollection, ValidationGroup, ValidationRules } from '../types';

const STORAGE_KEY = 'dartstore_project';
const AUTO_SAVE_DELAY = 1000; // ms

let autoSaveTimeout: number | null = null;

function normalizeValidationGroup(group: ValidationGroup): ValidationGroup {
    return {
        ...group,
        conditions: Array.isArray(group.conditions) ? group.conditions : [],
        groups: Array.isArray(group.groups)
            ? group.groups.map(normalizeValidationGroup)
            : [],
    };
}

function normalizeValidationRules(rules: ValidationRules | undefined): ValidationRules | undefined {
    if (!rules) return undefined;
    // Migrate from old single 'enabled' field to dual switches
    const migrated = rules as ValidationRules & { enabled?: boolean };
    const clientEnabled = rules.clientEnabled ?? migrated.enabled ?? false;
    const serverEnabled = rules.serverEnabled ?? false;
    return {
        clientEnabled,
        serverEnabled,
        rootGroup: normalizeValidationGroup(rules.rootGroup),
    };
}

function normalizeCollection(collection: FirestoreCollection): FirestoreCollection {
    return {
        ...collection,
        fields: Array.isArray(collection.fields) ? collection.fields : [],
        subcollections: Array.isArray(collection.subcollections)
            ? collection.subcollections.map(normalizeCollection)
            : [],
        validationRules: normalizeValidationRules(collection.validationRules),
    };
}

function normalizeProject(project: FirestoreProject): FirestoreProject {
    return {
        ...project,
        collections: Array.isArray(project.collections)
            ? project.collections.map(normalizeCollection)
            : [],
    };
}

export function saveProject(project: FirestoreProject): void {
    try {
        const serialized = JSON.stringify(project);
        localStorage.setItem(STORAGE_KEY, serialized);
    } catch (error) {
        console.error('Failed to save project:', error);
        throw new Error('Failed to save project to local storage');
    }
}

export function loadProject(): FirestoreProject | null {
    try {
        const serialized = localStorage.getItem(STORAGE_KEY);
        if (!serialized) return null;

        const project = JSON.parse(serialized) as FirestoreProject;
        return normalizeProject(project);
    } catch (error) {
        console.error('Failed to load project:', error);
        return null;
    }
}

export function autoSaveProject(project: FirestoreProject): void {
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
    }

    autoSaveTimeout = window.setTimeout(() => {
        saveProject(project);
    }, AUTO_SAVE_DELAY);
}

export function exportProject(project: FirestoreProject): void {
    try {
        const serialized = JSON.stringify(project, null, 2);
        const blob = new Blob([serialized], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${project.name || 'firestore-project'}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Failed to export project:', error);
        throw new Error('Failed to export project');
    }
}

export function exportDartCode(dartCode: string, projectName: string): void {
    try {
        const blob = new Blob([dartCode], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${projectName || 'firestore_models'}.dart`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Failed to export Dart code:', error);
        throw new Error('Failed to export Dart code');
    }
}

export function importProject(file: File): Promise<FirestoreProject> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (event) => {
            try {
                const content = event.target?.result as string;
                const project = JSON.parse(content) as FirestoreProject;

                // Validate basic structure
                if (!project.id || !project.name || !Array.isArray(project.collections)) {
                    throw new Error('Invalid project file format');
                }

                resolve(normalizeProject(project));
            } catch (error) {
                reject(new Error('Failed to parse project file'));
            }
        };

        reader.onerror = () => {
            reject(new Error('Failed to read project file'));
        };

        reader.readAsText(file);
    });
}

export function clearProject(): void {
    localStorage.removeItem(STORAGE_KEY);
}

export function createNewProject(name: string, description?: string): FirestoreProject {
    const now = new Date().toISOString();
    return {
        id: generateId(),
        name,
        description,
        collections: [],
        createdAt: now,
        updatedAt: now,
    };
}

export function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
