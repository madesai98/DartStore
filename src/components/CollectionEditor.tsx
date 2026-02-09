import { useState } from 'react';
import { Plus, Edit2, Trash2, Check, X, Monitor, Server } from 'lucide-react';
import type { FirestoreCollection, FirestoreField, FirestoreFieldType, DefaultValuePreset, ValidationRules } from '../types';
import { generateId } from '../utils/storage';
import { getAvailablePresetsForType } from '../utils/dartGenerator';
import ValidationRuleBuilder from './ValidationRuleBuilder';

interface CollectionEditorProps {
    collection: FirestoreCollection;
    allCollections: FirestoreCollection[];
    onUpdateCollection: (updates: Partial<FirestoreCollection>) => void;
    onAddField: (field: FirestoreField) => void;
    onUpdateField: (fieldId: string, updates: Partial<FirestoreField>) => void;
    onDeleteField: (fieldId: string) => void;
}

const FIELD_TYPES: FirestoreFieldType[] = [
    'string',
    'number',
    'boolean',
    'timestamp',
    'geopoint',
    'reference',
    'array',
    'map',
    'null',
];

// Validate that reference fields have at least one collection selected
const validateField = (field: Partial<FirestoreField>): string | null => {
    if (field.type === 'reference') {
        if (!field.referenceCollections || field.referenceCollections.length === 0) {
            return 'Reference fields must have at least one collection selected';
        }
    }
    return null;
};

