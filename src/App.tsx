import { useState, useEffect, useMemo, useCallback } from 'react';
import type { FirestoreProject, FirestoreCollection, FirestoreField, FirestoreFieldType, ValidationGroup, ValidationRules, ValidationCondition, ProjectSecurityRules } from './types';
import { loadProject, saveProject, autoSaveProject, createNewProject } from './utils/storage';
import { getDefaultOperatorForType } from './utils/validationOperators';
import { generateFullDartFile } from './utils/dartGenerator';
import { generateSecurityRules, createDefaultProjectSecurityRules } from './utils/securityRulesGenerator';
import { useCollaboration } from './hooks/useCollaboration';
import { useFocusTracking } from './hooks/useFocusTracking';
import { buildElementPath, findMeaningfulElement, resolveElementPath } from './utils/elementPath';
import type { SyncedAppState, PeerUser } from './types/collaboration';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import CollectionEditor from './components/CollectionEditor';
import CodePreview from './components/CodePreview';
import SecurityRulesBuilder from './components/SecurityRulesBuilder';
import SecurityRulesPreview from './components/SecurityRulesPreview';
import WelcomeScreen from './components/WelcomeScreen';
import OverviewGraph from './components/OverviewGraph';
import RemoteCursors from './components/RemoteCursors';

type AppView = 'editor' | 'security-rules' | 'overview';

const findCollectionById = (collections: FirestoreCollection[], id: string): FirestoreCollection | null => {
  for (const collection of collections) {
    if (collection.id === id) return collection;
    if (collection.subcollections.length > 0) {
      const match = findCollectionById(collection.subcollections, id);
      if (match) return match;
    }
  }
  return null;
};

const updateCollectionById = (
  collections: FirestoreCollection[],
  id: string,
  updater: (collection: FirestoreCollection) => FirestoreCollection
): FirestoreCollection[] => {
  return collections.map((collection) => {
    if (collection.id === id) {
      return updater(collection);
    }

    if (collection.subcollections.length > 0) {
      const updatedSubcollections = updateCollectionById(collection.subcollections, id, updater);
      if (updatedSubcollections !== collection.subcollections) {
        return { ...collection, subcollections: updatedSubcollections };
      }
    }

    return collection;
  });
};

const removeCollectionById = (collections: FirestoreCollection[], id: string): FirestoreCollection[] => {
  return collections
    .filter((collection) => collection.id !== id)
    .map((collection) => ({
      ...collection,
      subcollections: removeCollectionById(collection.subcollections, id),
    }));
};

const getFirstCollectionId = (collections: FirestoreCollection[]): string | null => {
  return collections.length > 0 ? collections[0].id : null;
};

const getAllCollectionsFlat = (collections: FirestoreCollection[]): FirestoreCollection[] => {
  const result: FirestoreCollection[] = [];
  const traverse = (collectionList: FirestoreCollection[]) => {
    for (const collection of collectionList) {
      result.push(collection);
      if (collection.subcollections.length > 0) {
        traverse(collection.subcollections);
      }
    }
  };
  traverse(collections);
  return result;
};

