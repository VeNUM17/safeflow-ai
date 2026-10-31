import React, { useState, useEffect } from 'react';
import {
  FileText,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  RotateCcw,
  Edit2,
  Trash2,
  Check,
  X,
  RefreshCw,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  CommonDrawingModel,
  ConnectionCandidate,
  ProcessDescriptionExtraction,
  ProcessProject,
  DocumentRecord,
  ConnectionReconciliationStatus,
} from '../../types';

interface HybridReconciliationPanelProps {
  project: ProcessProject;
  documents: DocumentRecord[];
  onRefreshGraph?: () => void;
  onSelectCandidate?: (candidate: ConnectionCandidate) => void;
}

export const HybridReconciliationPanel: React.FC<HybridReconciliationPanelProps> = ({
  project,
  documents,
  onRefreshGraph,
  onSelectCandidate,
}) => {
  const [descriptionText, setDescriptionText] = useState<string>('');
  const [extraction, setExtraction] = useState<ProcessDescriptionExtraction | null>(null);
  const [drawingModel, setDrawingModel] = useState<CommonDrawingModel | null>(null);
  const [isLoadingDesc, setIsLoadingDesc] = useState<boolean>(false);
  const [isLoadingRecognition, setIsLoadingRecognition] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    source_equipment: string;
    destination_equipment: string;
    line_number: string;
    flow_direction: 'forward' | 'reverse' | 'bidirectional' | 'unknown';
  }>({
    source_equipment: '',
    destination_equipment: '',
    line_number: '',
    flow_direction: 'forward',
  });

  // Load existing process description and recognition results on mount
  useEffect(() => {
    async function loadData() {
      try {
        const descRes = await fetch(`/api/projects/${project.id}/process-description`);
        const descData = await descRes.json();
        if (descData.success && descData.data) {
          setExtraction(descData.data);
          setDescriptionText(descData.data.raw_description || '');
        }

        const recRes = await fetch(`/api/projects/${project.id}/recognition-results`);
        const recData = await recRes.json();
        if (recData.success && Array.isArray(recData.data) && recData.data.length > 0) {
          setDrawingModel(recData.data[0]);
        }
      } catch (err) {
        console.error('Failed to load hybrid recognition data:', err);
      }
    }
    loadData();
  }, [project.id]);

  // Submit Process Narrative
  const handleAnalyzeDescription = async () => {
    if (!descriptionText.trim()) return;
    try {
      setIsLoadingDesc(true);
      const res = await fetch(`/api/projects/${project.id}/process-description`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: descriptionText.trim() }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setExtraction(data.data);
      }
    } catch (err) {
      console.error('Failed to analyze description:', err);
    } finally {
      setIsLoadingDesc(false);
    }
  };

  // Run Hybrid Recognition
  const handleRunHybridRecognition = async () => {
    try {
      setIsLoadingRecognition(true);
      const res = await fetch(`/api/projects/${project.id}/recognize-hybrid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setDrawingModel(data.data);
      }
    } catch (err) {
      console.error('Failed to run hybrid recognition:', err);
    } finally {
      setIsLoadingRecognition(false);
    }
  };

  // Verify Candidate Connection
  const handleVerifyCandidate = async (candidateId: string) => {
    try {
      const res = await fetch(`/api/connections/${candidateId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewer: 'Process Safety Engineer' }),
      });
      const data = await res.json();
      if (data.success && data.data && drawingModel) {
        setDrawingModel({
          ...drawingModel,
          connection_candidates: drawingModel.connection_candidates.map((c) =>
            c.id === candidateId ? data.data : c
          ),
        });
      }
    } catch (err) {
      console.error('Failed to verify candidate:', err);
    }
  };

  // Reject Candidate Connection
  const handleRejectCandidate = async (candidateId: string) => {
    try {
      const res = await fetch(`/api/connections/${candidateId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewer: 'Process Safety Engineer' }),
      });
      const data = await res.json();
      if (data.success && data.data && drawingModel) {
        setDrawingModel({
          ...drawingModel,
          connection_candidates: drawingModel.connection_candidates.map((c) =>
            c.id === candidateId ? data.data : c
          ),
        });
      }
    } catch (err) {
      console.error('Failed to reject candidate:', err);
    }
  };

  // Start Editing Candidate
  const handleStartEdit = (cand: ConnectionCandidate) => {
    setEditingCandidateId(cand.id);
    setEditForm({
      source_equipment: cand.source_equipment,
      destination_equipment: cand.destination_equipment,
      line_number: cand.line_number || '',
      flow_direction: cand.flow_direction,
    });
  };

  // Save Candidate Edit
  const handleSaveEdit = async (candidateId: string) => {
    try {
      const res = await fetch(`/api/connections/${candidateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_equipment: editForm.source_equipment.trim().toUpperCase(),
          destination_equipment: editForm.destination_equipment.trim().toUpperCase(),
          line_number: editForm.line_number.trim() || undefined,
          flow_direction: editForm.flow_direction,
          reviewer: 'Process Safety Engineer',
        }),
      });
      const data = await res.json();
      if (data.success && data.data && drawingModel) {
        setDrawingModel({
          ...drawingModel,
          connection_candidates: drawingModel.connection_candidates.map((c) =>
            c.id === candidateId ? data.data : c
          ),
        });
        setEditingCandidateId(null);
      }
    } catch (err) {
      console.error('Failed to save connection correction:', err);
    }
  };

  // Idempotent Topology Synchronization
  const handleSyncTopology = async () => {
    if (!drawingModel) return;
    try {
      setIsSyncing(true);
      setSyncMessage(null);
      const approvedIds = drawingModel.connection_candidates
        .filter(
          (c) =>
            c.verification_status === 'verified' ||
            c.recognition_status === 'corroborated' ||
            c.recognition_status === 'visually_supported'
        )
        .map((c) => c.id);

      const res = await fetch(`/api/projects/${project.id}/sync-connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_ids: approvedIds,
          reviewer: 'Process Safety Engineer',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSyncMessage(`Successfully synchronized ${data.data.synced_count} piping connections into authoritative process graph.`);
        if (onRefreshGraph) onRefreshGraph();
      } else {
        setSyncMessage(`Sync warning: ${data.error}`);
      }
    } catch (err: any) {
      setSyncMessage(`Sync error: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const candidates = drawingModel?.connection_candidates || [];
  const filteredCandidates = candidates.filter((c) => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'corroborated') return c.recognition_status === 'corroborated';
    if (filterStatus === 'visually_supported') return c.recognition_status === 'visually_supported';
    if (filterStatus === 'description_supported') return c.recognition_status === 'description_supported';
    if (filterStatus === 'conflicting') return c.recognition_status === 'conflicting';
    if (filterStatus === 'unresolved') return c.recognition_status === 'unresolved';
    if (filterStatus === 'verified') return c.verification_status === 'verified';
    return true;
  });

  const getStatusBadge = (status: ConnectionReconciliationStatus, verification: string) => {
    if (verification === 'verified') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
          <ShieldCheck className="w-3.5 h-3.5" /> Engineer Verified
        </span>
      );
    }
    switch (status) {
      case 'corroborated':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-500/20 text-green-300 border border-green-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" /> Corroborated
          </span>
        );
      case 'visually_supported':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
            <Cpu className="w-3.5 h-3.5" /> Visually Supported
          </span>
        );
      case 'description_supported':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
            <FileText className="w-3.5 h-3.5" /> Description Only
          </span>
        );
      case 'conflicting':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/30">
            <ShieldAlert className="w-3.5 h-3.5" /> Conflicting
          </span>
        );
      case 'unresolved':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <HelpCircle className="w-3.5 h-3.5" /> Unresolved
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 text-white">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            Hybrid P&ID Recognition & Process Understanding Engine
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Reconciles physical drawing geometry with natural language process narratives to build authoritative process topology.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRunHybridRecognition}
            disabled={isLoadingRecognition}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium shadow-lg transition-all"
          >
            <Cpu className={`w-4 h-4 ${isLoadingRecognition ? 'animate-spin' : ''}`} />
            {isLoadingRecognition ? 'Analyzing Drawing...' : 'Run Hybrid Recognition'}
          </button>
          <button
            onClick={handleSyncTopology}
            disabled={isSyncing || !drawingModel}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium shadow-lg transition-all"
          >
            <ShieldCheck className="w-4 h-4" />
            {isSyncing ? 'Syncing...' : 'Sync with Process Graph'}
          </button>
        </div>
      </div>

      {syncMessage && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{syncMessage}</span>
        </div>
      )}

      {/* Section 1: Natural Language Process Description */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2 text-slate-200">
            <FileText className="w-4 h-4 text-purple-400" />
            Process Narrative Understanding
          </h3>
          <span className="text-[11px] text-slate-400">
            Provide operating description to corroborate and resolve drawing ambiguities
          </span>
        </div>

        <textarea
          value={descriptionText}
          onChange={(e) => setDescriptionText(e.target.value)}
          placeholder="E.g. Sodium hydroxide solution is stored in TK-101. Pump P-101 transfers the solution to mixing tank MX-101. Water is supplied through a separate line and joins the sodium hydroxide stream in MX-101. The mixed solution passes through heat exchanger E-101 for cooling and is then transferred to product tank TK-102."
          rows={3}
          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
        />

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            {extraction && (
              <span className="text-xs text-slate-400">
                Extracted: <strong className="text-indigo-300">{extraction.extracted_tags.length} tags</strong>,{' '}
                <strong className="text-emerald-300">{extraction.relationships.length} stream relationships</strong>
              </span>
            )}
            {extraction?.missing_tags_in_drawing && extraction.missing_tags_in_drawing.length > 0 && (
              <span className="text-xs text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                Missing from drawing: {extraction.missing_tags_in_drawing.join(', ')}
              </span>
            )}
          </div>
          <button
            onClick={handleAnalyzeDescription}
            disabled={isLoadingDesc || !descriptionText.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/80 hover:bg-purple-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {isLoadingDesc ? 'Analyzing Narrative...' : 'Analyze Description'}
          </button>
        </div>
      </div>

      {/* Section 2: Reconciliation Summary Matrix */}
      {drawingModel && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <div
            onClick={() => setFilterStatus('corroborated')}
            className={`cursor-pointer p-3 rounded-xl border transition-all ${
              filterStatus === 'corroborated'
                ? 'bg-green-950/60 border-green-500 ring-1 ring-green-500'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="text-[11px] text-slate-400 font-medium">Corroborated</div>
            <div className="text-xl font-bold text-green-400 mt-1">
              {drawingModel.reconciliation_summary.corroborated_count}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Drawing + Narrative</div>
          </div>

          <div
            onClick={() => setFilterStatus('visually_supported')}
            className={`cursor-pointer p-3 rounded-xl border transition-all ${
              filterStatus === 'visually_supported'
                ? 'bg-blue-950/60 border-blue-500 ring-1 ring-blue-500'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="text-[11px] text-slate-400 font-medium">Visually Supported</div>
            <div className="text-xl font-bold text-blue-400 mt-1">
              {drawingModel.reconciliation_summary.visually_supported_count}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Drawing Only</div>
          </div>

          <div
            onClick={() => setFilterStatus('description_supported')}
            className={`cursor-pointer p-3 rounded-xl border transition-all ${
              filterStatus === 'description_supported'
                ? 'bg-purple-950/60 border-purple-500 ring-1 ring-purple-500'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="text-[11px] text-slate-400 font-medium">Description Only</div>
            <div className="text-xl font-bold text-purple-400 mt-1">
              {drawingModel.reconciliation_summary.description_supported_count}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Narrative Only</div>
          </div>

          <div
            onClick={() => setFilterStatus('conflicting')}
            className={`cursor-pointer p-3 rounded-xl border transition-all ${
              filterStatus === 'conflicting'
                ? 'bg-red-950/60 border-red-500 ring-1 ring-red-500'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="text-[11px] text-slate-400 font-medium">Conflicting</div>
            <div className="text-xl font-bold text-red-400 mt-1">
              {drawingModel.reconciliation_summary.conflicting_count}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Opposing Flow / Path</div>
          </div>

          <div
            onClick={() => setFilterStatus('unresolved')}
            className={`cursor-pointer p-3 rounded-xl border transition-all ${
              filterStatus === 'unresolved'
                ? 'bg-amber-950/60 border-amber-500 ring-1 ring-amber-500'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="text-[11px] text-slate-400 font-medium">Unresolved</div>
            <div className="text-xl font-bold text-amber-400 mt-1">
              {drawingModel.reconciliation_summary.unresolved_count}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Dangling / Unattached</div>
          </div>

          <div
            onClick={() => setFilterStatus('verified')}
            className={`cursor-pointer p-3 rounded-xl border transition-all ${
              filterStatus === 'verified'
                ? 'bg-emerald-950/60 border-emerald-500 ring-1 ring-emerald-500'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="text-[11px] text-slate-400 font-medium">Engineer Verified</div>
            <div className="text-xl font-bold text-emerald-400 mt-1">
              {drawingModel.reconciliation_summary.engineer_verified_count}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Signed Off</div>
          </div>
        </div>
      )}

      {/* Section 3: Reconciled Connection Candidates Table */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-slate-200">
              Candidate Piping Connections ({filteredCandidates.length})
            </h3>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Filter:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-indigo-500"
            >
              <option value="all">All Candidates</option>
              <option value="corroborated">Corroborated Only</option>
              <option value="visually_supported">Visually Supported Only</option>
              <option value="description_supported">Description Supported Only</option>
              <option value="conflicting">Conflicting Only</option>
              <option value="unresolved">Unresolved Only</option>
              <option value="verified">Engineer Verified Only</option>
            </select>
          </div>
        </div>

        {filteredCandidates.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No connection candidates found matching filter criteria. Click "Run Hybrid Recognition" above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold">
                  <th className="py-3 px-4">Source Equipment</th>
                  <th className="py-3 px-4">Direction</th>
                  <th className="py-3 px-4">Destination Equipment</th>
                  <th className="py-3 px-4">Line Tag</th>
                  <th className="py-3 px-4">Flow Baseline</th>
                  <th className="py-3 px-4">Classification</th>
                  <th className="py-3 px-4">Supporting Evidence</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredCandidates.map((cand) => {
                  const isEditing = editingCandidateId === cand.id;

                  return (
                    <tr
                      key={cand.id}
                      className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                      onClick={() => onSelectCandidate && onSelectCandidate(cand)}
                    >
                      {/* Source */}
                      <td className="py-3 px-4 font-mono font-medium text-slate-200">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.source_equipment}
                            onChange={(e) => setEditForm({ ...editForm, source_equipment: e.target.value })}
                            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs w-24"
                          />
                        ) : (
                          cand.source_equipment
                        )}
                      </td>

                      {/* Direction */}
                      <td className="py-3 px-4 text-slate-400">
                        {isEditing ? (
                          <select
                            value={editForm.flow_direction}
                            onChange={(e) => setEditForm({ ...editForm, flow_direction: e.target.value as any })}
                            className="bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-xs"
                          >
                            <option value="forward">→</option>
                            <option value="reverse">←</option>
                            <option value="bidirectional">↔</option>
                          </select>
                        ) : (
                          <span className="font-mono text-indigo-400">
                            {cand.flow_direction === 'reverse' ? '←' : cand.flow_direction === 'bidirectional' ? '↔' : '→'}
                          </span>
                        )}
                      </td>

                      {/* Destination */}
                      <td className="py-3 px-4 font-mono font-medium text-slate-200">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.destination_equipment}
                            onChange={(e) => setEditForm({ ...editForm, destination_equipment: e.target.value })}
                            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs w-24"
                          />
                        ) : (
                          cand.destination_equipment
                        )}
                      </td>

                      {/* Line Tag */}
                      <td className="py-3 px-4 text-slate-300">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.line_number}
                            onChange={(e) => setEditForm({ ...editForm, line_number: e.target.value })}
                            placeholder="Line ID"
                            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs w-28"
                          />
                        ) : (
                          cand.line_number || <span className="text-slate-600">Unspecified</span>
                        )}
                      </td>

                      {/* Flow baseline */}
                      <td className="py-3 px-4 text-slate-300">
                        {cand.flow_rates?.normal !== null && cand.flow_rates?.normal !== undefined ? (
                          <span className="font-mono text-indigo-300">
                            {cand.flow_rates.normal} {cand.flow_rates.unit || 'm3/h'}
                          </span>
                        ) : (
                          <span className="text-slate-600">null (not provided)</span>
                        )}
                      </td>

                      {/* Classification Badge */}
                      <td className="py-3 px-4">
                        {getStatusBadge(cand.recognition_status, cand.verification_status)}
                      </td>

                      {/* Evidence */}
                      <td className="py-3 px-4 text-slate-400 max-w-xs truncate text-[11px]">
                        {cand.conflict_details ? (
                          <span className="text-red-400">{cand.conflict_details}</span>
                        ) : cand.text_evidence && cand.text_evidence.length > 0 ? (
                          cand.text_evidence[0]
                        ) : (
                          'Physical polyline traced from drawing'
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleSaveEdit(cand.id)}
                              className="p-1 text-emerald-400 hover:bg-emerald-950/60 rounded"
                              title="Save Changes"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingCandidateId(null)}
                              className="p-1 text-slate-400 hover:bg-slate-800 rounded"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleStartEdit(cand)}
                              className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded"
                              title="Correct Connection"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            {cand.verification_status !== 'verified' && (
                              <button
                                onClick={() => handleVerifyCandidate(cand.id)}
                                className="p-1 text-emerald-400 hover:bg-emerald-950/60 rounded"
                                title="Approve & Verify"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            {cand.verification_status !== 'rejected' && (
                              <button
                                onClick={() => handleRejectCandidate(cand.id)}
                                className="p-1 text-red-400 hover:bg-red-950/60 rounded"
                                title="Reject Candidate"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
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
    </div>
  );
};
