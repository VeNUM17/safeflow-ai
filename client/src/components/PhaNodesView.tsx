import React, { useState } from 'react';
import {
  Network,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Edit2,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Info,
  Clock,
  User,
  Waves,
  Gauge,
  Activity,
  ArrowLeftRight,
  Check,
  CheckCircle,
} from 'lucide-react';
import {
  PhaStudyNode,
  HazopReadinessResult,
  EquipmentTag,
  PipingLine,
  ProcessStream,
  ChemicalRecord,
} from '../types';
import { StreamModal } from './StreamModal';

interface PhaNodesViewProps {
  projectId: string;
  graphApproved: boolean;
  phaNodes: PhaStudyNode[];
  readiness: HazopReadinessResult | null;
  equipment: EquipmentTag[];
  lines: PipingLine[];
  streams?: ProcessStream[];
  chemicals?: ChemicalRecord[];
  onGenerateNodes: () => Promise<void>;
  onCreateNode: (nodeData: any) => Promise<void>;
  onUpdateNode: (nodeId: string, updates: any) => Promise<void>;
  onApproveNode: (nodeId: string, reviewer: string) => Promise<void>;
  onDeleteNode: (nodeId: string) => Promise<void>;
  onRefreshReadiness: () => Promise<void>;
  onSaveStream?: (streamData: any) => Promise<void>;
  onVerifyStream?: (streamId: string) => Promise<void>;
  onDeleteStream?: (streamId: string) => Promise<void>;
}

