import { Database, Code2, Download, Upload, FileCode, Shield, LayoutGrid } from 'lucide-react';
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
    const handleExportProject = () => {
        exportProject(project);
    };

    const handleExportDart = () => {
        const dartCode = generateFullDartFile(project);
        exportDartCode(dartCode, project.name);
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
    };

    return (
        <header className="px-6 py-3.5 bg-white/[0.03]">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-violet-500/20 p-2 rounded-xl">
                        <Database className="w-5 h-5 text-violet-300" />
                    </div>
                    <div>
                        <h1 className="text-base font-semibold text-white/90 tracking-tight">{project.name}</h1>
                        {project.description && (
                            <p className="text-xs text-white/30">{project.description}</p>
                        )}
                    </div>

                    {/* View Tabs */}
                    <div className="flex items-center ml-4 bg-white/[0.04] rounded-lg overflow-hidden">
                        <button
                            onClick={() => onChangeView('editor')}
                            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium transition-all duration-200 ${activeView === 'editor'
                                ? 'bg-violet-500/80 text-white'
                                : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
                                }`}
                        >
                            <Database className="w-3.5 h-3.5" />
                            <span>Models</span>
                        </button>
                        <button
                            onClick={() => onChangeView('security-rules')}
                            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium transition-all duration-200 ${activeView === 'security-rules'
                                ? 'bg-amber-500/80 text-white'
                                : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
                                }`}
                        >
                            <Shield className="w-3.5 h-3.5" />
                            <span>Security Rules</span>
                        </button>
                        <button
                            onClick={() => onChangeView('overview')}
                            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium transition-all duration-200 ${activeView === 'overview'
                                ? 'bg-teal-500/80 text-white'
                                : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
                                }`}
                        >
                            <LayoutGrid className="w-3.5 h-3.5" />
                            <span>Overview</span>
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-0.5">
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
            </div>
        </header>
    );
}
