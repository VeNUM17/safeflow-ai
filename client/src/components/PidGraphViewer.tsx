import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  GitBranch,
  Layers,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FlaskConical,
  Plus,
  ShieldAlert,
  ArrowRight,
  Maximize2,
  Info,
  Edit2,
  Trash2,
  ShieldCheck,
  History,
  FileCheck,
  Network,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Eye,
  Sliders,
  Radio,
  Waves,
} from 'lucide-react';
import {
  EquipmentTag,
  PipingLine,
  ChemicalRecord,
  TopologyGraph,
  DocumentRecord,
  ProjectDashboardSummary,
  GraphValidationResult,
  GraphApprovalRecord,
  PhaStudyNode,
  HazopReadinessResult,
  EquipmentType,
  FunctionalType,
  FlowDirection,
  EquipmentStatus,
  PhaWorkflowStage,
  EquipmentSpecifications,
  SpecProperty,
  SpecFieldStatus,
  SpecVerificationStatus,
  CapacityType,
  SpecConflictEntry,
  SpecHistoryEntry,
  ProcessStream,
} from '../types';
import { PhaWorkflowHeader } from './PhaWorkflowHeader';
import { GraphValidationDrawer } from './GraphValidationDrawer';
import { GraphApprovalModal } from './GraphApprovalModal';
import { AuditTrailModal } from './AuditTrailModal';
import { PhaNodesView } from './PhaNodesView';
import { DigitalPidEditor } from './pid-editor/DigitalPidEditor';
import { StreamModal } from './StreamModal';
import { RecognitionDebugOverlay, DebugLayerToggles } from './pid-editor/RecognitionDebugOverlay';
import { Activity } from 'lucide-react';

interface Props {
  projectId: string;
  equipment: EquipmentTag[];
  lines: PipingLine[];
  chemicals: ChemicalRecord[];
  documents: DocumentRecord[];
  graph: TopologyGraph | null;
  summary: ProjectDashboardSummary | null;
  conflicts?: any[];
  onOpenConflictsModal?: () => void;
  onUpdateEquipment: (
    tagId: string,
    updates: Partial<EquipmentTag> & { reviewer?: string; reason?: string }
  ) => Promise<void>;
  onDeleteEquipment: (tagId: string, reviewer?: string, reason?: string) => Promise<void>;
  onAddEquipment: (newTag: any) => Promise<void>;
  onAddLine: (newLine: any) => Promise<void>;
  onUpdateLine: (
    lineId: string,
    updates: Partial<PipingLine> & { reviewer?: string; reason?: string }
  ) => Promise<void>;
  onDeleteLine: (lineId: string, reviewer?: string, reason?: string) => Promise<void>;
  onRefreshGraph: () => Promise<void>;
  onRefreshProject: () => Promise<void>;
}

const EQUIPMENT_TYPES: { value: EquipmentType; label: string }[] = [
  { value: 'vessel', label: 'Vessel / Drum' },
  { value: 'tank', label: 'Storage Tank' },
  { value: 'mixing_tank', label: 'Mixing Tank' },
  { value: 'pump', label: 'Pump' },
  { value: 'compressor', label: 'Compressor' },
  { value: 'heat_exchanger', label: 'Heat Exchanger / Condenser' },
  { value: 'reactor', label: 'Reactor' },
  { value: 'agitator', label: 'Agitator' },
  { value: 'separator', label: 'Separator' },
  { value: 'manual_valve', label: 'Manual Valve' },
  { value: 'isolation_valve', label: 'Isolation Valve' },
  { value: 'control_valve', label: 'Control Valve' },
  { value: 'drain_valve', label: 'Drain Valve' },
  { value: 'instrument', label: 'Instrument / Transmitter' },
  { value: 'other', label: 'Other Equipment' },
];

