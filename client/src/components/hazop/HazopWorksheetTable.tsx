import React, { useState, useEffect } from 'react';
import {
  Table,
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Filter,
  CheckCircle2,
  Clock,
  User,
  Plus,
  RefreshCw,
  FileSpreadsheet,
  ExternalLink,
} from 'lucide-react';
import { HazopWorksheetRow } from '../../types';

interface HazopWorksheetTableProps {
  projectId: string;
  onNavigateToLopa?: (lopaId: string) => void;
}

export const HazopWorksheetTable: React.FC<HazopWorksheetTableProps> = ({
  projectId,
  onNavigateToLopa,
}) => {
  const [rows, setRows] = useState<HazopWorksheetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedParameter, setSelectedParameter] = useState<string>('all');
  const [selectedRiskFilter, setSelectedRiskFilter] = useState<string>('all');
  const [closingActionId, setClosingActionId] = useState<string | null>(null);
  const [closureEvidence, setClosureEvidence] = useState<string>('');

  const fetchWorksheet = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/hazop/worksheet`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setRows(data.data);
      }
    } catch (err) {
      console.error('Failed to load HAZOP worksheet:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorksheet();
  }, [projectId]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/hazop/worksheet/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewer: 'Lead Process Safety Engineer (CFSE)' }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setRows(data.data);
      }
    } catch (err) {
      console.error('Failed to generate HAZOP worksheet:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handleCreateLopa = async (rowId: string) => {
    try {
      const res = await fetch(`/api/hazop/worksheet/${rowId}/lopa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewer: 'LOPA Specialist' }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        await fetchWorksheet();
        if (onNavigateToLopa) {
          onNavigateToLopa(data.data.id);
        }
      }
    } catch (err) {
      console.error('Failed to transfer HAZOP row to LOPA:', err);
    }
  };

  const handleCloseAction = async (rowId: string, actionId: string) => {
    if (!closureEvidence.trim()) {
      alert('Please enter closure verification evidence before closing the action.');
      return;
    }
    try {
      const res = await fetch(`/api/hazop/worksheet/${rowId}/actions/${actionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'closed',
          closure_evidence: closureEvidence.trim(),
          reviewer: 'Process Safety Assurance Lead',
        }),
      });
      if (res.ok) {
        setClosingActionId(null);
        setClosureEvidence('');
        await fetchWorksheet();
      }
    } catch (err) {
      console.error('Failed to close action:', err);
    }
  };

  const filteredRows = rows.filter((r) => {
    if (selectedParameter !== 'all' && r.parameter !== selectedParameter) return false;
    if (selectedRiskFilter !== 'all' && r.initial_risk_level !== selectedRiskFilter) return false;
    return true;
  });

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'Critical':
        return 'bg-rose-950 text-rose-300 border-rose-600/60';
      case 'High':
        return 'bg-amber-950 text-amber-300 border-amber-600/60';
      case 'Medium':
        return 'bg-sky-950 text-sky-300 border-sky-600/60';
      case 'Low':
      default:
        return 'bg-emerald-950 text-emerald-300 border-emerald-600/60';
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-900/90 rounded-2xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-slate-100 text-sm">IEC 61882 Guided HAZOP Worksheet</h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950 text-cyan-400 border border-cyan-800">
              {rows.length} Scenarios Recorded
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Systematic parameter & guideword deviations strictly distinguishing{' '}
            <strong className="text-cyan-300">Prevention Safeguards</strong> from{' '}
            <strong className="text-rose-300">Emergency Mitigation Safeguards</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchWorksheet}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg shadow transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {generating ? 'Synthesizing...' : 'Generate IEC 61882 Worksheet'}
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-slate-400 font-medium">
            <Filter className="w-3.5 h-3.5" />
            <span>Parameter:</span>
          </div>
          <select
            value={selectedParameter}
            onChange={(e) => setSelectedParameter(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-slate-200 rounded px-2.5 py-1 text-xs focus:ring-1 focus:ring-cyan-500"
          >
            <option value="all">All Parameters</option>
            <option value="Flow">Flow</option>
            <option value="Pressure">Pressure</option>
            <option value="Level">Level</option>
            <option value="Temperature">Temperature</option>
            <option value="Containment">Containment</option>
          </select>

          <div className="flex items-center gap-1.5 text-slate-400 font-medium ml-2">
            <span>Risk Level:</span>
          </div>
          <select
            value={selectedRiskFilter}
            onChange={(e) => setSelectedRiskFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-slate-200 rounded px-2.5 py-1 text-xs focus:ring-1 focus:ring-cyan-500"
          >
            <option value="all">All Risk Ranks</option>
            <option value="Critical">Critical (S5/L4+)</option>
            <option value="High">High (LOPA Mandatory)</option>
            <option value="Medium">Medium (ALARP)</option>
            <option value="Low">Low</option>
          </select>
        </div>

        <div className="text-[11px] text-slate-400 font-mono">
          Showing {filteredRows.length} of {rows.length} rows
        </div>
      </div>

      {/* Worksheet Table */}
      {filteredRows.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
          <FileSpreadsheet className="w-10 h-10 mx-auto text-slate-600" />
          <h4 className="text-slate-200 font-bold text-sm">No HAZOP Worksheet Rows Found</h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Click "Generate IEC 61882 Worksheet" above to automatically synthesize standardized parameter deviations for your approved study nodes.
          </p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg shadow transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Synthesize Standard IEC Deviations
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-300 font-bold">
                <th className="p-3 w-40">Node & Guideword</th>
                <th className="p-3 w-56">Causes</th>
                <th className="p-3 w-56">Consequences</th>
                <th className="p-3 w-52">
                  <span className="text-cyan-400">Prevention Safeguards</span>
                </th>
                <th className="p-3 w-52">
                  <span className="text-rose-400">Mitigation Safeguards</span>
                </th>
                <th className="p-3 w-28 text-center">Initial Risk</th>
                <th className="p-3 w-64">Actions & Closure Evidence</th>
                <th className="p-3 w-32 text-center">LOPA Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredRows.map((row) => {
                const isHighRisk = row.initial_risk_level === 'High' || row.initial_risk_level === 'Critical';
                return (
                  <tr key={row.id} className="hover:bg-slate-900/40 transition-colors align-top">
                    {/* Node & Deviation */}
                    <td className="p-3">
                      <div className="font-bold text-slate-100 flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-cyan-400 font-mono">
                          {row.node_name.split(' ')[0]}
                        </span>
                        <span className="text-xs">{row.parameter}</span>
                      </div>
                      <div className="text-[11px] font-semibold text-cyan-300 mt-1">
                        [{row.guideword}] {row.deviation}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1 font-mono">
                        Doc: {row.drawing_number} ({row.drawing_revision})
                      </div>
                    </td>

                    {/* Causes */}
                    <td className="p-3">
                      <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
                        {row.causes.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                      {row.registry_references && row.registry_references.length > 0 && (
                        <details className="mt-2 rounded border border-amber-800/50 bg-amber-950/20 p-2">
                          <summary className="cursor-pointer text-[10px] font-semibold text-amber-300">
                            Generic registry references · unverified
                          </summary>
                          <div className="mt-2 space-y-2 text-[10px] text-amber-100/80">
                            {row.registry_references.map((reference) => (
                              <div key={reference.component_class_id}>
                                <div className="font-semibold text-amber-200">{reference.component_name}</div>
                                {reference.typical_failure_modes.length > 0 && (
                                  <div>Failure modes: {reference.typical_failure_modes.join('; ')}</div>
                                )}
                                {reference.typical_safeguards.length > 0 && (
                                  <div>Typical safeguards: {reference.typical_safeguards.join('; ')}</div>
                                )}
                                <div className="mt-1 text-amber-300">Confirm relevance and site evidence with the study team.</div>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </td>

                    {/* Consequences */}
                    <td className="p-3">
                      <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
                        {row.consequences.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </td>

                    {/* Prevention Safeguards */}
                    <td className="p-3">
                      <div className="space-y-1.5">
                        {row.prevention_safeguards.length === 0 ? (
                          <span className="text-[11px] text-slate-500 italic">None defined</span>
                        ) : (
                          row.prevention_safeguards.map((sg) => (
                            <div
                              key={sg.id}
                              className="p-1.5 rounded bg-cyan-950/40 border border-cyan-800/40 text-[11px] text-cyan-200"
                            >
                              <div className="font-semibold text-cyan-300">{sg.tag || 'Prevention'}</div>
                              <div className="text-[10px] text-slate-300 mt-0.5">{sg.description}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </td>

                    {/* Emergency Mitigation Safeguards */}
                    <td className="p-3">
                      <div className="space-y-1.5">
                        {row.mitigation_safeguards.length === 0 ? (
                          <span className="text-[11px] text-slate-500 italic">None defined</span>
                        ) : (
                          row.mitigation_safeguards.map((sg) => (
                            <div
                              key={sg.id}
                              className="p-1.5 rounded bg-rose-950/40 border border-rose-800/40 text-[11px] text-rose-200"
                            >
                              <div className="font-semibold text-rose-300">{sg.tag || 'Emergency Mitigation'}</div>
                              <div className="text-[10px] text-slate-300 mt-0.5">{sg.description}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </td>

                    {/* Risk Rank */}
                    <td className="p-3 text-center">
                      <div
                        className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold border ${getRiskBadge(
                          row.initial_risk_level
                        )}`}
                      >
                        {row.initial_risk_level}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 mt-1">
                        S{row.initial_severity} × L{row.initial_likelihood}
                      </div>
                    </td>

                    {/* Actions & Closure */}
                    <td className="p-3 space-y-2">
                      {row.actions && row.actions.length > 0 ? (
                        row.actions.map((act) => (
                          <div
                            key={act.id}
                            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-[11px] space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-200">{act.action_number}</span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                  act.status === 'closed'
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                    : 'bg-amber-950 text-amber-300 border border-amber-800'
                                }`}
                              >
                                {act.status.toUpperCase()}
                              </span>
                            </div>
                            <p className="text-slate-300 text-[11px]">{act.recommendation}</p>
                            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                              <span>Owner: {act.owner}</span>
                              {act.status !== 'closed' && (
                                <button
                                  onClick={() => setClosingActionId(act.id)}
                                  className="text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer underline"
                                >
                                  Close Action
                                </button>
                              )}
                            </div>

                            {/* Action Closure Dialog Input */}
                            {closingActionId === act.id && (
                              <div className="mt-2 pt-2 border-t border-slate-800 space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-300 block">
                                  Verification / Closure Evidence:
                                </label>
                                <textarea
                                  value={closureEvidence}
                                  onChange={(e) => setClosureEvidence(e.target.value)}
                                  placeholder="e.g. Sizing calculation verified per API 520, MOC #4092 approved"
                                  className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-[11px] text-slate-200"
                                  rows={2}
                                />
                                <div className="flex items-center gap-2 justify-end">
                                  <button
                                    onClick={() => setClosingActionId(null)}
                                    className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleCloseAction(row.id, act.id)}
                                    className="px-2.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[10px]"
                                  >
                                    Confirm Closure
                                  </button>
                                </div>
                              </div>
                            )}

                            {act.closure_evidence && (
                              <div className="text-[10px] text-emerald-400 bg-emerald-950/40 p-1 rounded border border-emerald-800/40 mt-1">
                                <strong>Closure Evidence:</strong> {act.closure_evidence}
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <span className="text-[11px] text-slate-500 italic">No action items</span>
                      )}
                    </td>

                    {/* LOPA Link / Transfer */}
                    <td className="p-3 text-center">
                      {row.linked_lopa_id ? (
                        <button
                          onClick={() => onNavigateToLopa && onNavigateToLopa(row.linked_lopa_id!)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 text-[11px] font-medium transition cursor-pointer"
                        >
                          <ExternalLink className="w-3 h-3" />
                          View LOPA
                        </button>
                      ) : isHighRisk ? (
                        <button
                          onClick={() => handleCreateLopa(row.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold text-[11px] transition shadow cursor-pointer"
                        >
                          Transfer to LOPA
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-500 italic">Optional</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
