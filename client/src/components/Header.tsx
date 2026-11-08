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
  FlaskConical,
  Sparkles,
  Shield,
  Activity,
  ChevronDown,
  Database,
  AlertOctagon,
} from 'lucide-react';
import { ProcessProject, ProjectDashboardSummary } from '../types';

export type ActiveNavTab =
  | 'workspace'
  | 'pid-graph'
  | 'chemical-inventory'
  | 'engineering-matrix'
  | 'discrepancy-manager'
  | 'documents';

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
  activeTab: ActiveNavTab;
  setActiveTab: (tab: ActiveNavTab) => void;
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
    <header className="bg-slate-950/90 backdrop-blur-xl border-b border-amber-500/20 sticky top-0 z-30 shadow-2xl shadow-black/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          
          {/* Left: Brand Identity & Creator Badge & Project Selector */}
          <div className="flex items-center gap-3.5 flex-wrap">
            {/* SafeFlow AI Brand Icon */}
            <div className="flex items-center gap-2.5">
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-600 rounded-xl blur opacity-60 group-hover:opacity-100 transition duration-300" />
                <div className="relative bg-gradient-to-b from-slate-900 to-slate-950 p-2.5 rounded-xl border border-amber-400/40 text-amber-300 flex items-center justify-center shadow-inner">
                  <Shield className="w-5 h-5 text-amber-400 fill-amber-400/20" />
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-amber-100 to-amber-400 text-lg tracking-tight">
                    SafeFlow AI
                  </span>
                  <span className="bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full shadow-sm">
                    OSHA 1910.119
                  </span>
                </div>
                <p className="text-slate-400 text-[11px] font-medium leading-none mt-0.5">
                  Process Safety Information & Topology Intelligence
                </p>
              </div>
            </div>

            {/* PROMINENT CREATOR ATTRIBUTION BADGE: MADE BY SHLOK */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-950/60 via-slate-900 to-slate-950 border border-amber-500/40 shadow-sm hover:border-amber-400/70 transition-all cursor-default group">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 group-hover:rotate-12 transition-transform duration-300" />
              <span className="text-[11px] text-slate-300 font-medium">
                Made by <strong className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 font-black tracking-wide">Shlok</strong>
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse ml-0.5" />
            </div>

            {/* Project Picker */}
            <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-lg border border-slate-700/60 hover:border-amber-500/30 shadow-inner transition-colors">
              <FolderGit2 className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
              <select
                className="bg-transparent text-slate-200 text-xs py-1 px-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500 rounded font-medium cursor-pointer max-w-[210px] truncate"
                value={currentProject?.id || ''}
                onChange={(e) => onSelectProject(e.target.value)}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id} className="bg-slate-900 text-slate-200">
                    {p.name} {p.is_sample ? '(Demo)' : ''}
                  </option>
                ))}
              </select>

              <button
                onClick={onOpenNewProjectModal}
                title="Create New Project"
                className="bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-300 p-1 rounded-md transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Right: Modern Segmented Navigation & Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Segmented Controls */}
            <div className="flex bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs shadow-inner">
              <button
                onClick={() => setActiveTab('workspace')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                  activeTab === 'workspace'
                    ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-slate-950 font-bold shadow-md shadow-amber-950/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <FileCheck2 className="w-3.5 h-3.5" />
                PSI Review
              </button>

              <button
                onClick={() => setActiveTab('pid-graph')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                  activeTab === 'pid-graph'
                    ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-slate-950 font-bold shadow-md shadow-amber-950/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <GitBranch className="w-3.5 h-3.5" />
                P&ID Map
              </button>

              <button
                onClick={() => setActiveTab('chemical-inventory')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                  activeTab === 'chemical-inventory'
                    ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-slate-950 font-bold shadow-md shadow-amber-950/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <FlaskConical className="w-3.5 h-3.5" />
                Chemicals & Mapping
              </button>

              <button
                onClick={() => setActiveTab('engineering-matrix')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                  activeTab === 'engineering-matrix'
                    ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-slate-950 font-bold shadow-md shadow-amber-950/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                Unified Matrix
              </button>

              <button
                onClick={() => setActiveTab('discrepancy-manager')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                  activeTab === 'discrepancy-manager'
                    ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-slate-950 font-bold shadow-md shadow-amber-950/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <AlertOctagon className="w-3.5 h-3.5" />
                Discrepancies
              </button>

              <button
                onClick={() => setActiveTab('documents')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                  activeTab === 'documents'
                    ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-slate-950 font-bold shadow-md shadow-amber-950/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Docs ({summary?.documents_count || 0})
              </button>
            </div>

            {/* Conflicts Alert Button */}
            {summary && summary.active_conflicts_count > 0 && (
              <button
                onClick={onOpenConflictsModal}
                className="flex items-center gap-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 px-2.5 py-1.5 rounded-lg text-xs font-semibold animate-pulse transition-all shadow-sm shadow-rose-950/40"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>{summary.active_conflicts_count} Conflicts</span>
              </button>
            )}

            {/* Upload Files Button */}
            <button
              onClick={onOpenUploadModal}
              className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-amber-400/40 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shadow-sm"
            >
              <Upload className="w-3.5 h-3.5 text-amber-400" />
              Upload Files
            </button>

            {/* Add Chemical Button */}
            {onOpenManualChemicalModal && (
              <button
                onClick={onOpenManualChemicalModal}
                className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-extrabold px-3 py-1.5 rounded-lg text-xs transition-all shadow-md shadow-amber-950/50"
                title="Create a new chemical record manually without requiring SDS"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Chemical
              </button>
            )}

            {/* Export Records Button */}
            <button
              onClick={onOpenExportModal}
              className="flex items-center gap-1.5 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-300 hover:from-white hover:to-slate-200 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs transition-all shadow-md shadow-black/40"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};