export default function CollectionEditor({
    collection,
    allCollections,
    onUpdateCollection,
    onAddField,
    onUpdateField,
    onDeleteField,
}: CollectionEditorProps) {
    const [editingName, setEditingName] = useState(false);
    const [editingDesc, setEditingDesc] = useState(false);
    const [tempName, setTempName] = useState(collection.name);
    const [tempDesc, setTempDesc] = useState(collection.description || '');
    const [showNewField, setShowNewField] = useState(false);
    const [editingFieldId, setEditingFieldId] = useState<string | null>(null);

    const handleSaveName = () => {
        if (tempName.trim()) {
            onUpdateCollection({ name: tempName.trim() });
            setEditingName(false);
        }
    };

    const handleSaveDesc = () => {
        onUpdateCollection({ description: tempDesc.trim() || undefined });
        setEditingDesc(false);
    };

    const handleDeleteField = (fieldId: string) => {
        onDeleteField(fieldId);
    };

    return (
        <div className="h-full flex flex-col">
            {/* Collection Header */}
            <div className="p-6">
                <div className="max-w-4xl mx-auto">
                    {editingName ? (
                        <div className="flex items-center gap-2 mb-2">
                            <input
                                type="text"
                                value={tempName}
                                onChange={(e) => setTempName(e.target.value)}
                                className="flex-1 text-2xl font-bold px-3 py-1 bg-white/[0.06] border-0 rounded-lg text-white/90 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveName();
                                    if (e.key === 'Escape') {
                                        setTempName(collection.name);
                                        setEditingName(false);
                                    }
                                }}
                            />
                            <button
                                onClick={handleSaveName}
                                className="p-2 text-emerald-400/70 hover:bg-white/[0.05] rounded-lg transition-all"
                            >
                                <Check className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => {
                                    setTempName(collection.name);
                                    setEditingName(false);
                                }}
                                className="p-2 text-red-400/60 hover:bg-white/[0.05] rounded-lg transition-all"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 mb-2 group">
                            <h2 className="text-2xl font-bold text-white/90">{collection.name}</h2>
                            <button
                                onClick={() => setEditingName(true)}
                                className="opacity-0 group-hover:opacity-100 p-1.5 text-white/20 hover:text-white/50 hover:bg-white/[0.05] rounded-lg transition-all"
                            >
                                <Edit2 className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {editingDesc ? (
                        <div className="flex items-start gap-2">
                            <input
                                type="text"
                                value={tempDesc}
                                onChange={(e) => setTempDesc(e.target.value)}
                                className="flex-1 px-3 py-1 bg-white/[0.06] border-0 rounded-lg text-white/60 placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
                                placeholder="Add a description…"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveDesc();
                                    if (e.key === 'Escape') {
                                        setTempDesc(collection.description || '');
                                        setEditingDesc(false);
                                    }
                                }}
                            />
                            <button
                                onClick={handleSaveDesc}
                                className="p-2 text-emerald-400/70 hover:bg-white/[0.05] rounded-lg transition-all"
                            >
                                <Check className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => {
                                    setTempDesc(collection.description || '');
                                    setEditingDesc(false);
                                }}
                                className="p-2 text-red-400/60 hover:bg-white/[0.05] rounded-lg transition-all"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 group">
                            <p className="text-white/30">{collection.description || 'No description'}</p>
                            <button
                                onClick={() => setEditingDesc(true)}
                                className="opacity-0 group-hover:opacity-100 p-1.5 text-white/20 hover:text-white/50 hover:bg-white/[0.05] rounded-lg transition-all"
                            >
                                <Edit2 className="w-3 h-3" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Fields List */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-4xl mx-auto">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-white/70">Fields</h3>
                        <button
                            onClick={() => setShowNewField(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-violet-500/80 text-white rounded-lg hover:bg-violet-500 transition-all duration-200"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Add Field</span>
                        </button>
                    </div>

                    {showNewField && (
                        <NewFieldForm
                            allCollections={allCollections}
                            onAdd={(field) => {
                                onAddField(field);
                                setShowNewField(false);
                            }}
                            onCancel={() => setShowNewField(false)}
                        />
                    )}

                    <div className="space-y-2">
                        {collection.fields.map((field) => (
                            <FieldRow
                                key={field.id}
                                field={field}
                                allCollections={allCollections}
                                isEditing={editingFieldId === field.id}
                                onEdit={() => setEditingFieldId(field.id)}
                                onSave={(updates) => {
                                    onUpdateField(field.id, updates);
                                    setEditingFieldId(null);
                                }}
                                onCancel={() => setEditingFieldId(null)}
                                onDelete={() => handleDeleteField(field.id)}
                            />
                        ))}
                    </div>

                    {collection.fields.length === 0 && !showNewField && (
                        <div className="text-center py-12">
                            <p className="text-white/30">No fields yet</p>
                            <p className="text-sm mt-1 text-white/20">Click “Add Field” to create one</p>
                        </div>
                    )}
                    {/* Validation Rules Builder */}
                    {collection.fields.length > 0 && (
                        <ValidationRuleBuilder
                            fields={collection.fields}
                            validationRules={collection.validationRules}
                            onChange={(rules: ValidationRules) => onUpdateCollection({ validationRules: rules })}
                        />
                    )}                </div>
            </div>
        </div>
    );
}

interface NewFieldFormProps {
    allCollections: FirestoreCollection[];
    onAdd: (field: FirestoreField) => void;
    onCancel: () => void;
}

