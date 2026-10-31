import React, { useState, useEffect } from 'react';
import {
  Layers,
  Activity,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  Maximize2,
  Sparkles,
  GitBranch,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Info,
} from 'lucide-react';
import { CommonDrawingModel, PipePath, PipeJunction, DrawingObject, EquipmentPort, ConnectionCandidate } from '../../types';

export interface DebugLayerToggles {
  rawSegments: boolean;
  processPiping: boolean;
  signalLines: boolean;
  junctions: boolean;
  boundingBoxes: boolean;
  ports: boolean;
  candidates: boolean;
  confirmedPaths: boolean;
}

export interface RecognitionDebugData {
  has_pid: boolean;
  message?: string;
  document?: {
    id: string;
    name: string;
    file_path: string;
    mime_type: string;
    pages_count: number;
    is_readable: boolean;
  };
  stage_counts?: {
    objects_count: number;
    pipe_paths_count: number;
    process_piping_count: number;
    signal_lines_count: number;
    junctions_count: number;
    ports_count: number;
    connection_candidates_count: number;
    confirmed_paths_count: number;
    unresolved_segments_count: number;
    graph_nodes_count: number;
    graph_edges_count: number;
    isolated_nodes_count: number;
  };
  drawing_model?: CommonDrawingModel;
  reconciliation_summary?: CommonDrawingModel['reconciliation_summary'];
  graph_counts?: {
    total_nodes: number;
    total_edges: number;
    isolated_nodes_count: number;
  };
}

interface RecognitionDebugOverlayProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  layers: DebugLayerToggles;
  onToggleLayer: (layer: keyof DebugLayerToggles) => void;
  onSelectElement?: (element: { type: string; id: string; data: any } | null) => void;
}

