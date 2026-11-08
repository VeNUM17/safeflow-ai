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
  Activity,
  Layers,
  Sparkles,
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
    <div className="bg-slate-950/70 border-b border-slate-800/80 p-4 sm:p-5 backdrop-blur-md">
      <div className="max-w-7xl mx-auto space-y-4">
        
        {/* Top Grid: High-Aesthetic Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          
          {/* Completeness Card */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-2 bg-gradient-to-br from-slate-900/90 to-slate-950 p-4 rounded-xl border border-cyan-500/30 flex flex-col justify-between shadow-lg shadow-cyan-950/20 relative overflow-hidden group">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-500" />
            
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                PSI Completeness Meter
              </span>
              <span className="text-xl font-extrabold font-mono text-cyan-400 text-glow-cyan">
                {completeness}%
              </span>
            </div>

            {/* Progress bar with glowing gradient */}
            <div className="w-full bg-slate-800/80 rounded-full h-2.5 overflow-hidden my-2 shadow-inner border border-slate-700/50">
              <div
                className="h-full transition-all duration-700 rounded-full bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 shadow-sm"
                style={{ width: `${Math.max(completeness, 3)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mt-1 pt-1 border-t border-slate-800/60">
              <span className="text-emerald-400 font-semibold">{summary.confirmed_fields} Confirmed</span>
              <span className="text-amber-400 font-semibold">{summary.needs_review_fields} Review</span>
              <span className="text-slate-500">{summary.missing_fields} Missing</span>
            </div>
          </div>

          {/* Stat: Chemicals */}
          <div className="bg-gradient-to-br from-slate-900/90 to-slate-950 p-3.5 rounded-xl border border-slate-800 hover:border-purple-500/40 transition-all flex flex-col justify-between shadow-md relative overflow-hidden group">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-500 to-indigo-500 opacity-60 group-hover:opacity-100 transition-opacity" />
            <div className="text-slate-400 text-xs font-semibold flex items-center justify-between">
              <span>Chemicals</span>
              <div className="p-1 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <FlaskConical className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-2xl font-black font-mono text-white my-1 tracking-tight">
              {summary.chemicals_count}
            </div>
            <div className="text-[11px] text-slate-400 truncate font-mono">
              {chemicals.map((c) => c.cas_number.value || 'N/A').join(', ') || 'No chemicals loaded'}
            </div>
          </div>

          {/* Stat: Needs Review */}
          <div
            onClick={() => setStatusFilter(statusFilter === 'needs_review' ? 'all' : 'needs_review')}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between shadow-md relative overflow-hidden ${
              statusFilter === 'needs_review'
                ? 'bg-amber-950/40 border-amber-500 shadow-amber-950/30 ring-1 ring-amber-500'
                : 'bg-gradient-to-br from-slate-900/90 to-slate-950 border-slate-800 hover:border-amber-500/50'
            }`}
          >
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-500 to-orange-500 opacity-70" />
            <div className="text-slate-400 text-xs font-semibold flex items-center justify-between">
              <span>Needs Review</span>
              <div className="p-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <AlertCircle className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-2xl font-black font-mono text-amber-400 my-1 tracking-tight">
              {summary.needs_review_fields}
            </div>
            <div className="text-[11px] text-amber-400/80 font-medium">
              Awaiting PE verification
            </div>
          </div>

          {/* Stat: Conflicts */}
          <div
            onClick={summary.active_conflicts_count > 0 ? onOpenConflictsModal : undefined}
            className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between shadow-md relative overflow-hidden ${
              summary.active_conflicts_count > 0
                ? 'bg-rose-950/40 border-rose-600/70 hover:bg-rose-900/40 cursor-pointer shadow-rose-950/30 animate-pulse'
                : 'bg-gradient-to-br from-slate-900/90 to-slate-950 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className={`absolute top-0 left-0 right-0 h-0.5 ${summary.active_conflicts_count > 0 ? 'bg-rose-500' : 'bg-slate-700'}`} />
            <div className="text-slate-400 text-xs font-semibold flex items-center justify-between">
              <span>Conflicts</span>
              <div className={`p-1 rounded-md ${summary.active_conflicts_count > 0 ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-slate-800 text-slate-500'}`}>
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className={`text-2xl font-black font-mono my-1 tracking-tight ${summary.active_conflicts_count > 0 ? 'text-rose-400 font-extrabold' : 'text-slate-300'}`}>
              {summary.active_conflicts_count}
            </div>
            <div className={`text-[11px] font-medium ${summary.active_conflicts_count > 0 ? 'text-rose-300 underline' : 'text-slate-500'}`}>
              {summary.active_conflicts_count > 0 ? 'Click to reconcile' : 'Zero active conflicts'}
            </div>
          </div>

          {/* Stat: Documents */}
          <div className="bg-gradient-to-br from-slate-900/90 to-slate-950 p-3.5 rounded-xl border border-slate-800 hover:border-cyan-500/40 transition-all flex flex-col justify-between shadow-md relative overflow-hidden group">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-500 to-blue-500 opacity-60 group-hover:opacity-100 transition-opacity" />
            <div className="text-slate-400 text-xs font-semibold flex items-center justify-between">
              <span>Documents</span>
              <div className="p-1 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <FileText className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-2xl font-black font-mono text-white my-1 tracking-tight">
              {summary.documents_count}
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5 font-mono">
              <span className="text-slate-300">{summary.sds_count} SDS</span>
              <span>•</span>
              <span className="text-cyan-400">{summary.pid_count} P&ID</span>
              {summary.unreadable_docs_count > 0 && (
                <span className="text-rose-400 font-semibold" title="Scanned/unreadable file">
                  • {summary.unreadable_docs_count} Unreadable
                </span>
              )}
            </div>
          </div>

        </div>

        {/* P&ID Process Topology Status Breakdown Ribbon */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 font-bold text-cyan-400">
              <GitBranch className="w-4 h-4 text-cyan-400" />
              <span>P&ID Topology Grounding:</span>
            </div>
            <span>
              {summary.graph_approved ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3" />
                  Engineer Approved
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                  <Activity className="w-3 h-3 animate-pulse" />
                  Provisional Candidate Topology
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono">
            <span className="bg-slate-950/90 border border-slate-800 px-2.5 py-1 rounded-lg text-slate-200 shadow-inner">
              <strong className="text-cyan-400 font-bold">{summary.equipment_nodes_count ?? (summary.confirmed_equipment_count + summary.provisional_equipment_count)}</strong> Equipment Nodes
            </span>
            <span className="bg-slate-950/90 border border-emerald-500/30 px-2.5 py-1 rounded-lg text-emerald-300 shadow-inner">
              <strong className="text-emerald-400 font-bold">{summary.confirmed_process_edges_count ?? 0}</strong> Confirmed Piping
            </span>
            <span className="bg-slate-950/90 border border-amber-500/30 px-2.5 py-1 rounded-lg text-amber-300 shadow-inner">
              <strong className="text-amber-400 font-bold">{summary.provisional_candidate_edges_count ?? 0}</strong> Provisional Edges
            </span>
            <span className="bg-slate-950/90 border border-purple-500/30 px-2.5 py-1 rounded-lg text-purple-300 shadow-inner">
              <strong className="text-purple-400 font-bold">{summary.unresolved_connections_count ?? 0}</strong> Unresolved
            </span>
            <span className="bg-slate-950/90 border border-indigo-500/30 px-2.5 py-1 rounded-lg text-indigo-300 shadow-inner">
              <strong className="text-indigo-400 font-bold">{summary.signal_only_connections_count ?? 0}</strong> Signal Loops (Non-Chemical)
            </span>
            {(summary.isolated_nodes_count ?? 0) > 0 && (
              <span className="bg-rose-950/50 border border-rose-500/40 px-2.5 py-1 rounded-lg text-rose-300 flex items-center gap-1 font-semibold">
                <AlertTriangle className="w-3 h-3 text-rose-400" />
                <strong>{summary.isolated_nodes_count}</strong> Isolated Nodes
              </span>
            )}
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs pb-1 sm:pb-0">
            <span className="text-slate-400 font-semibold mr-1 text-[11px] uppercase tracking-wider">Status:</span>
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
                className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all text-xs ${
                  statusFilter === f.id
                    ? 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white font-bold shadow-md shadow-cyan-950/40 border border-cyan-400/40'
                    : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-[260px]">
            <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search PSI parameters, CAS, or lines..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-900/90 border border-slate-700/80 text-slate-200 text-xs rounded-xl pl-9 pr-3 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 placeholder-slate-500 shadow-inner"
            />
          </div>
        </div>

      </div>
    </div>
  );
};
