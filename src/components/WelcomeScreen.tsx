import { useState } from 'react';
import { Database, Upload, Sparkles, Users } from 'lucide-react';
import type { FirestoreProject } from '../types';
import { importProject } from '../utils/storage';

interface WelcomeScreenProps {
    onCreateProject: (name: string, description?: string) => void;
    onLoadProject: (project: FirestoreProject) => void;
    onJoinSession?: (sessionId: string, username: string) => void;
    isJoining?: boolean;
}

export default function WelcomeScreen({ onCreateProject, onLoadProject, onJoinSession, isJoining }: WelcomeScreenProps) {
    const [showNewProject, setShowNewProject] = useState(false);
    const [projectName, setProjectName] = useState('');
    const [projectDescription, setProjectDescription] = useState('');
    const [joinUsername, setJoinUsername] = useState('');
    const [joinSessionId, setJoinSessionId] = useState('');

    const handleCreateProject = (e: React.FormEvent) => {
        e.preventDefault();
        if (projectName.trim()) {
            onCreateProject(projectName.trim(), projectDescription.trim() || undefined);
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const project = await importProject(file);
            onLoadProject(project);
        } catch {
            alert('Failed to import project. Please check the file format.');
        }
    };

    const handleJoinSession = (e: React.FormEvent) => {
        e.preventDefault();
        if (joinUsername.trim() && joinSessionId.trim() && onJoinSession) {
            onJoinSession(joinSessionId.trim().toUpperCase(), joinUsername.trim());
        }
    };

    if (showNewProject) {
        return (
            <div className="h-screen flex items-center justify-center">
                <div className="bg-white/[0.04] rounded-2xl p-8 w-full max-w-md">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="bg-violet-500/20 p-3 rounded-xl">
                            <Database className="w-6 h-6 text-violet-300" />
                        </div>
                        <h1 className="text-2xl font-bold text-white/90">New Project</h1>
                    </div>

                    <form onSubmit={handleCreateProject} className="space-y-4">
                        <div>
                            <label htmlFor="name" className="block text-sm font-medium text-white/40 mb-1">
                                Project Name *
                            </label>
                            <input
                                type="text"
                                id="name"
                                value={projectName}
                                onChange={(e) => setProjectName(e.target.value)}
                                className="w-full px-4 py-2.5 bg-white/[0.06] border-0 rounded-lg text-white/80 placeholder-white/20 focus:ring-1 focus:ring-violet-500/30 transition-all"
                                placeholder="My Firestore Project"
                                required
                                autoFocus
                            />
                        </div>

                        <div>
                            <label htmlFor="description" className="block text-sm font-medium text-white/40 mb-1">
                                Description (optional)
                            </label>
                            <textarea
                                id="description"
                                value={projectDescription}
                                onChange={(e) => setProjectDescription(e.target.value)}
                                className="w-full px-4 py-2.5 bg-white/[0.06] border-0 rounded-lg text-white/80 placeholder-white/20 focus:ring-1 focus:ring-violet-500/30 resize-none transition-all"
                                rows={3}
                                placeholder="Describe your Firestore database…"
                            />
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowNewProject(false)}
                                className="flex-1 px-4 py-2.5 text-white/40 rounded-lg hover:bg-white/[0.04] hover:text-white/60 transition-all"
                            >
                                Back
                            </button>
                            <button
                                type="submit"
                                className="flex-1 px-4 py-2.5 bg-violet-500/80 text-white rounded-lg hover:bg-violet-500 transition-all font-medium"
                            >
                                Create Project
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen flex items-center justify-center relative overflow-hidden">
            <div className="text-center max-w-2xl px-6 relative z-10">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-violet-500/20 rounded-2xl mb-8">
                    <Database className="w-10 h-10 text-violet-300" />
                </div>

                <h1 className="text-5xl font-bold text-white/90 mb-4 tracking-tight">
                    DartStore
                </h1>

                <p className="text-xl text-white/30 mb-12 leading-relaxed">
                    Model your Firestore database and generate type-safe Dart code for Flutter
                </p>

                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                    <button
                        onClick={() => setShowNewProject(true)}
                        className="group flex items-center gap-3 px-8 py-4 bg-violet-500/80 text-white rounded-xl hover:bg-violet-500 transition-all duration-300 transform hover:-translate-y-0.5"
                    >
                        <Sparkles className="w-5 h-5" />
                        <span className="font-semibold">Create New Project</span>
                    </button>

                    <label className="group flex items-center gap-3 px-8 py-4 bg-white/[0.04] text-white/50 rounded-xl hover:bg-white/[0.07] transition-all duration-300 transform hover:-translate-y-0.5 cursor-pointer">
                        <Upload className="w-5 h-5" />
                        <span className="font-semibold">Import Project</span>
                        <input
                            type="file"
                            accept=".json"
                            onChange={handleImport}
                            className="hidden"
                        />
                    </label>
                </div>

                {/* Join Session */}
                {onJoinSession && (
                    <div className="mt-10 w-full max-w-md mx-auto">
                        <div className="bg-white/[0.04] rounded-2xl p-6">
                            <div className="flex items-center gap-2 mb-4">
                                <Users className="w-5 h-5 text-blue-300" />
                                <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Join a Session</h2>
                            </div>
                            <form onSubmit={handleJoinSession} className="space-y-3">
                                <input
                                    type="text"
                                    value={joinUsername}
                                    onChange={(e) => setJoinUsername(e.target.value)}
                                    placeholder="Your name"
                                    className="w-full px-4 py-2.5 bg-white/[0.06] border-0 rounded-lg text-white/80 placeholder-white/20 focus:ring-1 focus:ring-blue-500/30 transition-all text-sm"
                                    maxLength={20}
                                    disabled={isJoining}
                                />
                                <input
                                    type="text"
                                    value={joinSessionId}
                                    onChange={(e) => setJoinSessionId(e.target.value.toUpperCase())}
                                    placeholder="Session ID (e.g. A3KR7W)"
                                    className="w-full px-4 py-2.5 bg-white/[0.06] border-0 rounded-lg text-white/80 placeholder-white/20 focus:ring-1 focus:ring-blue-500/30 font-mono tracking-widest transition-all text-sm"
                                    maxLength={6}
                                    disabled={isJoining}
                                />
                                <button
                                    type="submit"
                                    disabled={!joinUsername.trim() || !joinSessionId.trim() || isJoining}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500/80 text-white rounded-lg hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all font-medium text-sm"
                                >
                                    {isJoining ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Connecting…
                                        </>
                                    ) : (
                                        <>
                                            <Users className="w-4 h-4" />
                                            Join Session
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>
                    </div>
                )}

                <div className="mt-16 text-sm text-white/15">
                    <p>Open source • Save locally • Export anytime</p>
                </div>
            </div>
        </div>
    );
}
