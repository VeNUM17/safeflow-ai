import React from 'react';
import {
  Layers,
  Upload,
  Download,
  AlertTriangle,
  Plus,
  GitBranch,
  FileText,
  FileCheck2,
  FolderGit2,
} from 'lucide-react';
import { ProcessProject, ProjectDashboardSummary } from '../types';

interface HeaderProps {
  projects: ProcessProject[];
  currentProject: ProcessProject | null;
  summary: ProjectDashboardSummary | null;
  onSelectProject: (projectId: string) => void;
  onOpenNewProjectModal: () => void;
  onOpenUploadModal: () => void;
  onOpenManualChemicalModal?: () => void;
  onOpenExportModal: () => void;
  onOpenConflictsModal: () => void;
  activeTab: 'workspace' | 'pid-graph' | 'documents';
  setActiveTab: (tab: 'workspace' | 'pid-graph' | 'documents') => void;
}

export const Header: React.FC<HeaderProps> = ({
  projects,
  currentProject,
  summary,
  onSelectProject,
  onOpenNewProjectModal,
  onOpenUploadModal,
  onOpenManualChemicalModal,
  onOpenExportModal,
  onOpenConflictsModal,
  activeTab,
  setActiveTab,
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          
          {/* Brand & Project Selector */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="bg-cyan-600/20 p-2 rounded-lg border border-cyan-500/30 text-cyan-400">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-bold text-slate-100 text-base tracking-tight">
                    PSI Identification Engine
                  </h1>
                  <span className="bg-slate-800 text-cyan-400 border border-cyan-500/30 text-[10px] font-mono px-1.5 py-0.5 rounded">
                    OSHA 1910.119(d)(1)
                  </span>
                </div>
                <p className="text-slate-400 text-xs">
                  Evidence-Grounded Process Safety Information & P&ID Topology
                </p>
              </div>
            </div>

            {/* Project Picker */}
            <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-md border border-slate-700/80">
              <FolderGit2 className="w-4 h-4 text-slate-400 ml-1.5" />
              <select
                className="bg-transparent text-slate-200 text-xs py-1 px-2 focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded font-medium cursor-pointer max-w-[220px] truncate"
                value={currentProject?.id || ''}
                onChange={(e) => onSelectProject(e.target.value)}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id} className="bg-slate-900 text-slate-200">
                    {p.name} {p.is_sample ? '(Sample Demo)' : ''}
                  </option>
                ))}
              </select>

              <button
                onClick={onOpenNewProjectModal}
                title="Create New Project"
                className="bg-slate-700 hover:bg-slate-600 text-slate-300 p-1.5 rounded transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Navigation Tabs & Primary Actions */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* View Modes */}
            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                onClick={() => setActiveTab('workspace')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
                  activeTab === 'workspace'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileCheck2 className="w-3.5 h-3.5" />
                PSI Review
              </button>

              <button
                onClick={() => setActiveTab('pid-graph')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
                  activeTab === 'pid-graph'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <GitBranch className="w-3.5 h-3.5" />
                P&ID & GNN Map
              </button>

              <button
                onClick={() => setActiveTab('documents')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
                  activeTab === 'documents'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Documents ({summary?.documents_count || 0})
              </button>
            </div>

            {/* Conflicts Alert Button */}
            {summary && summary.active_conflicts_count > 0 && (
              <button
                onClick={onOpenConflictsModal}
                className="flex items-center gap-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 px-2.5 py-1.5 rounded-md text-xs font-semibold animate-pulse transition-all"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>{summary.active_conflicts_count} Conflicts</span>
              </button>
            )}

            {/* Upload Button */}
            <button
              onClick={onOpenUploadModal}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
            >
              <Upload className="w-3.5 h-3.5 text-cyan-400" />
              Upload Files
            </button>

            {/* Add Chemical Manually Button */}
            {onOpenManualChemicalModal && (
              <button
                onClick={onOpenManualChemicalModal}
                className="flex items-center gap-1.5 bg-cyan-600/90 hover:bg-cyan-500 text-white px-3 py-1.5 rounded-md text-xs font-medium transition-all shadow-sm"
                title="Create a new chemical record manually without requiring SDS"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Chemical Manually
              </button>
            )}

            {/* Export Button */}
            <button
              onClick={onOpenExportModal}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-md text-xs font-medium transition-all shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              Export Records
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};
