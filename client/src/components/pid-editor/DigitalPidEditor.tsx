import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Save,
  CheckCircle2,
  ShieldCheck,
  Download,
  ArrowRight,
  Plus,
  RefreshCw,
  FolderOpen,
  AlertTriangle,
  Layers,
  ArrowLeft,
  FileImage,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  Crosshair,
  Grid,
  Split,
  Undo2,
  Redo2,
  Columns,
  Eye,
} from 'lucide-react';
import {
  DigitalPidDrawing,
  DrawingElement,
  DrawingConnector,
  DrawingValidationResult,
  ChemicalRecord,
  DocumentRecord,
  ProcessProject,
} from '../../types';
import { SymbolPalette, PaletteItem } from './SymbolPalette';
import { EditorCanvas } from './EditorCanvas';
import { EditorPropertiesPanel } from './EditorPropertiesPanel';
import { DrawingValidationDrawer } from './DrawingValidationDrawer';
import { DrawingApprovalModal } from './DrawingApprovalModal';
import { DrawingExportModal } from './DrawingExportModal';
import { HybridReconciliationPanel } from './HybridReconciliationPanel';
import { PidCleanViewer } from '../pid-viewer/PidCleanViewer';

interface DigitalPidEditorProps {
  project: ProcessProject;
  documents: DocumentRecord[];
  chemicals: ChemicalRecord[];
  onBackToWorkflow?: () => void;
  onProceedToPhaNodes?: () => void;
}

async function safeFetchJson<T = any>(url: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (netErr: any) {
    throw new Error(
      `Network connection failed: ${netErr.message || 'Unable to connect'}. Please ensure the backend server is running on http://localhost:5001.`
    );
  }

  const ct = res.headers.get('content-type') || '';

  // Handle non-2xx status codes
  if (!res.ok) {
    if (ct.includes('application/json')) {
      try {
        const errJson = await res.json();
        throw new Error(errJson.error || errJson.message || `Server returned HTTP ${res.status}`);
      } catch (e: any) {
        if (e.message && !e.message.includes('JSON')) throw e;
      }
    }
    if (res.status === 404) {
      throw new Error(`Endpoint not found (404) at ${url}. Please verify the backend route is active.`);
    }
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error('Backend server is offline or restarting. Please verify the PSI backend is active on port 5001.');
    }
    throw new Error(`Server returned HTTP ${res.status} (${res.statusText || 'Error'}).`);
  }

  // Handle case where status is 200 but content is HTML (e.g. Vite SPA fallback or error page)
  if (!ct.includes('application/json')) {
    const rawText = await res.text().catch(() => '');
    if (rawText.trim().startsWith('<') || rawText.includes('<!DOCTYPE')) {
      throw new Error(
        'Backend server returned HTML instead of JSON. The backend server on port 5001 may have stopped or the API route is missing.'
      );
    }
    throw new Error(`Invalid response format from server (expected JSON, received ${ct || 'unknown'}).`);
  }

  try {
    return await res.json();
  } catch (parseErr: any) {
    throw new Error(`Failed to parse server JSON response: ${parseErr.message}`);
  }
}