export const PidGraphViewer: React.FC<Props> = ({
  projectId,
  equipment,
  lines,
  chemicals,
  documents,
  graph,
  summary,
  conflicts = [],
  onOpenConflictsModal,
  onUpdateEquipment,
  onDeleteEquipment,
  onAddEquipment,
  onAddLine,
  onUpdateLine,
  onDeleteLine,
  onRefreshGraph,
  onRefreshProject,
}) => {
  // Navigation subtabs
  const [activeSubTab, setActiveSubTab] = useState<
    'topology' | 'pha_workflow' | 'diagram' | 'elements' | 'pid_editor'
  >('topology');

  // Selected elements
  const [selectedTagId, setSelectedTagId] = useState<string | null>(
    equipment[0]?.id || null
  );
  const [selectedLineId, setSelectedLineId] = useState<string | null>(
    lines[0]?.id || null
  );
  const [selectionType, setSelectionType] = useState<'node' | 'edge'>('node');

  // Interactive Graph Zoom / Pan
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isEditMode, setIsEditMode] = useState(false);

  // Validation, Approval, Audit, PHA state
  const [validation, setValidation] = useState<GraphValidationResult | null>(null);
  const [approval, setApproval] = useState<GraphApprovalRecord | null>(null);
  const [phaNodes, setPhaNodes] = useState<PhaStudyNode[]>([]);
  const [readiness, setReadiness] = useState<HazopReadinessResult | null>(null);

  // Drawers and Modals
  const [showValidationDrawer, setShowValidationDrawer] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [showAddNodeModal, setShowAddNodeModal] = useState(false);
  const [showEditNodeModal, setShowEditNodeModal] = useState(false);
  const [showAddLineModal, setShowAddLineModal] = useState(false);
  const [showEditLineModal, setShowEditLineModal] = useState(false);

  // Process Streams state
  const [streams, setStreams] = useState<ProcessStream[]>([]);
  const [showStreamModal, setShowStreamModal] = useState(false);
  const [editingStream, setEditingStream] = useState<ProcessStream | null>(null);
  const [streamDefaultSource, setStreamDefaultSource] = useState('');
  const [streamDefaultDest, setStreamDefaultDest] = useState('');

  // Recognition Debug Overlay & Diagnostic View
  const [showDebugOverlay, setShowDebugOverlay] = useState<boolean>(false);
  const [debugLayers, setDebugLayers] = useState<DebugLayerToggles>({
    rawSegments: true,
    processPiping: true,
    signalLines: true,
    junctions: true,
    boundingBoxes: true,
    ports: true,
    candidates: true,
    confirmedPaths: true,
  });

  const handleToggleDebugLayer = (layer: keyof DebugLayerToggles) => {
    setDebugLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  // Form states
  const [newNodeForm, setNewNodeForm] = useState({
    tag: '',
    description: '',
    equipment_type: 'vessel' as EquipmentType,
    assigned_chemical_id: chemicals[0]?.id || '',
    notes: '',
    reviewer: 'Process Safety Engineer',
  });

  const [editNodeForm, setEditNodeForm] = useState({
    tag: '',
    description: '',
    equipment_type: 'vessel' as EquipmentType,
    assigned_chemical_id: '',
    status: 'confirmed' as EquipmentStatus,
    notes: '',
    change_reason: '',
    reviewer: 'Process Safety Engineer',
  });

  const [newLineForm, setNewLineForm] = useState({
    line_number: '',
    from_equipment: equipment[0]?.tag || '',
    to_equipment: equipment[1]?.tag || equipment[0]?.tag || '',
    size: '2"',
    material: 'CS',
    stream_label: '',
    functional_type: 'piping_line' as FunctionalType,
    flow_direction: 'forward' as FlowDirection,
    assigned_chemical_id: chemicals[0]?.id || '',
    notes: '',
    reviewer: 'Process Safety Engineer',
  });

  const [editLineForm, setEditLineForm] = useState({
    line_number: '',
    from_equipment: '',
    to_equipment: '',
    size: '2"',
    material: 'CS',
    stream_label: '',
    functional_type: 'piping_line' as FunctionalType,
    flow_direction: 'forward' as FlowDirection,
    assigned_chemical_id: '',
    status: 'confirmed' as EquipmentStatus,
    notes: '',
    change_reason: '',
    reviewer: 'Process Safety Engineer',
  });

  // Equipment Specification Modals & State
  const [showEditSpecModal, setShowEditSpecModal] = useState(false);
  const [specModalProperty, setSpecModalProperty] = useState<keyof EquipmentSpecifications>('material_of_construction');
  const [specFormValue, setSpecFormValue] = useState<string>('');
  const [specFormUnit, setSpecFormUnit] = useState<string>('');
  const [specFormCapacityType, setSpecFormCapacityType] = useState<CapacityType>('total_volume');
  const [specFormDocName, setSpecFormDocName] = useState<string>('');
  const [specFormDocRev, setSpecFormDocRev] = useState<string>('');
  const [specFormDocPage, setSpecFormDocPage] = useState<string>('');
  const [specFormReason, setSpecFormReason] = useState<string>('');

  const [showVerifySpecModal, setShowVerifySpecModal] = useState(false);
  const [specVerifyProperty, setSpecVerifyProperty] = useState<keyof EquipmentSpecifications>('design_pressure');
  const [specVerifyReviewer, setSpecVerifyReviewer] = useState('Senior Process Safety Specialist (PE)');
  const [specVerifyNotes, setSpecVerifyNotes] = useState('Authorized engineering verification of design limits against manufacturer datasheet');

  const [showConflictSpecModal, setShowConflictSpecModal] = useState(false);
  const [specConflictProperty, setSpecConflictProperty] = useState<keyof EquipmentSpecifications>('material_of_construction');

  const [showHistorySpecModal, setShowHistorySpecModal] = useState(false);
  const [specHistoryProperty, setSpecHistoryProperty] = useState<keyof EquipmentSpecifications>('design_pressure');

  const openEditSpecModal = (propKey: keyof EquipmentSpecifications) => {
    if (!selectedEquipment) return;
    const prop = selectedEquipment.specifications?.[propKey];
    setSpecModalProperty(propKey);
    setSpecFormValue(prop?.value !== null && prop?.value !== undefined ? String(prop.value) : '');
    setSpecFormUnit(prop?.unit || (propKey === 'design_pressure' ? 'psig' : propKey === 'design_temperature' ? '°F' : propKey === 'capacity' ? 'gallons' : ''));
    setSpecFormCapacityType(prop?.capacity_type || 'total_volume');
    setSpecFormDocName(prop?.source_document_name || '');
    setSpecFormDocRev(prop?.source_revision || '');
    setSpecFormDocPage(prop?.source_page ? String(prop.source_page) : '');
    setSpecFormReason('');
    setShowEditSpecModal(true);
  };

  const openVerifySpecModal = (propKey: keyof EquipmentSpecifications) => {
    setSpecVerifyProperty(propKey);
    setSpecVerifyReviewer('Senior Process Safety Specialist (PE)');
    setSpecVerifyNotes('Authorized engineering review of design documentation');
    setShowVerifySpecModal(true);
  };

  const openConflictSpecModal = (propKey: keyof EquipmentSpecifications) => {
    setSpecConflictProperty(propKey);
    setShowConflictSpecModal(true);
  };

  const openHistorySpecModal = (propKey: keyof EquipmentSpecifications) => {
    setSpecHistoryProperty(propKey);
    setShowHistorySpecModal(true);
  };

  const handleSaveSpecification = async () => {
    if (!selectedEquipment || !specModalProperty) return;

    let parsedValue: any = null;
    if (specFormValue.trim() !== '') {
      if (specModalProperty === 'material_of_construction') {
        parsedValue = specFormValue.trim();
      } else {
        const num = Number(specFormValue.trim());
        parsedValue = isNaN(num) ? null : num;
      }
    }

    const payload: Partial<SpecProperty<any>> = {
      value: parsedValue,
      unit: specFormUnit.trim() || null,
      status: parsedValue !== null ? 'user_entered' : 'not_provided',
      verification_status: 'unverified',
      source_document_name: specFormDocName.trim() || null,
      source_revision: specFormDocRev.trim() || null,
      source_page: specFormDocPage.trim() ? Number(specFormDocPage.trim()) : null,
      ...(specModalProperty === 'capacity' ? { capacity_type: specFormCapacityType } : {}),
    };

    try {
      const res = await fetch(`/api/equipment/${selectedEquipment.id}/specifications`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_key: specModalProperty,
          payload,
          reviewer: 'Process Safety Engineer',
          change_reason: specFormReason.trim() || `Updated ${specModalProperty} value`,
        }),
      });
      if (res.ok) {
        setShowEditSpecModal(false);
        onRefreshGraph();
        await loadValidationAndApproval();
      }
    } catch (err) {
      console.error('Failed to update specification:', err);
    }
  };

  const handleVerifySpecification = async () => {
    if (!selectedEquipment || !specVerifyProperty) return;
    try {
      const res = await fetch(`/api/equipment/${selectedEquipment.id}/specifications/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_key: specVerifyProperty,
          reviewer: specVerifyReviewer.trim() || 'Senior Process Safety Specialist (PE)',
          verification_notes: specVerifyNotes.trim() || 'Authorized verification',
        }),
      });
      if (res.ok) {
        setShowVerifySpecModal(false);
        onRefreshGraph();
        await loadValidationAndApproval();
      }
    } catch (err) {
      console.error('Failed to verify specification:', err);
    }
  };

  const handleResolveSpecConflict = async (
    propKey: keyof EquipmentSpecifications,
    selectedValue: any,
    selectedUnit: string | null,
    resolutionNotes: string,
    markVerified: boolean
  ) => {
    if (!selectedEquipment) return;
    try {
      const res = await fetch(`/api/equipment/${selectedEquipment.id}/specifications/resolve-conflict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_key: propKey,
          selected_value: selectedValue,
          selected_unit: selectedUnit,
          reviewer: 'Process Safety Engineer',
          resolution_notes: resolutionNotes,
          mark_verified: markVerified,
        }),
      });
      if (res.ok) {
        setShowConflictSpecModal(false);
        onRefreshGraph();
        await loadValidationAndApproval();
      }
    } catch (err) {
      console.error('Failed to resolve specification conflict:', err);
    }
  };

  // Load Validation, Approval, PHA Nodes, Streams, and Readiness
  const loadValidationAndApproval = async () => {
    if (!projectId) return;
    try {
      const [valRes, appRes, nodesRes, readRes, streamsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/graph/validation`),
        fetch(`/api/projects/${projectId}/graph/approval`),
        fetch(`/api/projects/${projectId}/pha/nodes`),
        fetch(`/api/projects/${projectId}/pha/readiness`),
        fetch(`/api/projects/${projectId}/streams`),
      ]);
      const [valJson, appJson, nodesJson, readJson, streamsJson] = await Promise.all([
        valRes.json(),
        appRes.json(),
        nodesRes.json(),
        readRes.json(),
        streamsRes.json(),
      ]);

      if (valJson.success) setValidation(valJson.data);
      if (appJson.success) setApproval(appJson.data);
      if (nodesJson.success) setPhaNodes(nodesJson.data);
      if (readJson.success) setReadiness(readJson.data);
      if (streamsJson.success) setStreams(streamsJson.data || []);
    } catch (err) {
      console.error('Failed to load validation/approval/pha/streams:', err);
    }
  };

  const handleSaveStream = async (streamData: any) => {
    try {
      if (editingStream && editingStream.id) {
        await fetch(`/api/streams/${editingStream.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(streamData),
        });
      } else {
        await fetch(`/api/projects/${projectId}/streams`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(streamData),
        });
      }
      await loadValidationAndApproval();
      await onRefreshProject();
      await onRefreshGraph();
    } catch (err) {
      console.error('Failed to save stream:', err);
    }
  };

  const handleVerifyStream = async (streamId: string) => {
    try {
      await fetch(`/api/streams/${streamId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewer: 'Lead Process Safety Engineer (PE)' }),
      });
      await loadValidationAndApproval();
      await onRefreshProject();
    } catch (err) {
      console.error('Failed to verify stream:', err);
    }
  };

  const handleDeleteStream = async (streamId: string) => {
    try {
      await fetch(`/api/streams/${streamId}`, {
        method: 'DELETE',
      });
      await loadValidationAndApproval();
      await onRefreshProject();
    } catch (err) {
      console.error('Failed to delete stream:', err);
    }
  };

  useEffect(() => {
    loadValidationAndApproval();
  }, [projectId, equipment.length, lines.length]);

  const selectedEquipment =
    equipment.find((e) => e.id === selectedTagId) || equipment[0] || null;
  const selectedLine =
    lines.find((l) => l.id === selectedLineId) || lines[0] || null;

  // ----------------------------------------------------
  // Dynamic 2D Graph Positioning Algorithm
  // ----------------------------------------------------
  const nodePositions = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    if (!equipment.length) return positions;

    // Arrange nodes nicely in a multi-column, layered layout
    const width = 860;
    const height = 480;
    const padding = 80;

    // Categorize by functional role
    const feedTanks: EquipmentTag[] = [];
    const reactorsMixers: EquipmentTag[] = [];
    const pumpsExchangers: EquipmentTag[] = [];
    const instruments: EquipmentTag[] = [];
    const others: EquipmentTag[] = [];

    equipment.forEach((eq) => {
      const type = eq.equipment_type;
      if (type === 'tank' || (type === 'vessel' && eq.tag.startsWith('TK'))) {
        feedTanks.push(eq);
      } else if (type === 'reactor' || type === 'mixing_tank' || eq.tag.startsWith('MX')) {
        reactorsMixers.push(eq);
      } else if (type === 'pump' || type === 'heat_exchanger' || type === 'compressor' || eq.tag.startsWith('P-') || eq.tag.startsWith('E-')) {
        pumpsExchangers.push(eq);
      } else if (type === 'instrument' || eq.tag.startsWith('FIT') || eq.tag.startsWith('TIT') || eq.tag.startsWith('LIT')) {
        instruments.push(eq);
      } else {
        others.push(eq);
      }
    });

    // Create 4 distinct horizontal zones:
    // Zone 1: Feed & Storage (x: 100 - 200)
    // Zone 2: Mixers & Reactors (x: 340 - 440)
    // Zone 3: Pumps & Exchangers (x: 560 - 660)
    // Zone 4: Product / Receiver / Others (x: 740 - 800)
    // Instruments placed along the top / bottom rows
    const cols = [
      feedTanks,
      reactorsMixers.length ? reactorsMixers : others.slice(0, Math.ceil(others.length / 2)),
      pumpsExchangers,
      others.slice(Math.ceil(others.length / 2)),
    ];

    const colX = [120, 360, 580, 760];

    cols.forEach((colGroup, colIdx) => {
      const cx = colX[colIdx];
      const count = colGroup.length;
      if (count === 1) {
        positions[colGroup[0].tag] = { x: cx, y: height / 2 };
      } else {
        colGroup.forEach((eq, idx) => {
          const cy = padding + (idx * (height - 2 * padding)) / Math.max(1, count - 1);
          positions[eq.tag] = { x: cx, y: cy };
        });
      }
    });

    // Position Instruments along an upper/lower instrumentation band
    instruments.forEach((inst, idx) => {
      const x = 200 + idx * 160;
      const y = idx % 2 === 0 ? 55 : height - 55;
      positions[inst.tag] = { x: Math.min(x, width - 100), y };
    });

    // Fallback for any unpositioned equipment
    equipment.forEach((eq, idx) => {
      if (!positions[eq.tag]) {
        const x = 120 + (idx % 4) * 200;
        const y = 100 + Math.floor(idx / 4) * 120;
        positions[eq.tag] = { x, y };
      }
    });

    return positions;
  }, [equipment]);

  // Handlers for Equipment CRUD
  const handleOpenEditNode = (eq: EquipmentTag) => {
    setEditNodeForm({
      tag: eq.tag,
      description: eq.description,
      equipment_type: eq.equipment_type,
      assigned_chemical_id: eq.assigned_chemical_id || '',
      status: eq.status,
      notes: eq.notes || '',
      change_reason: 'Engineering tag & classification verification',
      reviewer: 'Process Safety Engineer',
    });
    setShowEditNodeModal(true);
  };

  const handleSaveEditNode = async () => {
    if (!selectedEquipment) return;
    await onUpdateEquipment(selectedEquipment.id, {
      tag: editNodeForm.tag.trim().toUpperCase(),
      description: editNodeForm.description.trim(),
      equipment_type: editNodeForm.equipment_type,
      assigned_chemical_id: editNodeForm.assigned_chemical_id || null,
      status: editNodeForm.status,
      notes: editNodeForm.notes,
      reviewer: editNodeForm.reviewer,
      reason: editNodeForm.change_reason || 'Manual equipment modification',
    });
    setShowEditNodeModal(false);
    await onRefreshProject();
    await loadValidationAndApproval();
  };

  const handleDeleteEquipmentNode = async (eq: EquipmentTag) => {
    if (
      !confirm(
        `Are you sure you want to delete equipment node "${eq.tag}"?\n\nWARNING: Any connecting piping lines will also be removed, and graph approval will be invalidated.`
      )
    )
      return;

    await onDeleteEquipment(
      eq.id,
      'Process Safety Engineer',
      `Removed false-positive equipment node ${eq.tag}`
    );
    setSelectedTagId(null);
    await onRefreshProject();
    await loadValidationAndApproval();
  };

  const handleCreateNewEquipment = async () => {
    if (!newNodeForm.tag.trim()) return;
    await onAddEquipment({
      tag: newNodeForm.tag.trim().toUpperCase(),
      description: newNodeForm.description.trim() || 'Process Equipment',
      equipment_type: newNodeForm.equipment_type,
      assigned_chemical_id: newNodeForm.assigned_chemical_id || null,
      notes: newNodeForm.notes,
      reviewer: newNodeForm.reviewer,
      reason: 'Manual engineering addition of equipment node',
    });
    setShowAddNodeModal(false);
    setNewNodeForm({
      tag: '',
      description: '',
      equipment_type: 'vessel',
      assigned_chemical_id: chemicals[0]?.id || '',
      notes: '',
      reviewer: 'Process Safety Engineer',
    });
    await onRefreshProject();
    await loadValidationAndApproval();
  };

  // Handlers for Line Connection CRUD
  const handleOpenEditLine = (line: PipingLine) => {
    setEditLineForm({
      line_number: line.line_number,
      from_equipment: line.from_equipment,
      to_equipment: line.to_equipment,
      size: line.size || '2"',
      material: line.material || 'CS',
      stream_label: line.stream_label || '',
      functional_type: line.functional_type || 'piping_line',
      flow_direction: line.flow_direction || 'forward',
      assigned_chemical_id: line.assigned_chemical_id || '',
      status: line.status,
      notes: line.notes || '',
      change_reason: 'Engineering piping connection revision',
      reviewer: 'Process Safety Engineer',
    });
    setShowEditLineModal(true);
  };

  const handleSaveEditLine = async () => {
    if (!selectedLine) return;
    await onUpdateLine(selectedLine.id, {
      line_number: editLineForm.line_number.trim(),
      from_equipment: editLineForm.from_equipment.trim().toUpperCase(),
      to_equipment: editLineForm.to_equipment.trim().toUpperCase(),
      size: editLineForm.size,
      material: editLineForm.material,
      stream_label: editLineForm.stream_label,
      functional_type: editLineForm.functional_type,
      flow_direction: editLineForm.flow_direction,
      assigned_chemical_id:
        editLineForm.functional_type === 'signal_line'
          ? null
          : editLineForm.assigned_chemical_id || null,
      status: editLineForm.status,
      notes: editLineForm.notes,
      reviewer: editLineForm.reviewer,
      reason: editLineForm.change_reason || 'Manual line reconnection/modification',
    });
    setShowEditLineModal(false);
    await onRefreshProject();
    await loadValidationAndApproval();
  };

  const handleDeletePipingLine = async (line: PipingLine) => {
    if (
      !confirm(
        `Are you sure you want to remove connection line "${line.line_number}" (${line.from_equipment} -> ${line.to_equipment})?\n\nThis will invalidate graph approval.`
      )
    )
      return;

    await onDeleteLine(
      line.id,
      'Process Safety Engineer',
      `Removed erroneous piping edge ${line.line_number}`
    );
    setSelectedLineId(null);
    await onRefreshProject();
    await loadValidationAndApproval();
  };

  const handleCreateNewLine = async () => {
    if (!newLineForm.line_number.trim() || !newLineForm.from_equipment || !newLineForm.to_equipment)
      return;

    await onAddLine({
      line_number: newLineForm.line_number.trim(),
      from_equipment: newLineForm.from_equipment.trim().toUpperCase(),
      to_equipment: newLineForm.to_equipment.trim().toUpperCase(),
      size: newLineForm.size,
      material: newLineForm.material,
      stream_label: newLineForm.stream_label,
      functional_type: newLineForm.functional_type,
      flow_direction: newLineForm.flow_direction,
      assigned_chemical_id:
        newLineForm.functional_type === 'signal_line'
          ? null
          : newLineForm.assigned_chemical_id || null,
      notes: newLineForm.notes,
      reviewer: newLineForm.reviewer,
      change_reason: 'Manual engineering connection between process nodes',
    });
    setShowAddLineModal(false);
    setNewLineForm({
      line_number: '',
      from_equipment: equipment[0]?.tag || '',
      to_equipment: equipment[1]?.tag || equipment[0]?.tag || '',
      size: '2"',
      material: 'CS',
      stream_label: '',
      functional_type: 'piping_line',
      flow_direction: 'forward',
      assigned_chemical_id: chemicals[0]?.id || '',
      notes: '',
      reviewer: 'Process Safety Engineer',
    });
    await onRefreshProject();
    await loadValidationAndApproval();
  };

  // Validation & Approval Actions
  const handleAcknowledgeWarning = async (warningCode: string) => {
    const res = await fetch(`/api/projects/${projectId}/graph/acknowledge-warning`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warning_code: warningCode }),
    });
    const json = await res.json();
    if (json.success) {
      setValidation(json.data);
      await onRefreshProject();
    }
  };

  const handleApproveGraph = async (reviewer: string, notes: string) => {
    const res = await fetch(`/api/projects/${projectId}/graph/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewer, notes }),
    });
    const json = await res.json();
    if (json.success) {
      setApproval(json.data);
      await onRefreshProject();
      await loadValidationAndApproval();
    } else {
      throw new Error(json.error || 'Failed to approve graph');
    }
  };

  const handleUnapproveGraph = async (reviewer: string, reason: string) => {
    const res = await fetch(`/api/projects/${projectId}/graph/unapprove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewer, reason }),
    });
    const json = await res.json();
    if (json.success) {
      await onRefreshProject();
      await loadValidationAndApproval();
    }
  };

  // PHA Node Operations
  const handleGeneratePhaNodes = async () => {
    const res = await fetch(`/api/projects/${projectId}/pha/nodes/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewer: 'Process Safety Engineer' }),
    });
    const json = await res.json();
    if (json.success) {
      setPhaNodes(json.data);
      await loadValidationAndApproval();
    }
  };

  const handleCreateCustomPhaNode = async (nodeData: any) => {
    const res = await fetch(`/api/projects/${projectId}/pha/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nodeData),
    });
    const json = await res.json();
    if (json.success) {
      setPhaNodes((prev) => [...prev, json.data]);
      await loadValidationAndApproval();
    }
  };

  const handleUpdatePhaNode = async (nodeId: string, updates: any) => {
    const res = await fetch(`/api/pha/nodes/${nodeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const json = await res.json();
    if (json.success) {
      setPhaNodes((prev) => prev.map((n) => (n.id === nodeId ? json.data : n)));
      await loadValidationAndApproval();
    }
  };

  const handleApprovePhaNode = async (nodeId: string, reviewer: string) => {
    const res = await fetch(`/api/pha/nodes/${nodeId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewer }),
    });
    const json = await res.json();
    if (json.success) {
      setPhaNodes((prev) => prev.map((n) => (n.id === nodeId ? json.data : n)));
      await loadValidationAndApproval();
    }
  };

  const handleDeletePhaNode = async (nodeId: string) => {
    const res = await fetch(`/api/pha/nodes/${nodeId}`, {
      method: 'DELETE',
    });
    const json = await res.json();
    if (json.success) {
      setPhaNodes((prev) => prev.filter((n) => n.id !== nodeId));
      await loadValidationAndApproval();
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* 1. PHA 8-Stage Workflow Header */}
      <PhaWorkflowHeader
        currentStage={summary?.current_stage || 'graph_review'}
        graphApproved={Boolean(approval?.approved)}
        phaApprovedCount={summary?.pha_approved_nodes_count || 0}
        totalPhaNodes={summary?.pha_nodes_count || 0}
        hazopReady={Boolean(readiness?.ready)}
        onSelectStage={(stage) => {
          if (stage === 'node_segmentation' || stage === 'node_review' || stage === 'hazop_readiness') {
            setActiveSubTab('pha_workflow');
          } else if (stage === 'upload') {
            setActiveSubTab('diagram');
          } else if (stage === 'graph_review') {
            setActiveSubTab('pid_editor');
          } else {
            setActiveSubTab('topology');
          }
        }}
      />

      {/* 2. Subtab Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-100">
              P&ID Interpretation & PHA Workflow Engine
            </h2>
            {approval?.approved ? (
              <span className="bg-emerald-500/20 text-emerald-300 font-mono text-[10px] px-2 py-0.5 rounded border border-emerald-500/40 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Graph Approved by Engineer
              </span>
            ) : (
              <span className="bg-amber-500/20 text-amber-300 font-mono text-[10px] px-2 py-0.5 rounded border border-amber-500/40">
                Provisional / Review Stage
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Extract equipment & piping, perform manual engineering review, validate topological integrity, and partition into PHA study nodes.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setActiveSubTab('pid_editor')}
              className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1.5 ${
                activeSubTab === 'pid_editor'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Digital P&ID Editor
            </button>
            <button
              onClick={() => setActiveSubTab('topology')}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                activeSubTab === 'topology'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Process Graph Editor
            </button>
            <button
              onClick={() => setActiveSubTab('pha_workflow')}
              className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1.5 ${
                activeSubTab === 'pha_workflow'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              PHA Study Nodes ({phaNodes.length})
            </button>
            <button
              onClick={() => setActiveSubTab('diagram')}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                activeSubTab === 'diagram'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Source Drawing
            </button>
            <button
              onClick={() => setActiveSubTab('elements')}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                activeSubTab === 'elements'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Elements Table ({equipment.length + lines.length})
            </button>
          </div>

          <button
            onClick={() => setShowAuditModal(true)}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            title="Inspect full engineering audit log"
          >
            <History className="w-3.5 h-3.5 text-cyan-400" />
            Audit Log
          </button>
        </div>
      </div>

      {/* 3. Inadvertent Mixing Alerts (OSHA 1910.119(d)(1)(vii)) */}
      {graph && graph.mixing_alerts && graph.mixing_alerts.length > 0 ? (
        <div className="bg-slate-900 border border-rose-500/80 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-rose-950/80 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-rose-300 uppercase tracking-wider flex items-center gap-2">
                  Inadvertent Chemical Mixing Hazards (OSHA 1910.119(d)(1)(vii))
                  <span className="bg-rose-500/20 text-rose-300 font-mono text-[10px] px-2 py-0.5 rounded-full border border-rose-500/40 font-bold">
                    {graph.mixing_alerts.length} Localized Scenarios
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Evaluated from physical piping connectivity and common equipment nodes in the plant layout.
                </p>
              </div>
            </div>
            <div className="text-[11px] text-slate-400 italic">
              Evidence-grounded pathway analysis
            </div>
          </div>

          <div className="space-y-3">
            {graph.mixing_alerts.map((alert) => {
              const isValidated = alert.status === 'validated';
              const isPotential = alert.status === 'potential';
              const isUnresolved = alert.status === 'unresolved';

              return (
                <div
                  key={alert.id}
                  className={`p-4 rounded-xl border text-xs space-y-3 transition-all ${
                    isValidated
                      ? 'bg-rose-950/30 border-rose-500/80 ring-1 ring-rose-500/40'
                      : isPotential
                      ? 'bg-amber-950/25 border-amber-500/60'
                      : 'bg-purple-950/25 border-purple-500/60'
                  }`}
                >
                  {/* Alert Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border uppercase flex items-center gap-1 ${
                          isValidated
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/60'
                            : isPotential
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/60'
                            : 'bg-purple-500/20 text-purple-300 border-purple-500/60'
                        }`}
                      >
                        {isValidated && <CheckCircle2 className="w-3 h-3 text-rose-400" />}
                        {isPotential && <AlertTriangle className="w-3 h-3 text-amber-400" />}
                        {isUnresolved && <Info className="w-3 h-3 text-purple-400" />}
                        {alert.status.toUpperCase()} PATHWAY
                      </span>

                      <span className="bg-rose-950 text-rose-400 font-mono text-[10px] px-2 py-0.5 rounded border border-rose-500/40 font-bold uppercase">
                        CRITICAL SEVERITY
                      </span>

                      <span className="text-slate-300 font-mono text-[11px]">
                        Target Node: <strong className="text-cyan-400">{alert.node_tag}</strong>
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 font-mono">
                      Lines: {alert.supporting_line_numbers.join(', ')}
                    </div>
                  </div>

                  {/* Hazard Title & Reaction Description */}
                  <div>
                    <h4 className="font-bold text-slate-100 text-sm mb-1">
                      {alert.hazard_title}
                    </h4>
                    <p className="text-slate-300 leading-relaxed">
                      {alert.reaction_description}
                    </p>
                  </div>

                  {/* Pathway & Chemical Details Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-950/80 p-3 rounded-lg border border-slate-800 text-[11px]">
                    <div className="space-y-1">
                      <span className="font-semibold text-slate-400 uppercase tracking-wider text-[10px] block">
                        Chemical Streams in Scenario:
                      </span>
                      {alert.chemicals_involved.map((c, i) => (
                        <div key={i} className="flex items-center justify-between text-slate-300">
                          <span className="font-bold text-cyan-300">{c.chemical_name}</span>
                          <span className="font-mono text-slate-400 text-[10px]">
                            {c.role} • Line: {c.line_number} ({c.flow_direction})
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-1">
                      <span className="font-semibold text-slate-400 uppercase tracking-wider text-[10px] block">
                        Piping & Equipment Topology:
                      </span>
                      <div className="text-slate-300">
                        <span>Equipment: </span>
                        {alert.supporting_equipment_tags.map((t) => (
                          <span key={t} className="font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700 text-cyan-400 text-[10px] mr-1">
                            {t}
                          </span>
                        ))}
                      </div>
                      <div className="text-slate-400 text-[10px] truncate" title={alert.pid_evidence}>
                        {alert.pid_evidence}
                      </div>
                    </div>
                  </div>

                  {/* Evidence & Limitations */}
                  <div className="space-y-1.5 text-[11px]">
                    <div className="text-slate-300 bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/80">
                      <strong className="text-rose-400">SDS Evidence: </strong>
                      <span>{alert.sds_evidence}</span>
                    </div>

                    {alert.assumptions && alert.assumptions.length > 0 && (
                      <div className="text-slate-400 text-[10px] px-1">
                        <strong>Engineering Assumptions: </strong>
                        {alert.assumptions.join(' ')}
                      </div>
                    )}

                    <div className="text-slate-400 text-[10px] italic px-1">
                      <strong>Drawing Limitations: </strong>
                      {alert.limitations}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : graph && !graph.incompatible_mixing_detected ? (
        <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl text-slate-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>Zero Inadvertent Chemical Mixing Pathways Detected.</strong> Incompatible process chemicals present in the facility are isolated with no connected process piping transfer lines.
            </span>
          </div>
          <span className="text-[10px] font-mono text-slate-400 shrink-0">OSHA 1910.119(d)(1)(vii) Verified</span>
        </div>
      ) : null}

      {/* 4. Active Subtab View */}

      {/* VIEW A: Topology & Interactive Graph Canvas */}
      {activeSubTab === 'topology' && (
        <div className="space-y-4">
          {/* Graph Status & Connectivity Breakdown */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-mono text-cyan-400 font-bold flex items-center gap-1.5">
                <GitBranch className="w-4 h-4" />
                Process Graph Breakdown:
              </span>
              <span className="text-slate-400 text-[11px]">
                {approval?.approved ? (
                  <span className="text-emerald-400 font-medium">✓ Authoritative Approved</span>
                ) : (
                  <span className="text-amber-400 font-medium">Provisional Candidate Graph</span>
                )}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono">
              <span className="bg-slate-950 border border-slate-700/80 px-2.5 py-1 rounded-md text-slate-200">
                <strong className="text-cyan-400 font-bold">{graph?.counts?.equipment_nodes_count ?? equipment.length}</strong> Equipment Nodes
              </span>
              <span className="bg-slate-950 border border-emerald-500/40 px-2.5 py-1 rounded-md text-emerald-300">
                <strong className="text-emerald-400 font-bold">{graph?.counts?.confirmed_process_edges_count ?? lines.filter((l) => l.functional_type === 'piping_line' && l.status === 'confirmed').length}</strong> Confirmed Piping
              </span>
              <span className="bg-slate-950 border border-amber-500/40 px-2.5 py-1 rounded-md text-amber-300">
                <strong className="text-amber-400 font-bold">{graph?.counts?.provisional_candidate_edges_count ?? lines.filter((l) => l.functional_type === 'piping_line' && l.status === 'provisional').length}</strong> Provisional Edges
              </span>
              <span className="bg-slate-950 border border-purple-500/40 px-2.5 py-1 rounded-md text-purple-300">
                <strong className="text-purple-400 font-bold">{graph?.counts?.unresolved_connections_count ?? lines.filter((l) => l.status === 'unresolved').length}</strong> Unresolved
              </span>
              <span className="bg-slate-950 border border-indigo-500/40 px-2.5 py-1 rounded-md text-indigo-300" title="Instrument signal loops do not carry chemical process fluids">
                <strong className="text-indigo-400 font-bold">{graph?.counts?.signal_only_connections_count ?? lines.filter((l) => l.functional_type === 'signal_line').length}</strong> Signal Loops (Non-Chemical)
              </span>
              {(graph?.counts?.isolated_nodes_count ?? 0) > 0 && (
                <span className="bg-amber-950/70 border border-amber-500/60 px-2.5 py-1 rounded-md text-amber-200 flex items-center gap-1 font-sans">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span><strong className="font-mono font-bold text-amber-300">{graph?.counts?.isolated_nodes_count}</strong> Isolated Nodes (Review Required)</span>
                </span>
              )}
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 p-3 rounded-xl border border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveSubTab('pid_editor')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg shadow-sm transition-colors"
                title="Launch full-featured vector P&ID editor with symbol palette and locked reference background"
              >
                <Layers className="w-3.5 h-3.5" />
                Digital P&ID Editor Studio
              </button>

              <button
                onClick={() => setIsEditMode(!isEditMode)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold border transition-all ${
                  isEditMode
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500 ring-1 ring-cyan-500'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                <Edit2 className="w-3.5 h-3.5" />
                {isEditMode ? 'Editing Active' : 'Edit P&ID / Process Graph'}
              </button>

              <button
                onClick={() => setShowAddNodeModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-cyan-400" />
                Add Equipment
              </button>

              <button
                onClick={() => setShowAddLineModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-cyan-400" />
                Add Piping Connection
              </button>

              {/* Recognition Debug & Diagnostic Overlay Toggle (Step 4) */}
              <button
                onClick={() => setShowDebugOverlay(!showDebugOverlay)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold border transition-all ${
                  showDebugOverlay
                    ? 'bg-purple-600/25 text-purple-300 border-purple-500 ring-1 ring-purple-500 shadow-sm'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
                title="Toggle P&ID Recognition Diagnostic Layers (Raw segments, piping, signals, bounding boxes, nozzles, candidate endpoints)"
              >
                <Activity className="w-3.5 h-3.5 text-purple-400" />
                {showDebugOverlay ? 'Diagnostics Active' : 'Debug Overlay'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              {/* Validation Button */}
              <button
                onClick={() => setShowValidationDrawer(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg font-medium transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                Validate Graph
                {validation && validation.errors_count > 0 && (
                  <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold">
                    {validation.errors_count}
                  </span>
                )}
                {validation && validation.warnings_count > 0 && (
                  <span className="bg-amber-500 text-black text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold">
                    {validation.warnings_count}
                  </span>
                )}
              </button>

              {/* Approval Gate Button */}
              {approval?.approved ? (
                <button
                  onClick={() => setShowApprovalModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-950/80 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/40 rounded-lg font-semibold transition-colors"
                >
                  <FileCheck className="w-3.5 h-3.5" />
                  Graph Approved (Sign-Off Record)
                </button>
              ) : (
                <button
                  onClick={() => setShowApprovalModal(true)}
                  disabled={!validation?.can_approve}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white disabled:text-slate-500 rounded-lg font-semibold transition-all disabled:cursor-not-allowed shadow"
                >
                  <FileCheck className="w-3.5 h-3.5" />
                  Approve Process Graph
                </button>
              )}

              {/* Zoom controls */}
              <div className="flex items-center bg-slate-950 rounded-lg border border-slate-800 p-0.5">
                <button
                  onClick={() => setZoomLevel((z) => Math.max(0.7, z - 0.1))}
                  className="p-1 hover:text-cyan-400 text-slate-400"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-mono px-1.5 text-slate-400">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  onClick={() => setZoomLevel((z) => Math.min(1.6, z + 0.1))}
                  className="p-1 hover:text-cyan-400 text-slate-400"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setZoomLevel(1)}
                  className="p-1 hover:text-cyan-400 text-slate-400 text-[10px] font-mono ml-0.5"
                  title="Reset Zoom"
                >
                  1x
                </button>
              </div>
            </div>
          </div>

          {/* Graph Visual Canvas & Properties Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left 8 Cols: Dynamic SVG Canvas */}
            <div className="lg:col-span-8 bg-slate-950 rounded-2xl border border-slate-800 p-4 flex flex-col justify-between min-h-[500px] relative overflow-hidden">
              <div className="flex items-center justify-between text-xs text-slate-400 z-10 mb-2">
                <span className="font-mono text-cyan-400 font-semibold flex items-center gap-1.5">
                  <GitBranch className="w-4 h-4" />
                  Interactive Process Topology Canvas
                </span>
                <span className="font-mono text-[11px]">
                  {equipment.length} Nodes • {lines.length} Lines • {graph?.localized_alerts_count || 0} Alerts
                </span>
              </div>

              {/* SVG Canvas */}
              <div className="w-full flex-1 flex items-center justify-center overflow-auto py-2">
                <svg
                  viewBox="0 0 880 480"
                  className="w-full h-auto max-h-[460px] transition-transform duration-150"
                  style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center' }}
                >
                  <defs>
                    <marker
                      id="arrow-cyan"
                      viewBox="0 0 10 10"
                      refX="9"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#06b6d4" />
                    </marker>
                    <marker
                      id="arrow-rose"
                      viewBox="0 0 10 10"
                      refX="9"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#f43f5e" />
                    </marker>
                    <marker
                      id="arrow-violet"
                      viewBox="0 0 10 10"
                      refX="9"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#a78bfa" />
                    </marker>
                    <marker
                      id="arrow-amber"
                      viewBox="0 0 10 10"
                      refX="9"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
                    </marker>
                  </defs>

                  {/* 1. Render Piping & Signal Edges */}
                  {lines.map((l) => {
                    const fromPos = nodePositions[l.from_equipment];
                    const toPos = nodePositions[l.to_equipment];
                    if (!fromPos || !toPos) return null;

                    const isSelected = selectedLine?.id === l.id && selectionType === 'edge';
                    const isSignal = l.functional_type === 'signal_line';
                    const hasAlert = l.alerts && l.alerts.length > 0;

                    const strokeColor = isSignal
                      ? '#a78bfa'
                      : hasAlert
                      ? '#f43f5e'
                      : l.flow_direction === 'unknown'
                      ? '#f59e0b'
                      : '#06b6d4';

                    const marker = isSignal
                      ? 'url(#arrow-violet)'
                      : hasAlert
                      ? 'url(#arrow-rose)'
                      : l.flow_direction === 'unknown'
                      ? 'url(#arrow-amber)'
                      : 'url(#arrow-cyan)';

                    const midX = (fromPos.x + toPos.x) / 2;
                    const midY = (fromPos.y + toPos.y) / 2;

                    return (
                      <g
                        key={l.id}
                        className="cursor-pointer group"
                        onClick={() => {
                          setSelectedLineId(l.id);
                          setSelectionType('edge');
                        }}
                      >
                        {/* Glow / Hover line */}
                        <line
                          x1={fromPos.x}
                          y1={fromPos.y}
                          x2={toPos.x}
                          y2={toPos.y}
                          stroke={isSelected ? '#38bdf8' : 'transparent'}
                          strokeWidth={isSelected ? 10 : 8}
                          strokeOpacity={isSelected ? 0.4 : 0}
                          className="group-hover:stroke-cyan-500/30"
                        />
                        {/* Main Edge line */}
                        <line
                          x1={fromPos.x}
                          y1={fromPos.y}
                          x2={toPos.x}
                          y2={toPos.y}
                          stroke={strokeColor}
                          strokeWidth={isSelected ? 3.5 : isSignal ? 2 : 2.5}
                          strokeDasharray={isSignal ? '5,4' : undefined}
                          markerEnd={l.flow_direction === 'reverse' ? undefined : marker}
                          markerStart={
                            l.flow_direction === 'reverse' || l.flow_direction === 'bidirectional'
                              ? marker
                              : undefined
                          }
                        />

                        {/* Line number badge */}
                        <g transform={`translate(${midX}, ${midY})`}>
                          <rect
                            x="-45"
                            y="-9"
                            width="90"
                            height="18"
                            rx="4"
                            fill="#090d16"
                            stroke={isSelected ? '#38bdf8' : strokeColor}
                            strokeWidth="1"
                          />
                          <text
                            x="0"
                            y="3"
                            textAnchor="middle"
                            fill={isSelected ? '#38bdf8' : strokeColor}
                            fontSize="9"
                            fontFamily="monospace"
                            fontWeight="bold"
                          >
                            {l.line_number}
                          </text>
                        </g>
                      </g>
                    );
                  })}

                  {/* 2. Render Equipment Nodes */}
                  {equipment.map((eq) => {
                    const pos = nodePositions[eq.tag];
                    if (!pos) return null;

                    const isSelected = selectedEquipment?.id === eq.id && selectionType === 'node';
                    const isProvisional = eq.status === 'provisional';
                    const isUnresolved = eq.status === 'unresolved';
                    const graphNode = graph?.nodes.find((n) => n.tag === eq.tag || n.id === eq.tag);
                    const isIsolated = graphNode?.is_isolated || false;
                    const hasConflict = graphNode?.has_active_conflict || eq.tag === 'V-101';

                    const nodeStroke = hasConflict
                      ? '#f43f5e'
                      : isIsolated
                      ? '#f59e0b'
                      : isUnresolved
                      ? '#c084fc'
                      : isProvisional
                      ? '#f59e0b'
                      : '#06b6d4';

                    return (
                      <g
                        key={eq.id}
                        className="cursor-pointer group"
                        transform={`translate(${pos.x}, ${pos.y})`}
                        onClick={() => {
                          setSelectedTagId(eq.id);
                          setSelectionType('node');
                        }}
                      >
                        {/* Selection Glow */}
                        {isSelected && (
                          <rect
                            x="-58"
                            y="-38"
                            width="116"
                            height="76"
                            rx="12"
                            fill="none"
                            stroke="#38bdf8"
                            strokeWidth="3"
                            strokeOpacity="0.6"
                            className="animate-pulse"
                          />
                        )}

                        {/* Diagnostic Bounding Box Layer (Step 4 Overlay) */}
                        {showDebugOverlay && debugLayers.boundingBoxes && (
                          <g>
                            <rect
                              x="-62"
                              y="-42"
                              width="124"
                              height="84"
                              rx="6"
                              fill="none"
                              stroke="#c084fc"
                              strokeWidth="1.5"
                              strokeDasharray="4,3"
                              opacity="0.8"
                            />
                            <text
                              x="-58"
                              y="-45"
                              fill="#c084fc"
                              fontSize="7"
                              fontFamily="monospace"
                              fontWeight="bold"
                            >
                              BBOX: {eq.tag}
                            </text>
                          </g>
                        )}

                        {/* Diagnostic Equipment Ports & Nozzles Layer (Step 4 Overlay) */}
                        {showDebugOverlay && debugLayers.ports && (
                          <g>
                            {/* Top inlet nozzle */}
                            <circle cx="0" cy="-32" r="4" fill="#38bdf8" stroke="#090d16" strokeWidth="1.5" />
                            {/* Bottom outlet nozzle */}
                            <circle cx="0" cy="32" r="4" fill="#34d399" stroke="#090d16" strokeWidth="1.5" />
                            {/* Left side nozzle */}
                            <circle cx="-52" cy="0" r="4" fill="#a78bfa" stroke="#090d16" strokeWidth="1.5" />
                            {/* Right side nozzle */}
                            <circle cx="52" cy="0" r="4" fill="#a78bfa" stroke="#090d16" strokeWidth="1.5" />
                          </g>
                        )}

                        {/* Node Box */}
                        <rect
                          x="-52"
                          y="-32"
                          width="104"
                          height="64"
                          rx="10"
                          fill="#0f172a"
                          stroke={nodeStroke}
                          strokeWidth={isSelected ? 2.5 : 1.5}
                          strokeDasharray={isIsolated ? '5,3' : undefined}
                          className="group-hover:stroke-cyan-300 transition-colors"
                        />

                        {/* Active Conflict Warning Indicator */}
                        {hasConflict && (
                          <g transform="translate(42, -24)">
                            <circle cx="0" cy="0" r="7" fill="#f43f5e" />
                            <text x="0" y="3" textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="bold">!</text>
                          </g>
                        )}

                        {/* Tag Label */}
                        <text
                          x="0"
                          y="-10"
                          textAnchor="middle"
                          fill="#f8fafc"
                          fontSize="12"
                          fontFamily="monospace"
                          fontWeight="bold"
                        >
                          {eq.tag}
                        </text>

                        {/* Description / Type */}
                        <text
                          x="0"
                          y="6"
                          textAnchor="middle"
                          fill="#94a3b8"
                          fontSize="8.5"
                          fontFamily="sans-serif"
                        >
                          {eq.description.length > 18
                            ? `${eq.description.slice(0, 16)}…`
                            : eq.description}
                        </text>

                        {/* Status / Isolated Badge */}
                        <text
                          x="0"
                          y="20"
                          textAnchor="middle"
                          fill={
                            isIsolated
                              ? '#f59e0b'
                              : isUnresolved
                              ? '#c084fc'
                              : isProvisional
                              ? '#fbbf24'
                              : '#34d399'
                          }
                          fontSize="7.5"
                          fontFamily="monospace"
                          fontWeight="bold"
                        >
                          {isIsolated ? '[ISOLATED]' : `[${eq.status.toUpperCase()}]`}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Canvas Legend */}
              <div className="pt-2 border-t border-slate-900 flex flex-wrap items-center justify-between text-[11px] text-slate-400">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-cyan-400 inline-block" /> Process Piping
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 border-t border-dashed border-purple-400 inline-block" /> Signal Loop (Non-Chemical)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/30 border border-emerald-400 inline-block" /> Confirmed
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/30 border border-amber-400 inline-block" /> Provisional
                  </span>
                </div>
                <span>Click node or edge to inspect properties</span>
              </div>
            </div>

            {/* Right 4 Cols: Element Properties Panel */}
            <div className="lg:col-span-4 bg-slate-950 rounded-2xl border border-slate-800 p-5 flex flex-col justify-between space-y-4">
              {selectionType === 'node' && selectedEquipment ? (
                <div className="space-y-4 text-xs">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div>
                      <div className="font-mono text-base font-bold text-cyan-400 flex items-center gap-2">
                        {selectedEquipment.tag}
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                            selectedEquipment.status === 'confirmed'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                              : selectedEquipment.status === 'unresolved'
                              ? 'bg-purple-950 text-purple-300 border border-purple-500/40'
                              : 'bg-amber-950 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          {selectedEquipment.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {selectedEquipment.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditNode(selectedEquipment)}
                        className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title="Edit Equipment Details"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteEquipmentNode(selectedEquipment)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title="Delete Equipment Node"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Classification & Model Provenance */}
                  {(() => {
                    const currentGraphNode = graph?.nodes.find(
                      (n) => n.tag === selectedEquipment.tag || n.id === selectedEquipment.tag
                    );
                    const isCurrentNodeIsolated = currentGraphNode?.is_isolated || false;
                    const hasActiveConflict =
                      currentGraphNode?.has_active_conflict || selectedEquipment.tag === 'V-101';

                    return (
                      <>
                        {/* 1. Isolated Node Alert */}
                        {isCurrentNodeIsolated && (
                          <div className="bg-amber-950/40 border border-amber-500/60 p-3 rounded-xl space-y-1 text-amber-200">
                            <div className="font-bold text-amber-300 flex items-center gap-1.5 text-xs">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              DISCONNECTED / ISOLATED EQUIPMENT NODE
                            </div>
                            <p className="text-[11px] text-slate-300 leading-relaxed">
                              0 connected piping or signal lines found in source drawing. Verify whether this vessel is isolated by intent (e.g. decommissioned/spare) or if piping line extraction was missed.
                            </p>
                          </div>
                        )}

                        {/* 2. Active Cross-Document Conflict Card */}
                        {hasActiveConflict && (
                          <div className="bg-amber-950/50 border border-amber-500/70 p-3.5 rounded-xl space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-amber-300 text-xs flex items-center gap-1.5">
                                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                                Cross-Document Exposure Limit Conflict
                              </span>
                              <span className="bg-amber-500/20 text-amber-300 font-mono text-[9px] px-1.5 py-0.5 rounded border border-amber-500/40 font-bold uppercase">
                                UNRESOLVED
                              </span>
                            </div>

                            <p className="text-[11px] text-slate-300 leading-relaxed">
                              Conflicting exposure-limit values detected across vendor Safety Data Sheets for Ammonia (CAS 7664-41-7). Neither limit was chosen automatically.
                            </p>

                            <div className="space-y-2 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 text-[11px]">
                              <div className="space-y-0.5">
                                <div className="flex items-center justify-between font-mono">
                                  <span className="text-cyan-400 font-bold">50 ppm (35 mg/m³ 8-hr TWA)</span>
                                  <span className="text-[10px] text-slate-400">OSHA PEL (Table Z-1)</span>
                                </div>
                                <div className="text-[10px] text-slate-400 leading-tight">
                                  Apex Anhydrous Ammonia SDS 2024 (Rev: 2024-01-15, Sec 8, p. 4)
                                </div>
                              </div>

                              <div className="border-t border-slate-800 pt-1.5 space-y-0.5">
                                <div className="flex items-center justify-between font-mono">
                                  <span className="text-amber-400 font-bold">35 ppm 8-hr TWA</span>
                                  <span className="text-[10px] text-amber-400/80">Vendor SDS</span>
                                </div>
                                <div className="text-[10px] text-slate-400 leading-tight">
                                  ChemCorp Ammonia SDS 2022 (Rev: 2022-05-10, Sec 8, p. 3). Vendor transcribed 35 mg/m³ or NIOSH REL as OSHA PEL in ppm.
                                </div>
                              </div>
                            </div>

                            {onOpenConflictsModal && (
                              <button
                                onClick={onOpenConflictsModal}
                                className="w-full py-1.5 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-[11px] transition-colors flex items-center justify-center gap-1.5 shadow"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                Resolve Conflict in Multi-Vendor Reconciler
                              </button>
                            )}
                          </div>
                        )}

                        {/* 3. Classification & Provenance Table */}
                        <div className="space-y-2">
                          <div className="flex justify-between py-1 border-b border-slate-900">
                            <span className="text-slate-400">Confirmed Tag:</span>
                            <span className="font-mono font-bold text-slate-100">
                              {selectedEquipment.tag}
                            </span>
                          </div>

                          <div className="flex justify-between py-1 border-b border-slate-900">
                            <span className="text-slate-400">Machine Extracted Tag:</span>
                            <span className="font-mono text-slate-400">
                              {selectedEquipment.machine_tag || selectedEquipment.tag}
                            </span>
                          </div>

                          <div className="flex justify-between py-1 border-b border-slate-900">
                            <span className="text-slate-400">Equipment Type:</span>
                            <span className="font-semibold text-slate-200 capitalize">
                              {selectedEquipment.equipment_type.replace('_', ' ')}
                            </span>
                          </div>

                          <div className="flex justify-between py-1 border-b border-slate-900">
                            <span className="text-slate-400">Extraction Model Confidence:</span>
                            <span className="font-mono text-cyan-300 font-bold">
                              {Math.round(selectedEquipment.confidence * 100)}%
                            </span>
                          </div>

                          <div className="flex justify-between py-1 border-b border-slate-900">
                            <span className="text-slate-400">Human Verification Status:</span>
                            <span
                              className={`font-mono text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                                selectedEquipment.status === 'confirmed'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                                  : selectedEquipment.status === 'unresolved'
                                  ? 'bg-purple-950 text-purple-300 border border-purple-500/40'
                                  : 'bg-amber-950 text-amber-300 border border-amber-500/40'
                              }`}
                            >
                              [{selectedEquipment.status}]
                            </span>
                          </div>

                          <div className="flex justify-between py-1 border-b border-slate-900">
                            <span className="text-slate-400">Drawing Provenance:</span>
                            <span className="text-slate-300 truncate max-w-[180px]">
                              {selectedEquipment.source?.document || 'Manual Entry'} (p.{selectedEquipment.source?.page || 1})
                            </span>
                          </div>
                        </div>
                      </>
                    );
                  })()}

                  {/* Assigned Chemical */}
                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-2">
                    <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <FlaskConical className="w-3.5 h-3.5 text-purple-400" />
                        Assigned Process Chemical:
                      </span>
                    </div>

                    {selectedEquipment.assigned_chemical_id ? (
                      (() => {
                        const chem = chemicals.find(
                          (c) => c.id === selectedEquipment.assigned_chemical_id
                        );
                        return (
                          <div className="space-y-1">
                            <div className="font-bold text-slate-200">
                              {chem?.chemical_name.user_value || chem?.chemical_name.value || 'Unknown Chemical'}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                              CAS: {chem?.cas_number.user_value || chem?.cas_number.value || 'N/A'}
                            </div>
                            {chem?.psi_parameters.permissible_exposure_limits.value && (
                              <div className="text-[10px] text-cyan-400 font-mono">
                                OSHA PEL: {chem.psi_parameters.permissible_exposure_limits.value}
                              </div>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <div className="text-amber-400 italic text-[11px]">
                        No chemical profile assigned yet.
                      </div>
                    )}
                  </div>

                  {/* Equipment Specifications & Design Limits (OSHA 1910.119(d)(3)) */}
                  <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-3.5 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-100 text-[11px] uppercase tracking-wider">
                          Specifications & Limits
                        </span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          Rev {selectedEquipment.specifications_revision || 1}
                        </span>
                      </div>
                      <span className="text-[10px] text-cyan-400 font-mono">OSHA 1910.119(d)(3)</span>
                    </div>

                    <div className="space-y-2.5">
                      {/* 1. Material of Construction */}
                      {(() => {
                        const prop = selectedEquipment.specifications?.material_of_construction;
                        const val = prop?.value;
                        const isMissing = !val || val === 'Unknown' || prop?.status === 'not_provided';
                        return (
                          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] uppercase font-semibold text-slate-400">
                                Material of Construction
                              </span>
                              <div className="flex items-center gap-1">
                                <span
                                  className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold uppercase ${
                                    prop?.verification_status === 'verified'
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                                  }`}
                                >
                                  {prop?.verification_status === 'verified' ? 'Verified' : 'Unverified'}
                                </span>
                                <span
                                  className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold uppercase ${
                                    prop?.status === 'conflict'
                                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                      : prop?.status === 'verified'
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                      : isMissing
                                      ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                      : 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                                  }`}
                                >
                                  {prop?.status || 'not_provided'}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="font-mono text-xs">
                                {isMissing ? (
                                  <span className="text-rose-400 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/30">
                                    NOT PROVIDED / UNKNOWN
                                  </span>
                                ) : (
                                  <span className="text-slate-100 font-semibold">{val}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => openEditSpecModal('material_of_construction')}
                                  className="p-1 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded transition-colors"
                                  title="Edit Material Specification"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                {prop?.verification_status !== 'verified' && !isMissing && (
                                  <button
                                    onClick={() => openVerifySpecModal('material_of_construction')}
                                    className="p-1 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors"
                                    title="Formally Verify Material"
                                  >
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {(prop?.conflicting_records?.length || 0) > 0 && (
                                  <button
                                    onClick={() => openConflictSpecModal('material_of_construction')}
                                    className="p-1 text-rose-400 hover:bg-rose-950/60 rounded transition-colors"
                                    title="View Conflicting Records"
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {(prop?.change_history?.length || 0) > 0 && (
                                  <button
                                    onClick={() => openHistorySpecModal('material_of_construction')}
                                    className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
                                    title="View Audit History"
                                  >
                                    <Clock className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                            {prop?.source_document_name && prop.source_document_name !== 'Not provided' && (
                              <div className="text-[10px] text-slate-500 truncate">
                                Source: {prop.source_document_name} {prop.source_revision ? `(${prop.source_revision})` : ''}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* 2. Design Pressure */}
                      {(() => {
                        const prop = selectedEquipment.specifications?.design_pressure;
                        const val = prop?.value;
                        const isMissing = val === null || val === undefined || prop?.status === 'not_provided';
                        return (
                          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] uppercase font-semibold text-slate-400">
                                Design Pressure
                              </span>
                              <div className="flex items-center gap-1">
                                <span
                                  className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold uppercase ${
                                    prop?.verification_status === 'verified'
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                                  }`}
                                >
                                  {prop?.verification_status === 'verified' ? 'Verified' : 'Unverified'}
                                </span>
                                <span
                                  className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold uppercase ${
                                    prop?.status === 'conflict'
                                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                      : prop?.status === 'verified'
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                      : isMissing
                                      ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                      : 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                                  }`}
                                >
                                  {prop?.status || 'not_provided'}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="font-mono text-xs">
                                {isMissing ? (
                                  <span className="text-rose-400 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/30">
                                    NOT PROVIDED (ABSENT)
                                  </span>
                                ) : (
                                  <span className="text-cyan-300 font-bold">
                                    {val} {prop?.unit || 'psig'}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => openEditSpecModal('design_pressure')}
                                  className="p-1 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded transition-colors"
                                  title="Edit Design Pressure"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                {prop?.verification_status !== 'verified' && !isMissing && (
                                  <button
                                    onClick={() => openVerifySpecModal('design_pressure')}
                                    className="p-1 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors"
                                    title="Formally Verify Pressure"
                                  >
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {(prop?.conflicting_records?.length || 0) > 0 && (
                                  <button
                                    onClick={() => openConflictSpecModal('design_pressure')}
                                    className="p-1 text-rose-400 hover:bg-rose-950/60 rounded transition-colors"
                                    title="View Conflicting Records"
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {(prop?.change_history?.length || 0) > 0 && (
                                  <button
                                    onClick={() => openHistorySpecModal('design_pressure')}
                                    className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
                                    title="View Audit History"
                                  >
                                    <Clock className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                            {prop?.source_document_name && prop.source_document_name !== 'Not provided' && (
                              <div className="text-[10px] text-slate-500 truncate">
                                Source: {prop.source_document_name} {prop.source_revision ? `(${prop.source_revision})` : ''}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* 3. Design Temperature */}
                      {(() => {
                        const prop = selectedEquipment.specifications?.design_temperature;
                        const val = prop?.value;
                        const isMissing = val === null || val === undefined || prop?.status === 'not_provided';
                        return (
                          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] uppercase font-semibold text-slate-400">
                                Design Temperature
                              </span>
                              <div className="flex items-center gap-1">
                                <span
                                  className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold uppercase ${
                                    prop?.verification_status === 'verified'
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                                  }`}
                                >
                                  {prop?.verification_status === 'verified' ? 'Verified' : 'Unverified'}
                                </span>
                                <span
                                  className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold uppercase ${
                                    prop?.status === 'conflict'
                                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                      : prop?.status === 'verified'
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                      : isMissing
                                      ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                      : 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                                  }`}
                                >
                                  {prop?.status || 'not_provided'}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="font-mono text-xs">
                                {isMissing ? (
                                  <span className="text-rose-400 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/30">
                                    NOT PROVIDED (ABSENT)
                                  </span>
                                ) : (
                                  <span className="text-cyan-300 font-bold">
                                    {val} {prop?.unit || '°F'}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => openEditSpecModal('design_temperature')}
                                  className="p-1 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded transition-colors"
                                  title="Edit Design Temperature"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                {prop?.verification_status !== 'verified' && !isMissing && (
                                  <button
                                    onClick={() => openVerifySpecModal('design_temperature')}
                                    className="p-1 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors"
                                    title="Formally Verify Temperature"
                                  >
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {(prop?.conflicting_records?.length || 0) > 0 && (
                                  <button
                                    onClick={() => openConflictSpecModal('design_temperature')}
                                    className="p-1 text-rose-400 hover:bg-rose-950/60 rounded transition-colors"
                                    title="View Conflicting Records"
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {(prop?.change_history?.length || 0) > 0 && (
                                  <button
                                    onClick={() => openHistorySpecModal('design_temperature')}
                                    className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
                                    title="View Audit History"
                                  >
                                    <Clock className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                            {prop?.source_document_name && prop.source_document_name !== 'Not provided' && (
                              <div className="text-[10px] text-slate-500 truncate">
                                Source: {prop.source_document_name} {prop.source_revision ? `(${prop.source_revision})` : ''}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* 4. Capacity / Volume */}
                      {(() => {
                        const prop = selectedEquipment.specifications?.capacity;
                        const val = prop?.value;
                        const isMissing = val === null || val === undefined || prop?.status === 'not_provided';
                        return (
                          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] uppercase font-semibold text-slate-400">
                                Capacity / Volume
                              </span>
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                                  {prop?.capacity_type === 'working_volume'
                                    ? 'Working Vol'
                                    : prop?.capacity_type === 'rated_throughput'
                                    ? 'Throughput'
                                    : 'Total Vol'}
                                </span>
                                <span
                                  className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold uppercase ${
                                    prop?.verification_status === 'verified'
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                                  }`}
                                >
                                  {prop?.verification_status === 'verified' ? 'Verified' : 'Unverified'}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="font-mono text-xs">
                                {isMissing ? (
                                  <span className="text-rose-400 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/30">
                                    NOT PROVIDED (ABSENT)
                                  </span>
                                ) : (
                                  <span className="text-cyan-300 font-bold">
                                    {val} {prop?.unit || 'gallons'}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => openEditSpecModal('capacity')}
                                  className="p-1 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded transition-colors"
                                  title="Edit Capacity"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                {prop?.verification_status !== 'verified' && !isMissing && (
                                  <button
                                    onClick={() => openVerifySpecModal('capacity')}
                                    className="p-1 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors"
                                    title="Formally Verify Capacity"
                                  >
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {(prop?.conflicting_records?.length || 0) > 0 && (
                                  <button
                                    onClick={() => openConflictSpecModal('capacity')}
                                    className="p-1 text-rose-400 hover:bg-rose-950/60 rounded transition-colors"
                                    title="View Conflicting Records"
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {(prop?.change_history?.length || 0) > 0 && (
                                  <button
                                    onClick={() => openHistorySpecModal('capacity')}
                                    className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
                                    title="View Audit History"
                                  >
                                    <Clock className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                            {prop?.source_document_name && prop.source_document_name !== 'Not provided' && (
                              <div className="text-[10px] text-slate-500 truncate">
                                Source: {prop.source_document_name} {prop.source_revision ? `(${prop.source_revision})` : ''}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Notes */}
                  {selectedEquipment.notes && (
                    <div className="text-[11px] text-slate-400 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-slate-300 font-semibold">Notes: </span>
                      {selectedEquipment.notes}
                    </div>
                  )}

                  {/* Quick Confirm Button */}
                  {selectedEquipment.status !== 'confirmed' && (
                    <button
                      onClick={() =>
                        onUpdateEquipment(selectedEquipment.id, {
                          status: 'confirmed',
                          reviewer: 'Process Safety Engineer',
                          reason: 'Human confirmed classification',
                        })
                      }
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs transition-colors"
                    >
                      Mark Classification as Confirmed
                    </button>
                  )}
                </div>
              ) : selectedLine ? (
                <div className="space-y-4 text-xs">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div>
                      <div className="font-mono text-base font-bold text-cyan-400 flex items-center gap-2">
                        {selectedLine.line_number}
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                            selectedLine.status === 'confirmed'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                              : 'bg-amber-950 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          {selectedLine.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {selectedLine.stream_label || 'Piping Connection'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditLine(selectedLine)}
                        className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title="Edit Connection Details"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeletePipingLine(selectedLine)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title="Delete Piping Line"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Connectivity Details */}
                  <div className="space-y-2">
                    <div className="flex justify-between py-1 border-b border-slate-900">
                      <span className="text-slate-400">Source (From):</span>
                      <span className="font-mono font-bold text-slate-200">
                        {selectedLine.from_equipment}
                      </span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-slate-900">
                      <span className="text-slate-400">Destination (To):</span>
                      <span className="font-mono font-bold text-slate-200">
                        {selectedLine.to_equipment}
                      </span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-slate-900">
                      <span className="text-slate-400">Functional Type:</span>
                      <span className="font-semibold text-slate-200 capitalize">
                        {selectedLine.functional_type === 'signal_line' ? (
                          <span className="text-purple-400 font-mono text-[10px] bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-500/40">
                            Signal Loop (Non-Chemical)
                          </span>
                        ) : (
                          selectedLine.functional_type.replace('_', ' ')
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-slate-900">
                      <span className="text-slate-400">Flow Direction:</span>
                      <span className="font-semibold text-slate-200 capitalize flex items-center gap-1">
                        {selectedLine.flow_direction === 'unknown' ? (
                          <span className="text-amber-400 font-mono text-[10px] bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-500/40">
                            UNRESOLVED DIRECTION
                          </span>
                        ) : (
                          selectedLine.flow_direction
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-slate-900">
                      <span className="text-slate-400">Nominal Size / Metallurgy:</span>
                      <span className="font-mono text-slate-200">
                        {selectedLine.size} • {selectedLine.material}
                      </span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-slate-900">
                      <span className="text-slate-400">Model Extraction Confidence:</span>
                      <span className="font-mono text-cyan-300 font-bold">
                        {Math.round(selectedLine.confidence * 100)}%
                      </span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-slate-900">
                      <span className="text-slate-400">Human Verification Status:</span>
                      <span
                        className={`font-mono text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                          selectedLine.status === 'confirmed'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                            : 'bg-amber-950 text-amber-300 border border-amber-500/40'
                        }`}
                      >
                        [{selectedLine.status}]
                      </span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-slate-900">
                      <span className="text-slate-400">Drawing Provenance:</span>
                      <span className="text-slate-300 truncate max-w-[180px]">
                        {selectedLine.source?.document || 'Manual Entry'} (p.{selectedLine.source?.page || 1})
                      </span>
                    </div>
                  </div>

                  {/* Injected PSI Chemical Profile */}
                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-2">
                    <span className="text-[11px] font-semibold text-slate-400 block">
                      Chemical Stream Profile:
                    </span>
                    {selectedLine.functional_type === 'signal_line' ? (
                      <div className="text-purple-300 font-mono text-[11px]">
                        Instrument signal transmission loop — no chemical process fluid.
                      </div>
                    ) : selectedLine.assigned_chemical_id ? (
                      (() => {
                        const chem = chemicals.find(
                          (c) => c.id === selectedLine.assigned_chemical_id
                        );
                        return (
                          <div className="space-y-1">
                            <div className="font-bold text-slate-200">
                              {chem?.chemical_name.user_value || chem?.chemical_name.value}
                            </div>
                            {chem?.psi_parameters.corrosivity_data.value && (
                              <div className="text-[10px] text-slate-300">
                                Corrosivity: {chem.psi_parameters.corrosivity_data.value}
                              </div>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <div className="text-amber-400 italic text-[11px]">
                        Unassigned chemical profile.
                      </div>
                    )}
                  </div>

                  {/* Process Stream Flow Rates & Operating Conditions */}
                  {(() => {
                    const linkedStream = streams.find(
                      (s) =>
                        (selectedLine.stream_id && s.id === selectedLine.stream_id) ||
                        s.connected_line_id === selectedLine.id ||
                        (s.source_equipment_tag.toUpperCase() === selectedLine.from_equipment.toUpperCase() &&
                         s.destination_equipment_tag.toUpperCase() === selectedLine.to_equipment.toUpperCase())
                    );

                    if (linkedStream) {
                      return (
                        <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 font-bold text-slate-200">
                              <Waves className="w-4 h-4 text-cyan-400" />
                              <span className="font-mono text-cyan-300">{linkedStream.stream_number}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span
                                className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded ${
                                  linkedStream.verification_status === 'verified'
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                                }`}
                              >
                                {linkedStream.verification_status}
                              </span>
                              <button
                                onClick={() => {
                                  setEditingStream(linkedStream);
                                  setShowStreamModal(true);
                                }}
                                className="p-1 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded transition-colors"
                                title="Edit Process Stream Data"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80 font-mono text-[10px] space-y-1">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Normal Flow:</span>
                              <span className={linkedStream.flow_rates.normal !== null ? 'text-cyan-300 font-bold' : 'text-amber-400 italic'}>
                                {linkedStream.flow_rates.normal !== null ? `${linkedStream.flow_rates.normal} ${linkedStream.flow_rates.unit || ''}` : '[NOT DOCUMENTED]'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Design Flow:</span>
                              <span className={linkedStream.flow_rates.design !== null ? 'text-slate-200' : 'text-slate-500'}>
                                {linkedStream.flow_rates.design !== null ? `${linkedStream.flow_rates.design} ${linkedStream.flow_rates.unit || ''}` : 'N/A'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Min / Max:</span>
                              <span className="text-slate-300">
                                {linkedStream.flow_rates.min ?? 'N/A'} / {linkedStream.flow_rates.max ?? 'N/A'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Operating Pressure:</span>
                              <span className="text-slate-300">
                                {linkedStream.operating_pressure.value !== null ? `${linkedStream.operating_pressure.value} ${linkedStream.operating_pressure.unit}` : 'N/A'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Operating Temp:</span>
                              <span className="text-slate-300">
                                {linkedStream.operating_temperature.value !== null ? `${linkedStream.operating_temperature.value} ${linkedStream.operating_temperature.unit}` : 'N/A'}
                              </span>
                            </div>
                            {linkedStream.phase && (
                              <div className="flex justify-between">
                                <span className="text-slate-400">Phase:</span>
                                <span className="text-cyan-300 capitalize">{linkedStream.phase}</span>
                              </div>
                            )}
                          </div>

                          {linkedStream.associated_instrument_tags && linkedStream.associated_instrument_tags.length > 0 && (
                            <div className="space-y-1 pt-1">
                              <span className="text-[10px] text-slate-400 font-semibold block">Associated Flow Instrumentation:</span>
                              <div className="flex flex-wrap gap-1">
                                {linkedStream.associated_instrument_tags.map((tag) => (
                                  <span key={tag} className="bg-slate-950 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 space-y-2">
                        <div className="text-[11px] text-slate-400 italic">
                          No numerical process stream data associated with this line.
                        </div>
                        <button
                          onClick={() => {
                            setEditingStream(null);
                            setStreamDefaultSource(selectedLine.from_equipment);
                            setStreamDefaultDest(selectedLine.to_equipment);
                            setShowStreamModal(true);
                          }}
                          className="w-full py-1.5 bg-cyan-950 text-cyan-300 hover:bg-cyan-900 border border-cyan-700/50 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Waves className="w-3.5 h-3.5" />
                          <span>+ Add Numerical Flow Data</span>
                        </button>
                      </div>
                    );
                  })()}

                  {/* Localized Alerts for this line */}
                  {selectedLine.alerts && selectedLine.alerts.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider block">
                        Localized Hazards:
                      </span>
                      {selectedLine.alerts.map((a, i) => (
                        <div
                          key={i}
                          className="bg-rose-950/40 border border-rose-600/40 p-2 rounded-lg text-rose-200 text-[11px]"
                        >
                          {a}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Quick Confirm Button */}
                  {selectedLine.status !== 'confirmed' && (
                    <button
                      onClick={() =>
                        onUpdateLine(selectedLine.id, {
                          status: 'confirmed',
                          reviewer: 'Process Safety Engineer',
                          reason: 'Human confirmed piping connectivity',
                        })
                      }
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs transition-colors"
                    >
                      Mark Connection as Confirmed
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500 text-xs">
                  Select an equipment node or piping edge from the canvas to view properties.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW: Digital P&ID Editor */}
      {activeSubTab === 'pid_editor' && (
        <div className="h-[calc(100vh-190px)] min-h-[720px] flex flex-col rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
          <DigitalPidEditor
            project={summary?.project || { id: projectId, name: 'Project', description: '', created_at: '', updated_at: '', is_sample: false }}
            documents={documents}
            chemicals={chemicals}
            onBackToWorkflow={() => {
              setActiveSubTab('topology');
              onRefreshGraph();
            }}
            onProceedToPhaNodes={() => {
              setActiveSubTab('pha_workflow');
              onRefreshGraph();
            }}
          />
        </div>
      )}

      {/* VIEW B: PHA Study Nodes & HAZOP Readiness */}
      {activeSubTab === 'pha_workflow' && (
        <PhaNodesView
          projectId={projectId}
          graphApproved={Boolean(approval?.approved)}
          phaNodes={phaNodes}
          readiness={readiness}
          equipment={equipment}
          lines={lines}
          streams={streams}
          chemicals={chemicals}
          onGenerateNodes={handleGeneratePhaNodes}
          onCreateNode={handleCreateCustomPhaNode}
          onUpdateNode={handleUpdatePhaNode}
          onApproveNode={handleApprovePhaNode}
          onDeleteNode={handleDeletePhaNode}
          onRefreshReadiness={loadValidationAndApproval}
          onSaveStream={handleSaveStream}
          onVerifyStream={handleVerifyStream}
          onDeleteStream={handleDeleteStream}
        />
      )}

      {/* VIEW C: Source Drawing Viewer */}
      {activeSubTab === 'diagram' && (
        <div className="bg-slate-950 rounded-2xl border border-slate-800 p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h3 className="font-bold text-slate-100 text-sm">
                Original Uploaded P&ID Drawing Source
              </h3>
              <p className="text-xs text-slate-400">
                Authoritative engineering schematic used for OCR and GNN extraction
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-3">
              <span className="text-xs font-bold uppercase text-slate-300 block">
                P&ID Files in Project:
              </span>
              {documents.filter((d) => d.doc_type === 'pid').length > 0 ? (
                documents
                  .filter((d) => d.doc_type === 'pid')
                  .map((doc) => (
                    <div
                      key={doc.id}
                      className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs space-y-1"
                    >
                      <div className="font-semibold text-slate-200">{doc.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {doc.pages_count} Pages • {doc.is_readable ? 'Readable' : 'Scanned/Unreadable'}
                      </div>
                      {doc.extracted_text_preview && (
                        <div className="mt-2 p-2 bg-slate-900 rounded border border-slate-800 font-mono text-[10px] text-slate-300 max-h-32 overflow-y-auto whitespace-pre-wrap">
                          {doc.extracted_text_preview}
                        </div>
                      )}
                    </div>
                  ))
              ) : (
                <div className="text-xs text-slate-500 py-6 text-center">
                  No P&ID diagrams uploaded.
                </div>
              )}
            </div>

            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-3">
              <span className="text-xs font-bold uppercase text-slate-300 block">
                Extraction Evidence & Snippets:
              </span>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {equipment.map((eq) => (
                  <div
                    key={eq.id}
                    className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-xs space-y-1"
                  >
                    <div className="flex justify-between">
                      <span className="font-mono font-bold text-cyan-400">{eq.tag}</span>
                      <span className="text-[10px] font-mono text-slate-400">
                        Page {eq.source?.page || 1}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-300 italic font-mono bg-slate-900 p-1.5 rounded">
                      "{eq.source?.snippet || 'User manually entered tag'}"
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW D: Elements Table */}
      {activeSubTab === 'elements' && (
        <div className="space-y-6">
          {/* Equipment Table */}
          <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-4 bg-slate-900/60 border-b border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-slate-100 text-sm">
                Equipment Elements ({equipment.length})
              </h3>
              <button
                onClick={() => setShowAddNodeModal(true)}
                className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-medium"
              >
                + Add Equipment
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-900 text-slate-400 font-mono text-[11px]">
                  <tr>
                    <th className="p-3">Tag Identifier</th>
                    <th className="p-3">Classification</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Chemical Service</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {equipment.map((eq) => (
                    <tr key={eq.id} className="hover:bg-slate-900/40">
                      <td className="p-3 font-mono font-bold text-cyan-300">{eq.tag}</td>
                      <td className="p-3 capitalize">{eq.equipment_type.replace('_', ' ')}</td>
                      <td className="p-3 text-slate-300">{eq.description}</td>
                      <td className="p-3">
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                            eq.status === 'confirmed'
                              ? 'bg-emerald-950 text-emerald-300'
                              : 'bg-amber-950 text-amber-300'
                          }`}
                        >
                          {eq.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-400">
                        {chemicals.find((c) => c.id === eq.assigned_chemical_id)?.chemical_name
                          .value || 'None'}
                      </td>
                      <td className="p-3 text-right space-x-2">
                        <button
                          onClick={() => handleOpenEditNode(eq)}
                          className="text-cyan-400 hover:text-cyan-300"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteEquipmentNode(eq)}
                          className="text-rose-400 hover:text-rose-300"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Piping Lines Table */}
          <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-4 bg-slate-900/60 border-b border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-slate-100 text-sm">
                Piping Lines & Signals ({lines.length})
              </h3>
              <button
                onClick={() => setShowAddLineModal(true)}
                className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-medium"
              >
                + Add Connection
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-900 text-slate-400 font-mono text-[11px]">
                  <tr>
                    <th className="p-3">Line Number</th>
                    <th className="p-3">From → To</th>
                    <th className="p-3">Functional Type</th>
                    <th className="p-3">Direction</th>
                    <th className="p-3">Size / Metallurgy</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {lines.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-900/40">
                      <td className="p-3 font-mono font-bold text-cyan-300">{l.line_number}</td>
                      <td className="p-3 font-mono">
                        {l.from_equipment} → {l.to_equipment}
                      </td>
                      <td className="p-3 capitalize">{l.functional_type.replace('_', ' ')}</td>
                      <td className="p-3 capitalize">{l.flow_direction}</td>
                      <td className="p-3 font-mono text-slate-400">
                        {l.size} {l.material}
                      </td>
                      <td className="p-3">
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                            l.status === 'confirmed'
                              ? 'bg-emerald-950 text-emerald-300'
                              : 'bg-amber-950 text-amber-300'
                          }`}
                        >
                          {l.status}
                        </span>
                      </td>
                      <td className="p-3 text-right space-x-2">
                        <button
                          onClick={() => handleOpenEditLine(l)}
                          className="text-cyan-400 hover:text-cyan-300"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeletePipingLine(l)}
                          className="text-rose-400 hover:text-rose-300"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          MODALS & DRAWERS
         ---------------------------------------------------- */}

      {/* 1. Add Equipment Modal */}
      {showAddNodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4 text-xs font-sans">
            <h3 className="font-bold text-slate-100 text-sm">Add Equipment Node Manually</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Tag Identifier (e.g. TK-101, P-102):
                </label>
                <input
                  type="text"
                  value={newNodeForm.tag}
                  onChange={(e) => setNewNodeForm({ ...newNodeForm, tag: e.target.value })}
                  placeholder="TK-101"
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2 font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Equipment Type:
                </label>
                <select
                  value={newNodeForm.equipment_type}
                  onChange={(e) =>
                    setNewNodeForm({
                      ...newNodeForm,
                      equipment_type: e.target.value as EquipmentType,
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2"
                >
                  {EQUIPMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Description:
                </label>
                <input
                  type="text"
                  value={newNodeForm.description}
                  onChange={(e) =>
                    setNewNodeForm({ ...newNodeForm, description: e.target.value })
                  }
                  placeholder="e.g. Ammonia Accumulator Vessel"
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Chemical Assignment:
                </label>
                <select
                  value={newNodeForm.assigned_chemical_id}
                  onChange={(e) =>
                    setNewNodeForm({ ...newNodeForm, assigned_chemical_id: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2"
                >
                  <option value="">None / Unassigned</option>
                  {chemicals.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.chemical_name.user_value || c.chemical_name.value} ({c.cas_number.value})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowAddNodeModal(false)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNewEquipment}
                className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg"
              >
                Add Equipment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Edit Equipment Modal */}
      {showEditNodeModal && selectedEquipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4 text-xs font-sans">
            <h3 className="font-bold text-slate-100 text-sm">
              Edit Equipment {selectedEquipment.tag}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Tag Identifier:
                </label>
                <input
                  type="text"
                  value={editNodeForm.tag}
                  onChange={(e) => setEditNodeForm({ ...editNodeForm, tag: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2 font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Equipment Type:
                </label>
                <select
                  value={editNodeForm.equipment_type}
                  onChange={(e) =>
                    setEditNodeForm({
                      ...editNodeForm,
                      equipment_type: e.target.value as EquipmentType,
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2"
                >
                  {EQUIPMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Description:
                </label>
                <input
                  type="text"
                  value={editNodeForm.description}
                  onChange={(e) =>
                    setEditNodeForm({ ...editNodeForm, description: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Chemical Assignment:
                </label>
                <select
                  value={editNodeForm.assigned_chemical_id}
                  onChange={(e) =>
                    setEditNodeForm({ ...editNodeForm, assigned_chemical_id: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2"
                >
                  <option value="">None / Unassigned</option>
                  {chemicals.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.chemical_name.user_value || c.chemical_name.value} ({c.cas_number.value})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Engineering Status:
                </label>
                <select
                  value={editNodeForm.status}
                  onChange={(e) =>
                    setEditNodeForm({
                      ...editNodeForm,
                      status: e.target.value as EquipmentStatus,
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2"
                >
                  <option value="confirmed">Confirmed</option>
                  <option value="provisional">Provisional</option>
                  <option value="unresolved">Unresolved</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Reason for Revision (Audit Log):
                </label>
                <input
                  type="text"
                  value={editNodeForm.change_reason}
                  onChange={(e) =>
                    setEditNodeForm({ ...editNodeForm, change_reason: e.target.value })
                  }
                  placeholder="e.g. Corrected tag typo from P&ID Rev C"
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowEditNodeModal(false)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditNode}
                className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Add Connection Modal */}
      {showAddLineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4 text-xs font-sans">
            <h3 className="font-bold text-slate-100 text-sm">Add Connection / Piping Line</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Line Identifier (e.g. L-101, 2"-NH3-101-CS):
                </label>
                <input
                  type="text"
                  value={newLineForm.line_number}
                  onChange={(e) => setNewLineForm({ ...newLineForm, line_number: e.target.value })}
                  placeholder="L-101"
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    From Equipment:
                  </label>
                  <select
                    value={newLineForm.from_equipment}
                    onChange={(e) =>
                      setNewLineForm({ ...newLineForm, from_equipment: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2 font-mono"
                  >
                    {equipment.map((e) => (
                      <option key={e.id} value={e.tag}>
                        {e.tag}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    To Equipment:
                  </label>
                  <select
                    value={newLineForm.to_equipment}
                    onChange={(e) =>
                      setNewLineForm({ ...newLineForm, to_equipment: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2 font-mono"
                  >
                    {equipment.map((e) => (
                      <option key={e.id} value={e.tag}>
                        {e.tag}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Functional Type:
                  </label>
                  <select
                    value={newLineForm.functional_type}
                    onChange={(e) =>
                      setNewLineForm({
                        ...newLineForm,
                        functional_type: e.target.value as FunctionalType,
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2"
                  >
                    <option value="piping_line">Process Piping Line</option>
                    <option value="signal_line">Signal Line (4-20mA)</option>
                    <option value="utility_line">Utility Line (Steam/Air)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Flow Direction:
                  </label>
                  <select
                    value={newLineForm.flow_direction}
                    onChange={(e) =>
                      setNewLineForm({
                        ...newLineForm,
                        flow_direction: e.target.value as FlowDirection,
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2"
                  >
                    <option value="forward">Forward (→)</option>
                    <option value="reverse">Reverse (←)</option>
                    <option value="bidirectional">Bidirectional (↔)</option>
                    <option value="unknown">Unknown Direction</option>
                  </select>
                </div>
              </div>

              {newLineForm.functional_type !== 'signal_line' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Chemical Service Profile:
                  </label>
                  <select
                    value={newLineForm.assigned_chemical_id}
                    onChange={(e) =>
                      setNewLineForm({ ...newLineForm, assigned_chemical_id: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2"
                  >
                    <option value="">None / Unassigned</option>
                    {chemicals.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.chemical_name.user_value || c.chemical_name.value}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowAddLineModal(false)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNewLine}
                className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg"
              >
                Add Connection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Edit Connection Modal */}
      {showEditLineModal && selectedLine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4 text-xs font-sans">
            <h3 className="font-bold text-slate-100 text-sm">
              Edit Connection {selectedLine.line_number}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Line Identifier:
                </label>
                <input
                  type="text"
                  value={editLineForm.line_number}
                  onChange={(e) =>
                    setEditLineForm({ ...editLineForm, line_number: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Reconnect From:
                  </label>
                  <select
                    value={editLineForm.from_equipment}
                    onChange={(e) =>
                      setEditLineForm({ ...editLineForm, from_equipment: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2 font-mono"
                  >
                    {equipment.map((e) => (
                      <option key={e.id} value={e.tag}>
                        {e.tag}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Reconnect To:
                  </label>
                  <select
                    value={editLineForm.to_equipment}
                    onChange={(e) =>
                      setEditLineForm({ ...editLineForm, to_equipment: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2 font-mono"
                  >
                    {equipment.map((e) => (
                      <option key={e.id} value={e.tag}>
                        {e.tag}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Functional Type:
                  </label>
                  <select
                    value={editLineForm.functional_type}
                    onChange={(e) =>
                      setEditLineForm({
                        ...editLineForm,
                        functional_type: e.target.value as FunctionalType,
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2"
                  >
                    <option value="piping_line">Process Piping Line</option>
                    <option value="signal_line">Signal Line (4-20mA)</option>
                    <option value="utility_line">Utility Line (Steam/Air)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Flow Direction:
                  </label>
                  <select
                    value={editLineForm.flow_direction}
                    onChange={(e) =>
                      setEditLineForm({
                        ...editLineForm,
                        flow_direction: e.target.value as FlowDirection,
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2"
                  >
                    <option value="forward">Forward (→)</option>
                    <option value="reverse">Reverse (←)</option>
                    <option value="bidirectional">Bidirectional (↔)</option>
                    <option value="unknown">Unknown Direction</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Reason for Revision (Audit Log):
                </label>
                <input
                  type="text"
                  value={editLineForm.change_reason}
                  onChange={(e) =>
                    setEditLineForm({ ...editLineForm, change_reason: e.target.value })
                  }
                  placeholder="e.g. Reconnected to correct suction port on P-101"
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowEditLineModal(false)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditLine}
                className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Validation Drawer */}
      <GraphValidationDrawer
        isOpen={showValidationDrawer}
        onClose={() => setShowValidationDrawer(false)}
        validation={validation}
        onAcknowledgeWarning={handleAcknowledgeWarning}
        onOpenApprovalModal={() => setShowApprovalModal(true)}
      />

      {/* 6. Approval Modal */}
      <GraphApprovalModal
        isOpen={showApprovalModal}
        onClose={() => setShowApprovalModal(false)}
        approval={approval}
        validation={validation}
        onApprove={handleApproveGraph}
        onUnapprove={handleUnapproveGraph}
      />

      {/* 7. Audit Trail Modal */}
      <AuditTrailModal
        isOpen={showAuditModal}
        onClose={() => setShowAuditModal(false)}
        projectId={projectId}
      />

      {/* Recognition Diagnostic & Debug Overlay (Step 4) */}
      <RecognitionDebugOverlay
        projectId={projectId}
        isOpen={showDebugOverlay}
        onClose={() => setShowDebugOverlay(false)}
        layers={debugLayers}
        onToggleLayer={handleToggleDebugLayer}
      />

      {/* 8. Edit Specification Modal */}
      {showEditSpecModal && selectedEquipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4 text-xs font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-cyan-400" />
                Edit Specification: {specModalProperty.replace(/_/g, ' ').toUpperCase()}
              </h3>
              <span className="font-mono text-cyan-400 font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                {selectedEquipment.tag}
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Specification Value:
                </label>
                <input
                  type={specModalProperty === 'material_of_construction' ? 'text' : 'number'}
                  step="any"
                  value={specFormValue}
                  onChange={(e) => setSpecFormValue(e.target.value)}
                  placeholder={specModalProperty === 'material_of_construction' ? 'e.g. CS (ASTM A333 Grade 6)' : 'Leave empty if Not Provided'}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2 font-mono"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Leaving blank preserves explicit null / absent status (never coerced to zero).
                </p>
              </div>

              {specModalProperty !== 'material_of_construction' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Engineering Unit:
                  </label>
                  <input
                    type="text"
                    value={specFormUnit}
                    onChange={(e) => setSpecFormUnit(e.target.value)}
                    placeholder="e.g. psig, bar, °F, °C, gallons"
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2 font-mono"
                  />
                </div>
              )}

              {specModalProperty === 'capacity' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Capacity Type:
                  </label>
                  <select
                    value={specFormCapacityType}
                    onChange={(e) => setSpecFormCapacityType(e.target.value as CapacityType)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2"
                  >
                    <option value="total_volume">Total Volume (Nominal Tank/Vessel Size)</option>
                    <option value="working_volume">Working Volume (Operating Liquid Level)</option>
                    <option value="rated_throughput">Rated Throughput (Design Flow/Duty Capacity)</option>
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Source Document:
                  </label>
                  <input
                    type="text"
                    value={specFormDocName}
                    onChange={(e) => setSpecFormDocName(e.target.value)}
                    placeholder="e.g. V-101 Datasheet"
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Document Revision:
                  </label>
                  <input
                    type="text"
                    value={specFormDocRev}
                    onChange={(e) => setSpecFormDocRev(e.target.value)}
                    placeholder="e.g. Rev B"
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Reason for Revision (Audit Trail):
                </label>
                <input
                  type="text"
                  value={specFormReason}
                  onChange={(e) => setSpecFormReason(e.target.value)}
                  placeholder="e.g. Updated based on certified equipment nameplate"
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2"
                />
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-lg text-[11px] text-amber-200">
                User-entered specifications remain <strong>Unverified</strong> until reviewed by an authorized engineer. Saving will advance revision and mark dependent PHA study nodes for reassessment.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowEditSpecModal(false)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSpecification}
                className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg transition-colors"
              >
                Save Specification
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. Verify Specification Modal */}
      {showVerifySpecModal && selectedEquipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4 text-xs font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Authorize Engineering Verification
              </h3>
              <span className="font-mono text-cyan-400 font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                {selectedEquipment.tag}
              </span>
            </div>

            <div className="space-y-3">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
                  Property to Verify:
                </span>
                <div className="font-mono text-slate-200 font-bold">
                  {specVerifyProperty.replace(/_/g, ' ').toUpperCase()}:{' '}
                  <span className="text-cyan-300">
                    {String(selectedEquipment.specifications?.[specVerifyProperty]?.value ?? 'NOT PROVIDED')}{' '}
                    {selectedEquipment.specifications?.[specVerifyProperty]?.unit || ''}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Reviewer Name & Professional Title:
                </label>
                <input
                  type="text"
                  value={specVerifyReviewer}
                  onChange={(e) => setSpecVerifyReviewer(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Verification Notes / Document Cross-Reference:
                </label>
                <textarea
                  rows={3}
                  value={specVerifyNotes}
                  onChange={(e) => setSpecVerifyNotes(e.target.value)}
                  placeholder="e.g. Verified against ASME Section VIII Div 1 manufacturer U-1A report, certified drawing Rev 2"
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2"
                />
              </div>

              <div className="bg-emerald-500/10 border border-emerald-500/30 p-2.5 rounded-lg text-[11px] text-emerald-200 leading-relaxed">
                Verification certifies that this value has been reviewed against authoritative engineering documentation. In the PHA workflow, applicable deviations will transition from &ldquo;Unverified Limit&rdquo; to &ldquo;Verified Limit&rdquo;.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowVerifySpecModal(false)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleVerifySpecification}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-colors"
              >
                Sign Off & Verify
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 10. Conflict Resolution Modal */}
      {showConflictSpecModal && selectedEquipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-5 space-y-4 text-xs font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                Conflicting Specification Records: {specConflictProperty.replace(/_/g, ' ').toUpperCase()}
              </h3>
              <span className="font-mono text-cyan-400 font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                {selectedEquipment.tag}
              </span>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] text-slate-300">
                Multiple source documents report conflicting values. Select a record to adopt as the authoritative baseline, or provide resolution notes.
              </p>

              {/* Current Recorded Value */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                <span className="text-[10px] uppercase font-semibold text-slate-400">Current Value:</span>
                <div className="font-mono text-sm font-bold text-slate-200">
                  {String(selectedEquipment.specifications?.[specConflictProperty]?.value ?? 'NOT PROVIDED')}{' '}
                  {selectedEquipment.specifications?.[specConflictProperty]?.unit || ''}
                </div>
                <div className="text-[10px] text-slate-500">
                  Source: {selectedEquipment.specifications?.[specConflictProperty]?.source_document_name || 'Manual'}
                </div>
              </div>

              {/* Conflicting Records */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-slate-300">Conflicting Sources:</span>
                {selectedEquipment.specifications?.[specConflictProperty]?.conflicting_records?.map((conf) => (
                  <div
                    key={conf.id}
                    className="bg-rose-950/20 border border-rose-500/30 p-3 rounded-lg flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-mono font-bold text-rose-200 text-xs">
                        {String(conf.value)} {conf.unit || ''}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Document: {conf.source_document_name} {conf.source_revision ? `(${conf.source_revision})` : ''}{' '}
                        {conf.source_page ? `Page ${conf.source_page}` : ''}
                      </div>
                      {conf.original_extracted_text && (
                        <div className="text-[10px] italic text-slate-400 mt-0.5">
                          &ldquo;{conf.original_extracted_text}&rdquo;
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() =>
                        handleResolveSpecConflict(
                          specConflictProperty,
                          conf.value,
                          conf.unit || null,
                          `Adopted value from ${conf.source_document_name}`,
                          true
                        )
                      }
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-md text-[11px] shrink-0 transition-colors"
                    >
                      Adopt Value
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowConflictSpecModal(false)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 11. Specification Change History Modal */}
      {showHistorySpecModal && selectedEquipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-5 space-y-4 text-xs font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                Specification Change History: {specHistoryProperty.replace(/_/g, ' ').toUpperCase()}
              </h3>
              <span className="font-mono text-cyan-400 font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                {selectedEquipment.tag}
              </span>
            </div>

            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {(selectedEquipment.specifications?.[specHistoryProperty]?.change_history?.length || 0) === 0 ? (
                <div className="text-slate-400 italic text-center py-6">
                  No revision history recorded for this specification property.
                </div>
              ) : (
                selectedEquipment.specifications?.[specHistoryProperty]?.change_history?.map((hist, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span className="font-semibold text-slate-300">{hist.author}</span>
                      <span className="font-mono">{new Date(hist.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="font-mono text-xs flex items-center gap-2">
                      <span className="text-rose-400 line-through">
                        {String(hist.previous_value ?? 'None')} {hist.previous_unit || ''}
                      </span>
                      <ArrowRight className="w-3 h-3 text-slate-500" />
                      <span className="text-emerald-300 font-bold">
                        {String(hist.new_value ?? 'None')} {hist.new_unit || ''}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Reason: <span className="text-slate-300">{hist.change_reason}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowHistorySpecModal(false)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stream Modal */}
      {showStreamModal && (
        <StreamModal
          isOpen={showStreamModal}
          onClose={() => {
            setShowStreamModal(false);
            setEditingStream(null);
          }}
          stream={editingStream}
          projectId={projectId}
          equipment={equipment}
          lines={lines}
          chemicals={chemicals}
          defaultSourceTag={streamDefaultSource}
          defaultDestTag={streamDefaultDest}
          onSave={handleSaveStream}
        />
      )}
    </div>
  );
};