function NewFieldForm({ allCollections, onAdd, onCancel }: NewFieldFormProps) {
    const [name, setName] = useState('');
    const [type, setType] = useState<FirestoreFieldType>('string');
    const [isRequired, setIsRequired] = useState(false);
    const [description, setDescription] = useState('');
    const [arrayItemType, setArrayItemType] = useState<FirestoreFieldType>('string');
    const [mapValueType, setMapValueType] = useState<FirestoreFieldType>('string');
    const [defaultPreset, setDefaultPreset] = useState<DefaultValuePreset>('none');
    const [customDefaultValue, setCustomDefaultValue] = useState('');
    const [referenceCollections, setReferenceCollections] = useState<string[]>([]);
    const [visibilityClient, setVisibilityClient] = useState(true);
    const [visibilityServer, setVisibilityServer] = useState(true);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (name.trim()) {
            const field: FirestoreField = {
                id: generateId(),
                name: name.trim(),
                type,
                isRequired,
                description: description.trim() || undefined,
                arrayItemType: type === 'array' ? arrayItemType : undefined,
                mapValueType: type === 'map' ? mapValueType : undefined,
                defaultPreset: defaultPreset !== 'none' ? defaultPreset : undefined,
                defaultValue: customDefaultValue.trim() || undefined,
                referenceCollections: type === 'reference' && referenceCollections.length > 0 ? referenceCollections : undefined,
                visibility: (visibilityClient && visibilityServer) ? undefined : { client: visibilityClient, server: visibilityServer },
            };
            const validationError = validateField(field);
            if (validationError) {
                alert(validationError);
                return;
            }
            onAdd(field);
        }
    };

    const availablePresets = getAvailablePresetsForType(type);

    return (
        <form onSubmit={handleSubmit} className="bg-white/[0.04] rounded-2xl p-5 mb-4">
            <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                    <label className="block text-sm font-medium text-white/40 mb-1">Field Name *</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-3 py-2 bg-white/[0.06] border-0 rounded-lg text-white/80 placeholder-white/20 focus:ring-1 focus:ring-violet-500/30 transition-all"
                        placeholder="fieldName"
                        required
                        autoFocus
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-white/40 mb-1">Type</label>
                    <select
                        value={type}
                        onChange={(e) => {
                            setType(e.target.value as FirestoreFieldType);
                            setDefaultPreset('none');
                            setCustomDefaultValue('');
                        }}
                        className="w-full px-3 py-2 bg-white/[0.06] border-0 rounded-lg text-white/80 focus:ring-1 focus:ring-violet-500/30 transition-all"
                    >
                        {FIELD_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>
            </div>

            {type === 'array' && (
                <div className="mb-3">
                    <label className="block text-sm font-medium text-white/40 mb-1">Array Item Type</label>
                    <select
                        value={arrayItemType}
                        onChange={(e) => setArrayItemType(e.target.value as FirestoreFieldType)}
                        className="w-full px-3 py-2 bg-white/[0.06] border-0 rounded-lg text-white/80 focus:ring-1 focus:ring-violet-500/30 transition-all"
                    >
                        {FIELD_TYPES.filter(t => t !== 'array' && t !== 'map').map((t) => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>
            )}

            {type === 'reference' && (
                <div className="mb-3">
                    <label className="block text-sm font-medium text-white/40 mb-1">Collections</label>
                    <div className="space-y-2 max-h-48 overflow-y-auto bg-white/[0.02] rounded-lg p-3 border border-white/[0.08]">
                        {allCollections.length === 0 ? (
                            <p className="text-sm text-white/30">No collections available</p>
                        ) : (
                            allCollections.map((collection) => (
                                <label key={collection.id} className="flex items-center gap-2 cursor-pointer hover:bg-white/[0.04] p-2 rounded">
                                    <input
                                        type="checkbox"
                                        checked={referenceCollections.includes(collection.id)}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setReferenceCollections([...referenceCollections, collection.id]);
                                            } else {
                                                setReferenceCollections(referenceCollections.filter(id => id !== collection.id));
                                            }
                                        }}
                                        className="rounded border-0 bg-white/[0.1] text-violet-500 focus:ring-violet-500/30"
                                    />
                                    <span className="text-sm text-white/70">{collection.name}</span>
                                </label>
                            ))
                        )}
                    </div>
                </div>
            )}

            {type === 'map' && (
                <div className="mb-3">
                    <label className="block text-sm font-medium text-white/40 mb-1">Map Value Type</label>
                    <select
                        value={mapValueType}
                        onChange={(e) => setMapValueType(e.target.value as FirestoreFieldType)}
                        className="w-full px-3 py-2 bg-white/[0.06] border-0 rounded-lg text-white/80 focus:ring-1 focus:ring-violet-500/30 transition-all"
                    >
                        {FIELD_TYPES.filter(t => t !== 'map').map((t) => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>
            )}

            <div className="mb-3">
                <label className="block text-sm font-medium text-white/40 mb-1">Description</label>
                <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 bg-white/[0.06] border-0 rounded-lg text-white/80 placeholder-white/20 focus:ring-1 focus:ring-violet-500/30 transition-all"
                    placeholder="Optional description"
                />
            </div>

            <div className="mb-3">
                <label className="block text-sm font-medium text-white/40 mb-1">Default Value</label>
                <select
                    value={defaultPreset}
                    onChange={(e) => {
                        setDefaultPreset(e.target.value as DefaultValuePreset);
                        if (e.target.value !== 'custom') {
                            setCustomDefaultValue('');
                        }
                    }}
                    className="w-full px-3 py-2 bg-white/[0.06] border-0 rounded-lg text-white/80 focus:ring-1 focus:ring-violet-500/30 transition-all"
                >
                    {availablePresets.map((preset) => (
                        <option key={preset.value} value={preset.value}>
                            {preset.label} {preset.description ? `— ${preset.description}` : ''}
                        </option>
                    ))}
                </select>
                {defaultPreset === 'custom' && (
                    <input
                        type="text"
                        value={customDefaultValue}
                        onChange={(e) => setCustomDefaultValue(e.target.value)}
                        className="w-full mt-2 px-3 py-2 bg-white/[0.06] border-0 rounded-lg text-white/80 placeholder-white/20 focus:ring-1 focus:ring-violet-500/30 transition-all"
                        placeholder="e.g. 42, 'hello', true"
                    />
                )}
            </div>

            <div className="flex gap-4 mb-3">
                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={isRequired}
                        onChange={(e) => setIsRequired(e.target.checked)}
                        className="rounded border-0 bg-white/[0.1] text-violet-500 focus:ring-violet-500/30"
                    />
                    <span className="text-sm text-white/50">Required</span>
                </label>
            </div>

            {/* Field Visibility */}
            <div className="flex gap-4 mb-3 items-center">
                <span className="text-sm font-medium text-white/40">Visibility:</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={visibilityClient}
                        onChange={(e) => setVisibilityClient(e.target.checked)}
                        className="rounded border-0 bg-white/[0.1] text-violet-500 focus:ring-violet-500/30"
                    />
                    <Monitor className="w-3.5 h-3.5 text-violet-400/70" />
                    <span className="text-sm text-white/50">Client</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={visibilityServer}
                        onChange={(e) => setVisibilityServer(e.target.checked)}
                        className="rounded border-0 bg-white/[0.1] text-emerald-500 focus:ring-emerald-500/30"
                    />
                    <Server className="w-3.5 h-3.5 text-emerald-400/70" />
                    <span className="text-sm text-white/50">Server</span>
                </label>
            </div>

            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={onCancel}
                    className="flex-1 px-4 py-2 text-white/40 rounded-lg hover:bg-white/[0.04] hover:text-white/60 transition-all"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-violet-500/80 text-white rounded-lg hover:bg-violet-500 transition-all"
                >
                    Add Field
                </button>
            </div>
        </form>
    );
}

interface FieldRowProps {
    field: FirestoreField;
    allCollections: FirestoreCollection[];
    isEditing: boolean;
    onEdit: () => void;
    onSave: (updates: Partial<FirestoreField>) => void;
    onCancel: () => void;
    onDelete: () => void;
}

function FieldRow({ field, allCollections, isEditing, onEdit, onSave, onCancel, onDelete }: FieldRowProps) {
    const [editData, setEditData] = useState(field);

    if (isEditing) {
        return (
            <div className="bg-white/[0.04] rounded-2xl p-5">
                <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                        <label className="block text-sm font-medium text-white/40 mb-1">Field Name</label>
                        <input
                            type="text"
                            value={editData.name}
                            onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                            className="w-full px-3 py-2 bg-white/[0.06] border-0 rounded-lg text-white/80 focus:ring-1 focus:ring-violet-500/30 transition-all"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-white/40 mb-1">Type</label>
                        <select
                            value={editData.type}
                            onChange={(e) => {
                                const newType = e.target.value as FirestoreFieldType;
                                setEditData({ ...editData, type: newType, defaultPreset: 'none' });
                            }}
                            className="w-full px-3 py-2 bg-white/[0.06] border-0 rounded-lg text-white/80 focus:ring-1 focus:ring-violet-500/30 transition-all"
                        >
                            {FIELD_TYPES.map((t) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="mb-3">
                    <label className="block text-sm font-medium text-white/40 mb-1">Description</label>
                    <input
                        type="text"
                        value={editData.description || ''}
                        onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                        className="w-full px-3 py-2 bg-white/[0.06] border-0 rounded-lg text-white/80 placeholder-white/20 focus:ring-1 focus:ring-violet-500/30 transition-all"
                    />
                </div>

                {editData.type === 'reference' && (
                    <div className="mb-3">
                        <label className="block text-sm font-medium text-white/40 mb-1">Collections</label>
                        <div className="space-y-2 max-h-48 overflow-y-auto bg-white/[0.02] rounded-lg p-3 border border-white/[0.08]">
                            {allCollections.length === 0 ? (
                                <p className="text-sm text-white/30">No collections available</p>
                            ) : (
                                allCollections.map((collection) => (
                                    <label key={collection.id} className="flex items-center gap-2 cursor-pointer hover:bg-white/[0.04] p-2 rounded">
                                        <input
                                            type="checkbox"
                                            checked={(editData.referenceCollections || []).includes(collection.id)}
                                            onChange={(e) => {
                                                const current = editData.referenceCollections || [];
                                                if (e.target.checked) {
                                                    setEditData({ ...editData, referenceCollections: [...current, collection.id] });
                                                } else {
                                                    setEditData({ ...editData, referenceCollections: current.filter(id => id !== collection.id) });
                                                }
                                            }}
                                            className="rounded border-0 bg-white/[0.1] text-violet-500 focus:ring-violet-500/30"
                                        />
                                        <span className="text-sm text-white/70">{collection.name}</span>
                                    </label>
                                ))
                            )}
                        </div>
                    </div>
                )}

                <div className="mb-3">
                    <label className="block text-sm font-medium text-white/40 mb-1">Default Value</label>
                    <select
                        value={editData.defaultPreset || 'none'}
                        onChange={(e) => {
                            const newPreset = e.target.value as DefaultValuePreset;
                            setEditData({
                                ...editData,
                                defaultPreset: newPreset !== 'none' ? newPreset : undefined,
                                defaultValue: newPreset !== 'custom' ? undefined : editData.defaultValue
                            });
                        }}
                        className="w-full px-3 py-2 bg-white/[0.06] border-0 rounded-lg text-white/80 focus:ring-1 focus:ring-violet-500/30 transition-all"
                    >
                        {getAvailablePresetsForType(editData.type).map((preset) => (
                            <option key={preset.value} value={preset.value}>
                                {preset.label} {preset.description ? `— ${preset.description}` : ''}
                            </option>
                        ))}
                    </select>
                    {editData.defaultPreset === 'custom' && (
                        <input
                            type="text"
                            value={editData.defaultValue || ''}
                            onChange={(e) => setEditData({ ...editData, defaultValue: e.target.value })}
                            className="w-full mt-2 px-3 py-2 bg-white/[0.06] border-0 rounded-lg text-white/80 placeholder-white/20 focus:ring-1 focus:ring-violet-500/30 transition-all"
                            placeholder="e.g. 42, 'hello', true"
                        />
                    )}
                </div>

                <div className="flex gap-4 mb-3">
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={editData.isRequired}
                            onChange={(e) => setEditData({ ...editData, isRequired: e.target.checked })}
                            className="rounded border-0 bg-white/[0.1] text-violet-500 focus:ring-violet-500/30"
                        />
                        <span className="text-sm text-white/50">Required</span>
                    </label>
                </div>

                {/* Field Visibility */}
                <div className="flex gap-4 mb-3 items-center">
                    <span className="text-sm font-medium text-white/40">Visibility:</span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={editData.visibility?.client !== false}
                            onChange={(e) => setEditData({
                                ...editData,
                                visibility: {
                                    client: e.target.checked,
                                    server: editData.visibility?.server !== false,
                                },
                            })}
                            className="rounded border-0 bg-white/[0.1] text-violet-500 focus:ring-violet-500/30"
                        />
                        <Monitor className="w-3.5 h-3.5 text-violet-400/70" />
                        <span className="text-sm text-white/50">Client</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={editData.visibility?.server !== false}
                            onChange={(e) => setEditData({
                                ...editData,
                                visibility: {
                                    client: editData.visibility?.client !== false,
                                    server: e.target.checked,
                                },
                            })}
                            className="rounded border-0 bg-white/[0.1] text-emerald-500 focus:ring-emerald-500/30"
                        />
                        <Server className="w-3.5 h-3.5 text-emerald-400/70" />
                        <span className="text-sm text-white/50">Server</span>
                    </label>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-white/40 rounded-lg hover:bg-white/[0.04] hover:text-white/60 transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            const validationError = validateField(editData);
                            if (validationError) {
                                alert(validationError);
                                return;
                            }
                            onSave(editData);
                        }}
                        className="px-4 py-2 bg-violet-500/80 text-white rounded-lg hover:bg-violet-500 transition-all"
                    >
                        Save
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white/[0.03] rounded-xl p-4 hover:bg-white/[0.05] transition-all duration-200 group">
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-medium text-white/80">{field.name}</span>
                        <span className="px-2 py-0.5 text-xs font-medium bg-white/[0.06] text-violet-300/70 rounded-md">
                            {field.type}
                        </span>
                        {field.isRequired && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-red-500/10 text-red-400/70 rounded-md">
                                Required
                            </span>
                        )}
                        {!field.isRequired && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-violet-500/10 text-violet-300/60 rounded-md">
                                Optional
                            </span>
                        )}
                        {field.visibility && (!field.visibility.client || !field.visibility.server) && (
                            <>
                                {field.visibility.client && !field.visibility.server && (
                                    <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-violet-500/10 text-violet-300/60 rounded-md">
                                        <Monitor className="w-3 h-3" /> Client only
                                    </span>
                                )}
                                {field.visibility.server && !field.visibility.client && (
                                    <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-emerald-500/10 text-emerald-300/60 rounded-md">
                                        <Server className="w-3 h-3" /> Server only
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                    {field.description && (
                        <p className="text-sm text-white/30">{field.description}</p>
                    )}
                    {field.type === 'array' && field.arrayItemType && (
                        <p className="text-xs text-white/20 mt-1">Array of {field.arrayItemType}</p>
                    )}
                    {field.type === 'map' && field.mapValueType && (
                        <p className="text-xs text-white/20 mt-1">Map values: {field.mapValueType}</p>
                    )}
                    {field.type === 'reference' && field.referenceCollections && field.referenceCollections.length > 0 && (
                        <p className="text-xs text-white/20 mt-1">References: {field.referenceCollections.join(', ')}</p>
                    )}
                    {field.defaultPreset && field.defaultPreset !== 'none' && (
                        <p className="text-xs text-emerald-400/60 mt-1">Default: {field.defaultPreset}</p>
                    )}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={onEdit}
                        className="p-2 text-violet-400/60 hover:bg-white/[0.05] rounded-lg transition-all"
                        title="Edit field"
                    >
                        <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={onDelete}
                        className="p-2 text-red-400/50 hover:bg-white/[0.05] rounded-lg transition-all"
                        title="Delete field"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
