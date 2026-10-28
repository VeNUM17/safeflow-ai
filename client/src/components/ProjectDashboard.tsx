import React from 'react';
import {
  FileText,
  FlaskConical,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  FileWarning,
  GitBranch,
  ShieldCheck,
  Search,
} from 'lucide-react';
import { ProjectDashboardSummary, ChemicalRecord } from '../types';

interface DashboardProps {
  summary: ProjectDashboardSummary | null;
  chemicals: ChemicalRecord[];
  onOpenConflictsModal: () => void;
  statusFilter: string;
  setStatusFilter: (filter: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export const ProjectDashboard: React.FC<DashboardProps> = ({
  summary,
  chemicals,
  onOpenConflictsModal,
  statusFilter,
  setStatusFilter,
  searchQuery,
  setSearchQuery,
}) => {
  if (!summary) return null;

  const completeness = summary.completeness_pct;

  return (
    <div className="bg-slate-900/80 border-b border-slate-800 p-4 sm:p-6 backdrop-blur">
      <div className="max-w-7xl mx-auto space-y-4">
        
        {/* Top Grid: Completeness & Quick Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          
          {/* Completeness Card */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-2 bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                PSI Completeness Meter
              </span>
              <span className="text-lg font-bold font-mono text-cyan-400">
                {completeness}%
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden my-2">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  completeness >= 80
                    ? 'bg-emerald-500'
                    : completeness >= 50
                    ? 'bg-amber-500'
                    : 'bg-cyan-500'
                }`}
                style={{ width: `${completeness}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mt-1">
              <span>{summary.confirmed_fields} Confirmed</span>
              <span>{summary.needs_review_fields} Needs Review</span>
              <span>{summary.missing_fields} Missing</span>
            </div>
          </div>

          {/* Stat: Chemicals */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div className="text-slate-400 text-xs font-medium flex items-center justify-between">
              <span>Chemicals</span>
              <FlaskConical className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-slate-100 my-1">
              {summary.chemicals_count}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              {chemicals.map((c) => c.cas_number.value || 'N/A').join(', ') || 'None loaded'}
            </div>
          </div>

          {/* Stat: Needs Review */}
          <div
            onClick={() => setStatusFilter(statusFilter === 'needs_review' ? 'all' : 'needs_review')}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
              statusFilter === 'needs_review'
                ? 'bg-amber-950/40 border-amber-500 ring-1 ring-amber-500'
                : 'bg-slate-950 border-slate-800 hover:border-amber-500/50'
            }`}
          >
            <div className="text-slate-400 text-xs font-medium flex items-center justify-between">
              <span>Needs Review</span>
              <AlertCircle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-amber-400 my-1">
              {summary.needs_review_fields}
            </div>
            <div className="text-[11px] text-amber-400/80">
              Unverified extractions
            </div>
          </div>

          {/* Stat: Conflicts */}
          <div
            onClick={summary.active_conflicts_count > 0 ? onOpenConflictsModal : undefined}
            className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
              summary.active_conflicts_count > 0
                ? 'bg-rose-950/40 border-rose-600/60 hover:bg-rose-900/30 cursor-pointer'
                : 'bg-slate-950 border-slate-800'
            }`}
          >
            <div className="text-slate-400 text-xs font-medium flex items-center justify-between">
              <span>Conflicts</span>
              <AlertTriangle className={`w-4 h-4 ${summary.active_conflicts_count > 0 ? 'text-rose-400' : 'text-slate-500'}`} />
            </div>
            <div className={`text-2xl font-bold font-mono my-1 ${summary.active_conflicts_count > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
              {summary.active_conflicts_count}
            </div>
            <div className="text-[11px] text-slate-400">
              {summary.active_conflicts_count > 0 ? 'Click to reconcile' : 'Zero conflicts'}
            </div>
          </div>

          {/* Stat: Documents & Unreadable warnings */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div className="text-slate-400 text-xs font-medium flex items-center justify-between">
              <span>Documents</span>
              <FileText className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-slate-100 my-1">
              {summary.documents_count}
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <span>{summary.sds_count} SDS</span>
              <span>•</span>
              <span>{summary.pid_count} P&ID</span>
              {summary.unreadable_docs_count > 0 && (
                <span className="text-rose-400 flex items-center gap-0.5" title="Unreadable/Scanned file detected">
                  • <FileWarning className="w-3 h-3 inline" /> {summary.unreadable_docs_count} Unreadable
                </span>
              )}
            </div>
          </div>

        </div>

        {/* P&ID Process Topology Status Breakdown */}
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-mono text-cyan-400 font-bold flex items-center gap-1.5">
              <GitBranch className="w-4 h-4" />
              P&ID Topology Status:
            </span>
            <span className="text-slate-400">
              {summary.graph_approved ? (
                <span className="text-emerald-400 font-medium">✓ Engineer Approved</span>
              ) : (
                <span className="text-amber-400 font-medium">Under Engineering Review</span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono">
            <span className="bg-slate-900 border border-slate-700/60 px-2.5 py-1 rounded-md text-slate-200">
              <strong className="text-cyan-400 font-bold">{summary.equipment_nodes_count ?? (summary.confirmed_equipment_count + summary.provisional_equipment_count)}</strong> Equipment Nodes
            </span>
            <span className="bg-slate-900 border border-emerald-500/30 px-2.5 py-1 rounded-md text-emerald-300">
              <strong className="text-emerald-400 font-bold">{summary.confirmed_process_edges_count ?? 0}</strong> Confirmed Piping
            </span>
            <span className="bg-slate-900 border border-amber-500/30 px-2.5 py-1 rounded-md text-amber-300">
              <strong className="text-amber-400 font-bold">{summary.provisional_candidate_edges_count ?? 0}</strong> Provisional Lines
            </span>
            <span className="bg-slate-900 border border-purple-500/30 px-2.5 py-1 rounded-md text-purple-300">
              <strong className="text-purple-400 font-bold">{summary.unresolved_connections_count ?? 0}</strong> Unresolved
            </span>
            <span className="bg-slate-900 border border-indigo-500/30 px-2.5 py-1 rounded-md text-indigo-300">
              <strong className="text-indigo-400 font-bold">{summary.signal_only_connections_count ?? 0}</strong> Signal Loops (Non-Chemical)
            </span>
            {(summary.isolated_nodes_count ?? 0) > 0 && (
              <span className="bg-amber-950/60 border border-amber-500/50 px-2.5 py-1 rounded-md text-amber-200 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <strong className="font-bold">{summary.isolated_nodes_count}</strong> Isolated Nodes (Review Needed)
              </span>
            )}
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs pb-1 sm:pb-0">
            <span className="text-slate-400 font-medium mr-1 text-[11px]">Filter:</span>
            {[
              { id: 'all', label: `All Fields (${summary.total_fields})` },
              { id: 'needs_review', label: `Needs Review (${summary.needs_review_fields})`, color: 'amber' },
              { id: 'confirmed', label: `Confirmed (${summary.confirmed_fields})`, color: 'emerald' },
              { id: 'missing', label: `Missing (${summary.missing_fields})`, color: 'slate' },
              { id: 'rejected', label: `Rejected (${summary.rejected_fields})`, color: 'rose' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={`px-2.5 py-1 rounded-md font-medium whitespace-nowrap transition-all ${
                  statusFilter === f.id
                    ? 'bg-slate-700 text-cyan-300 font-semibold border border-cyan-500/40'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-[240px]">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search PSI parameters or text..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg pl-9 pr-3 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-cyan-500 placeholder-slate-500"
            />
          </div>
        </div>

      </div>
    </div>
  );
};
