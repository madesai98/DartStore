import { useState, useRef, useEffect } from 'react';
import { Code2, Download, Upload, FileCode, Shield, LayoutGrid, Database, Menu, X, Check, Pencil } from 'lucide-react';
import type { FirestoreProject } from '../types';
import { exportProject, exportDartCode, importProject } from '../utils/storage';
import { generateFullDartFile } from '../utils/dartGenerator';

type AppView = 'editor' | 'security-rules' | 'overview';

interface HeaderProps {
    project: FirestoreProject;
    onUpdateProject: (updates: Partial<FirestoreProject>) => void;
    onShowCode: () => void;
    onNewProject: () => void;
    activeView: AppView;
    onChangeView: (view: AppView) => void;
}

export default function Header({ project, onUpdateProject, onShowCode, onNewProject, activeView, onChangeView }: HeaderProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [editingName, setEditingName] = useState(false);
    const [editingDesc, setEditingDesc] = useState(false);
    const [nameValue, setNameValue] = useState(project.name);
    const [descValue, setDescValue] = useState(project.description ?? '');
    const nameRef = useRef<HTMLInputElement>(null);
    const descRef = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close menu on outside click
    useEffect(() => {
        if (!menuOpen) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [menuOpen]);

    // Auto-focus inputs
    useEffect(() => { if (editingName) nameRef.current?.focus(); }, [editingName]);
    useEffect(() => { if (editingDesc) descRef.current?.focus(); }, [editingDesc]);

    // Sync with external project prop changes
    useEffect(() => { setNameValue(project.name); }, [project.name]);
    useEffect(() => { setDescValue(project.description ?? ''); }, [project.description]);

    const commitName = () => {
        const trimmed = nameValue.trim();
        if (trimmed && trimmed !== project.name) onUpdateProject({ name: trimmed });
        else setNameValue(project.name);
        setEditingName(false);
    };

    const commitDesc = () => {
        const trimmed = descValue.trim();
        if (trimmed !== (project.description ?? '')) onUpdateProject({ description: trimmed || undefined });
        else setDescValue(project.description ?? '');
        setEditingDesc(false);
    };

    const handleExportProject = () => {
        exportProject(project);
        setMenuOpen(false);
    };

    const handleExportDart = () => {
        const dartCode = generateFullDartFile(project);
        exportDartCode(dartCode, project.name);
        setMenuOpen(false);
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const importedProject = await importProject(file);
            if (confirm('This will replace your current project. Continue?')) {
                onUpdateProject(importedProject);
            }
        } catch (error) {
            alert('Failed to import project. Please check the file format.');
        }
        e.target.value = '';
        setMenuOpen(false);
    };

    const tabs: { view: AppView; label: string; icon: React.ReactNode; activeClass: string }[] = [
        { view: 'editor', label: 'Models', icon: <Database className="w-3.5 h-3.5" />, activeClass: 'bg-violet-500/80 text-white' },
        { view: 'security-rules', label: 'Security Rules', icon: <Shield className="w-3.5 h-3.5" />, activeClass: 'bg-amber-500/80 text-white' },
        { view: 'overview', label: 'Overview', icon: <LayoutGrid className="w-3.5 h-3.5" />, activeClass: 'bg-teal-500/80 text-white' },
    ];

    return (
        <header className="px-4 sm:px-6 py-3.5 bg-white/[0.03]">
            <div className="flex items-center gap-3">
                {/* Editable name / description — constrained width with ellipsis */}
                <div className="min-w-0 max-w-[30%] shrink group">
                    {editingName ? (
                        <form onSubmit={(e) => { e.preventDefault(); commitName(); }} className="flex items-center gap-1">
                            <input
                                ref={nameRef}
                                value={nameValue}
                                onChange={(e) => setNameValue(e.target.value)}
                                onBlur={commitName}
                                onKeyDown={(e) => { if (e.key === 'Escape') { setNameValue(project.name); setEditingName(false); } }}
                                className="text-base font-semibold text-white/90 tracking-tight bg-white/[0.06] rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-violet-500/40 w-full max-w-48"
                            />
                            <button type="submit" className="p-0.5 text-white/40 hover:text-emerald-400 shrink-0">
                                <Check className="w-3.5 h-3.5" />
                            </button>
                        </form>
                    ) : (
                        <button
                            onClick={() => setEditingName(true)}
                            className="relative flex items-center gap-1.5 max-w-full text-base font-semibold text-white/90 tracking-tight hover:text-white transition-colors group/name"
                        >
                            <span className="truncate">{project.name}</span>
                            <Pencil className="w-3 h-3 shrink-0 text-white/0 group-hover:text-white/30 transition-colors" />
                            <span className="absolute left-0 top-full mt-1.5 hidden group-hover/name:block max-w-xs px-2.5 py-1.5 rounded-lg bg-[#1a1a40]/95 border border-white/[0.08] shadow-xl text-xs font-normal text-white/60 z-[9999] whitespace-nowrap pointer-events-none">
                                {project.name}
                            </span>
                        </button>
                    )}
                    {editingDesc ? (
                        <form onSubmit={(e) => { e.preventDefault(); commitDesc(); }} className="flex items-center gap-1 mt-0.5">
                            <input
                                ref={descRef}
                                value={descValue}
                                onChange={(e) => setDescValue(e.target.value)}
                                onBlur={commitDesc}
                                onKeyDown={(e) => { if (e.key === 'Escape') { setDescValue(project.description ?? ''); setEditingDesc(false); } }}
                                placeholder="Add a description…"
                                className="text-xs text-white/30 bg-white/[0.06] rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-violet-500/40 w-full max-w-56 placeholder-white/15"
                            />
                            <button type="submit" className="p-0.5 text-white/40 hover:text-emerald-400 shrink-0">
                                <Check className="w-3 h-3" />
                            </button>
                        </form>
                    ) : (
                        <button
                            onClick={() => setEditingDesc(true)}
                            className="relative text-xs text-white/30 hover:text-white/50 transition-colors cursor-pointer mt-0.5 block max-w-full truncate text-left group/desc"
                        >
                            {project.description || 'Add description…'}
                            {project.description && (
                                <span className="absolute left-0 top-full mt-1.5 hidden group-hover/desc:block max-w-xs px-2.5 py-1.5 rounded-lg bg-[#1a1a40]/95 border border-white/[0.08] shadow-xl text-[11px] font-normal text-white/50 z-[9999] whitespace-normal pointer-events-none">
                                    {project.description}
                                </span>
                            )}
                        </button>
                    )}
                </div>

                {/* Spacer pushes tabs + actions to the right */}
                <div className="flex-1" />

                {/* View Tabs — collapse labels on small screens */}
                <div className="flex items-center bg-white/[0.04] rounded-lg overflow-hidden shrink-0">
                    {tabs.map(tab => (
                        <button
                            key={tab.view}
                            onClick={() => onChangeView(tab.view)}
                            className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium transition-all duration-200 ${activeView === tab.view
                                    ? tab.activeClass
                                    : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
                                }`}
                            title={tab.label}
                        >
                            {tab.icon}
                            <span className="hidden md:inline">{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* Desktop actions */}
                <div className="hidden lg:flex items-center gap-0.5 shrink-0">
                    <button
                        onClick={onShowCode}
                        className="flex items-center gap-2 px-3.5 py-1.5 text-violet-300/90 hover:text-violet-200 hover:bg-white/[0.05] rounded-lg transition-all duration-200"
                    >
                        <Code2 className="w-4 h-4" />
                        <span className="font-medium text-sm">View Code</span>
                    </button>

                    <button
                        onClick={handleExportDart}
                        className="flex items-center gap-2 px-3.5 py-1.5 text-white/40 hover:text-white/70 hover:bg-white/[0.05] rounded-lg transition-all duration-200"
                        title="Export Dart Code"
                    >
                        <FileCode className="w-4 h-4" />
                        <span className="font-medium text-sm">Export .dart</span>
                    </button>

                    <button
                        onClick={handleExportProject}
                        className="flex items-center gap-2 px-3.5 py-1.5 text-white/40 hover:text-white/70 hover:bg-white/[0.05] rounded-lg transition-all duration-200"
                        title="Export Project"
                    >
                        <Download className="w-4 h-4" />
                        <span className="font-medium text-sm">Export</span>
                    </button>

                    <label className="flex items-center gap-2 px-3.5 py-1.5 text-white/40 hover:text-white/70 hover:bg-white/[0.05] rounded-lg transition-all duration-200 cursor-pointer"
                        title="Import Project">
                        <Upload className="w-4 h-4" />
                        <span className="font-medium text-sm">Import</span>
                        <input
                            type="file"
                            accept=".json"
                            onChange={handleImport}
                            className="hidden"
                        />
                    </label>

                    <button
                        onClick={() => {
                            if (confirm('Create a new project? Your current work is auto-saved.')) {
                                onNewProject();
                            }
                        }}
                        className="px-3.5 py-1.5 text-white/40 hover:text-white/70 hover:bg-white/[0.05] rounded-lg transition-all duration-200 font-medium text-sm"
                    >
                        New Project
                    </button>
                </div>

                {/* Mobile hamburger menu */}
                <div className="lg:hidden relative shrink-0" ref={menuRef}>
                    <button
                        onClick={() => setMenuOpen(!menuOpen)}
                        className="p-2 text-white/50 hover:text-white/80 hover:bg-white/[0.06] rounded-lg transition-all"
                    >
                        {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                    </button>

                    {menuOpen && (
                        <div className="absolute right-0 top-full mt-1 w-52 bg-[#1e1e3a]/95 backdrop-blur-md border border-white/[0.08] rounded-xl shadow-xl z-50 py-1.5 overflow-hidden">
                            <button
                                onClick={() => { onShowCode(); setMenuOpen(false); }}
                                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-violet-300/90 hover:bg-white/[0.06] transition-colors text-sm"
                            >
                                <Code2 className="w-4 h-4" />
                                View Code
                            </button>
                            <button
                                onClick={handleExportDart}
                                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-colors text-sm"
                            >
                                <FileCode className="w-4 h-4" />
                                Export .dart
                            </button>
                            <button
                                onClick={handleExportProject}
                                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-colors text-sm"
                            >
                                <Download className="w-4 h-4" />
                                Export Project
                            </button>
                            <label className="flex items-center gap-2.5 w-full px-4 py-2.5 text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-colors text-sm cursor-pointer">
                                <Upload className="w-4 h-4" />
                                Import
                                <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                            </label>
                            <div className="border-t border-white/[0.06] my-1" />
                            <button
                                onClick={() => {
                                    if (confirm('Create a new project? Your current work is auto-saved.')) {
                                        onNewProject();
                                    }
                                    setMenuOpen(false);
                                }}
                                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-colors text-sm"
                            >
                                New Project
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