function App() {
  const [project, setProject] = useState<FirestoreProject | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [showCodePreview, setShowCodePreview] = useState(false);
  const [showSecurityRulesPreview, setShowSecurityRulesPreview] = useState(false);
  const [activeView, setActiveView] = useState<AppView>('editor');
  const [securityRules, setSecurityRules] = useState<ProjectSecurityRules>(createDefaultProjectSecurityRules());
  const [isGuest, setIsGuest] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // ─── Collaboration ──────────────────────────────────────────────────────────
  const handleRemoteStateSync = useCallback((state: SyncedAppState) => {
    setProject(state.project);
    setSecurityRules(state.securityRules);
  }, []);

  const collab = useCollaboration({
    project,
    securityRules,
    selectedCollectionId,
    activeView,
    onRemoteStateSync: handleRemoteStateSync,
  });

  const isCollabActive = collab.status === 'hosting' || collab.status === 'connected';

  // Track mouse movement for collaboration cursors
  useEffect(() => {
    if (!isCollabActive) return;
    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Skip cursor overlay elements
      if (target.closest('[data-collab-cursors]')) return;
      const el = findMeaningfulElement(target);
      const path = buildElementPath(el);
      collab.updateCursor({ elementPath: path });
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCollabActive]);

  // Track focused inputs for collaboration — also moves cursor to focused element
  useFocusTracking(isCollabActive, collab.updateFocus, collab.updateCursor);

  // Load project on mount
  useEffect(() => {
    const savedProject = loadProject();
    if (savedProject) {
      setProject(savedProject);
      if (savedProject.collections.length > 0) {
        setSelectedCollectionId(savedProject.collections[0].id);
      }
      // Load security rules from localStorage
      try {
        const savedRules = localStorage.getItem('dartstore_security_rules');
        if (savedRules) {
          setSecurityRules(JSON.parse(savedRules));
        }
      } catch { /* ignore */ }
    }
  }, []);

  // Auto-save when project changes (skip for guests)
  useEffect(() => {
    if (project && !isGuest) {
      autoSaveProject(project);
    }
  }, [project, isGuest]);

  // Auto-save security rules (skip for guests)
  useEffect(() => {
    if (isGuest) return;
    try {
      localStorage.setItem('dartstore_security_rules', JSON.stringify(securityRules));
    } catch { /* ignore */ }
  }, [securityRules, isGuest]);

  // Generate Dart code
  const dartCode = useMemo(() => {
    if (!project) return '';
    return generateFullDartFile(project);
  }, [project]);

  // Generate security rules code
  const securityRulesCode = useMemo(() => {
    if (!project) return '';
    return generateSecurityRules(project, securityRules);
  }, [project, securityRules]);

  const selectedCollection = useMemo(() => {
    if (!project || !selectedCollectionId) return null;
    return findCollectionById(project.collections, selectedCollectionId);
  }, [project, selectedCollectionId]);

  const handleCreateProject = (name: string, description?: string) => {
    const newProject = createNewProject(name, description);
    setProject(newProject);
    saveProject(newProject);
    setIsGuest(false);
  };

  const handleJoinSession = useCallback((sessionId: string, username: string) => {
    setIsGuest(true);
    collab.joinSession(sessionId, username);
  }, [collab]);

  const handleGuestDisconnect = useCallback(() => {
    collab.disconnect();
    if (isGuest) {
      setProject(null);
      setIsGuest(false);
      setSecurityRules(createDefaultProjectSecurityRules());
      setActiveView('editor');
    }
  }, [collab, isGuest]);

  // Jump to a remote peer's location: switch tab, select collection, scroll to element
  const handleJumpToUser = useCallback((user: PeerUser) => {
    // 1. Switch to their active tab
    if (user.activeView !== activeView) {
      setActiveView(user.activeView);
    }

    // 2. Switch to their selected collection
    if (user.selectedCollectionId) {
      setSelectedCollectionId(user.selectedCollectionId);
    }

    // 3. After a brief delay (to let React re-render the tab/collection), scroll to their element
    setTimeout(() => {
      const path = user.cursor.elementPath;
      if (path) {
        const el = resolveElementPath(path);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }, 150);
  }, [activeView]);

  const handleUpdateProject = (updates: Partial<FirestoreProject>) => {
    if (!project) return;
    const updatedProject = {
      ...project,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    setProject(updatedProject);
  };

  const handleAddCollection = (collection: FirestoreCollection) => {
    if (!project) return;
    const updatedProject = {
      ...project,
      collections: [...project.collections, collection],
      updatedAt: new Date().toISOString(),
    };
    setProject(updatedProject);
    setSelectedCollectionId(collection.id);
  };

  const handleAddSubcollection = (parentId: string, collection: FirestoreCollection) => {
    if (!project) return;
    const updatedProject = {
      ...project,
      collections: updateCollectionById(project.collections, parentId, (parent) => ({
        ...parent,
        subcollections: [...parent.subcollections, collection],
      })),
      updatedAt: new Date().toISOString(),
    };
    setProject(updatedProject);
    setSelectedCollectionId(collection.id);
  };

  const handleUpdateCollection = (collectionId: string, updates: Partial<FirestoreCollection>) => {
    if (!project) return;
    const updatedProject = {
      ...project,
      collections: updateCollectionById(project.collections, collectionId, (collection) => ({
        ...collection,
        ...updates,
      })),
      updatedAt: new Date().toISOString(),
    };
    setProject(updatedProject);
  };

  const handleDeleteCollection = (collectionId: string) => {
    if (!project) return;
    const updatedCollections = removeCollectionById(project.collections, collectionId);
    const updatedProject = {
      ...project,
      collections: updatedCollections,
      updatedAt: new Date().toISOString(),
    };
    setProject(updatedProject);

    if (!findCollectionById(updatedCollections, selectedCollectionId ?? '')) {
      setSelectedCollectionId(getFirstCollectionId(updatedCollections));
    }
  };

  const handleAddField = (collectionId: string, field: FirestoreField) => {
    if (!project) return;
    const updatedProject = {
      ...project,
      collections: updateCollectionById(project.collections, collectionId, (collection) => ({
        ...collection,
        fields: [...collection.fields, field],
      })),
      updatedAt: new Date().toISOString(),
    };
    setProject(updatedProject);
  };

  const resetConditionsForFieldType = (
    group: ValidationGroup,
    fieldId: string,
    newType: FirestoreFieldType
  ): ValidationGroup => ({
    ...group,
    conditions: group.conditions.map((c: ValidationCondition) =>
      c.fieldId === fieldId
        ? { ...c, operator: getDefaultOperatorForType(newType), value: '', secondaryValue: undefined, enabled: false }
        : c
    ),
    groups: group.groups.map((g) => resetConditionsForFieldType(g, fieldId, newType)),
  });

  const handleUpdateField = (collectionId: string, fieldId: string, updates: Partial<FirestoreField>) => {
    if (!project) return;
    const typeChanged = updates.type !== undefined;
    const updatedProject = {
      ...project,
      collections: updateCollectionById(project.collections, collectionId, (collection) => {
        const updatedCollection = {
          ...collection,
          fields: collection.fields.map((field) =>
            field.id === fieldId ? { ...field, ...updates } : field
          ),
        };
        if (typeChanged && updatedCollection.validationRules) {
          updatedCollection.validationRules = {
            ...updatedCollection.validationRules,
            rootGroup: resetConditionsForFieldType(
              updatedCollection.validationRules.rootGroup,
              fieldId,
              updates.type as FirestoreFieldType
            ),
          };
        }
        return updatedCollection;
      }),
      updatedAt: new Date().toISOString(),
    };
    setProject(updatedProject);
  };

  const purgeFieldFromGroup = (group: ValidationGroup, fieldId: string): ValidationGroup => ({
    ...group,
    conditions: group.conditions.filter((c) => c.fieldId !== fieldId),
    groups: group.groups.map((g) => purgeFieldFromGroup(g, fieldId)),
  });

  const purgeFieldFromValidation = (rules: ValidationRules | undefined, fieldId: string): ValidationRules | undefined => {
    if (!rules) return undefined;
    return { ...rules, rootGroup: purgeFieldFromGroup(rules.rootGroup, fieldId) };
  };

  const handleDeleteField = (collectionId: string, fieldId: string) => {
    if (!project) return;
    const updatedProject = {
      ...project,
      collections: updateCollectionById(project.collections, collectionId, (collection) => ({
        ...collection,
        fields: collection.fields.filter((field) => field.id !== fieldId),
        validationRules: purgeFieldFromValidation(collection.validationRules, fieldId),
      })),
      updatedAt: new Date().toISOString(),
    };
    setProject(updatedProject);
  };

  if (!project) {
    return (
      <WelcomeScreen
        onCreateProject={handleCreateProject}
        onLoadProject={setProject}
        onJoinSession={handleJoinSession}
        isJoining={collab.status === 'connecting'}
      />
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <Header
        project={project}
        onUpdateProject={handleUpdateProject}
        onShowCode={() => setShowCodePreview(true)}
        onNewProject={() => {
          if (isGuest) {
            handleGuestDisconnect();
          } else {
            collab.disconnect();
            setProject(null);
            setSecurityRules(createDefaultProjectSecurityRules());
            setActiveView('editor');
          }
        }}
        activeView={activeView}
        onChangeView={setActiveView}
      />

      <div className="flex-1 flex overflow-hidden">
        {activeView === 'editor' ? (
          <Sidebar
            collections={project.collections}
            selectedCollectionId={selectedCollectionId}
            onSelectCollection={setSelectedCollectionId}
            onAddCollection={handleAddCollection}
            onAddSubcollection={handleAddSubcollection}
            onDeleteCollection={handleDeleteCollection}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(c => !c)}
            collaboration={{
              status: collab.status,
              sessionId: collab.sessionId,
              localUser: collab.localUser,
              peers: collab.peers,
              onHost: collab.hostSession,
              onDisconnect: handleGuestDisconnect,
              onJumpToUser: handleJumpToUser,
            }}
          />
        ) : activeView === 'security-rules' ? (
          <Sidebar
            collections={project.collections}
            selectedCollectionId={selectedCollectionId}
            onSelectCollection={setSelectedCollectionId}
            readOnly
            title="Collections"
            mode="security-rules"
            securityRules={securityRules}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(c => !c)}
            collaboration={{
              status: collab.status,
              sessionId: collab.sessionId,
              localUser: collab.localUser,
              peers: collab.peers,
              onHost: collab.hostSession,
              onDisconnect: handleGuestDisconnect,
              onJumpToUser: handleJumpToUser,
            }}
          />
        ) : (
          <Sidebar
            collections={[]}
            selectedCollectionId={null}
            onSelectCollection={() => { }}
            readOnly
            title="Overview"
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(c => !c)}
            collaboration={{
              status: collab.status,
              sessionId: collab.sessionId,
              localUser: collab.localUser,
              peers: collab.peers,
              onHost: collab.hostSession,
              onDisconnect: handleGuestDisconnect,
              onJumpToUser: handleJumpToUser,
            }}
          />
        )}

        <main className="flex-1 overflow-auto">
          {activeView === 'editor' ? (
            selectedCollection ? (
              <CollectionEditor
                collection={selectedCollection}
                allCollections={project ? getAllCollectionsFlat(project.collections) : []}
                onUpdateCollection={(updates) => handleUpdateCollection(selectedCollection.id, updates)}
                onAddField={(field) => handleAddField(selectedCollection.id, field)}
                onUpdateField={(fieldId, updates) => handleUpdateField(selectedCollection.id, fieldId, updates)}
                onDeleteField={(fieldId) => handleDeleteField(selectedCollection.id, fieldId)}
              />
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <p className="text-lg text-white/30">No collection selected</p>
                  <p className="text-sm mt-2 text-white/20">Create a collection to get started</p>
                </div>
              </div>
            )
          ) : activeView === 'security-rules' ? (
            <SecurityRulesBuilder
              project={project}
              securityRules={securityRules}
              onChange={setSecurityRules}
              onShowPreview={() => setShowSecurityRulesPreview(true)}
              selectedCollectionId={selectedCollectionId}
            />
          ) : (
            <OverviewGraph
              project={project}
              securityRules={securityRules}
            />
          )}
        </main>

        {showCodePreview && (
          <CodePreview
            code={dartCode}
            projectName={project.name}
            onClose={() => setShowCodePreview(false)}
          />
        )}

        {showSecurityRulesPreview && (
          <SecurityRulesPreview
            code={securityRulesCode}
            projectName={project.name}
            onClose={() => setShowSecurityRulesPreview(false)}
          />
        )}
      </div>

      {/* Remote collaboration cursors */}
      {isCollabActive && (
        <RemoteCursors
          peers={collab.peers}
          localUserId={collab.localUser?.id ?? null}
        />
      )}
    </div>
  );
}

export default App;