export const DigitalPidEditor: React.FC<DigitalPidEditorProps> = ({
  project,
  documents,
  chemicals,
  onBackToWorkflow,
  onProceedToPhaNodes,
}) => {
  // Drawings List & Active Drawing
  const [drawings, setDrawings] = useState<DigitalPidDrawing[]>([]);
  const [activeDrawing, setActiveDrawing] = useState<DigitalPidDrawing | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [editorViewTab, setEditorViewTab] = useState<'clean_viewer' | 'canvas' | 'hybrid'>('clean_viewer');

  const editorRootRef = useRef<HTMLDivElement>(null);

  // Wheel listener to isolate entire editor and prevent outer webpage from scrolling up or down
  useEffect(() => {
    const rootEl = editorRootRef.current;
    if (!rootEl) return;

    const onEditorWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      // Allow scrolling inside elements with overflow-y-auto or overflow-auto (like symbol palette or properties panel)
      const scrollable = target?.closest('.overflow-y-auto, .overflow-auto');
      if (scrollable) {
        const canScrollDown = scrollable.scrollTop < scrollable.scrollHeight - scrollable.clientHeight - 1;
        const canScrollUp = scrollable.scrollTop > 1;
        if ((e.deltaY > 0 && canScrollDown) || (e.deltaY < 0 && canScrollUp)) {
          return; // Let sidebar scroll internally
        }
      }

      // In all other cases (canvas, toolbars, headers, boundaries):
      // Prevent outer page from scrolling up/down!
      e.preventDefault();
      e.stopPropagation();
    };

    rootEl.addEventListener('wheel', onEditorWheel, { passive: false });
    return () => {
      rootEl.removeEventListener('wheel', onEditorWheel);
    };
  }, []);

  // Selection
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);

  // Validation & Approval
  const [validationResult, setValidationResult] = useState<DrawingValidationResult | null>(null);
  const [isValidationDrawerOpen, setIsValidationDrawerOpen] = useState<boolean>(false);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isNewDrawingModalOpen, setIsNewDrawingModalOpen] = useState<boolean>(false);

  // Robust Undo / Redo History (Past / Future Snapshot Architecture)
  interface HistorySnapshot {
    elements: DrawingElement[];
    connectors: DrawingConnector[];
  }
  const [historyPast, setHistoryPast] = useState<HistorySnapshot[]>([]);
  const [historyFuture, setHistoryFuture] = useState<HistorySnapshot[]>([]);

  // Load drawings from backend
  const fetchDrawings = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await safeFetchJson(`/api/projects/${project.id}/drawings`);
      if (data.success && data.data) {
        setDrawings(data.data);
        if (data.data.length > 0) {
          const current = data.data[0];
          setActiveDrawing(current);
          setHistoryPast([]);
          setHistoryFuture([]);
        }
      }
    } catch (err) {
      console.error('Failed to load digital drawings:', err);
    } finally {
      setIsLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    fetchDrawings();
  }, [fetchDrawings]);

  // Run validation whenever drawing changes
  const runValidation = useCallback(async (drawingId: string) => {
    try {
      const data = await safeFetchJson(`/api/drawings/${drawingId}/validate`, { method: 'POST' });
      if (data.success) {
        setValidationResult(data.data);
      }
    } catch (err) {
      console.error('Failed to validate drawing:', err);
    }
  }, []);

  useEffect(() => {
    if (activeDrawing?.id) {
      runValidation(activeDrawing.id);
    }
  }, [activeDrawing?.id, runValidation]);

  // Record a new state snapshot for Undo
  const recordSnapshot = useCallback((elementsToSave?: DrawingElement[], connectorsToSave?: DrawingConnector[]) => {
    if (!activeDrawing) return;
    const snapElements = elementsToSave || activeDrawing.elements;
    const snapConnectors = connectorsToSave || activeDrawing.connectors;
    const snapshot: HistorySnapshot = {
      elements: JSON.parse(JSON.stringify(snapElements)),
      connectors: JSON.parse(JSON.stringify(snapConnectors)),
    };
    setHistoryPast((prev) => [...prev.slice(-40), snapshot]);
    setHistoryFuture([]); // Clear redo stack on new action
  }, [activeDrawing]);

  const handleUndo = useCallback(() => {
    if (historyPast.length === 0 || !activeDrawing) return;
    const previous = historyPast[historyPast.length - 1];
    const newPast = historyPast.slice(0, historyPast.length - 1);
    const currentSnapshot: HistorySnapshot = {
      elements: JSON.parse(JSON.stringify(activeDrawing.elements)),
      connectors: JSON.parse(JSON.stringify(activeDrawing.connectors)),
    };

    setHistoryFuture((prev) => [currentSnapshot, ...prev]);
    setHistoryPast(newPast);
    setActiveDrawing({
      ...activeDrawing,
      elements: JSON.parse(JSON.stringify(previous.elements)),
      connectors: JSON.parse(JSON.stringify(previous.connectors)),
    });
    setHasUnsavedChanges(true);
  }, [historyPast, activeDrawing]);

  const handleRedo = useCallback(() => {
    if (historyFuture.length === 0 || !activeDrawing) return;
    const next = historyFuture[0];
    const newFuture = historyFuture.slice(1);
    const currentSnapshot: HistorySnapshot = {
      elements: JSON.parse(JSON.stringify(activeDrawing.elements)),
      connectors: JSON.parse(JSON.stringify(activeDrawing.connectors)),
    };

    setHistoryPast((prev) => [...prev, currentSnapshot]);
    setHistoryFuture(newFuture);
    setActiveDrawing({
      ...activeDrawing,
      elements: JSON.parse(JSON.stringify(next.elements)),
      connectors: JSON.parse(JSON.stringify(next.connectors)),
    });
    setHasUnsavedChanges(true);
  }, [historyFuture, activeDrawing]);

  // Canvas update handlers
  const handleUpdateElements = (newElements: DrawingElement[]) => {
    if (!activeDrawing) return;
    setActiveDrawing({ ...activeDrawing, elements: newElements });
    setHasUnsavedChanges(true);
  };

  const handleDragCommit = () => {
    if (!activeDrawing) return;
    recordSnapshot(activeDrawing.elements, activeDrawing.connectors);
  };

  const handleUpdateConnectors = (newConnectors: DrawingConnector[]) => {
    if (!activeDrawing) return;
    recordSnapshot(activeDrawing.elements, activeDrawing.connectors);
    setActiveDrawing({ ...activeDrawing, connectors: newConnectors });
    setHasUnsavedChanges(true);
  };

  // Add symbol from palette
  const handleAddSymbol = (item: PaletteItem) => {
    if (!activeDrawing) return;

    recordSnapshot(activeDrawing.elements, activeDrawing.connectors);

    const countOfType = activeDrawing.elements.filter((e) => e.type === item.type).length;
    const tag = `${item.defaultTagPrefix}-${101 + countOfType}`;
    const registryPorts = item.registryPorts?.map((port) => ({
      id: port.id,
      name: port.id,
      type: port.role === 'drain' || port.role === 'vent' ? 'outlet' as const : port.role,
      position: {
        x: (((port.x - (item.registryViewBox?.x || 0)) / (item.registryViewBox?.width || 1)) - 0.5) * item.defaultWidth,
        y: (((port.y - (item.registryViewBox?.y || 0)) / (item.registryViewBox?.height || 1)) - 0.5) * item.defaultHeight,
      },
    }));

    const newElement: DrawingElement = {
      id: `elem-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      tag,
      type: item.type,
      component_class_id: item.registryClassId,
      inline: item.inline,
      description: item.description,
      position: { x: 300 + (countOfType % 3) * 60, y: 250 + (countOfType % 3) * 60 },
      size: { width: item.defaultWidth, height: item.defaultHeight },
      rotation: 0,
      assigned_chemical_id: null,
      status: 'provisional',
      confidence: 1.0,
      notes: '',
      ports: registryPorts || [
        { id: 'p_in', name: 'Process Inlet', type: 'inlet', position: { x: -item.defaultWidth / 2, y: 0 } },
        { id: 'p_out', name: 'Process Outlet', type: 'outlet', position: { x: item.defaultWidth / 2, y: 0 } },
        { id: 'p_top', name: 'Vent / Relief', type: 'outlet', position: { x: 0, y: -item.defaultHeight / 2 } },
        { id: 'p_btm', name: 'Drain', type: 'outlet', position: { x: 0, y: item.defaultHeight / 2 } },
        { id: 'p_sig', name: 'Signal Loop', type: 'signal', position: { x: 0, y: -item.defaultHeight / 4 } },
      ],
    };

    const updatedElements = [...activeDrawing.elements, newElement];
    setActiveDrawing({ ...activeDrawing, elements: updatedElements });
    setSelectedElementId(newElement.id);
    setSelectedConnectorId(null);
    setHasUnsavedChanges(true);
  };

  // Save Draft to Backend
  const handleSaveDraft = async () => {
    if (!activeDrawing) return;
    try {
      setIsSaving(true);
      const data = await safeFetchJson(`/api/drawings/${activeDrawing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeDrawing),
      });
      if (data.success && data.data) {
        setActiveDrawing(data.data);
        setDrawings((prev) => prev.map((d) => (d.id === data.data.id ? data.data : d)));
        setHasUnsavedChanges(false);
        runValidation(data.data.id);
      }
    } catch (err: any) {
      console.error('Failed to save drawing draft:', err);
      alert(err.message || 'Failed to save drawing draft');
    } finally {
      setIsSaving(false);
    }
  };

  // Auto-Align Digital Elements to 1:1 Reference Drawing Scale & Coordinates
  const [isAligning, setIsAligning] = useState<boolean>(false);
  const handleAlignToReference = async () => {
    if (!activeDrawing) return;
    try {
      setIsAligning(true);
      recordSnapshot(activeDrawing.elements, activeDrawing.connectors);
      const json = await safeFetchJson(`/api/drawings/${activeDrawing.id}/align-to-reference`, { method: 'POST' });
      if (json.success && json.data) {
        setActiveDrawing(json.data);
        setDrawings((prev) => prev.map((d) => (d.id === json.data.id ? json.data : d)));
        setHasUnsavedChanges(true);
        runValidation(json.data.id);
        alert(`1:1 Scale & Overlap Applied!\n${json.message || 'Elements snapped to reference drawing coordinates.'}`);
      } else {
        alert(json.error || 'Failed to align elements.');
      }
    } catch (err: any) {
      alert(err.message || 'Error aligning elements.');
    } finally {
      setIsAligning(false);
    }
  };

  // Multi-Part / Partitioned Digitization Engine (High-Accuracy Divide & Conquer)
  const [isPartitioning, setIsPartitioning] = useState<boolean>(false);
  const [partitionGrid, setPartitionGrid] = useState<'2x2' | '3x3' | '4x4'>('4x4');
  const [showPartitionOverlay, setShowPartitionOverlay] = useState<boolean>(false);
  const [partitionStats, setPartitionStats] = useState<any[]>([]);

  // Automatically execute 16-part (4x4) partitioned digitization on mount if not yet partitioned
  const autoDigitizedMapRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    if (!activeDrawing) return;
    if (autoDigitizedMapRef.current[activeDrawing.id]) return;
    const hasElements = activeDrawing.elements && activeDrawing.elements.length > 0;
    const missingConnectors = !activeDrawing.connectors || activeDrawing.connectors.length === 0;
    if (hasElements && missingConnectors) {
      autoDigitizedMapRef.current[activeDrawing.id] = true;
      setIsPartitioning(true);
      safeFetchJson(`/api/drawings/${activeDrawing.id}/partitioned-digitize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grid_rows: 4, grid_cols: 4, overlap_px: 40 }),
      })
        .then((json) => {
          if (json.success && json.data) {
            setActiveDrawing(json.data);
            setDrawings((prev) => prev.map((d) => (d.id === json.data.id ? json.data : d)));
            setPartitionStats(json.partitions || []);
            setShowPartitionOverlay(false); // Grid always off
            runValidation(json.data.id);
          }
        })
        .catch((err) => console.error('Auto 16-part partitioned digitization failed:', err))
        .finally(() => setIsPartitioning(false));
    }
  }, [activeDrawing]);

  const handlePartitionedDigitize = async () => {
    if (!activeDrawing) return;
    try {
      setIsPartitioning(true);
      recordSnapshot(activeDrawing.elements, activeDrawing.connectors);

      const json = await safeFetchJson(`/api/drawings/${activeDrawing.id}/partitioned-digitize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grid_rows: 4, grid_cols: 4, overlap_px: 40 }),
      });
      if (json.success && json.data) {
        setActiveDrawing(json.data);
        setDrawings((prev) => prev.map((d) => (d.id === json.data.id ? json.data : d)));
        setPartitionStats(json.partitions || []);
        setShowPartitionOverlay(false); // Grid always off
        setHasUnsavedChanges(true);
        runValidation(json.data.id);
      } else {
        alert(json.error || 'Failed to execute partitioned digitization.');
      }
    } catch (err: any) {
      alert(err.message || 'Error during partitioned digitization.');
    } finally {
      setIsPartitioning(false);
    }
  };

  // Acknowledge Warning
  const handleAcknowledgeWarning = async (warningCode: string) => {
    if (!activeDrawing) return;
    try {
      const data = await safeFetchJson(`/api/drawings/${activeDrawing.id}/acknowledge-warning`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warning_code: warningCode }),
      });
      if (data.success && data.validation) {
        setValidationResult(data.validation);
      }
    } catch (err: any) {
      console.error('Failed to acknowledge warning:', err);
    }
  };

  // Approve Drawing
  const handleApproveDrawing = async (reviewer: string, revision: string, notes: string) => {
    if (!activeDrawing) return;
    try {
      // First save draft
      await safeFetchJson(`/api/drawings/${activeDrawing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeDrawing),
      });

      const data = await safeFetchJson(`/api/drawings/${activeDrawing.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approver: reviewer, revision, notes }),
      });
      if (data.success && data.data) {
        setActiveDrawing(data.data);
        setDrawings((prev) => prev.map((d) => (d.id === data.data.id ? data.data : d)));
        setValidationResult(data.validation);
        setHasUnsavedChanges(false);
      } else {
        alert(data.error || 'Approval check failed');
      }
    } catch (err: any) {
      console.error('Failed to approve drawing:', err);
      alert(err.message || 'Approval request failed.');
    }
  };

  // Sync to Process Topology Graph
  const handleSyncToGraph = async () => {
    if (!activeDrawing) return;
    try {
      const data = await safeFetchJson(`/api/drawings/${activeDrawing.id}/sync`, { method: 'POST' });
      if (data.success) {
        alert(
          `Process Topology Synchronized!\n${data.equipment_count || activeDrawing.elements.length} equipment items & ${data.lines_count || activeDrawing.connectors.length} lines updated.`
        );
      }
    } catch (err: any) {
      console.error('Failed to sync drawing:', err);
      alert(err.message || 'Sync failed.');
    }
  };

  // Window & Detail Enhancements
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isPaletteCollapsed, setIsPaletteCollapsed] = useState<boolean>(false);
  const [isPropertiesCollapsed, setIsPropertiesCollapsed] = useState<boolean>(false);
  const [detailLevel, setDetailLevel] = useState<'standard' | 'high_detail'>('high_detail');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Create New Drawing Mode Dialog State
  const [newMode, setNewMode] = useState<'scratch' | 'imported_overlay'>('scratch');
  const [newTitle, setNewTitle] = useState('Process Piping & Instrumentation Diagram');
  const [newDocId, setNewDocId] = useState<string>('');
  const [importExtracted, setImportExtracted] = useState<boolean>(true);

  const handleCreateNewDrawing = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = await safeFetchJson(`/api/projects/${project.id}/drawings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          mode: newMode === 'imported_overlay' ? 'edit_imported' : 'create_new',
          source_document_id: newDocId || null,
          import_extracted_objects: importExtracted,
        }),
      });
      if (data.success && data.data) {
        setDrawings((prev) => [data.data, ...prev]);
        setActiveDrawing(data.data);
        setIsNewDrawingModalOpen(false);
        setHistoryPast([]);
        setHistoryFuture([]);
        setHasUnsavedChanges(false);
      }
    } catch (err: any) {
      console.error('Failed to create new drawing:', err);
      alert(err.message || 'Failed to create new drawing');
    }
  };

  const pidDocs = documents.filter((d) => d.doc_type === 'pid');

  const selectedElement = activeDrawing?.elements.find((e) => e.id === selectedElementId) || null;
  const selectedConnector =
    activeDrawing?.connectors.find((c) => c.id === selectedConnectorId) || null;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900 text-slate-400 text-sm">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-blue-500" />
        Loading Digital P&ID Editor...
      </div>
    );
  }

  if (!activeDrawing) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 p-8 text-center">
        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
          <Layers className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Digital P&ID Editor</h2>
        <p className="text-slate-500 text-sm max-w-md mt-2">
          Create or review verified digital P&IDs from scratch or using an uploaded drawing as a
          reference background layer.
        </p>
        <button
          onClick={() => setIsNewDrawingModalOpen(true)}
          className="mt-6 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Create New Drawing
        </button>
      </div>
    );
  }

  const isApproved = activeDrawing.status === 'approved';

  return (
    <div
      ref={editorRootRef}
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 w-screen h-screen bg-slate-950 flex flex-col overflow-hidden select-none overscroll-none'
          : 'flex-1 flex flex-col h-full bg-slate-100 overflow-hidden overscroll-none'
      }
    >
      {/* Top Main Navigation & Action Toolbar */}
      <div className="bg-slate-900 text-white border-b border-slate-800 px-4 py-2.5 flex items-center justify-between shadow-md shrink-0">
        <div className="flex items-center gap-3">
          {onBackToWorkflow && (
            <button
              onClick={onBackToWorkflow}
              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors flex items-center gap-1 text-xs"
              title="Back to Process Graph & Workflow"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>P&ID Topology</span>
            </button>
          )}

          <div className="w-px h-5 bg-slate-800" />

          {/* Drawing Selector Dropdown */}
          <div className="flex items-center gap-2">
            <select
              value={activeDrawing.id}
              onChange={(e) => {
                const found = drawings.find((d) => d.id === e.target.value);
                if (found) {
                  setActiveDrawing(found);
                  setSelectedElementId(null);
                  setSelectedConnectorId(null);
                  setHistoryPast([]);
                  setHistoryFuture([]);
                  setHasUnsavedChanges(false);
                }
              }}
              className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {drawings.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.drawing_number} — {d.title} ({d.revision})
                </option>
              ))}
            </select>

            <button
              onClick={() => setIsNewDrawingModalOpen(true)}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 rounded-lg border border-slate-700 transition-colors"
              title="Create Another Drawing"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider ${
                isApproved
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}
            >
              {activeDrawing.status.toUpperCase()}
            </span>

            <span className="font-mono text-xs font-semibold text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded border border-blue-800/40">
              {activeDrawing.revision}
            </span>

            {hasUnsavedChanges && (
              <span className="flex items-center gap-1 text-[11px] text-amber-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                Unsaved Changes
              </span>
            )}
          </div>

          {/* Sub-view switcher: Clean Source Viewer vs Interactive Editor vs Hybrid Reconciliation */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 ml-2">
            <button
              onClick={() => setEditorViewTab('clean_viewer')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                editorViewTab === 'clean_viewer'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Source Clean Viewer
            </button>
            <button
              onClick={() => setEditorViewTab('canvas')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                editorViewTab === 'canvas'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Interactive Editor
            </button>
            <button
              onClick={() => setEditorViewTab('hybrid')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                editorViewTab === 'hybrid'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
              Hybrid Recognition
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Quick Undo / Redo */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            <button
              onClick={handleUndo}
              disabled={historyPast.length === 0}
              className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white disabled:opacity-25 disabled:hover:bg-transparent rounded transition-colors"
              title="Undo Last Action (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleRedo}
              disabled={historyFuture.length === 0}
              className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white disabled:opacity-25 disabled:hover:bg-transparent rounded transition-colors"
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Automated 16-Part (4x4) Partition Digitization Status */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-purple-950/40 border border-purple-700/50 rounded-lg text-xs font-semibold text-purple-200"
            title="P&ID automatically digitized across 16 precision partitioned tiles"
          >
            <Split className={`w-3.5 h-3.5 text-purple-400 ${isPartitioning ? 'animate-spin' : ''}`} />
            <span>{isPartitioning ? 'Digitizing 16 Parts...' : '16-Part Digitized'}</span>
          </div>

          {/* Snap 1:1 Reference Overlap Button */}
          <button
            onClick={handleAlignToReference}
            disabled={isAligning}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-blue-950/60 hover:bg-blue-900/80 text-blue-300 border border-blue-700/60 shadow-xs transition-colors"
            title="Snap digital equipment, vessels, and lines directly onto their physical coordinates on the reference drawing"
          >
            <Crosshair className={`w-3.5 h-3.5 text-blue-400 ${isAligning ? 'animate-spin' : ''}`} />
            <span>{isAligning ? 'Aligning 1:1...' : 'Snap 1:1 Overlap'}</span>
          </button>

          {/* Fullscreen Studio Window Toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs ${
              isFullscreen
                ? 'bg-amber-600 hover:bg-amber-500 text-white ring-2 ring-amber-400/50'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
            title={isFullscreen ? 'Exit Fullscreen Studio (Esc)' : 'Expand to Fullscreen Studio Window'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5 text-amber-200" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 text-blue-400" />
            )}
            <span className="hidden sm:inline">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
          </button>

          {/* Wide Canvas / Zen Toggle */}
          <button
            onClick={() => {
              const shouldCollapse = !(isPaletteCollapsed && isPropertiesCollapsed);
              setIsPaletteCollapsed(shouldCollapse);
              setIsPropertiesCollapsed(shouldCollapse);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs ${
              isPaletteCollapsed && isPropertiesCollapsed
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white ring-2 ring-indigo-400/50'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }`}
            title={
              isPaletteCollapsed && isPropertiesCollapsed
                ? 'Restore side panels'
                : 'Maximize canvas workspace (hide side panels for expansive editing)'
            }
          >
            <Columns className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">
              {isPaletteCollapsed && isPropertiesCollapsed ? 'Zen View ON' : 'Wide Canvas'}
            </span>
          </button>

          {/* Save Draft */}
          <button
            onClick={handleSaveDraft}
            disabled={isSaving}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs ${
              hasUnsavedChanges
                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            {isSaving ? 'Saving...' : 'Save Draft'}
          </button>

          {/* Validation Drawer Button */}
          <button
            onClick={() => setIsValidationDrawerOpen(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
              validationResult?.can_approve
                ? 'bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border-emerald-700/50'
                : 'bg-red-950/40 hover:bg-red-900/60 text-red-300 border-red-700/50'
            }`}
          >
            {validationResult?.can_approve ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            )}
            <span>Validation</span>
            {validationResult && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-900">
                {validationResult.errors_count} err / {validationResult.warnings_count} warn
              </span>
            )}
          </button>

          {/* Approve Drawing */}
          <button
            onClick={() => setIsApprovalModalOpen(true)}
            disabled={!validationResult?.can_approve}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Approve Drawing
          </button>

          {/* Sync to Graph */}
          <button
            onClick={handleSyncToGraph}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            title="Update authoritative process graph from this drawing"
          >
            <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
            Sync Topology
          </button>

          {/* Export */}
          <button
            onClick={() => setIsExportModalOpen(true)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-slate-300" />
            Export
          </button>

          {/* Continue to PHA Node Segmentation */}
          {onProceedToPhaNodes && isApproved && (
            <button
              onClick={onProceedToPhaNodes}
              className="ml-2 px-4 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-xs font-bold shadow-md flex items-center gap-1.5 transition-all"
            >
              <span>PHA Node Segmentation</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area: Clean Source Viewer OR Hybrid Reconciliation OR Interactive Studio */}
      {editorViewTab === 'clean_viewer' ? (
        <div className="flex-1 overflow-hidden relative">
          <PidCleanViewer
            elements={activeDrawing.elements}
            connectors={activeDrawing.connectors}
            selectedElementId={selectedElementId}
            selectedConnectorId={selectedConnectorId}
            backgroundImageUrl={(() => {
              if (!activeDrawing.source_document_id) return null;
              const doc = documents.find(
                (d) =>
                  d.id === activeDrawing.source_document_id ||
                  d.file_path === activeDrawing.source_document_id ||
                  d.name === activeDrawing.source_document_id
              );
              if (doc) return doc.file_path;
              if (activeDrawing.source_document_id.startsWith('/uploads/')) {
                return activeDrawing.source_document_id;
              }
              return `/uploads/${activeDrawing.source_document_id}`;
            })()}
            onSelectElement={(el) => {
              setSelectedElementId(el ? el.id : null);
              if (el) setSelectedConnectorId(null);
            }}
            onSelectConnector={(conn) => {
              setSelectedConnectorId(conn ? conn.id : null);
              if (conn) setSelectedElementId(null);
            }}
          />
        </div>
      ) : editorViewTab === 'hybrid' ? (
        <div className="flex-1 overflow-hidden">
          <HybridReconciliationPanel
            project={project}
            documents={documents}
            onRefreshGraph={() => fetchDrawings()}
          />
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden relative">
          {/* Left: Reusable Engineering Symbol Palette (Collapsible) */}
          {!isPaletteCollapsed ? (
            <div className="relative flex shrink-0">
              <SymbolPalette onAddSymbol={handleAddSymbol} />
              <button
                onClick={() => setIsPaletteCollapsed(true)}
                className="absolute top-2 right-2 p-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white text-[10px] z-10 border border-slate-700 shadow-xs"
                title="Collapse Symbol Library to Maximize Canvas"
              >
                <PanelLeftClose className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="w-10 bg-slate-900 border-r border-slate-800 flex flex-col items-center py-3 gap-3 shrink-0 select-none">
              <button
                onClick={() => setIsPaletteCollapsed(false)}
                className="p-1.5 rounded bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white transition-colors border border-slate-700"
                title="Expand Symbol Library"
              >
                <PanelLeftOpen className="w-4 h-4 text-blue-400" />
              </button>
              <span className="text-[10px] font-mono font-bold text-slate-500 [writing-mode:vertical-lr] tracking-widest uppercase">
                Symbols
              </span>
            </div>
          )}

          {/* Center: Interactive Canvas (Expands to Full Width) */}
          <EditorCanvas
            elements={activeDrawing.elements}
            connectors={activeDrawing.connectors}
            selectedElementId={selectedElementId}
            selectedConnectorId={selectedConnectorId}
            detailLevel={detailLevel}
            onToggleDetailLevel={() =>
              setDetailLevel((prev) => (prev === 'standard' ? 'high_detail' : 'standard'))
            }
            backgroundImageUrl={(() => {
              if (!activeDrawing.source_document_id) return null;
              const doc = documents.find(
                (d) =>
                  d.id === activeDrawing.source_document_id ||
                  d.file_path === activeDrawing.source_document_id ||
                  d.name === activeDrawing.source_document_id
              );
              if (doc) return doc.file_path;
              if (activeDrawing.source_document_id.startsWith('/uploads/')) {
                return activeDrawing.source_document_id;
              }
              return `/uploads/${activeDrawing.source_document_id}`;
            })()}
            backgroundVisible={activeDrawing.background_visible}
            backgroundOpacity={activeDrawing.background_opacity}
            onUpdateElements={handleUpdateElements}
            onUpdateConnectors={handleUpdateConnectors}
            onSelectElement={(el) => {
              setSelectedElementId(el ? el.id : null);
              if (el) setSelectedConnectorId(null);
            }}
            onSelectConnector={(conn) => {
              setSelectedConnectorId(conn ? conn.id : null);
              if (conn) setSelectedElementId(null);
            }}
            onToggleBackgroundVisible={() => {
              setActiveDrawing({
                ...activeDrawing,
                background_visible: !activeDrawing.background_visible,
              });
              setHasUnsavedChanges(true);
            }}
            onChangeBackgroundOpacity={(opacity) => {
              setActiveDrawing({
                ...activeDrawing,
                background_opacity: opacity,
              });
              setHasUnsavedChanges(true);
            }}
            canUndo={historyPast.length > 0}
            canRedo={historyFuture.length > 0}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onPushHistory={handleDragCommit}
            showPartitionGrid={false}
            partitionGridType="4x4"
            partitionZones={partitionStats}
          />

          {/* Right: Contextual Properties Panel (Collapsible) */}
          {!isPropertiesCollapsed ? (
            <div className="relative flex shrink-0">
              <button
                onClick={() => setIsPropertiesCollapsed(true)}
                className="absolute top-2.5 right-2 p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 text-[10px] z-10 border border-slate-300 shadow-xs"
                title="Collapse Properties Inspector to Maximize Canvas"
              >
                <PanelRightClose className="w-3.5 h-3.5" />
              </button>
              <EditorPropertiesPanel
                drawing={activeDrawing}
                selectedElement={selectedElement}
                selectedConnector={selectedConnector}
                chemicals={chemicals}
                allElements={activeDrawing.elements}
                onUpdateElement={(updated) => {
                  handleUpdateElements(
                    activeDrawing.elements.map((el) => (el.id === updated.id ? updated : el))
                  );
                }}
                onUpdateConnector={(updated) => {
                  handleUpdateConnectors(
                    activeDrawing.connectors.map((c) => (c.id === updated.id ? updated : c))
                  );
                }}
                onUpdateDrawingMeta={(meta) => {
                  setActiveDrawing({ ...activeDrawing, ...meta });
                  setHasUnsavedChanges(true);
                }}
              />
            </div>
          ) : (
            <div className="w-10 bg-slate-900 border-l border-slate-800 flex flex-col items-center py-3 gap-3 shrink-0 select-none">
              <button
                onClick={() => setIsPropertiesCollapsed(false)}
                className="p-1.5 rounded bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white transition-colors border border-slate-700"
                title="Expand Properties Inspector"
              >
                <PanelRightOpen className="w-4 h-4 text-blue-400" />
              </button>
              <span className="text-[10px] font-mono font-bold text-slate-500 [writing-mode:vertical-lr] tracking-widest uppercase">
                Properties
              </span>
            </div>
          )}
        </div>
      )}

      {/* Drawers & Modals */}
      <DrawingValidationDrawer
        isOpen={isValidationDrawerOpen}
        onClose={() => setIsValidationDrawerOpen(false)}
        validationResult={validationResult}
        onAcknowledgeWarning={handleAcknowledgeWarning}
        onOpenApprovalModal={() => setIsApprovalModalOpen(true)}
      />

      <DrawingApprovalModal
        isOpen={isApprovalModalOpen}
        onClose={() => setIsApprovalModalOpen(false)}
        drawing={activeDrawing}
        onApprove={handleApproveDrawing}
      />

      <DrawingExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        drawing={activeDrawing}
      />

      {/* Create New Drawing Modal */}
      {isNewDrawingModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm">Create New Digital P&ID</h3>
              <button
                onClick={() => setIsNewDrawingModalOpen(false)}
                className="p-1 hover:bg-slate-200 text-slate-500 rounded"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateNewDrawing} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px] mb-1">
                  Drawing Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                  className="w-full px-3 py-1.5 font-medium text-slate-800 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px] mb-1">
                  Creation Mode
                </label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setNewMode('scratch')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      newMode === 'scratch'
                        ? 'border-blue-600 bg-blue-50/70 text-blue-900 font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <Layers className="w-4 h-4 mb-1 text-blue-600" />
                    <div className="text-xs">Blank Canvas</div>
                    <div className="text-[10px] text-slate-500 font-normal">
                      Draw process from scratch
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewMode('imported_overlay')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      newMode === 'imported_overlay'
                        ? 'border-blue-600 bg-blue-50/70 text-blue-900 font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <FileImage className="w-4 h-4 mb-1 text-blue-600" />
                    <div className="text-xs">Edit Imported Drawing</div>
                    <div className="text-[10px] text-slate-500 font-normal">
                      Reference background overlay
                    </div>
                  </button>
                </div>
              </div>

              {newMode === 'imported_overlay' && (
                <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div>
                    <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                      Select Source P&ID File
                    </label>
                    <select
                      value={newDocId}
                      onChange={(e) => setNewDocId(e.target.value)}
                      required
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs"
                    >
                      <option value="">-- Choose uploaded P&ID document --</option>
                      {pidDocs.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={importExtracted}
                      onChange={(e) => setImportExtracted(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-slate-700 text-[11px]">
                      Import AI/OCR extracted objects as provisional symbols
                    </span>
                  </label>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsNewDrawingModalOpen(false)}
                  className="px-3.5 py-1.5 text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm"
                >
                  Create Drawing
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
