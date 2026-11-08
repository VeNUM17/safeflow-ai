import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Filter,
  Search,
  RefreshCw,
  FileText,
  ShieldAlert,
  ShieldCheck,
  User,
  Clock,
  Sparkles,
  ChevronRight,
  X,
  Check,
  ExternalLink,
} from 'lucide-react';
import {
  CrossDocumentDiscrepancy,
  DiscrepancyStatus,
  DiscrepancyType,
} from '../types';

interface CrossDocumentDiscrepancyViewProps {
  projectId: string;
  onRefreshProject?: () => Promise<void>;
}

export const CrossDocumentDiscrepancyView: React.FC<CrossDocumentDiscrepancyViewProps> = ({
  projectId,
  onRefreshProject,
}) => {
  const [discrepancies, setDiscrepancies] = useState<CrossDocumentDiscrepancy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetecting, setIsDetecting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | DiscrepancyStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | DiscrepancyType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [resolvingDiscrepancy, setResolvingDiscrepancy] = useState<CrossDocumentDiscrepancy | null>(null);

  // Resolution Form State
  const [resolutionStatus, setResolutionStatus] = useState<DiscrepancyStatus>('resolved');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolverName, setResolverName] = useState('Shlok (Lead Process Safety Engineer)');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchDiscrepancies = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/discrepancies`);
      const json = await res.json();
      if (json.success) {
        setDiscrepancies(json.data);
      }
    } catch (err) {
      console.error('Failed to load cross-document discrepancies:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDiscrepancies();
  }, [projectId]);

  const handleDetectDiscrepancies = async () => {
    setIsDetecting(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/discrepancies/detect`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json.success) {
        setDiscrepancies(json.data);
        setActionMessage(`Consistency check complete: ${json.data.length} discrepancies audited across all document categories.`);
        if (onRefreshProject) await onRefreshProject();
      }
    } catch (err) {
      console.error('Failed to run discrepancy detection:', err);
      setActionMessage('Failed to detect discrepancies.');
    } finally {
      setIsDetecting(false);
    }
  };

  const handleOpenResolution = (disc: CrossDocumentDiscrepancy) => {
    setResolvingDiscrepancy(disc);
    setResolutionStatus(disc.status === 'open' ? 'resolved' : disc.status);
    setResolutionNotes(disc.resolution_notes || '');
  };

  const handleSubmitResolution = async () => {
    if (!resolvingDiscrepancy) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/discrepancies/${resolvingDiscrepancy.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: resolutionStatus,
          resolution_notes: resolutionNotes || 'Engineering review completed.',
          resolved_by: resolverName,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setResolvingDiscrepancy(null);
        await fetchDiscrepancies();
        if (onRefreshProject) await onRefreshProject();
        setActionMessage(`Discrepancy on ${resolvingDiscrepancy.entity_tag} updated to ${resolutionStatus}.`);
      }
    } catch (err) {
      console.error('Failed to resolve discrepancy:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Metrics
  const totalCount = discrepancies.length;
  const criticalCount = discrepancies.filter((d) => d.severity === 'critical' && (d.status === 'open' || d.status === 'reviewed')).length;
  const warningCount = discrepancies.filter((d) => d.severity === 'warning' && (d.status === 'open' || d.status === 'reviewed')).length;
  const resolvedCount = discrepancies.filter((d) => d.status === 'resolved' || d.status === 'accepted_as_margin').length;

  const filteredDiscrepancies = discrepancies.filter((d) => {
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;
    if (typeFilter !== 'all' && d.discrepancy_type !== typeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTag = d.entity_tag.toLowerCase().includes(q);
      const matchProp = d.property_name.toLowerCase().includes(q);
      const matchMsg = d.message.toLowerCase().includes(q);
      if (!matchTag && !matchProp && !matchMsg) return false;
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* 1. Header Banner */}
      <div className="bg-slate-900/90 border border-rose-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden backdrop-blur-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-rose-500/10 via-amber-500/5 to-transparent rounded-full blur-3xl -z-10" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 shadow-inner">
                <AlertOctagon className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-rose-100 to-rose-400">
                    Cross-Document Discrepancy Manager
                  </h1>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/30">
                    Multi-Source Integrity
                  </span>
                </div>
                <p className="text-slate-400 text-xs mt-0.5">
                  Automated auditing comparing operating conditions vs design limits, relief setpoints vs MAWP, SIF trips vs design limits, and cross-document metallurgy.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950/80 border border-amber-500/40 text-[11px] font-medium text-slate-300">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Architected by <strong className="text-amber-300 font-bold">Shlok</strong></span>
            </div>

            <button
              onClick={handleDetectDiscrepancies}
              disabled={isDetecting}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-rose-600 via-rose-500 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-950/50 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isDetecting ? 'animate-spin' : ''}`} />
              {isDetecting ? 'Auditing Cross-Documents...' : 'Run Consistency Audit'}
            </button>
          </div>
        </div>

        {actionMessage && (
          <div className="mt-4 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-cyan-400 flex-shrink-0" />
            <span>{actionMessage}</span>
          </div>
        )}
      </div>

      {/* 2. Headline Metric KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl space-y-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Total Audited</span>
          <div className="text-2xl font-black text-white font-mono">{totalCount}</div>
          <span className="text-[10px] text-slate-500">Cross-document parameters</span>
        </div>

        <div className="bg-slate-900/80 border border-rose-500/30 p-4 rounded-xl space-y-1">
          <span className="text-[10px] font-mono text-rose-400 uppercase tracking-wider flex items-center gap-1">
            <ShieldAlert className="w-3 h-3" />
            Critical Barriers
          </span>
          <div className="text-2xl font-black text-rose-300 font-mono">{criticalCount}</div>
          <span className="text-[10px] text-rose-400/80">Blocks HAZOP readiness</span>
        </div>

        <div className="bg-slate-900/80 border border-amber-500/30 p-4 rounded-xl space-y-1">
          <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider">Warnings & Margins</span>
          <div className="text-2xl font-black text-amber-300 font-mono">{warningCount}</div>
          <span className="text-[10px] text-amber-400/80">Requires engineering review</span>
        </div>

        <div className="bg-slate-900/80 border border-emerald-500/30 p-4 rounded-xl space-y-1">
          <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" />
            Resolved / Accepted
          </span>
          <div className="text-2xl font-black text-emerald-300 font-mono">{resolvedCount}</div>
          <span className="text-[10px] text-emerald-400/80">Signoff documented</span>
        </div>
      </div>

      {/* 3. Filters & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/70 p-3 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400 font-mono">Status:</span>
          {(['all', 'open', 'reviewed', 'resolved', 'accepted_as_margin'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 rounded-md text-xs font-mono capitalize transition-all ${
                statusFilter === st
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {st.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search entity tag or property..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
          />
        </div>
      </div>

      {/* 4. Discrepancy Cards List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-slate-500 font-mono">
            Auditing cross-document integrity...
          </div>
        ) : filteredDiscrepancies.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 font-mono bg-slate-900/60 rounded-2xl border border-slate-800">
            No discrepancies found matching current filters. All checked engineering parameters are aligned.
          </div>
        ) : (
          filteredDiscrepancies.map((disc) => (
            <div
              key={disc.id}
              className={`p-5 rounded-2xl border transition-all ${
                disc.severity === 'critical'
                  ? 'bg-slate-900/90 border-rose-500/40 shadow-lg shadow-rose-950/20'
                  : 'bg-slate-900/90 border-slate-800'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-mono font-black text-white text-sm">
                      {disc.entity_tag}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-800 text-slate-300 border border-slate-700">
                      {disc.entity_type}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-950 text-cyan-300 border border-slate-800">
                      {disc.property_name}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase ${
                        disc.severity === 'critical'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                      }`}
                    >
                      {disc.severity}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold ${
                        disc.status === 'resolved' || disc.status === 'accepted_as_margin'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {disc.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <p className="text-xs text-slate-200 font-medium">
                    {disc.message}
                  </p>

                  {/* Multi-Source Evidence Records */}
                  {disc.evidence_records && disc.evidence_records.length > 0 && (
                    <div className="pt-2">
                      <span className="text-[11px] font-mono text-slate-400 block mb-1.5">
                        Extracted Source Evidence Values:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {disc.evidence_records.map((ev, idx) => (
                          <div
                            key={idx}
                            className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80 text-xs space-y-0.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-white font-mono">
                                {ev.normalized_value} {ev.normalized_unit || ''}
                              </span>
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                                {ev.source_category}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              Document: {ev.source_document_name} {ev.page_or_drawing_location ? `(${ev.page_or_drawing_location})` : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Resolution Notes If Present */}
                  {disc.resolution_notes && (
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-1">
                      <div className="flex items-center justify-between text-emerald-400 font-mono text-[10px]">
                        <span>Resolution by: {disc.resolved_by || 'Engineer'}</span>
                        {disc.resolved_at && <span>{new Date(disc.resolved_at).toLocaleString()}</span>}
                      </div>
                      <p className="text-emerald-200">{disc.resolution_notes}</p>
                    </div>
                  )}
                </div>

                {/* Action Button */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenResolution(disc)}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 hover:border-amber-400 transition-all shadow-md"
                  >
                    Resolve / Review
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 5. Resolution Modal */}
      {resolvingDiscrepancy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Resolve Engineering Discrepancy
              </h3>
              <button
                onClick={() => setResolvingDiscrepancy(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-mono text-slate-400">Entity & Property:</span>
              <div className="font-bold text-white font-mono text-sm">
                {resolvingDiscrepancy.entity_tag} ({resolvingDiscrepancy.property_name})
              </div>
              <p className="text-xs text-slate-300">{resolvingDiscrepancy.message}</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-mono text-slate-400 block mb-1">
                  Resolution Decision
                </label>
                <select
                  value={resolutionStatus}
                  onChange={(e) => setResolutionStatus(e.target.value as DiscrepancyStatus)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="resolved">Resolved (Correct value documented)</option>
                  <option value="accepted_as_margin">Accepted as Design Margin (e.g. 5% API 520 Margin)</option>
                  <option value="reviewed">Under Engineering Review</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-mono text-slate-400 block mb-1">
                  Engineer Name / Attribution
                </label>
                <input
                  type="text"
                  value={resolverName}
                  onChange={(e) => setResolverName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-mono text-slate-400 block mb-1">
                  Technical Justification & Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="Provide engineering rationale, code reference (e.g. API 520 / ASME VIII), or operating limit justification..."
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setResolvingDiscrepancy(null)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitResolution}
                disabled={isSubmitting}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md"
              >
                {isSubmitting ? 'Submitting...' : 'Confirm Resolution'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