export const PhaNodesView: React.FC<PhaNodesViewProps> = ({
  projectId,
  graphApproved,
  phaNodes,
  readiness,
  equipment,
  lines,
  streams = [],
  chemicals = [],
  onGenerateNodes,
  onCreateNode,
  onUpdateNode,
  onApproveNode,
  onDeleteNode,
  onRefreshReadiness,
  onSaveStream,
  onVerifyStream,
  onDeleteStream,
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    phaNodes[0]?.id || null
  );
  const [isEditingModalOpen, setIsEditingModalOpen] = useState(false);
  const [isStreamModalOpen, setIsStreamModalOpen] = useState(false);
  const [editingStream, setEditingStream] = useState<ProcessStream | null>(null);
  const [defaultStreamSource, setDefaultStreamSource] = useState<string>('');
  const [defaultStreamDest, setDefaultStreamDest] = useState<string>('');
  const [editingNode, setEditingNode] = useState<PhaStudyNode | null>(null);
  const [isNewNode, setIsNewNode] = useState(false);
  const [reviewerName, setReviewerName] = useState('PHA Team Leader / Facilitator');
  const [loading, setLoading] = useState(false);

  // Form state for creating/editing node
  const [formNodeId, setFormNodeId] = useState('');
  const [formName, setFormName] = useState('');
  const [formDesignIntent, setFormDesignIntent] = useState('');
  const [formBasis, setFormBasis] = useState('');
  const [formEquipment, setFormEquipment] = useState<string[]>([]);
  const [formLines, setFormLines] = useState<string[]>([]);
  const [formTempUpper, setFormTempUpper] = useState<string>('');
  const [formTempLower, setFormTempLower] = useState<string>('');
  const [formPressUpper, setFormPressUpper] = useState<string>('');
  const [formPressLower, setFormPressLower] = useState<string>('');
  const [formFlowUpper, setFormFlowUpper] = useState<string>('');
  const [formFlowLower, setFormFlowLower] = useState<string>('');
  const [formTempUnit, setFormTempUnit] = useState('°C');
  const [formPressUnit, setFormPressUnit] = useState('bar(g)');
  const [formFlowUnit, setFormFlowUnit] = useState('m3/h');

  const selectedNode =
    phaNodes.find((n) => n.id === selectedNodeId) || phaNodes[0] || null;

  const openEditModal = (node: PhaStudyNode) => {
    setEditingNode(node);
    setIsNewNode(false);
    setFormNodeId(node.node_id);
    setFormName(node.name);
    setFormDesignIntent(node.design_intent);
    setFormBasis(node.basis_for_grouping);
    setFormEquipment([...node.equipment_tags]);
    setFormLines([...node.line_numbers]);
    setFormTempUpper(node.operating_limits.temperature_safe_upper?.toString() || '');
    setFormTempLower(node.operating_limits.temperature_safe_lower?.toString() || '');
    setFormPressUpper(node.operating_limits.pressure_safe_upper?.toString() || '');
    setFormPressLower(node.operating_limits.pressure_safe_lower?.toString() || '');
    setFormFlowUpper(node.operating_limits.flow_safe_upper?.toString() || '');
    setFormFlowLower(node.operating_limits.flow_safe_lower?.toString() || '');
    setFormTempUnit(node.operating_limits.units?.temperature || '°C');
    setFormPressUnit(node.operating_limits.units?.pressure || 'bar(g)');
    setFormFlowUnit(node.operating_limits.units?.flow || 'm3/h');
    setIsEditingModalOpen(true);
  };

  const openCreateModal = () => {
    setEditingNode(null);
    setIsNewNode(true);
    const nextNum = phaNodes.length + 1;
    const nextId = `N-${String(nextNum).padStart(3, '0')}`;
    setFormNodeId(nextId);
    setFormName('');
    setFormDesignIntent('');
    setFormBasis('Functional process section boundary');
    setFormEquipment([]);
    setFormLines([]);
    setFormTempUpper('');
    setFormTempLower('');
    setFormPressUpper('');
    setFormPressLower('');
    setFormFlowUpper('');
    setFormFlowLower('');
    setFormTempUnit('°C');
    setFormPressUnit('bar(g)');
    setFormFlowUnit('m3/h');
    setIsEditingModalOpen(true);
  };

  const handleSaveNode = async () => {
    if (!formNodeId.trim() || !formName.trim()) return;

    setLoading(true);
    const operatingLimits = {
      temperature_safe_upper: formTempUpper !== '' ? Number(formTempUpper) : null,
      temperature_safe_lower: formTempLower !== '' ? Number(formTempLower) : null,
      pressure_safe_upper: formPressUpper !== '' ? Number(formPressUpper) : null,
      pressure_safe_lower: formPressLower !== '' ? Number(formPressLower) : null,
      flow_safe_upper: formFlowUpper !== '' ? Number(formFlowUpper) : null,
      flow_safe_lower: formFlowLower !== '' ? Number(formFlowLower) : null,
      units: {
        temperature: formTempUnit,
        pressure: formPressUnit,
        flow: formFlowUnit,
      },
    };

    try {
      if (isNewNode) {
        await onCreateNode({
          node_id: formNodeId.trim(),
          name: formName.trim(),
          design_intent: formDesignIntent.trim(),
          equipment_tags: formEquipment,
          line_numbers: formLines,
          basis_for_grouping: formBasis.trim(),
          operating_limits: operatingLimits,
          reviewer: reviewerName,
        });
      } else if (editingNode) {
        await onUpdateNode(editingNode.id, {
          node_id: formNodeId.trim(),
          name: formName.trim(),
          design_intent: formDesignIntent.trim(),
          equipment_tags: formEquipment,
          line_numbers: formLines,
          basis_for_grouping: formBasis.trim(),
          operating_limits: operatingLimits,
          status: 'under_review',
        });
      }
      setIsEditingModalOpen(false);
      await onRefreshReadiness();
    } catch (err) {
      console.error('Failed to save study node:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (nodeId: string) => {
    setLoading(true);
    try {
      await onApproveNode(nodeId, reviewerName);
      await onRefreshReadiness();
    } catch (err) {
      console.error('Failed to approve node:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (nodeId: string) => {
    if (!confirm('Are you sure you want to delete this study node?')) return;
    setLoading(true);
    try {
      await onDeleteNode(nodeId);
      await onRefreshReadiness();
    } catch (err) {
      console.error('Failed to delete node:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledgeReassessment = async (nodeId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pha/nodes/${nodeId}/reassess-acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewer: reviewerName || 'Lead PHA Facilitator',
          notes: 'Acknowledged upstream specification modification; study node confirmed',
        }),
      });
      if (res.ok) {
        await onRefreshReadiness();
      }
    } catch (err) {
      console.error('Failed to acknowledge reassessment:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEquipment = (tag: string) => {
    setFormEquipment((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleToggleLine = (lineNo: string) => {
    setFormLines((prev) =>
      prev.includes(lineNo) ? prev.filter((l) => l !== lineNo) : [...prev, lineNo]
    );
  };

  return (
    <div className="space-y-6 font-sans">
      {/* 1. HAZOP Readiness Status Card */}
      <div
        className={`p-4 rounded-xl border transition-all ${
          readiness?.ready
            ? 'bg-emerald-950/40 border-emerald-500/50 shadow-lg'
            : 'bg-amber-950/30 border-amber-500/40'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-lg border ${
                readiness?.ready
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                  : 'bg-amber-500/20 border-amber-500/40 text-amber-400'
              }`}
            >
              {readiness?.ready ? (
                <ShieldCheck className="w-6 h-6" />
              ) : (
                <ShieldAlert className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-100">
                  HAZOP Readiness Gate (OSHA 1910.119(e))
                </h3>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                    readiness?.ready
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}
                >
                  {readiness?.ready ? 'Ready for HAZOP' : 'HAZOP Blocked'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {readiness?.ready
                  ? 'All engineering prerequisites, graph sign-off, design intent, and operating boundaries verified.'
                  : 'HAZOP cannot proceed until upstream P&ID review, study node approvals, and safe operating limits are satisfied.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-300 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
              Approved Nodes: {readiness?.nodes_ready_count || 0} /{' '}
              {readiness?.total_nodes_count || 0}
            </span>
          </div>
        </div>

        {/* Blocking Reasons Callout if Blocked */}
        {readiness && !readiness.ready && readiness.blocking_reasons.length > 0 && (
          <div className="mt-3 pt-3 border-t border-amber-500/20 space-y-1.5">
            <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
              Outstanding Prerequisites ({readiness.blocking_reasons.length}):
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              {readiness.blocking_reasons.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 bg-slate-950/80 p-2 rounded-lg border border-amber-500/30 text-amber-200 text-[11px]"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>{r}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. Top Controls & Segmentation Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
            <Network className="w-4 h-4 text-cyan-400" />
            PHA Study Node Segmentation (Candidate Partitions)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Segment the approved process graph into discrete nodes for systematic guide-word hazard analysis.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onGenerateNodes}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
          >
            <Network className="w-3.5 h-3.5" />
            Auto-Segment Candidate Nodes
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg shadow transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Study Node
          </button>
        </div>
      </div>

      {/* 3. Main Grid: Nodes List + Detailed Selected Node View */}
      {phaNodes.length === 0 ? (
        <div className="bg-slate-950 p-12 rounded-2xl border border-slate-800 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 mx-auto flex items-center justify-center text-slate-400">
            <Network className="w-6 h-6" />
          </div>
          <h4 className="font-bold text-slate-200 text-sm">
            No PHA Study Nodes Defined Yet
          </h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Once your P&ID graph is reviewed and approved, partition it into candidate study nodes (e.g. N-001 Storage, N-002 Dosing, N-003 Neutralization) based on functional intent.
          </p>
          <button
            onClick={onGenerateNodes}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg shadow transition-colors cursor-pointer mt-2"
          >
            Auto-Segment Nodes From Process Graph
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Node Cards */}
          <div className="lg:col-span-5 space-y-3">
            {phaNodes.map((node) => {
              const isSelected = node.id === selectedNode?.id;
              return (
                <div
                  key={node.id}
                  onClick={() => setSelectedNodeId(node.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-slate-900 border-cyan-500 ring-1 ring-cyan-500 shadow-md'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-bold text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-500/30">
                      {node.node_id}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                        node.status === 'approved'
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                          : node.status === 'under_review'
                          ? 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {node.status === 'candidate_not_authoritative'
                        ? 'Candidate'
                        : node.status === 'under_review'
                        ? 'Under Review'
                        : 'Approved'}
                    </span>
                  </div>

                  <h4 className="font-bold text-slate-100 text-xs mb-1">
                    {node.name}
                  </h4>
                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                    {node.design_intent || 'Design intent pending documentation'}
                  </p>

                  <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono mt-3 pt-2 border-t border-slate-800/80">
                    <span>{node.equipment_tags.length} Equipment</span>
                    <span>•</span>
                    <span>{node.line_numbers.length} Piping Lines</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: Node Details & Editor */}
          {selectedNode && (
            <div className="lg:col-span-7 bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold font-mono text-cyan-400">
                    {selectedNode.node_id}:
                  </span>
                  <h3 className="text-sm font-bold text-slate-100">
                    {selectedNode.name}
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(selectedNode)}
                    className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-lg transition-colors"
                    title="Edit Node Boundary / Limits"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(selectedNode.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                    title="Delete Node"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Reassessment Warning Banner */}
              {selectedNode.requires_reassessment && (
                <div className="p-3 bg-amber-500/15 border border-amber-500/40 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-amber-300">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Requires HAZOP Reassessment (Upstream Specification Changed)</span>
                    </div>
                    <button
                      onClick={() => handleAcknowledgeReassessment(selectedNode.id)}
                      disabled={loading}
                      className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-md text-[11px] shadow transition-colors"
                    >
                      Acknowledge Reassessment
                    </button>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-300 text-[11px] pl-1">
                    {selectedNode.reassessment_reasons?.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Status Banner */}
              <div
                className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                  selectedNode.status === 'approved'
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                    : 'bg-amber-950/30 border-amber-500/40 text-amber-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {selectedNode.status === 'approved' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  )}
                  <span>
                    Status:{' '}
                    <strong>
                      {selectedNode.status === 'approved'
                        ? 'Approved by Facilitator'
                        : selectedNode.status === 'under_review'
                        ? 'Under Engineering Review'
                        : 'Candidate Boundary (Unverified)'}
                    </strong>
                  </span>
                </div>

                {selectedNode.status !== 'approved' && (
                  <button
                    onClick={() => handleApprove(selectedNode.id)}
                    disabled={loading}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-md text-[11px] shadow transition-colors"
                  >
                    Approve Study Node
                  </button>
                )}
              </div>

              {/* Design Intent */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Design Intent & Process Objective:
                </span>
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 text-slate-200 text-xs leading-relaxed">
                  {selectedNode.design_intent || (
                    <span className="text-amber-400 italic">
                      [MISSING DESIGN INTENT]: Must be documented before HAZOP analysis.
                    </span>
                  )}
                </div>
              </div>

              {/* Safe Operating Limits */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Authoritative Safe Operating Limits (OSHA 1910.119(d)(2)):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Temperature */}
                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-1">
                    <div className="text-[11px] text-slate-400 font-semibold">
                      Safe Temperature
                    </div>
                    {selectedNode.operating_limits.temperature_safe_upper !== null &&
                    selectedNode.operating_limits.temperature_safe_upper !== undefined ? (
                      <div className="font-mono text-xs text-cyan-300 font-bold">
                        {selectedNode.operating_limits.temperature_safe_lower ?? 'N/A'} to{' '}
                        {selectedNode.operating_limits.temperature_safe_upper}{' '}
                        {selectedNode.operating_limits.units?.temperature || '°C'}
                      </div>
                    ) : (
                      <div className="text-[10px] text-amber-400 font-mono">
                        [NOT SPECIFIED]
                      </div>
                    )}
                  </div>

                  {/* Pressure */}
                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-1">
                    <div className="text-[11px] text-slate-400 font-semibold">
                      Safe Pressure
                    </div>
                    {selectedNode.operating_limits.pressure_safe_upper !== null &&
                    selectedNode.operating_limits.pressure_safe_upper !== undefined ? (
                      <div className="font-mono text-xs text-cyan-300 font-bold">
                        {selectedNode.operating_limits.pressure_safe_lower ?? 'N/A'} to{' '}
                        {selectedNode.operating_limits.pressure_safe_upper}{' '}
                        {selectedNode.operating_limits.units?.pressure || 'bar(g)'}
                      </div>
                    ) : (
                      <div className="text-[10px] text-amber-400 font-mono">
                        [NOT SPECIFIED]
                      </div>
                    )}
                  </div>

                  {/* Flow */}
                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-1">
                    <div className="text-[11px] text-slate-400 font-semibold">
                      Safe Flow Rate
                    </div>
                    {selectedNode.operating_limits.flow_safe_upper !== null &&
                    selectedNode.operating_limits.flow_safe_upper !== undefined ? (
                      <div className="font-mono text-xs text-cyan-300 font-bold">
                        {selectedNode.operating_limits.flow_safe_lower ?? 'N/A'} to{' '}
                        {selectedNode.operating_limits.flow_safe_upper}{' '}
                        {selectedNode.operating_limits.units?.flow || 'm3/h'}
                      </div>
                    ) : (
                      <div className="text-[10px] text-amber-400 font-mono">
                        [NOT SPECIFIED]
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Boundary Equipment & Lines */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Equipment Inside Boundary:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedNode.equipment_tags.length > 0 ? (
                      selectedNode.equipment_tags.map((tag) => (
                        <span
                          key={tag}
                          className="bg-slate-900 text-slate-200 border border-slate-700 px-2.5 py-1 rounded-md text-xs font-mono font-bold"
                        >
                          {tag}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500 italic">None assigned</span>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Piping Lines Inside Boundary:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedNode.line_numbers.length > 0 ? (
                      selectedNode.line_numbers.map((line) => (
                        <span
                          key={line}
                          className="bg-slate-900 text-cyan-300 border border-cyan-800/60 px-2.5 py-1 rounded-md text-xs font-mono font-bold"
                        >
                          {line}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500 italic">None assigned</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Basis for grouping */}
              {selectedNode.basis_for_grouping && (
                <div className="text-[11px] text-slate-400 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                  <span className="font-semibold text-slate-300">Boundary Basis: </span>
                  {selectedNode.basis_for_grouping}
                </div>
              )}

              {/* Process Streams & Flow Baseline (OSHA 1910.119(d)(2)) */}
              <div className="space-y-4 pt-4 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Waves className="w-4 h-4 text-cyan-400" />
                    <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider">
                      Process Streams & Boundary Flow Baseline
                    </span>
                    {selectedNode.stream_summary && (
                      <span
                        className={`text-[9px] font-mono uppercase px-2 py-0.5 rounded font-bold ${
                          selectedNode.stream_summary.unknown_flow_count === 0 && (selectedNode.stream_summary.incoming_count + selectedNode.stream_summary.outgoing_count) > 0
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                            : selectedNode.stream_summary.known_flow_count > 0
                            ? 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
                            : 'bg-rose-950/80 text-rose-300 border border-rose-500/40'
                        }`}
                      >
                        {selectedNode.stream_summary.unknown_flow_count === 0 && (selectedNode.stream_summary.incoming_count + selectedNode.stream_summary.outgoing_count) > 0
                          ? `${selectedNode.stream_summary.known_flow_count}/${selectedNode.stream_summary.incoming_count + selectedNode.stream_summary.outgoing_count} Streams Documented`
                          : selectedNode.stream_summary.unknown_flow_count > 0
                          ? `${selectedNode.stream_summary.unknown_flow_count} Stream(s) Missing Flow`
                          : 'No Streams Documented'}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      setEditingStream(null);
                      setDefaultStreamSource(selectedNode.equipment_tags[0] || '');
                      setDefaultStreamDest('');
                      setIsStreamModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-cyan-950 text-cyan-300 hover:bg-cyan-900 border border-cyan-700/50 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Process Stream</span>
                  </button>
                </div>

                {/* Missing Flow Information Notice */}
                {selectedNode.missing_process_information && selectedNode.missing_process_information.length > 0 && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1.5 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-amber-300 text-[11px]">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Process Stream Flow Baseline Information Notice:</span>
                    </div>
                    <div className="space-y-1 text-[11px] text-amber-200/90 leading-relaxed">
                      {selectedNode.missing_process_information.map((info, idx) => (
                        <div key={idx} className="flex items-start gap-1.5">
                          <span className="text-amber-400">•</span>
                          <span>{info}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Inlets & Outlets Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Incoming Streams (Inlets) */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1">
                      <ArrowRight className="w-3.5 h-3.5 text-cyan-400 rotate-180" />
                      Incoming Streams (Inlets):
                    </span>
                    {((selectedNode.incoming_streams && selectedNode.incoming_streams.length > 0)
                      ? selectedNode.incoming_streams
                      : streams.filter(
                          (s) =>
                            selectedNode.equipment_tags.map((t) => t.toUpperCase()).includes(s.destination_equipment_tag.toUpperCase()) &&
                            !selectedNode.equipment_tags.map((t) => t.toUpperCase()).includes(s.source_equipment_tag.toUpperCase())
                        )
                    ).length > 0 ? (
                      ((selectedNode.incoming_streams && selectedNode.incoming_streams.length > 0)
                        ? selectedNode.incoming_streams
                        : streams.filter(
                            (s) =>
                              selectedNode.equipment_tags.map((t) => t.toUpperCase()).includes(s.destination_equipment_tag.toUpperCase()) &&
                              !selectedNode.equipment_tags.map((t) => t.toUpperCase()).includes(s.source_equipment_tag.toUpperCase())
                          )
                      ).map((stream) => (
                        <div
                          key={stream.id}
                          className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-cyan-300 text-xs">
                              {stream.stream_number}
                            </span>
                            <div className="flex items-center gap-1">
                              <span
                                className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded ${
                                  stream.verification_status === 'verified'
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                                }`}
                              >
                                {stream.verification_status}
                              </span>
                              {onSaveStream && (
                                <button
                                  onClick={() => {
                                    setEditingStream(stream);
                                    setIsStreamModalOpen(true);
                                  }}
                                  className="p-1 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded transition-colors"
                                  title="Edit Stream"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              )}
                              {onVerifyStream && stream.verification_status !== 'verified' && (
                                <button
                                  onClick={() => onVerifyStream(stream.id)}
                                  className="p-1 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors"
                                  title="Verify Stream"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="text-[11px] font-mono text-slate-300 flex items-center gap-1.5">
                            <span className="text-slate-400">{stream.source_equipment_tag}</span>
                            <ArrowRight className="w-3 h-3 text-cyan-400" />
                            <span className="text-cyan-300 font-bold">{stream.destination_equipment_tag}</span>
                          </div>

                          <div className="text-[11px] text-slate-400 line-clamp-1">
                            {stream.material_description || 'Process Fluid'}
                          </div>

                          {/* Flow Rates Table */}
                          <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80 font-mono text-[10px] space-y-1">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Normal Flow:</span>
                              <span className={stream.flow_rates.normal !== null ? 'text-cyan-300 font-bold' : 'text-amber-400 italic'}>
                                {stream.flow_rates.normal !== null ? `${stream.flow_rates.normal} ${stream.flow_rates.unit || ''}` : '[UNKNOWN]'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Design Flow:</span>
                              <span className={stream.flow_rates.design !== null ? 'text-slate-200' : 'text-slate-500'}>
                                {stream.flow_rates.design !== null ? `${stream.flow_rates.design} ${stream.flow_rates.unit || ''}` : 'N/A'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Min / Max:</span>
                              <span className="text-slate-300">
                                {stream.flow_rates.min ?? 'N/A'} / {stream.flow_rates.max ?? 'N/A'}
                              </span>
                            </div>
                          </div>

                          {/* Conditions & Instruments */}
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                            {stream.operating_pressure.value !== null && (
                              <span className="bg-slate-950 text-slate-300 border border-slate-800 px-1.5 py-0.5 rounded font-mono">
                                {stream.operating_pressure.value} {stream.operating_pressure.unit}
                              </span>
                            )}
                            {stream.operating_temperature.value !== null && (
                              <span className="bg-slate-950 text-slate-300 border border-slate-800 px-1.5 py-0.5 rounded font-mono">
                                {stream.operating_temperature.value} {stream.operating_temperature.unit}
                              </span>
                            )}
                            {stream.phase && (
                              <span className="bg-cyan-950/60 text-cyan-300 border border-cyan-800/40 px-1.5 py-0.5 rounded capitalize">
                                {stream.phase}
                              </span>
                            )}
                          </div>

                          {stream.associated_instrument_tags && stream.associated_instrument_tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-800/80">
                              {stream.associated_instrument_tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="text-[9px] font-mono font-bold bg-slate-950 text-amber-300 border border-amber-500/30 px-1 py-0.5 rounded"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="p-3 bg-slate-900/40 rounded-xl border border-dashed border-slate-800 text-center text-slate-500 text-[11px] italic">
                        No incoming boundary streams detected.
                      </div>
                    )}
                  </div>

                  {/* Outgoing Streams (Outlets) */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1">
                      <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
                      Outgoing Streams (Outlets):
                    </span>
                    {((selectedNode.outgoing_streams && selectedNode.outgoing_streams.length > 0)
                      ? selectedNode.outgoing_streams
                      : streams.filter(
                          (s) =>
                            selectedNode.equipment_tags.map((t) => t.toUpperCase()).includes(s.source_equipment_tag.toUpperCase()) &&
                            !selectedNode.equipment_tags.map((t) => t.toUpperCase()).includes(s.destination_equipment_tag.toUpperCase())
                        )
                    ).length > 0 ? (
                      ((selectedNode.outgoing_streams && selectedNode.outgoing_streams.length > 0)
                        ? selectedNode.outgoing_streams
                        : streams.filter(
                            (s) =>
                              selectedNode.equipment_tags.map((t) => t.toUpperCase()).includes(s.source_equipment_tag.toUpperCase()) &&
                              !selectedNode.equipment_tags.map((t) => t.toUpperCase()).includes(s.destination_equipment_tag.toUpperCase())
                          )
                      ).map((stream) => (
                        <div
                          key={stream.id}
                          className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-cyan-300 text-xs">
                              {stream.stream_number}
                            </span>
                            <div className="flex items-center gap-1">
                              <span
                                className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded ${
                                  stream.verification_status === 'verified'
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                                }`}
                              >
                                {stream.verification_status}
                              </span>
                              {onSaveStream && (
                                <button
                                  onClick={() => {
                                    setEditingStream(stream);
                                    setIsStreamModalOpen(true);
                                  }}
                                  className="p-1 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded transition-colors"
                                  title="Edit Stream"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              )}
                              {onVerifyStream && stream.verification_status !== 'verified' && (
                                <button
                                  onClick={() => onVerifyStream(stream.id)}
                                  className="p-1 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors"
                                  title="Verify Stream"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="text-[11px] font-mono text-slate-300 flex items-center gap-1.5">
                            <span className="text-cyan-300 font-bold">{stream.source_equipment_tag}</span>
                            <ArrowRight className="w-3 h-3 text-cyan-400" />
                            <span className="text-slate-400">{stream.destination_equipment_tag}</span>
                          </div>

                          <div className="text-[11px] text-slate-400 line-clamp-1">
                            {stream.material_description || 'Process Fluid'}
                          </div>

                          {/* Flow Rates Table */}
                          <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80 font-mono text-[10px] space-y-1">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Normal Flow:</span>
                              <span className={stream.flow_rates.normal !== null ? 'text-cyan-300 font-bold' : 'text-amber-400 italic'}>
                                {stream.flow_rates.normal !== null ? `${stream.flow_rates.normal} ${stream.flow_rates.unit || ''}` : '[UNKNOWN]'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Design Flow:</span>
                              <span className={stream.flow_rates.design !== null ? 'text-slate-200' : 'text-slate-500'}>
                                {stream.flow_rates.design !== null ? `${stream.flow_rates.design} ${stream.flow_rates.unit || ''}` : 'N/A'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Min / Max:</span>
                              <span className="text-slate-300">
                                {stream.flow_rates.min ?? 'N/A'} / {stream.flow_rates.max ?? 'N/A'}
                              </span>
                            </div>
                          </div>

                          {/* Conditions & Instruments */}
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                            {stream.operating_pressure.value !== null && (
                              <span className="bg-slate-950 text-slate-300 border border-slate-800 px-1.5 py-0.5 rounded font-mono">
                                {stream.operating_pressure.value} {stream.operating_pressure.unit}
                              </span>
                            )}
                            {stream.operating_temperature.value !== null && (
                              <span className="bg-slate-950 text-slate-300 border border-slate-800 px-1.5 py-0.5 rounded font-mono">
                                {stream.operating_temperature.value} {stream.operating_temperature.unit}
                              </span>
                            )}
                            {stream.phase && (
                              <span className="bg-cyan-950/60 text-cyan-300 border border-cyan-800/40 px-1.5 py-0.5 rounded capitalize">
                                {stream.phase}
                              </span>
                            )}
                          </div>

                          {stream.associated_instrument_tags && stream.associated_instrument_tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-800/80">
                              {stream.associated_instrument_tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="text-[9px] font-mono font-bold bg-slate-950 text-amber-300 border border-amber-500/30 px-1 py-0.5 rounded"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="p-3 bg-slate-900/40 rounded-xl border border-dashed border-slate-800 text-center text-slate-500 text-[11px] italic">
                        No outgoing boundary streams detected.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Associated Valves, Instruments & Control Loops */}
              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                    Associated Valves, Instrumentation & Control Loops (ISA-5.1):
                  </span>
                  <span className="text-[10px] text-cyan-400 font-mono">P&ID Instrumentation</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400 font-semibold block">Boundary Valves:</span>
                    <div className="flex flex-wrap gap-1">
                      {selectedNode.associated_valves && selectedNode.associated_valves.length > 0 ? (
                        selectedNode.associated_valves.map((v) => (
                          <span key={v} className="bg-slate-900 text-cyan-300 border border-cyan-700/40 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">
                            {v}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-500 text-[10px] italic">No active valves isolated</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400 font-semibold block">Instruments & Transmitters:</span>
                    <div className="flex flex-wrap gap-1">
                      {selectedNode.associated_instruments && selectedNode.associated_instruments.length > 0 ? (
                        selectedNode.associated_instruments.map((inst) => (
                          <span key={inst} className="bg-slate-900 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">
                            {inst}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-500 text-[10px] italic">No instruments assigned</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400 font-semibold block">Identified Control Loops:</span>
                    <div className="flex flex-wrap gap-1">
                      {selectedNode.control_loops && selectedNode.control_loops.length > 0 ? (
                        selectedNode.control_loops.map((loop, idx) => (
                          <span key={idx} className="bg-slate-900 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded text-[10px] font-mono">
                            {loop}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-500 text-[10px] italic">Manual flow modulation</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Flow-Related HAZOP Deviations (5 Mandatory Deviations) */}
              {selectedNode.flow_deviations && selectedNode.flow_deviations.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      Flow-Related HAZOP Deviations (OSHA 1910.119(e)(3)(i)):
                    </span>
                    <span className="text-[10px] text-cyan-400 font-mono">5 Mandatory Flow Deviations</span>
                  </div>

                  <div className="space-y-2">
                    {selectedNode.flow_deviations.map((dev) => (
                      <div
                        key={dev.id}
                        className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-cyan-300 text-xs">
                              {dev.deviation}
                            </span>
                            <span className="text-[9px] font-mono uppercase px-2 py-0.5 rounded font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-500/30">
                              Guideword: {dev.guideword}
                            </span>
                            <span
                              className={`text-[9px] font-mono uppercase px-2 py-0.5 rounded font-bold ${
                                dev.status === 'verified_limit'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                                  : dev.status === 'unverified_limit'
                                  ? 'bg-amber-950 text-amber-300 border border-amber-500/40'
                                  : 'bg-rose-950 text-rose-300 border border-rose-500/40'
                              }`}
                            >
                              {dev.status === 'verified_limit'
                                ? 'Verified Limit'
                                : dev.status === 'unverified_limit'
                                ? 'Unverified Limit'
                                : 'Limit Unknown'}
                            </span>
                          </div>
                          <span className="font-mono text-[10px] text-slate-400">
                            {dev.from_to}
                          </span>
                        </div>

                        {/* Baseline Limits reference */}
                        <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80 text-[10px] font-mono flex items-center justify-between">
                          <span className="text-slate-400">Documented Limits:</span>
                          <span className="text-slate-300">
                            Normal: {dev.documented_limits.normal ?? 'Unknown'} {dev.documented_limits.unit || ''} | Safe Limits: [{dev.documented_limits.min_allowable ?? 'N/A'} - {dev.documented_limits.max_allowable ?? 'N/A'}] | Design: {dev.documented_limits.design_flow ?? 'N/A'}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Potential Causes:</span>
                            <ul className="list-disc list-inside text-slate-300 space-y-0.5 text-[10px]">
                              {dev.causes.map((c, i) => (
                                <li key={i}>{c}</li>
                              ))}
                            </ul>
                          </div>

                          <div className="space-y-0.5">
                            <span className="text-[10px] font-bold text-rose-400 uppercase">Consequences:</span>
                            <ul className="list-disc list-inside text-rose-200/90 space-y-0.5 text-[10px]">
                              {dev.consequences.map((c, i) => (
                                <li key={i}>{c}</li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] pt-1 border-t border-slate-800/80">
                          <div>
                            <span className="font-bold text-emerald-400 uppercase block">Safeguards:</span>
                            <span className="text-slate-300">{dev.safeguards.join(', ')}</span>
                          </div>
                          <div>
                            <span className="font-bold text-amber-400 uppercase block">Alarms:</span>
                            <span className="text-slate-300">{dev.instrumentation_and_alarms.join(', ')}</span>
                          </div>
                          <div>
                            <span className="font-bold text-cyan-400 uppercase block">Recommended Actions:</span>
                            <span className="text-slate-300">{dev.recommendations.join(', ')}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Equipment Specifications & Applicable Deviations (OSHA 1910.119(d)(3)) */}
              <div className="space-y-3 pt-3 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Equipment Specification Dependencies & Deviations:
                  </span>
                  <span className="text-[10px] text-cyan-400 font-mono">OSHA 1910.119(e)(3)</span>
                </div>

                {/* Missing Specifications Alert */}
                {selectedNode.missing_specifications && selectedNode.missing_specifications.length > 0 && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-1.5 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-rose-300 text-[11px]">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span>Missing Critical Specifications ({selectedNode.missing_specifications.length}):</span>
                    </div>
                    <div className="space-y-1 text-[11px]">
                      {selectedNode.missing_specifications.map((m, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-slate-950/60 p-2 rounded-lg border border-rose-500/20 text-rose-200">
                          <span className="font-mono font-bold text-cyan-400">[{m.equipment_tag}]</span>
                          <span className="text-slate-300">{m.impact}</span>
                          <span className="ml-auto text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-500/30 shrink-0">
                            {m.criticality}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Applicable Deviations Table */}
                {selectedNode.applicable_deviations && selectedNode.applicable_deviations.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold text-slate-300">
                      Applicable Guide-Word Deviations & Quantitative Limit Checks:
                    </span>
                    <div className="grid grid-cols-1 gap-2">
                      {selectedNode.applicable_deviations.map((dev, idx) => (
                        <div
                          key={idx}
                          className="flex items-start justify-between gap-3 bg-slate-900 p-2.5 rounded-xl border border-slate-800 text-xs"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-cyan-300 text-xs">
                                {dev.deviation}
                              </span>
                              <span
                                className={`text-[9px] font-mono uppercase px-2 py-0.5 rounded font-bold ${
                                  dev.status === 'verified_limit'
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                    : dev.status === 'unverified_limit'
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                }`}
                              >
                                {dev.status === 'verified_limit'
                                  ? 'Verified Limit'
                                  : dev.status === 'unverified_limit'
                                  ? 'Unverified Limit'
                                  : 'Limit Unknown'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                              {dev.notes || dev.potential_scenario}
                            </p>
                          </div>
                          {dev.design_limit_reference && (
                            <span className="font-mono text-cyan-400 text-[11px] bg-slate-950 px-2 py-1 rounded border border-slate-800 shrink-0">
                              {dev.design_limit_reference}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit / Create Node Modal */}
      {isEditingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-sans">
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950">
              <h3 className="font-bold text-slate-100 text-sm">
                {isNewNode ? 'Create PHA Study Node' : `Edit Study Node ${formNodeId}`}
              </h3>
              <button
                onClick={() => setIsEditingModalOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Node ID:
                  </label>
                  <input
                    type="text"
                    value={formNodeId}
                    onChange={(e) => setFormNodeId(e.target.value)}
                    placeholder="e.g. N-001"
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Node Name:
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Feed Storage and Transfer"
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Design Intent & Process Objective:
                </label>
                <textarea
                  rows={2}
                  value={formDesignIntent}
                  onChange={(e) => setFormDesignIntent(e.target.value)}
                  placeholder="Describe functional design intent (e.g. Accumulate refrigerant at 12 bar and circulate to evaporators)..."
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2"
                />
              </div>

              {/* Equipment Multi-select */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Assign Equipment in Boundary:
                </label>
                <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto p-2 bg-slate-950 rounded-lg border border-slate-800">
                  {equipment.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => handleToggleEquipment(e.tag)}
                      className={`px-2 py-1 rounded text-xs font-mono font-bold transition-colors ${
                        formEquipment.includes(e.tag)
                          ? 'bg-cyan-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {e.tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lines Multi-select */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Assign Piping Lines in Boundary:
                </label>
                <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto p-2 bg-slate-950 rounded-lg border border-slate-800">
                  {lines.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => handleToggleLine(l.line_number)}
                      className={`px-2 py-1 rounded text-xs font-mono font-bold transition-colors ${
                        formLines.includes(l.line_number)
                          ? 'bg-cyan-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {l.line_number}
                    </button>
                  ))}
                </div>
              </div>

              {/* Operating Limits Inputs */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <span className="text-[11px] font-bold text-slate-300 block">
                  Authoritative Safe Operating Limits (Leave empty if unknown):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
                    <span className="text-[10px] font-semibold text-slate-400">Temperature</span>
                    <div className="grid grid-cols-2 gap-1">
                      <input
                        type="number"
                        placeholder="Min"
                        value={formTempLower}
                        onChange={(e) => setFormTempLower(e.target.value)}
                        className="bg-slate-900 text-slate-100 p-1 rounded border border-slate-700 text-xs"
                      />
                      <input
                        type="number"
                        placeholder="Max"
                        value={formTempUpper}
                        onChange={(e) => setFormTempUpper(e.target.value)}
                        className="bg-slate-900 text-slate-100 p-1 rounded border border-slate-700 text-xs"
                      />
                    </div>
                  </div>

                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
                    <span className="text-[10px] font-semibold text-slate-400">Pressure</span>
                    <div className="grid grid-cols-2 gap-1">
                      <input
                        type="number"
                        placeholder="Min"
                        value={formPressLower}
                        onChange={(e) => setFormPressLower(e.target.value)}
                        className="bg-slate-900 text-slate-100 p-1 rounded border border-slate-700 text-xs"
                      />
                      <input
                        type="number"
                        placeholder="Max"
                        value={formPressUpper}
                        onChange={(e) => setFormPressUpper(e.target.value)}
                        className="bg-slate-900 text-slate-100 p-1 rounded border border-slate-700 text-xs"
                      />
                    </div>
                  </div>

                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
                    <span className="text-[10px] font-semibold text-slate-400">Flow Rate</span>
                    <div className="grid grid-cols-2 gap-1">
                      <input
                        type="number"
                        placeholder="Min"
                        value={formFlowLower}
                        onChange={(e) => setFormFlowLower(e.target.value)}
                        className="bg-slate-900 text-slate-100 p-1 rounded border border-slate-700 text-xs"
                      />
                      <input
                        type="number"
                        placeholder="Max"
                        value={formFlowUpper}
                        onChange={(e) => setFormFlowUpper(e.target.value)}
                        className="bg-slate-900 text-slate-100 p-1 rounded border border-slate-700 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end gap-2">
              <button
                onClick={() => setIsEditingModalOpen(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNode}
                disabled={loading}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg text-xs"
              >
                Save Study Node
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stream Modal */}
      {isStreamModalOpen && (
        <StreamModal
          isOpen={isStreamModalOpen}
          onClose={() => {
            setIsStreamModalOpen(false);
            setEditingStream(null);
          }}
          stream={editingStream}
          projectId={projectId}
          equipment={equipment}
          lines={lines}
          chemicals={chemicals}
          defaultSourceTag={defaultStreamSource}
          defaultDestTag={defaultStreamDest}
          onSave={async (streamData) => {
            if (onSaveStream) {
              await onSaveStream(streamData);
            }
          }}
        />
      )}
    </div>
  );
};
