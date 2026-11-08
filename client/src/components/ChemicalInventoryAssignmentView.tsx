import React, { useState, useEffect } from 'react';
import {
  FlaskConical,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ShieldAlert,
  ArrowRight,
  Plus,
  Trash2,
  Check,
  RotateCcw,
  Layers,
  FileSpreadsheet,
  AlertTriangle,
  FileCheck,
  Search,
  Filter,
  Info,
  Clock,
  UserCheck,
  Split,
  Database,
  ListChecks,
  Sparkles,
} from 'lucide-react';
import {
  ProcessProject,
  ChemicalRecord,
  EquipmentTag,
  PipingLine,
  ProcessStream,
  ChemicalAssignment,
  ChemicalMappingResult,
  ProjectPsiDashboardValidation,
  GasCompositionReport,
  VerificationHistoryEntry,
  ConcentrationUnit,
  StreamPhase,
  ChemicalIdentificationStatus,
} from '../types';

interface ChemicalInventoryAssignmentViewProps {
  projectId: string;
  project: ProcessProject | null;
  chemicals: ChemicalRecord[];
  equipment: EquipmentTag[];
  lines: PipingLine[];
  onOpenManualChemicalModal: () => void;
  onRefreshData?: () => void;
}

export const ChemicalInventoryAssignmentView: React.FC<ChemicalInventoryAssignmentViewProps> = ({
  projectId,
  project,
  chemicals,
  equipment,
  lines,
  onOpenManualChemicalModal,
  onRefreshData,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<
    'inventory' | 'assignment' | 'mapping' | 'psi-dashboard' | 'gas-reports'
  >('assignment');

  const [assignments, setAssignments] = useState<ChemicalAssignment[]>([]);
  const [mappings, setMappings] = useState<ChemicalMappingResult[]>([]);
  const [gasReports, setGasReports] = useState<GasCompositionReport[]>([]);
  const [psiReport, setPsiReport] = useState<ProjectPsiDashboardValidation | null>(null);
  const [history, setHistory] = useState<VerificationHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Assignment Form State
  const [selectedTargetType, setSelectedTargetType] = useState<'equipment' | 'stream'>('equipment');
  const [selectedEquipmentTag, setSelectedEquipmentTag] = useState<string>('');
  const [selectedStreamNumber, setSelectedStreamNumber] = useState<string>('');
  const [selectedChemicalId, setSelectedChemicalId] = useState<string>('');
  const [customChemicalName, setCustomChemicalName] = useState<string>('');
  const [connectionEndpoint, setConnectionEndpoint] = useState<'inlet' | 'outlet' | 'internal' | 'all'>('inlet');
  const [concentration, setConcentration] = useState<string>('');
  const [concentrationUnit, setConcentrationUnit] = useState<ConcentrationUnit>('mol%');
  const [phase, setPhase] = useState<StreamPhase>('multiphase');
  const [sourceDoc, setSourceDoc] = useState<string>('P&ID-GPF-001-02');
  const [notes, setNotes] = useState<string>('');
  const [verifyImmediately, setVerifyImmediately] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Gas Report Paste State
  const [rawGasReportText, setRawGasReportText] = useState<string>(
    `Sample Point: Inlet Reception Manifold (10"-PG-00101-A1A)
Analysis Method: Gas Chromatography (ASTM D1945)
Date: 2026-06-15

Component       mol%
Methane         82.40
Ethane           5.80
Propane          3.20
i-Butane         0.85
n-Butane         1.15
i-Pentane        0.45
n-Pentane        0.55
Hexanes+         1.20
Hydrogen Sulfide 2.10
Carbon Dioxide   1.50
Nitrogen         0.80`
  );
  const [gasReportTitle, setGasReportTitle] = useState<string>('Feed Gas Wellstream Analysis');
  const [gasReportStream, setGasReportStream] = useState<string>('10"-PG-00101-A1A');

  // Search & Filter
  const [inventorySearch, setInventorySearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'CONFIRMED' | 'CANDIDATE' | 'UNKNOWN'>('all');

  // Fetch all related data
  const fetchData = async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const [asgRes, mapRes, gasRes, psiRes, histRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/chemical-assignments`),
        fetch(`/api/projects/${projectId}/chemical-mappings`),
        fetch(`/api/projects/${projectId}/gas-composition-reports`),
        fetch(`/api/projects/${projectId}/psi-completeness`),
        fetch(`/api/projects/${projectId}/verification-history`),
      ]);

      const [asgJson, mapJson, gasJson, psiJson, histJson] = await Promise.all([
        asgRes.json(),
        mapRes.json(),
        gasRes.json(),
        psiRes.json(),
        histRes.json(),
      ]);

      if (asgJson.success) setAssignments(asgJson.data);
      if (mapJson.success) setMappings(mapJson.data);
      if (gasJson.success) setGasReports(gasJson.data);
      if (psiJson.success) setPsiReport(psiJson.data);
      if (histJson.success) setHistory(histJson.data);

      // Default equipment selection if empty
      if (!selectedEquipmentTag && equipment.length > 0) {
        const slugCatcher = equipment.find((e) => e.tag.toUpperCase() === 'PG-1001') || equipment[0];
        setSelectedEquipmentTag(slugCatcher.tag);
      }
    } catch (err) {
      console.error('Failed to load chemical mapping data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [projectId]);

  // Handle Assignment Submission
  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    let chemId = selectedChemicalId;
    let chemName = '';

    if (chemId) {
      const chem = chemicals.find((c) => c.id === chemId);
      chemName = chem?.chemical_name?.value || 'Chemical';
    } else if (customChemicalName.trim()) {
      chemName = customChemicalName.trim();
      chemId = `manual-chem-${chemName.toLowerCase().replace(/\s+/g, '-')}`;
    } else {
      setFormError('Please select a chemical from the inventory or enter a custom chemical name.');
      return;
    }

    try {
      const payload = {
        chemical_id: chemId,
        chemical_name: chemName,
        equipment_tag: selectedTargetType === 'equipment' ? selectedEquipmentTag : null,
        stream_number: selectedTargetType === 'stream' ? selectedStreamNumber : null,
        connection_endpoint: connectionEndpoint,
        concentration: concentration ? parseFloat(concentration) : null,
        concentration_unit: concentrationUnit,
        phase,
        source_document: sourceDoc,
        notes,
        verification_status: verifyImmediately ? 'verified' : 'unverified',
        author: 'Lead Process Safety Engineer (PE)',
      };

      const res = await fetch(`/api/projects/${projectId}/chemical-assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (json.success) {
        // Reset form inputs
        setConcentration('');
        setNotes('');
        setCustomChemicalName('');
        await fetchData();
        if (onRefreshData) onRefreshData();
      } else {
        setFormError(json.error || 'Failed to save chemical assignment');
      }
    } catch (err: any) {
      setFormError(err.message || 'Network error saving chemical assignment');
    }
  };

  // Handle Assignment Verification
  const handleVerifyAssignment = async (assignmentId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'verified' ? 'unverified' : 'verified';
    try {
      const res = await fetch(`/api/projects/${projectId}/chemical-assignments/${assignmentId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewer: 'Lead Process Safety Engineer (PE)',
          status: nextStatus,
        }),
      });
      const json = await res.json();
      if (json.success) {
        await fetchData();
        if (onRefreshData) onRefreshData();
      }
    } catch (err) {
      console.error('Failed to update verification status:', err);
    }
  };

  // Handle Delete Assignment
  const handleDeleteAssignment = async (assignmentId: string) => {
    if (!window.confirm('Are you sure you want to remove this chemical assignment?')) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/chemical-assignments/${assignmentId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: 'Lead Process Safety Engineer (PE)' }),
      });
      const json = await res.json();
      if (json.success) {
        await fetchData();
        if (onRefreshData) onRefreshData();
      }
    } catch (err) {
      console.error('Failed to delete assignment:', err);
    }
  };

  // Handle Gas Report Submission
  const handleParseGasReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawGasReportText.trim()) return;

    try {
      const res = await fetch(`/api/projects/${projectId}/gas-composition-reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_text: rawGasReportText,
          report_title: gasReportTitle,
          associated_stream_number: gasReportStream,
        }),
      });
      const json = await res.json();
      if (json.success) {
        alert('Gas Composition Report successfully parsed, normalized, and mapped to process streams!');
        await fetchData();
        setActiveSubTab('mapping');
      } else {
        alert(`Error: ${json.error}`);
      }
    } catch (err: any) {
      alert(`Error parsing gas report: ${err.message}`);
    }
  };

  // Helper badge for identification status
  const renderIdentificationBadge = (status: ChemicalIdentificationStatus) => {
    switch (status) {
      case 'CONFIRMED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            CONFIRMED
          </span>
        );
      case 'CANDIDATE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <AlertCircle className="w-3 h-3 text-amber-400" />
            CANDIDATE
          </span>
        );
      case 'UNKNOWN':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-700/50 text-slate-400 border border-slate-600/30">
            <HelpCircle className="w-3 h-3 text-slate-400" />
            UNKNOWN
          </span>
        );
    }
  };

  // Helper badge for mapping status
  const renderMappingBadge = (status: string) => {
    switch (status) {
      case 'VERIFIED MAPPING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            VERIFIED MAPPING
          </span>
        );
      case 'PROPOSED MAPPING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
            <Split className="w-3.5 h-3.5 text-amber-400" />
            PROPOSED MAPPING
          </span>
        );
      case 'INCOMPLETE MAPPING':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            INCOMPLETE MAPPING
          </span>
        );
    }
  };

  // Selected Equipment Mapping
  const activeMapping =
    mappings.find((m) => m.target_tag.toUpperCase() === selectedEquipmentTag.toUpperCase()) ||
    mappings[0] ||
    null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* 1. Header Banner & Engineering Principle */}
      <div className="bg-slate-950/90 border border-amber-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-600" />
        
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-amber-500/20 via-slate-900 to-yellow-500/10 p-3 rounded-xl border border-amber-500/30 text-amber-400 shadow-md shadow-amber-950/40">
                <FlaskConical className="w-7 h-7" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-amber-100 to-amber-400 tracking-tight">
                    Chemical Identification & Process Mapping Engine
                  </h2>
                  <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-gradient-to-r from-amber-950/80 via-slate-900 to-slate-950 border border-amber-500/40 text-amber-300 text-xs font-semibold shadow-sm">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>Engineered by <strong className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 font-extrabold">Shlok</strong></span>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Phase-Aware Topology Grounding, Chromatography Ingestion & OSHA 1910.119(d)(1) Verification
                </p>
              </div>
            </div>
          </div>

          {/* KPI Completeness (Gold) vs Verification (Silver) */}
          <div className="flex items-center gap-4 bg-slate-950/90 px-5 py-3 rounded-xl border border-slate-800 shadow-inner">
            <div className="text-center">
              <div className="text-2xl font-black font-mono text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 text-glow-gold">
                {psiReport?.overall_completeness_pct ?? 0}%
              </div>
              <div className="text-[10px] text-amber-400/90 uppercase tracking-wider font-bold">
                Completeness
              </div>
            </div>
            <div className="h-9 w-px bg-slate-800" />
            <div className="text-center">
              <div className="text-2xl font-black font-mono text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-slate-300 text-glow-silver">
                {psiReport?.overall_verification_pct ?? 0}%
              </div>
              <div className="text-[10px] text-slate-300 uppercase tracking-wider font-bold">
                PE Verified
              </div>
            </div>
            <div className="h-9 w-px bg-slate-800" />
            <div className="text-center">
              <div className="text-2xl font-black text-amber-400 font-mono">
                {assignments.length}
              </div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                Assignments
              </div>
            </div>
          </div>
        </div>

        {/* Critical Principle Notice */}
        <div className="mt-4 pt-3.5 border-t border-slate-800/80 flex items-center gap-2.5 text-xs text-amber-300/90 bg-amber-500/10 px-3.5 py-2.5 rounded-xl border border-amber-500/20">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>Critical Process Safety Principle:</strong> Never convert an assumed or AI-inferred chemical identity, composition, concentration, operating condition or equipment property into verified process data. Unverified values remain candidates until approved by a Professional Engineer.
          </span>
        </div>
      </div>

      {/* 2. Navigation Tabs */}
      <div className="flex bg-slate-950/90 p-1.5 rounded-xl border border-slate-800 gap-1 overflow-x-auto text-xs font-semibold shadow-inner">
        <button
          onClick={() => setActiveSubTab('assignment')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all ${
            activeSubTab === 'assignment'
              ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-slate-950 font-bold shadow-md shadow-amber-950/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
          }`}
        >
          <Plus className="w-4 h-4" />
          Chemical Inventory & Assignment ({assignments.length})
        </button>

        <button
          onClick={() => setActiveSubTab('mapping')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all ${
            activeSubTab === 'mapping'
              ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-slate-950 font-bold shadow-md shadow-amber-950/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
          }`}
        >
          <Split className="w-4 h-4" />
          Multiphase Separation & Topology Mapping
        </button>

        <button
          onClick={() => setActiveSubTab('psi-dashboard')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all ${
            activeSubTab === 'psi-dashboard'
              ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-slate-950 font-bold shadow-md shadow-amber-950/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
          }`}
        >
          <ListChecks className="w-4 h-4" />
          PSI Completeness Validation Dashboard (7 OSHA Topics)
        </button>

        <button
          onClick={() => setActiveSubTab('gas-reports')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all ${
            activeSubTab === 'gas-reports'
              ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-slate-950 font-bold shadow-md shadow-amber-950/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          Gas Composition Reports ({gasReports.length})
        </button>

        <button
          onClick={() => setActiveSubTab('inventory')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all ${
            activeSubTab === 'inventory'
              ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-slate-950 font-bold shadow-md shadow-amber-950/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
          }`}
        >
          <Database className="w-4 h-4" />
          Chemical Records Master List ({chemicals.length})
        </button>
      </div>

      {/* 3. TAB CONTENT */}

      {/* =====================================================================
          TAB 1: CHEMICAL ASSIGNMENT INTERFACE
      ===================================================================== */}
      {activeSubTab === 'assignment' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Assignment Form */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-cyan-400" />
                Assign Chemical to Equipment or Stream
              </h3>
              <p className="text-xs text-slate-400">
                Ground process streams and equipment items with chemical identities and concentrations.
              </p>
            </div>

            {formError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateAssignment} className="space-y-3.5 text-xs">
              {/* Target Selector */}
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Assignment Target Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedTargetType('equipment')}
                    className={`py-2 px-3 rounded-lg border font-medium transition-all ${
                      selectedTargetType === 'equipment'
                        ? 'bg-cyan-600/30 border-cyan-500 text-cyan-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    Equipment Vessel
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTargetType('stream')}
                    className={`py-2 px-3 rounded-lg border font-medium transition-all ${
                      selectedTargetType === 'stream'
                        ? 'bg-cyan-600/30 border-cyan-500 text-cyan-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    Process Stream / Line
                  </button>
                </div>
              </div>

              {/* Target Dropdown */}
              {selectedTargetType === 'equipment' ? (
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Target Equipment</label>
                  <select
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                    value={selectedEquipmentTag}
                    onChange={(e) => setSelectedEquipmentTag(e.target.value)}
                    required
                  >
                    <option value="">Select Equipment...</option>
                    {equipment.map((eq) => (
                      <option key={eq.id} value={eq.tag}>
                        {eq.tag} — {eq.description || eq.equipment_type}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Target Stream / Piping Line</label>
                  <select
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                    value={selectedStreamNumber}
                    onChange={(e) => setSelectedStreamNumber(e.target.value)}
                    required
                  >
                    <option value="">Select Stream or Line...</option>
                    {lines
                      .filter((l) => l.functional_type === 'piping_line')
                      .map((line) => (
                        <option key={line.id} value={line.line_number}>
                          {line.line_number} ({line.from_equipment} &rarr; {line.to_equipment}) — {line.stream_label || 'Process Fluid'}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Connection Endpoint / Nozzle */}
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Connection Endpoint / Port</label>
                <select
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  value={connectionEndpoint}
                  onChange={(e) => setConnectionEndpoint(e.target.value as any)}
                >
                  <option value="inlet">Inlet Nozzle / Stream (Feed)</option>
                  <option value="outlet">Outlet Nozzle / Stream (Discharge)</option>
                  <option value="internal">Internal Inventory / Liquid Pool</option>
                  <option value="all">Entire Process Unit (All Ports)</option>
                </select>
              </div>

              {/* Chemical Selection */}
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Chemical Species</label>
                <select
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  value={selectedChemicalId}
                  onChange={(e) => {
                    setSelectedChemicalId(e.target.value);
                    if (e.target.value) setCustomChemicalName('');
                  }}
                >
                  <option value="">Select from Project Inventory...</option>
                  {chemicals.map((chem) => (
                    <option key={chem.id} value={chem.id}>
                      {chem.chemical_name?.value || 'Unnamed'} (CAS: {chem.cas_number?.value || 'N/A'})
                    </option>
                  ))}
                </select>
                <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-1">
                  <span>Or enter custom chemical name:</span>
                </div>
                <input
                  type="text"
                  placeholder="e.g. Hydrogen Sulfide (H2S), Methane, Condensate"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  value={customChemicalName}
                  onChange={(e) => {
                    setCustomChemicalName(e.target.value);
                    if (e.target.value) setSelectedChemicalId('');
                  }}
                />
              </div>

              {/* Concentration and Unit */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Concentration</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 82.5 or 2.1"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                    value={concentration}
                    onChange={(e) => setConcentration(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Concentration Unit</label>
                  <select
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                    value={concentrationUnit}
                    onChange={(e) => setConcentrationUnit(e.target.value as any)}
                  >
                    <option value="mol%">mol%</option>
                    <option value="vol%">vol%</option>
                    <option value="wt%">wt%</option>
                    <option value="ppm">ppm</option>
                    <option value="mg/L">mg/L</option>
                    <option value="fraction">fraction (0-1)</option>
                  </select>
                </div>
              </div>

              {/* Phase */}
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Fluid Phase</label>
                <select
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  value={phase}
                  onChange={(e) => setPhase(e.target.value as any)}
                >
                  <option value="multiphase">Multiphase (Gas + Liquid Hydrocarbon + Water)</option>
                  <option value="gas">Gas / Vapor</option>
                  <option value="liquid">Liquid</option>
                  <option value="solid">Solid (Scale / Sand)</option>
                </select>
              </div>

              {/* Source Document */}
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Source Document Evidence</label>
                <input
                  type="text"
                  placeholder="e.g. P&ID-GPF-001-02 Note 1 / Lab Gas Analysis 2026-06-15"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  value={sourceDoc}
                  onChange={(e) => setSourceDoc(e.target.value)}
                />
              </div>

              {/* Engineering Notes */}
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Engineering Notes</label>
                <textarea
                  rows={2}
                  placeholder="Basis for concentration, sample conditions, or reference comments..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* Immediate Verification Toggle */}
              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-slate-300 select-none">
                  <input
                    type="checkbox"
                    className="rounded bg-slate-800 border-slate-700 text-cyan-600 focus:ring-cyan-500"
                    checked={verifyImmediately}
                    onChange={(e) => setVerifyImmediately(e.target.checked)}
                  />
                  <span>Certify immediately as Verified Process Data (PE Reviewer)</span>
                </label>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg shadow-md transition-all flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Save Chemical Assignment
              </button>
            </form>
          </div>

          {/* Active Assignments Table */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-emerald-400" />
                  Active Chemical Assignments & Audit Trail ({assignments.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Chemicals currently assigned to process equipment and streams with verification status.
                </p>
              </div>
            </div>

            {assignments.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs font-mono border border-dashed border-slate-800 rounded-lg">
                No chemical assignments created yet. Assign chemicals using the form on the left or parse a gas composition report.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 font-mono text-[11px] border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Target Entity</th>
                      <th className="py-2.5 px-3">Chemical Species</th>
                      <th className="py-2.5 px-3">Endpoint</th>
                      <th className="py-2.5 px-3">Concentration</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-slate-300">
                    {assignments.map((asgn) => (
                      <tr key={asgn.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-3 font-mono font-semibold text-cyan-400">
                          {asgn.equipment_tag || asgn.stream_number || 'Global'}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-medium text-white">{asgn.chemical_name}</div>
                          {asgn.cas_number && (
                            <div className="text-[10px] text-slate-500 font-mono">
                              CAS: {asgn.cas_number}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 capitalize">
                          <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 border border-slate-700">
                            {asgn.connection_endpoint || 'all'}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono">
                          {asgn.concentration !== null ? (
                            <span className="text-emerald-400 font-semibold">
                              {asgn.concentration} {asgn.concentration_unit}
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">Not quantified</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <div className="space-y-1">
                            {renderIdentificationBadge(asgn.identification_status)}
                            <div>
                              {asgn.verification_status === 'verified' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                                  <UserCheck className="w-3 h-3" />
                                  Verified by PE
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] text-amber-400/80">
                                  <Clock className="w-3 h-3" />
                                  Unverified
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            onClick={() => handleVerifyAssignment(asgn.id, asgn.verification_status)}
                            className={`p-1.5 rounded transition-colors ${
                              asgn.verification_status === 'verified'
                                ? 'bg-amber-600/20 text-amber-300 hover:bg-amber-600/30'
                                : 'bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30'
                            }`}
                            title={asgn.verification_status === 'verified' ? 'Revoke verification' : 'Verify assignment as PE'}
                          >
                            {asgn.verification_status === 'verified' ? (
                              <RotateCcw className="w-3.5 h-3.5" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() => handleDeleteAssignment(asgn.id)}
                            className="p-1.5 rounded bg-rose-600/20 text-rose-300 hover:bg-rose-600/30 transition-colors"
                            title="Delete assignment"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: MULTIPHASE SEPARATION & PROCESS TOPOLOGY MAPPING
      ===================================================================== */}
      {activeSubTab === 'mapping' && (
        <div className="space-y-6">
          {/* Equipment Selector */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Split className="w-5 h-5 text-cyan-400" />
              <div>
                <h3 className="text-sm font-bold text-white">Select Process Equipment for Mapping Inspection</h3>
                <p className="text-xs text-slate-400">
                  Inspect phase behavior, inlet feed composition, and separation partitioning.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <select
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                value={selectedEquipmentTag}
                onChange={(e) => setSelectedEquipmentTag(e.target.value)}
              >
                {equipment.map((eq) => (
                  <option key={eq.id} value={eq.tag}>
                    {eq.tag} — {eq.description}
                  </option>
                ))}
              </select>

              <button
                onClick={async () => {
                  await fetch(`/api/projects/${projectId}/chemical-mappings/evaluate`, { method: 'POST' });
                  await fetchData();
                }}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Re-evaluate Mappings
              </button>
            </div>
          </div>

          {/* Mapping Details Card */}
          {activeMapping ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
              {/* Mapping Status Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold text-white font-mono">{activeMapping.target_tag}</h3>
                    {renderMappingBadge(activeMapping.mapping_status)}
                    <span className="px-2.5 py-1 rounded text-xs font-mono uppercase bg-slate-800 text-slate-300 border border-slate-700">
                      Phase: {activeMapping.phase}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Source Provenance: {activeMapping.source_provenance}
                  </p>
                </div>
              </div>

              {/* Separation Summary Banner */}
              {activeMapping.separation_summary && (
                <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3.5 flex items-start gap-3">
                  <Split className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <div className="font-bold text-cyan-300">Multiphase Separation Vessel Detected</div>
                    <p className="text-slate-300 leading-relaxed">{activeMapping.separation_summary}</p>
                  </div>
                </div>
              )}

              {/* Three-Column Process Flow Representation */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 1. Inlet Feed Streams */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                      <ArrowRight className="w-4 h-4 text-cyan-400" />
                      Inlet Feed Stream (N1)
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                      10"-PG-00101-A1A
                    </span>
                  </div>

                  {activeMapping.inlet_chemicals.length === 0 ? (
                    <div className="p-4 text-center text-slate-500 text-xs italic">
                      No verified inlet chemical composition. Upload a gas composition report or create an assignment.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activeMapping.inlet_chemicals.map((chem, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 bg-slate-900/90 border border-slate-800 rounded-lg flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="font-semibold text-white">{chem.chemical_name}</div>
                            <div className="text-[10px] text-slate-500">
                              Phase: {chem.phase} {chem.cas_number ? `| CAS: ${chem.cas_number}` : ''}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono font-bold text-cyan-400">
                              {chem.concentration !== null ? `${chem.concentration} ${chem.concentration_unit}` : 'Unknown'}
                            </div>
                            <div>{renderIdentificationBadge(chem.identification_status)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Vessel Internal / Physical Attributes */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-slate-400" />
                      Vessel Physical Integrity
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                      PG-1001
                    </span>
                  </div>

                  <div className="space-y-2.5 text-xs text-slate-300">
                    <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                      <span className="text-slate-400">Design Rating:</span>
                      <span className="font-mono font-semibold text-white">90 BARG / 120 °C</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                      <span className="text-slate-400">Vessel Dimensions:</span>
                      <span className="font-mono font-semibold text-white">1200 ID x 8000 LG</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                      <span className="text-slate-400">Service Specification:</span>
                      <span className="font-mono font-semibold text-amber-300">NACE MR0175 / ISO 15156 (Note 1)</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                      <span className="text-slate-400">Overpressure Protection:</span>
                      <span className="font-mono font-semibold text-emerald-400">PSV-1001 (Set 95 BARG)</span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-slate-400">Safety Instrumented Trip:</span>
                      <span className="font-mono font-semibold text-purple-400">SIS LS-1001 (LT-1002 High-High)</span>
                    </div>
                  </div>
                </div>

                {/* 3. Outlet Streams (Gas Overhead vs Liquid Bottoms) */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Split className="w-4 h-4 text-emerald-400" />
                      Separated Outlets (N2 & N3)
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                      Gas & Liquid
                    </span>
                  </div>

                  {activeMapping.outlet_chemicals.length === 0 ? (
                    <div className="p-4 text-center text-slate-500 text-xs italic">
                      No outlet partitioning evaluated.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activeMapping.outlet_chemicals.map((chem, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 bg-slate-900/90 border border-slate-800 rounded-lg flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="font-semibold text-white flex items-center gap-1.5">
                              {chem.chemical_name}
                              <span
                                className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                                  chem.phase === 'gas'
                                    ? 'bg-cyan-500/20 text-cyan-300'
                                    : 'bg-emerald-500/20 text-emerald-300'
                                }`}
                              >
                                {chem.phase}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Port: {chem.connection_tag}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono text-slate-400 text-[11px] italic">
                              {chem.concentration !== null
                                ? `${chem.concentration} ${chem.concentration_unit}`
                                : 'Pending Flash Calc'}
                            </div>
                            <div>{renderIdentificationBadge(chem.identification_status)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Unresolved Engineering Gaps */}
              {activeMapping.unresolved_gaps.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    Unresolved Engineering Information Gaps
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-xs text-slate-300">
                    {activeMapping.unresolved_gaps.map((gap, i) => (
                      <li key={i}>{gap}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 text-xs font-mono">
              No chemical mapping available for selected equipment.
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 3: PSI COMPLETENESS VALIDATION DASHBOARD (7 OSHA TOPICS)
      ===================================================================== */}
      {activeSubTab === 'psi-dashboard' && psiReport && (
        <div className="space-y-6">
          {/* Summary KPI Meters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-cyan-400 font-mono">
                {psiReport.overall_completeness_pct}%
              </div>
              <div className="text-xs text-slate-400 mt-1 font-semibold uppercase tracking-wider">
                Overall Completeness
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Populated OSHA Fields
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-emerald-400 font-mono">
                {psiReport.overall_verification_pct}%
              </div>
              <div className="text-xs text-slate-400 mt-1 font-semibold uppercase tracking-wider">
                PE Verification
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Audited & Approved
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-purple-400 font-mono">
                {psiReport.confirmed_chemicals_count} / {psiReport.total_chemicals}
              </div>
              <div className="text-xs text-slate-400 mt-1 font-semibold uppercase tracking-wider">
                Confirmed Chemicals
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Direct Document Evidence
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-amber-400 font-mono">
                {psiReport.global_engineering_checklist.length}
              </div>
              <div className="text-xs text-slate-400 mt-1 font-semibold uppercase tracking-wider">
                Missing Safety Topics
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Plant Action Items
              </div>
            </div>
          </div>

          {/* Actionable Engineering Checklist */}
          {psiReport.global_engineering_checklist.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">Actionable Plant Engineering Checklist</h3>
                  <p className="text-xs text-slate-400">
                    Mandatory items required before completing Process Safety Management (PSM) compliance review.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {psiReport.global_engineering_checklist.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg flex items-start justify-between gap-4 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{item.chemical_name}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          {item.missing_topic}
                        </span>
                      </div>
                      <p className="text-slate-400">{item.description}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30 shrink-0">
                      {item.priority} Priority
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chemical Reports Breakdown Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-cyan-400" />
              OSHA 29 CFR 1910.119(d)(1) Seven Topic Verification Matrix
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 font-mono text-[11px] border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Chemical Name</th>
                    <th className="py-2.5 px-3">Toxicity</th>
                    <th className="py-2.5 px-3">PEL / Limits</th>
                    <th className="py-2.5 px-3">Physical Data</th>
                    <th className="py-2.5 px-3">Reactivity</th>
                    <th className="py-2.5 px-3">Corrosivity</th>
                    <th className="py-2.5 px-3">Stability</th>
                    <th className="py-2.5 px-3">Inadvertent Mixing</th>
                    <th className="py-2.5 px-3 text-right">Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {psiReport.chemical_reports.map((cr) => (
                    <tr key={cr.chemical_id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-semibold text-white">{cr.chemical_name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          CAS: {cr.cas_number || 'N/A'}
                        </div>
                      </td>
                      {cr.categories.map((cat, ci) => (
                        <td key={ci} className="py-3 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                              cat.data_state === 'VERIFIED'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : cat.data_state === 'UNVERIFIED'
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : cat.data_state === 'REQUIRES_REVIEW'
                                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {cat.data_state}
                          </span>
                        </td>
                      ))}
                      <td className="py-3 px-3 text-right font-mono font-bold text-emerald-400">
                        {cr.verification_percentage}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 4: GAS COMPOSITION REPORTS (PARSER & INGESTION)
      ===================================================================== */}
      {activeSubTab === 'gas-reports' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
                Ingest Laboratory Gas Analysis Report
              </h3>
              <p className="text-xs text-slate-400">
                Paste chromatographic report text to parse components, normalize molar fractions, and map to inlet piping.
              </p>
            </div>

            <form onSubmit={handleParseGasReport} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Report Title / Description</label>
                <input
                  type="text"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  value={gasReportTitle}
                  onChange={(e) => setGasReportTitle(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Associate With Process Stream / Line</label>
                <input
                  type="text"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                  value={gasReportStream}
                  onChange={(e) => setGasReportStream(e.target.value)}
                  placeholder="e.g. 10&quot;-PG-00101-A1A"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Raw Gas Analysis Report Text</label>
                <textarea
                  rows={10}
                  className="w-full bg-slate-950 font-mono text-[11px] border border-slate-800 rounded-lg p-3 text-cyan-300 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  value={rawGasReportText}
                  onChange={(e) => setRawGasReportText(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg shadow-md transition-all flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Parse, Normalize & Associate Report
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <FileCheck className="w-4 h-4 text-emerald-400" />
              Ingested Gas Reports ({gasReports.length})
            </h3>

            {gasReports.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs font-mono border border-dashed border-slate-800 rounded-lg">
                No gas reports parsed yet. Use the form on the left to ingest chromatographic analysis data.
              </div>
            ) : (
              <div className="space-y-4">
                {gasReports.map((report) => (
                  <div
                    key={report.id}
                    className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <div>
                        <div className="font-bold text-white text-xs">{report.report_title}</div>
                        <div className="text-[10px] text-slate-400">
                          Sample Point: {report.sample_point} | Method: {report.analysis_method}
                        </div>
                      </div>
                      <div className="text-right font-mono text-xs">
                        <div className="text-emerald-400 font-bold">
                          Total: {report.total_concentration} {report.concentration_unit}
                        </div>
                        {report.associated_stream_number && (
                          <div className="text-[10px] text-cyan-400">
                            Stream: {report.associated_stream_number}
                          </div>
                        )}
                      </div>
                    </div>

                    {report.ambiguity_flag && (
                      <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded text-[11px] text-amber-300 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>{report.ambiguity_flag}</span>
                      </div>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900 text-slate-400 text-[10px] font-mono">
                          <tr>
                            <th className="py-1 px-2">Component</th>
                            <th className="py-1 px-2">Formula</th>
                            <th className="py-1 px-2">Phase</th>
                            <th className="py-1 px-2">Concentration</th>
                            <th className="py-1 px-2 text-right">Normalized mol%</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {report.components.map((comp, ci) => (
                            <tr key={ci} className="hover:bg-slate-900/40">
                              <td className="py-1.5 px-2 font-sans font-medium text-white flex items-center gap-1">
                                {comp.component_name}
                                {comp.is_hazardous && (
                                  <span className="text-[9px] px-1 rounded bg-rose-500/20 text-rose-300">
                                    Hazard
                                  </span>
                                )}
                              </td>
                              <td className="py-1.5 px-2 text-slate-400">{comp.formula || '—'}</td>
                              <td className="py-1.5 px-2 uppercase text-slate-400 text-[10px]">{comp.phase}</td>
                              <td className="py-1.5 px-2 text-slate-300">
                                {comp.concentration} {comp.unit}
                              </td>
                              <td className="py-1.5 px-2 text-right font-bold text-cyan-400">
                                {comp.normalized_mol_pct ?? comp.concentration}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 5: CHEMICAL RECORDS MASTER LIST
      ===================================================================== */}
      {activeSubTab === 'inventory' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-400" />
                Project Chemical Inventory & Grounding Status ({chemicals.length})
              </h3>
              <p className="text-xs text-slate-400">
                Uploaded SDS chemicals and manually entered process chemicals.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onOpenManualChemicalModal}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Chemical Manually
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 font-mono text-[11px] border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Chemical Name</th>
                  <th className="py-2.5 px-3">CAS Number</th>
                  <th className="py-2.5 px-3">Origin</th>
                  <th className="py-2.5 px-3">Physical State</th>
                  <th className="py-2.5 px-3">Associated Assignments</th>
                  <th className="py-2.5 px-3 text-right">Identification Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {chemicals.map((chem) => {
                  const assignedTo = assignments.filter((a) => a.chemical_id === chem.id);
                  let idStatus: ChemicalIdentificationStatus = 'CANDIDATE';
                  if (assignedTo.some((a) => a.verification_status === 'verified')) {
                    idStatus = 'CONFIRMED';
                  }

                  return (
                    <tr key={chem.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-semibold text-white">
                          {chem.chemical_name?.value || 'Unnamed'}
                        </div>
                        {chem.molecular_formula && (
                          <div className="text-[10px] text-slate-500 font-mono">
                            Formula: {chem.molecular_formula}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-300">
                        {chem.cas_number?.value || 'N/A'}
                      </td>
                      <td className="py-3 px-3 capitalize">
                        <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300">
                          {chem.origin ? chem.origin.replace('_', ' ') : 'SDS Extracted'}
                        </span>
                      </td>
                      <td className="py-3 px-3 capitalize text-slate-400">
                        {chem.physical_state || 'Liquid / Gas'}
                      </td>
                      <td className="py-3 px-3 font-mono text-cyan-400">
                        {assignedTo.length > 0 ? (
                          assignedTo.map((a) => a.equipment_tag || a.stream_number).join(', ')
                        ) : (
                          <span className="text-slate-500 italic">Unassigned (Available)</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {renderIdentificationBadge(idStatus)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
