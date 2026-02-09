import { X, Copy, Download, Check } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';

interface SecurityRulesPreviewProps {
    code: string;
    projectName: string;
    onClose: () => void;
}

export default function SecurityRulesPreview({ code, projectName, onClose }: SecurityRulesPreviewProps) {
    const [copied, setCopied] = useState(false);
    const dialogRef = useRef<HTMLDivElement>(null);

    // Escape key to close
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    // Focus the dialog on mount
    useEffect(() => {
        dialogRef.current?.focus();
    }, []);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    };

    const handleDownload = () => {
        try {
            const blob = new Blob([code], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${projectName || 'firestore'}.rules`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to download:', error);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-50 p-6" role="dialog" aria-modal="true" aria-labelledby="security-rules-title" ref={dialogRef} tabIndex={-1} style={{ overscrollBehavior: 'contain' }}>
            <div className="bg-[#1a1a3e]/95 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4">
                    <div>
                        <h2 id="security-rules-title" className="text-lg font-semibold text-white/90">Firestore Security Rules</h2>
                        <p className="text-sm text-white/30 mt-0.5">
                            Copy to your Firebase Console or <code className="px-1.5 py-0.5 bg-white/[0.05] rounded text-xs font-mono text-amber-300/70">firestore.rules</code> file
                        </p>
                    </div>
                    <div className="flex items-center gap-1">
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
                            className="flex items-center gap-2 px-3.5 py-1.5 bg-amber-500/80 text-white rounded-lg hover:bg-amber-500 transition-all duration-200 text-sm"
                        >
                            <Download className="w-4 h-4" />
                            <span>Download .rules</span>
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 text-white/30 hover:text-white/60 hover:bg-white/[0.05] rounded-lg transition-all duration-200 ml-1"
                            aria-label="Close security rules preview"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Code Editor */}
                <div className="flex-1 overflow-hidden">
                    <Editor
                        height="100%"
                        defaultLanguage="plaintext"
                        value={code}
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
                            <span className="font-medium text-white/50">{code.split('\n').length}</span> lines
                            <span className="mx-2 text-white/15">•</span>
                            <span className="font-medium text-white/50">{code.length}</span> characters
                        </div>
                        <div className="text-white/25">
                            Deploy with <code className="px-2 py-0.5 bg-white/[0.05] rounded text-xs font-mono text-amber-300/70">
                                firebase deploy --only firestore:rules
                            </code>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
