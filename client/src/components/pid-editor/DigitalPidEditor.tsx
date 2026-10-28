import React, { useState, useEffect, useCallback } from 'react';
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

interface DigitalPidEditorProps {
  project: ProcessProject;
  documents: DocumentRecord[];
  chemicals: ChemicalRecord[];
  onBackToWorkflow?: () => void;
  onProceedToPhaNodes?: () => void;
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

  // Selection
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);

  // Validation & Approval
  const [validationResult, setValidationResult] = useState<DrawingValidationResult | null>(null);
  const [isValidationDrawerOpen, setIsValidationDrawerOpen] = useState<boolean>(false);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isNewDrawingModalOpen, setIsNewDrawingModalOpen] = useState<boolean>(false);

  // Undo / Redo History
  const [history, setHistory] = useState<
    { elements: DrawingElement[]; connectors: DrawingConnector[] }[]
  >([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Load drawings from backend
  const fetchDrawings = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/projects/${project.id}/drawings`);
      const data = await res.json();
      if (data.success && data.data) {
        setDrawings(data.data);
        if (data.data.length > 0) {
          const current = data.data[0];
          setActiveDrawing(current);
          setHistory([{ elements: current.elements, connectors: current.connectors }]);
          setHistoryIndex(0);
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
      const res = await fetch(`/api/drawings/${drawingId}/validate`, { method: 'POST' });
      const data = await res.json();
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

  // History Helper: push state
  const pushHistory = (newElements: DrawingElement[], newConnectors: DrawingConnector[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ elements: newElements, connectors: newConnectors });
    if (newHistory.length > 30) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0 && activeDrawing) {
      const prev = history[historyIndex - 1];
      setActiveDrawing({
        ...activeDrawing,
        elements: prev.elements,
        connectors: prev.connectors,
      });
      setHistoryIndex(historyIndex - 1);
      setHasUnsavedChanges(true);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1 && activeDrawing) {
      const next = history[historyIndex + 1];
      setActiveDrawing({
        ...activeDrawing,
        elements: next.elements,
        connectors: next.connectors,
      });
      setHistoryIndex(historyIndex + 1);
      setHasUnsavedChanges(true);
    }
  };

  // Add symbol from palette
  const handleAddSymbol = (item: PaletteItem) => {
    if (!activeDrawing) return;

    const countOfType = activeDrawing.elements.filter((e) => e.type === item.type).length;
    const tag = `${item.defaultTagPrefix}-${101 + countOfType}`;

    const newElement: DrawingElement = {
      id: `elem-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      tag,
      type: item.type,
      description: item.description,
      position: { x: 300 + (countOfType % 3) * 60, y: 250 + (countOfType % 3) * 60 },
      size: { width: item.defaultWidth, height: item.defaultHeight },
      rotation: 0,
      assigned_chemical_id: null,
      status: 'provisional',
      confidence: 1.0,
      notes: '',
      ports: [
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
    pushHistory(updatedElements, activeDrawing.connectors);
  };

  // Canvas update handlers
  const handleUpdateElements = (newElements: DrawingElement[]) => {
    if (!activeDrawing) return;
    setActiveDrawing({ ...activeDrawing, elements: newElements });
    setHasUnsavedChanges(true);
    pushHistory(newElements, activeDrawing.connectors);
  };

  const handleUpdateConnectors = (newConnectors: DrawingConnector[]) => {
    if (!activeDrawing) return;
    setActiveDrawing({ ...activeDrawing, connectors: newConnectors });
    setHasUnsavedChanges(true);
    pushHistory(activeDrawing.elements, newConnectors);
  };

  // Save Draft to Backend
  const handleSaveDraft = async () => {
    if (!activeDrawing) return;
    try {
      setIsSaving(true);
      const res = await fetch(`/api/drawings/${activeDrawing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeDrawing),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setActiveDrawing(data.data);
        setDrawings((prev) => prev.map((d) => (d.id === data.data.id ? data.data : d)));
        setHasUnsavedChanges(false);
        runValidation(data.data.id);
      }
    } catch (err) {
      console.error('Failed to save drawing draft:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Acknowledge Warning
  const handleAcknowledgeWarning = async (warningCode: string) => {
    if (!activeDrawing) return;
    try {
      const res = await fetch(`/api/drawings/${activeDrawing.id}/acknowledge-warning`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warning_code: warningCode }),
      });
      const data = await res.json();
      if (data.success && data.validation) {
        setValidationResult(data.validation);
      }
    } catch (err) {
      console.error('Failed to acknowledge warning:', err);
    }
  };

  // Approve Drawing
  const handleApproveDrawing = async (reviewer: string, revision: string, notes: string) => {
    if (!activeDrawing) return;
    try {
      // First save draft
      await fetch(`/api/drawings/${activeDrawing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeDrawing),
      });

      const res = await fetch(`/api/drawings/${activeDrawing.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approver: reviewer, revision, notes }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setActiveDrawing(data.data);
        setDrawings((prev) => prev.map((d) => (d.id === data.data.id ? data.data : d)));
        setValidationResult(data.validation);
        setHasUnsavedChanges(false);
      } else {
        alert(data.error || 'Approval check failed');
      }
    } catch (err) {
      console.error('Failed to approve drawing:', err);
    }
  };

  // Sync to Process Topology Graph
  const handleSyncToGraph = async () => {
    if (!activeDrawing) return;
    try {
      const res = await fetch(`/api/drawings/${activeDrawing.id}/sync`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(
          `Process Topology Synchronized!\n${data.equipment_count || activeDrawing.elements.length} equipment items & ${data.lines_count || activeDrawing.connectors.length} lines updated.`
        );
      }
    } catch (err) {
      console.error('Failed to sync drawing:', err);
    }
  };

  // Create New Drawing Mode Dialog State
  const [newMode, setNewMode] = useState<'scratch' | 'imported_overlay'>('scratch');
  const [newTitle, setNewTitle] = useState('Process Piping & Instrumentation Diagram');
  const [newDocId, setNewDocId] = useState<string>('');
  const [importExtracted, setImportExtracted] = useState<boolean>(true);

  const handleCreateNewDrawing = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/projects/${project.id}/drawings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          mode: newMode === 'imported_overlay' ? 'edit_imported' : 'create_new',
          source_document_id: newDocId || null,
          import_extracted_objects: importExtracted,
        }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setDrawings((prev) => [data.data, ...prev]);
        setActiveDrawing(data.data);
        setIsNewDrawingModalOpen(false);
        setHistory([{ elements: data.data.elements, connectors: data.data.connectors }]);
        setHistoryIndex(0);
        setHasUnsavedChanges(false);
      }
    } catch (err) {
      console.error('Failed to create new drawing:', err);
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
    <div className="flex-1 flex flex-col h-full bg-slate-100 overflow-hidden">
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
                  setHistory([{ elements: found.elements, connectors: found.connectors }]);
                  setHistoryIndex(0);
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
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
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

      {/* 3-Column Studio Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Reusable Engineering Symbol Palette */}
        <SymbolPalette onAddSymbol={handleAddSymbol} />

        {/* Center: Interactive Canvas */}
        <EditorCanvas
          elements={activeDrawing.elements}
          connectors={activeDrawing.connectors}
          selectedElementId={selectedElementId}
          selectedConnectorId={selectedConnectorId}
          backgroundImageUrl={
            activeDrawing.source_document_id
              ? `/uploads/${activeDrawing.source_document_id}`
              : null
          }
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
          canUndo={historyIndex > 0}
          canRedo={historyIndex < history.length - 1}
          onUndo={handleUndo}
          onRedo={handleRedo}
        />

        {/* Right: Contextual Properties Panel */}
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
