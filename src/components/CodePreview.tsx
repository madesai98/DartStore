import { X, Copy, Download, Check, FileCode, Shield, Server, Pencil } from 'lucide-react';
import { useState } from 'react';
import Editor from '@monaco-editor/react';
import { exportDartCode } from '../utils/storage';
import type { ProjectTransformConfig } from '../types';

type CodeTab = 'dart' | 'security' | 'cloud-function';

interface CodePreviewProps {
    dartCode: string;
    securityRulesCode: string;
    cloudFunctionCode: string;
    projectName: string;
    transformConfig: ProjectTransformConfig;
    onTransformConfigChange: (config: ProjectTransformConfig) => void;
    onClose: () => void;
}

const TABS: { id: CodeTab; label: string; icon: React.ReactNode; language: string; ext: string; accentClass: string }[] = [
    { id: 'dart', label: 'Dart Model', icon: <FileCode className="w-3.5 h-3.5" />, language: 'dart', ext: '.dart', accentClass: 'bg-violet-500/80 text-white' },
    { id: 'security', label: 'Security Rules', icon: <Shield className="w-3.5 h-3.5" />, language: 'plaintext', ext: '.rules', accentClass: 'bg-amber-500/80 text-white' },
    { id: 'cloud-function', label: 'Cloud Function', icon: <Server className="w-3.5 h-3.5" />, language: 'typescript', ext: '.ts', accentClass: 'bg-emerald-500/80 text-white' },
];

export default function CodePreview({
    dartCode,
    securityRulesCode,
    cloudFunctionCode,
    projectName,
    transformConfig,
    onTransformConfigChange,
    onClose,
}: CodePreviewProps) {
    const [copied, setCopied] = useState(false);
    const [activeTab, setActiveTab] = useState<CodeTab>('dart');
    const [editingEndpoint, setEditingEndpoint] = useState(false);
    const [endpointValue, setEndpointValue] = useState(transformConfig.endpointName);

    const currentTab = TABS.find(t => t.id === activeTab)!;
    const currentCode = activeTab === 'dart' ? dartCode : activeTab === 'security' ? securityRulesCode : cloudFunctionCode;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(currentCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    };

    const handleDownload = () => {
        if (activeTab === 'dart') {
            exportDartCode(currentCode, projectName);
        } else {
            const fileName = activeTab === 'security'
                ? `${projectName.toLowerCase().replace(/\s+/g, '_')}_rules${currentTab.ext}`
                : `${transformConfig.endpointName || 'index'}${currentTab.ext}`;
            const blob = new Blob([currentCode], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    const commitEndpoint = () => {
        const trimmed = endpointValue.trim() || 'api';
        onTransformConfigChange({ ...transformConfig, endpointName: trimmed });
        setEditingEndpoint(false);
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-50 p-6">
            <div className="bg-[#1a1a3e]/95 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="min-w-0">
                            <h2 className="text-lg font-semibold text-white/90">View Code</h2>
                            <p className="text-sm text-white/30 mt-0.5">
                                Ready to use in your project
                            </p>
                        </div>

                        {/* Tab switcher */}
                        <div className="flex items-center bg-white/[0.04] rounded-lg overflow-hidden ml-4">
                            {TABS.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => { setActiveTab(tab.id); setCopied(false); }}
                                    className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-all duration-200 ${activeTab === tab.id
                                        ? tab.accentClass
                                        : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
                                        }`}
                                >
                                    {tab.icon}
                                    <span className="hidden sm:inline">{tab.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-1">
                        {/* Endpoint name editor (only on cloud function tab) */}
                        {activeTab === 'cloud-function' && (
                            <div className="flex items-center gap-1.5 mr-3">
                                <span className="text-xs text-white/30">Endpoint:</span>
                                {editingEndpoint ? (
                                    <form onSubmit={(e) => { e.preventDefault(); commitEndpoint(); }} className="flex items-center gap-1">
                                        <input
                                            value={endpointValue}
                                            onChange={e => setEndpointValue(e.target.value)}
                                            onBlur={commitEndpoint}
                                            className="px-2 py-0.5 text-xs bg-white/[0.06] border-0 rounded text-white/80 focus:ring-1 focus:ring-emerald-500/30 w-28"
                                            autoFocus
                                            onKeyDown={e => { if (e.key === 'Escape') { setEndpointValue(transformConfig.endpointName); setEditingEndpoint(false); } }}
                                        />
                                        <button type="submit" className="p-0.5 text-white/40 hover:text-emerald-400">
                                            <Check className="w-3 h-3" />
                                        </button>
                                    </form>
                                ) : (
                                    <button
                                        onClick={() => setEditingEndpoint(true)}
                                        className="flex items-center gap-1 px-2 py-0.5 text-xs text-emerald-300/60 bg-emerald-500/10 rounded hover:bg-emerald-500/20 transition-colors group"
                                    >
                                        <span className="font-mono">{transformConfig.endpointName}</span>
                                        <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </button>
                                )}
                            </div>
                        )}

                        <button
                            onClick={handleCopy}
                            className="flex items-center gap-2 px-3.5 py-1.5 text-white/40 hover:text-white/70 hover:bg-white/[0.05] rounded-lg transition-all duration-200"
                            title="Copy to clipboard"
                        >
                            {copied ? (
                                <>
                                    <Check className="w-4 h-4 text-emerald-400" />
                                    <span className="text-emerald-400 text-sm">Copied!</span>
                                </>
                            ) : (
                                <>
                                    <Copy className="w-4 h-4" />
                                    <span className="text-sm">Copy</span>
                                </>
                            )}
                        </button>
                        <button
                            onClick={handleDownload}
                            className="flex items-center gap-2 px-3.5 py-1.5 bg-violet-500/80 text-white rounded-lg hover:bg-violet-500 transition-all duration-200 text-sm"
                        >
                            <Download className="w-4 h-4" />
                            <span>Download</span>
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 text-white/30 hover:text-white/60 hover:bg-white/[0.05] rounded-lg transition-all duration-200 ml-1"
                            title="Close"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Code Editor */}
                <div className="flex-1 overflow-hidden">
                    <Editor
                        height="100%"
                        language={currentTab.language}
                        value={currentCode}
                        theme="vs-dark"
                        options={{
                            readOnly: true,
                            minimap: { enabled: true },
                            fontSize: 14,
                            lineNumbers: 'on',
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            wordWrap: 'on',
                            padding: { top: 16, bottom: 16 },
                        }}
                    />
                </div>

                {/* Footer */}
                <div className="px-6 py-3 bg-white/[0.02]">
                    <div className="flex items-center justify-between text-sm">
                        <div className="text-white/30">
                            <span className="font-medium text-white/50">{currentCode.split('\n').length}</span> lines
                            <span className="mx-2 text-white/15">•</span>
                            <span className="font-medium text-white/50">{currentCode.length}</span> characters
                        </div>
                        <div className="text-white/25">
                            {activeTab === 'dart' && (
                                <>Include <code className="px-2 py-0.5 bg-white/[0.05] rounded text-xs font-mono text-violet-300/70">cloud_firestore</code> in your pubspec.yaml</>
                            )}
                            {activeTab === 'security' && (
                                <>Deploy with <code className="px-2 py-0.5 bg-white/[0.05] rounded text-xs font-mono text-amber-300/70">firebase deploy --only firestore:rules</code></>
                            )}
                            {activeTab === 'cloud-function' && (
                                <>Deploy with <code className="px-2 py-0.5 bg-white/[0.05] rounded text-xs font-mono text-emerald-300/70">firebase deploy --only functions</code></>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