export const RecognitionDebugOverlay: React.FC<RecognitionDebugOverlayProps> = ({
  projectId,
  isOpen,
  onClose,
  layers,
  onToggleLayer,
  onSelectElement,
}) => {
  const [data, setData] = useState<RecognitionDebugData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showStages, setShowStages] = useState<boolean>(true);
  const [selectedItem, setSelectedItem] = useState<{ type: string; title: string; details: any } | null>(null);

  const fetchDebugData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/projects/${projectId}/recognition-debug`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error || 'Failed to load recognition debug data');
      }
    } catch (err: any) {
      setError(err.message || 'Network error fetching debug data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDebugData();
    }
  }, [projectId, isOpen]);

  if (!isOpen) return null;

  const counts = data?.stage_counts;
  const drawingModel = data?.drawing_model;

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-slate-950/95 backdrop-blur-md border-l border-slate-800 shadow-2xl z-50 flex flex-col font-sans transition-all">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              Recognition Diagnostics
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/40 font-bold uppercase">
                Vector / OCR Engine
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Interactive layer toggles and stage-by-stage audit
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={fetchDebugData}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-cyan-400 transition-colors disabled:opacity-50"
            title="Refresh Debug Analysis"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors"
            title="Close Diagnostics"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {loading && !data && (
          <div className="flex flex-col items-center justify-center py-12 space-y-2 text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
            <p>Analyzing P&ID vector layers and connectivity...</p>
          </div>
        )}

        {error && (
          <div className="p-3 bg-rose-950/50 border border-rose-500/40 rounded-xl text-rose-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <div>
              <div className="font-bold">Diagnostics Error</div>
              <p className="text-[11px] text-rose-200/80">{error}</p>
            </div>
          </div>
        )}

        {data && (
          <>
            {/* Top Status Card: Isolated Node Meter */}
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between ${
                counts?.isolated_nodes_count === 0
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                  : 'bg-amber-950/40 border-amber-500/50 text-amber-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {counts?.isolated_nodes_count === 0 ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                )}
                <div>
                  <div className="font-bold text-xs uppercase tracking-wider">
                    {counts?.isolated_nodes_count === 0 ? 'Topology Synchronized' : 'Topology Review Required'}
                  </div>
                  <div className="text-[11px] opacity-80">
                    {counts?.isolated_nodes_count === 0
                      ? 'All equipment objects have connected piping or signals'
                      : `${counts?.isolated_nodes_count} isolated equipment nodes with 0 connections`}
                  </div>
                </div>
              </div>
              <div className="text-right font-mono">
                <span className="text-lg font-bold">
                  {counts?.graph_edges_count || 0}
                </span>
                <span className="text-[10px] block opacity-70">Active Edges</span>
              </div>
            </div>

            {/* Diagnostic Layer Toggles (Step 4 Requirement) */}
            <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-3 space-y-2.5">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5 uppercase tracking-wider">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  Drawing Visual Layers
                </span>
                <span className="text-[10px] text-slate-400">Toggle on/off</span>
              </div>

              <div className="space-y-1.5">
                {/* 1. Detected Raw Line Segments */}
                <label className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/60 cursor-pointer transition-colors border border-transparent hover:border-slate-700/50">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={layers.rawSegments}
                      onChange={() => onToggleLayer('rawSegments')}
                      className="rounded border-slate-700 bg-slate-950 text-purple-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span className="text-slate-200 font-medium">Raw Vector Line Segments</span>
                  </div>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-500/40">
                    {counts?.pipe_paths_count || 0} segs
                  </span>
                </label>

                {/* 2. Classified Process Piping */}
                <label className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/60 cursor-pointer transition-colors border border-transparent hover:border-slate-700/50">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={layers.processPiping}
                      onChange={() => onToggleLayer('processPiping')}
                      className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span className="text-slate-200 font-medium">Classified Process Piping</span>
                  </div>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                    {counts?.process_piping_count || 0} lines
                  </span>
                </label>

                {/* 3. Classified Signal Lines */}
                <label className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/60 cursor-pointer transition-colors border border-transparent hover:border-slate-700/50">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={layers.signalLines}
                      onChange={() => onToggleLayer('signalLines')}
                      className="rounded border-slate-700 bg-slate-950 text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span className="text-slate-200 font-medium">Instrument Signal Lines</span>
                  </div>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-500/40">
                    {counts?.signal_lines_count || 0} signals
                  </span>
                </label>

                {/* 4. Detected Junctions */}
                <label className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/60 cursor-pointer transition-colors border border-transparent hover:border-slate-700/50">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={layers.junctions}
                      onChange={() => onToggleLayer('junctions')}
                      className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span className="text-slate-200 font-medium">Detected Junctions & Crossings</span>
                  </div>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-500/40">
                    {counts?.junctions_count || 0} juncs
                  </span>
                </label>

                {/* 5. Equipment Bounding Boxes */}
                <label className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/60 cursor-pointer transition-colors border border-transparent hover:border-slate-700/50">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={layers.boundingBoxes}
                      onChange={() => onToggleLayer('boundingBoxes')}
                      className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span className="text-slate-200 font-medium">Equipment Bounding Boxes</span>
                  </div>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/40">
                    {counts?.objects_count || 0} boxes
                  </span>
                </label>

                {/* 6. Equipment Ports (Nozzles) */}
                <label className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/60 cursor-pointer transition-colors border border-transparent hover:border-slate-700/50">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={layers.ports}
                      onChange={() => onToggleLayer('ports')}
                      className="rounded border-slate-700 bg-slate-950 text-rose-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span className="text-slate-200 font-medium">Equipment Ports & Nozzles</span>
                  </div>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-500/40">
                    {counts?.ports_count || 0} ports
                  </span>
                </label>

                {/* 7. Candidate Connection Endpoints */}
                <label className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/60 cursor-pointer transition-colors border border-transparent hover:border-slate-700/50">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={layers.candidates}
                      onChange={() => onToggleLayer('candidates')}
                      className="rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span className="text-slate-200 font-medium">Candidate Connections</span>
                  </div>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/40">
                    {counts?.connection_candidates_count || 0} cand
                  </span>
                </label>

                {/* 8. Confirmed Pipe Paths */}
                <label className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/60 cursor-pointer transition-colors border border-transparent hover:border-slate-700/50">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={layers.confirmedPaths}
                      onChange={() => onToggleLayer('confirmedPaths')}
                      className="rounded border-slate-700 bg-slate-950 text-teal-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span className="text-slate-200 font-medium">Confirmed Connected Paths</span>
                  </div>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-500/40">
                    {counts?.confirmed_paths_count || 0} paths
                  </span>
                </label>
              </div>
            </div>

            {/* Stage-by-Stage Diagnostics Audit (Step 2 Requirement) */}
            <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-3 space-y-2">
              <button
                onClick={() => setShowStages(!showStages)}
                className="w-full flex items-center justify-between text-slate-200 font-bold text-xs uppercase tracking-wider"
              >
                <span className="flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
                  Stage-by-Stage Pipeline Counts
                </span>
                {showStages ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              {showStages && (
                <div className="space-y-1.5 pt-2 border-t border-slate-800 text-[11px]">
                  <div className="flex justify-between py-1 border-b border-slate-800/50 text-slate-400">
                    <span>1. PDF Extraction</span>
                    <span className="font-mono text-slate-200">
                      {data.document?.pages_count || 1} pg ({drawingModel?.document_classification || 'vector_pdf'})
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/50 text-slate-400">
                    <span>2. Text & OCR Extraction</span>
                    <span className="font-mono text-slate-200">{counts?.objects_count || 0} tokens</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/50 text-slate-400">
                    <span>3. Equipment Detection</span>
                    <span className="font-mono text-cyan-400 font-bold">{counts?.objects_count || 0} objects</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/50 text-slate-400">
                    <span>4. Line-Segment Detection</span>
                    <span className="font-mono text-purple-400 font-bold">{counts?.pipe_paths_count || 0} segments</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/50 text-slate-400">
                    <span>5. Pipe Classification</span>
                    <span className="font-mono text-emerald-400 font-bold">
                      {counts?.process_piping_count || 0} pipe / {counts?.signal_lines_count || 0} sig
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/50 text-slate-400">
                    <span>6. Pipe-Path Reconstruction</span>
                    <span className="font-mono text-teal-400 font-bold">{counts?.confirmed_paths_count || 0} paths</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/50 text-slate-400">
                    <span>7. Junction Detection</span>
                    <span className="font-mono text-amber-400 font-bold">{counts?.junctions_count || 0} juncs</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/50 text-slate-400">
                    <span>8. Port Detection</span>
                    <span className="font-mono text-rose-400 font-bold">{counts?.ports_count || 0} ports</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/50 text-slate-400">
                    <span>9. Connection Candidates</span>
                    <span className="font-mono text-indigo-400 font-bold">
                      {counts?.connection_candidates_count || 0} candidates
                    </span>
                  </div>
                  <div className="flex justify-between py-1 text-slate-400">
                    <span>10. Graph Synchronization</span>
                    <span className="font-mono text-emerald-300 font-bold">
                      {counts?.graph_nodes_count || 0} nodes / {counts?.graph_edges_count || 0} edges
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Candidate Connections Inspector */}
            <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-3 space-y-2">
              <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                <span className="font-bold text-slate-200 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                  Recognized Topology Edges ({drawingModel?.connection_candidates.length || 0})
                </span>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {(drawingModel?.connection_candidates || []).slice(0, 15).map((cand) => (
                  <div
                    key={cand.id}
                    onClick={() =>
                      setSelectedItem({
                        type: 'Candidate Connection',
                        title: `${cand.source_equipment} -> ${cand.destination_equipment}`,
                        details: cand,
                      })
                    }
                    className="p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500/40 cursor-pointer transition-colors space-y-1 text-[11px]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-slate-200">
                        {cand.source_equipment} <span className="text-cyan-400">→</span> {cand.destination_equipment}
                      </span>
                      <span
                        className={`text-[9px] font-mono px-1 py-0.2 rounded font-bold uppercase ${
                          cand.recognition_status === 'corroborated'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : cand.recognition_status === 'visually_supported'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                            : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                        }`}
                      >
                        {cand.recognition_status.replace('_', ' ')}
                      </span>
                    </div>
                    {cand.line_number && (
                      <div className="text-[10px] text-slate-400 font-mono">
                        Line: {cand.line_number} • Conf: {Math.round(cand.confidence * 100)}%
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Selected Element Detail Inspector */}
            {selectedItem && (
              <div className="bg-slate-900 rounded-xl border border-cyan-500/40 p-3 space-y-2">
                <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                  <span className="font-bold text-cyan-300 text-xs flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-cyan-400" />
                    {selectedItem.title}
                  </span>
                  <button
                    onClick={() => setSelectedItem(null)}
                    className="text-slate-400 hover:text-slate-200"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <pre className="text-[10px] font-mono text-slate-300 bg-slate-950 p-2 rounded max-h-36 overflow-y-auto">
                  {JSON.stringify(selectedItem.details, null, 2)}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
