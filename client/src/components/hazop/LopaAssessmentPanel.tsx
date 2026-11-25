import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Info,
  Layers,
  Activity,
  Calculator,
  ChevronDown,
  ChevronRight,
  Save,
  Check,
  FileCheck,
} from 'lucide-react';
import { LopaRecord, IndependentProtectionLayer } from '../../types';

interface LopaAssessmentPanelProps {
  projectId: string;
  initialSelectedLopaId?: string | null;
}

export const LopaAssessmentPanel: React.FC<LopaAssessmentPanelProps> = ({
  projectId,
  initialSelectedLopaId,
}) => {
  const [records, setRecords] = useState<LopaRecord[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(initialSelectedLopaId || null);
  const [loading, setLoading] = useState(false);
  const [editingIplId, setEditingIplId] = useState<string | null>(null);
  const [editingIplState, setEditingIplState] = useState<Partial<IndependentProtectionLayer>>({});
  const [savingIpl, setSavingIpl] = useState(false);

  const fetchLopaRecords = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/lopa`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setRecords(data.data);
        if (!selectedRecordId && data.data.length > 0) {
          setSelectedRecordId(data.data[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load LOPA records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLopaRecords();
  }, [projectId]);

  useEffect(() => {
    if (initialSelectedLopaId) {
      setSelectedRecordId(initialSelectedLopaId);
    }
  }, [initialSelectedLopaId]);

  const selectedRecord = records.find((r) => r.id === selectedRecordId) || records[0];

  const handleStartEditIpl = (ipl: IndependentProtectionLayer) => {
    setEditingIplId(ipl.id);
    setEditingIplState({
      ...ipl,
      criterion_independence_met: ipl.independence_verified,
      criterion_functionality_met: ipl.functionality_verified,
      criterion_reliability_met: ipl.reliability_verified,
      criterion_auditability_met: ipl.auditability_verified,
    });
  };

  const handleSaveIpl = async (lopaId: string, iplId: string) => {
    setSavingIpl(true);
    try {
      const res = await fetch(`/api/lopa/${lopaId}/ipls/${iplId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editingIplState,
          reviewer: 'Certified Functional Safety Expert (CFSE)',
        }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setEditingIplId(null);
        await fetchLopaRecords();
      }
    } catch (err) {
      console.error('Failed to update IPL qualification:', err);
    } finally {
      setSavingIpl(false);
    }
  };

  const getSilBadge = (sil: string) => {
    switch (sil) {
      case 'SIL 4':
      case 'SIL 3':
        return 'bg-rose-950 text-rose-300 border-rose-600';
      case 'SIL 2':
        return 'bg-amber-950 text-amber-300 border-amber-600';
      case 'SIL 1':
        return 'bg-sky-950 text-sky-300 border-sky-600';
      case 'None':
      default:
        return 'bg-emerald-950 text-emerald-300 border-emerald-600';
    }
  };

  if (loading && records.length === 0) {
    return (
      <div className="p-8 text-center text-slate-400 bg-slate-900/60 rounded-xl border border-slate-800">
        <div className="inline-block animate-spin w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full mb-2"></div>
        <p className="text-xs">Loading CCPS LOPA Assessment Records...</p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="p-12 text-center text-slate-400 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
        <Calculator className="w-10 h-10 mx-auto text-slate-600" />
        <h4 className="text-slate-200 font-bold text-sm">No LOPA Assessment Records Created Yet</h4>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          In the IEC 61882 HAZOP Worksheet tab, high or critical risk scenarios feature a "Transfer to LOPA" button to evaluate mandatory Independent Protection Layers (IPLs).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Selector for LOPA Scenarios */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-900/80 rounded-2xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-slate-100 text-sm">CCPS Layer of Protection Analysis (LOPA) Engine</h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950 text-cyan-400 border border-cyan-800">
              {records.length} Scenarios
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Enforces strict CCPS 4-criteria qualification gate: <span className="text-cyan-300">Independence</span>,{' '}
            <span className="text-cyan-300">Functionality</span>, <span className="text-cyan-300">Reliability</span>, and{' '}
            <span className="text-cyan-300">Auditability</span>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">Select Scenario:</label>
          <select
            value={selectedRecord?.id || ''}
            onChange={(e) => setSelectedRecordId(e.target.value)}
            className="bg-slate-950 border border-slate-700 text-slate-200 rounded px-3 py-1.5 text-xs font-medium focus:ring-1 focus:ring-cyan-500 max-w-md truncate"
          >
            {records.map((r) => (
              <option key={r.id} value={r.id}>
                {r.scenario_title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedRecord && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Initiating Event & Mathematical Model */}
          <div className="lg:col-span-4 space-y-4">
            {/* Scenario Header Card */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-900 text-slate-300 border border-slate-800">
                  {selectedRecord.drawing_number}
                </span>
                <span className="text-xs font-bold text-rose-400">
                  Severity S{selectedRecord.severity_level}
                </span>
              </div>
              <h4 className="font-bold text-slate-100 text-sm">{selectedRecord.scenario_title}</h4>
              <p className="text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
                <strong className="text-slate-100">Consequence:</strong> {selectedRecord.consequence_description}
              </p>
            </div>

            {/* Initiating Event & Conditional Modifiers */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 text-xs">
              <h4 className="font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5 text-[11px]">
                <Activity className="w-4 h-4 text-cyan-400" />
                Initiating Event Frequency (f_IE)
              </h4>

              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">{selectedRecord.initiating_event.category}</span>
                  <span className="font-mono text-cyan-400 font-bold">
                    {selectedRecord.initiating_event.frequency_per_year} /yr
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">{selectedRecord.initiating_event.description}</p>
              </div>

              {selectedRecord.conditional_modifiers && selectedRecord.conditional_modifiers.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <div className="text-[11px] font-bold text-slate-400">Conditional Modifiers (Enabling / Ignition / Exposure):</div>
                  {selectedRecord.conditional_modifiers.map((mod) => (
                    <div key={mod.id} className="p-2 rounded bg-slate-900/80 border border-slate-800 text-[11px]">
                      <div className="flex items-center justify-between font-semibold">
                        <span className="text-slate-300">{mod.name}</span>
                        <span className="font-mono text-amber-400">{mod.probability}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{mod.justification}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-3 rounded-lg bg-slate-900 border border-cyan-800/40 text-xs flex items-center justify-between">
                <span className="font-bold text-slate-300">Unmitigated Event Frequency (f0):</span>
                <span className="font-mono text-cyan-300 font-bold text-sm">
                  {selectedRecord.unmitigated_frequency} /yr
                </span>
              </div>
            </div>

            {/* Risk Assessment Summary Card */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <h4 className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
                LOPA Assessment Calculation
              </h4>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2 rounded bg-slate-900">
                  <span className="text-slate-400">Total Credited PFD:</span>
                  <span className="font-mono font-bold text-slate-100">
                    {selectedRecord.total_pfd}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded bg-slate-900">
                  <span className="text-slate-400">Mitigated Event Frequency (MEF):</span>
                  <span className="font-mono font-bold text-cyan-300">
                    {selectedRecord.mitigated_frequency} /yr
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded bg-slate-900">
                  <span className="text-slate-400">Target Mitigated Frequency (TMEF):</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {selectedRecord.target_frequency} /yr
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded bg-slate-900">
                  <span className="text-slate-400">Risk Tolerance Criteria:</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                      selectedRecord.risk_tolerance_met
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-rose-950 text-rose-300 border border-rose-800'
                    }`}
                  >
                    {selectedRecord.risk_tolerance_met ? 'TOLERABLE' : 'RISK GAP (INTOLERABLE)'}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 mt-2">
                  <span className="text-slate-300 font-semibold">Allocated Safety Integrity Level:</span>
                  <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${getSilBadge(selectedRecord.sil_requirement)}`}>
                    {selectedRecord.sil_requirement}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: 4-Pillar IPL Qualification Gate Table */}
          <div className="lg:col-span-8 space-y-4">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-100 text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  Candidate Independent Protection Layers (IPL) Qualification
                </h4>
                <span className="text-xs text-slate-400 font-mono">
                  {selectedRecord.ipls.filter((i) => i.is_qualified_ipl).length} of {selectedRecord.ipls.length} Qualified
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Under CCPS guidelines, risk reduction credit is strictly prohibited unless all 4 criteria are independently verified with recorded documentation evidence.
              </p>

              {/* IPL List Cards */}
              <div className="space-y-4 pt-2">
                {selectedRecord.ipls.map((ipl) => {
                  const isEditing = editingIplId === ipl.id;
                  return (
                    <div
                      key={ipl.id}
                      className={`p-4 rounded-xl border transition-all ${
                        ipl.is_qualified_ipl
                          ? 'bg-slate-900/90 border-emerald-500/40'
                          : 'bg-slate-900/60 border-amber-500/30'
                      }`}
                    >
                      {/* IPL Top Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-100">{ipl.tag}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                            {ipl.ipl_type.toUpperCase()}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-xs">
                            <span className="text-slate-400 mr-1.5">PFD:</span>
                            <span className="font-mono font-bold text-cyan-300">{ipl.pfd}</span>
                          </div>

                          <span
                            className={`px-2.5 py-1 rounded text-xs font-bold border ${
                              ipl.is_qualified_ipl
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-600'
                                : 'bg-amber-950 text-amber-300 border-amber-600'
                            }`}
                          >
                            {ipl.is_qualified_ipl ? 'QUALIFIED IPL (Credited)' : 'UNQUALIFIED (No Credit)'}
                          </span>

                          {!isEditing && (
                            <button
                              onClick={() => handleStartEditIpl(ipl)}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-medium border border-slate-700 transition cursor-pointer"
                            >
                              Edit Evidence
                            </button>
                          )}
                        </div>
                      </div>

                      <p className="text-xs text-slate-300 mt-2">{ipl.description}</p>

                      {/* 4 Pillars Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 text-xs">
                        {/* 1. Independence */}
                        <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-200">1. Independence</span>
                            {ipl.independence_verified ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400">
                            {ipl.independence_evidence || (
                              <span className="italic text-slate-500">Missing verification evidence</span>
                            )}
                          </p>
                        </div>

                        {/* 2. Functionality */}
                        <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-200">2. Functionality</span>
                            {ipl.functionality_verified ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400">
                            {ipl.functionality_evidence || (
                              <span className="italic text-slate-500">Missing verification evidence</span>
                            )}
                          </p>
                        </div>

                        {/* 3. Reliability */}
                        <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-200">3. Reliability (PFD)</span>
                            {ipl.reliability_verified ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400">
                            {ipl.reliability_evidence || (
                              <span className="italic text-slate-500">Missing verification evidence</span>
                            )}
                          </p>
                        </div>

                        {/* 4. Auditability */}
                        <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-200">4. Auditability</span>
                            {ipl.auditability_verified ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400">
                            {ipl.auditability_evidence || (
                              <span className="italic text-slate-500">Missing proof test evidence</span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Edit Modal / Inline Verification Form */}
                      {isEditing && (
                        <div className="mt-4 pt-3 border-t border-slate-700/80 space-y-3 bg-slate-950/90 p-3 rounded-lg">
                          <div className="text-xs font-bold text-cyan-300">
                            Verify CCPS 4 Mandatory Qualification Criteria for {ipl.tag}:
                          </div>

                          <div className="space-y-2 text-xs">
                            {/* Independence */}
                            <div className="space-y-1">
                              <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={Boolean(editingIplState.criterion_independence_met)}
                                  onChange={(e) =>
                                    setEditingIplState((prev) => ({
                                      ...prev,
                                      criterion_independence_met: e.target.checked,
                                    }))
                                  }
                                  className="rounded text-cyan-500"
                                />
                                <span className="font-bold">Criterion 1: Independence Met</span>
                              </label>
                              <input
                                type="text"
                                value={editingIplState.independence_evidence || ''}
                                onChange={(e) =>
                                  setEditingIplState((prev) => ({
                                    ...prev,
                                    independence_evidence: e.target.value,
                                  }))
                                }
                                placeholder="Evidence: Separate sensor, distinct valve, and unshared PLC processor"
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200"
                              />
                            </div>

                            {/* Functionality */}
                            <div className="space-y-1">
                              <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={Boolean(editingIplState.criterion_functionality_met)}
                                  onChange={(e) =>
                                    setEditingIplState((prev) => ({
                                      ...prev,
                                      criterion_functionality_met: e.target.checked,
                                    }))
                                  }
                                  className="rounded text-cyan-500"
                                />
                                <span className="font-bold">Criterion 2: Functionality Met</span>
                              </label>
                              <input
                                type="text"
                                value={editingIplState.functionality_evidence || ''}
                                onChange={(e) =>
                                  setEditingIplState((prev) => ({
                                    ...prev,
                                    functionality_evidence: e.target.value,
                                  }))
                                }
                                placeholder="Evidence: Valve closes fail-safe within 1.5s; relieves full discharge capacity"
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200"
                              />
                            </div>

                            {/* Reliability */}
                            <div className="space-y-1">
                              <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={Boolean(editingIplState.criterion_reliability_met)}
                                  onChange={(e) =>
                                    setEditingIplState((prev) => ({
                                      ...prev,
                                      criterion_reliability_met: e.target.checked,
                                    }))
                                  }
                                  className="rounded text-cyan-500"
                                />
                                <span className="font-bold">Criterion 3: Reliability Met</span>
                              </label>
                              <input
                                type="text"
                                value={editingIplState.reliability_evidence || ''}
                                onChange={(e) =>
                                  setEditingIplState((prev) => ({
                                    ...prev,
                                    reliability_evidence: e.target.value,
                                  }))
                                }
                                placeholder="Evidence: SIL 2 certified per IEC 61508; documented PFD <= 0.01"
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200"
                              />
                            </div>

                            {/* Auditability */}
                            <div className="space-y-1">
                              <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={Boolean(editingIplState.criterion_auditability_met)}
                                  onChange={(e) =>
                                    setEditingIplState((prev) => ({
                                      ...prev,
                                      criterion_auditability_met: e.target.checked,
                                    }))
                                  }
                                  className="rounded text-cyan-500"
                                />
                                <span className="font-bold">Criterion 4: Auditability Met</span>
                              </label>
                              <input
                                type="text"
                                value={editingIplState.auditability_evidence || ''}
                                onChange={(e) =>
                                  setEditingIplState((prev) => ({
                                    ...prev,
                                    auditability_evidence: e.target.value,
                                  }))
                                }
                                placeholder="Evidence: Annual proof testing documented in SAP PM Plan #PM-4019"
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200"
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                              onClick={() => setEditingIplId(null)}
                              className="px-3 py-1 rounded bg-slate-800 text-slate-300 text-xs"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSaveIpl(selectedRecord.id, ipl.id)}
                              disabled={savingIpl}
                              className="px-3.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs shadow transition cursor-pointer flex items-center gap-1.5"
                            >
                              <Save className="w-3.5 h-3.5" />
                              {savingIpl ? 'Validating...' : 'Save & Evaluate Qualification'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
