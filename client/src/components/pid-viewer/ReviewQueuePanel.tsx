import React from 'react';
import { AlertTriangle, CheckCircle, Eye, ShieldAlert, ArrowRight, Info, Filter, X } from 'lucide-react';

export interface FlaggedEdgeItem {
  edgeId: string;
  sourceNodeId: string;
  sourcePort: string;
  targetNodeId: string;
  targetPort: string;
  lineType: string;
  lineNumber?: string;
  confidence: number;
  needsReview: boolean;
  lengthPx: number;
  crossedObstaclesCount: number;
  sharesLineNumber: boolean;
  warningReasons: string[];
}

interface ReviewQueuePanelProps {
  isOpen: boolean;
  onClose: () => void;
  items: FlaggedEdgeItem[];
  selectedEdgeId: string | null;
  onSelectEdge: (edgeId: string) => void;
  onAcknowledgeEdge?: (edgeId: string) => void;
}

export const ReviewQueuePanel: React.FC<ReviewQueuePanelProps> = ({
  isOpen,
  onClose,
  items,
  selectedEdgeId,
  onSelectEdge,
  onAcknowledgeEdge,
}) => {
  if (!isOpen) return null;

  return (
    <div className="w-80 sm:w-96 bg-white border-l border-slate-200 shadow-2xl flex flex-col h-full z-30 transition-all select-none">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Topology Review Queue</h3>
            <span className="text-xs text-slate-500 font-mono">
              {items.length} flagged connection{items.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Flagged Items List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {items.length === 0 ? (
          <div className="p-8 text-center text-slate-400 space-y-2">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">All Connections Verified</p>
            <p className="text-xs text-slate-400">Zero suspicious or flagged piping routes detected.</p>
          </div>
        ) : (
          items.map((item) => {
            const isSelected = selectedEdgeId === item.edgeId;
            return (
              <div
                key={item.edgeId}
                onClick={() => onSelectEdge(item.edgeId)}
                className={`p-3 rounded-xl border transition-all cursor-pointer text-left ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50/60 shadow-xs ring-1 ring-blue-500'
                    : 'border-amber-200 bg-amber-50/40 hover:bg-amber-50/70 hover:border-amber-300'
                }`}
              >
                {/* Route Header */}
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-mono font-bold text-slate-900 flex items-center gap-1">
                    <span>{item.sourceNodeId}</span>
                    <span className="text-slate-400 font-normal">({item.sourcePort})</span>
                    <ArrowRight className="w-3 h-3 text-slate-400" />
                    <span>{item.targetNodeId}</span>
                    <span className="text-slate-400 font-normal">({item.targetPort})</span>
                  </span>
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-bold ${
                      item.confidence < 0.6
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {Math.round(item.confidence * 100)}% conf
                  </span>
                </div>

                {/* Line Tag & Type */}
                <div className="text-[11px] text-slate-600 mb-2 flex items-center justify-between">
                  <span className="font-mono text-slate-800 font-semibold truncate max-w-[190px]">
                    {item.lineNumber || 'UNLABELED LINE'}
                  </span>
                  <span className="uppercase text-[9px] font-bold text-slate-500 bg-slate-200/80 px-1.5 py-0.5 rounded">
                    {item.lineType}
                  </span>
                </div>

                {/* Warning Flags */}
                <div className="space-y-1 mb-2">
                  {item.warningReasons.map((reason, idx) => (
                    <div key={idx} className="flex items-start gap-1 text-[10px] text-amber-800">
                      <span className="text-amber-500 font-bold">•</span>
                      <span>{reason}</span>
                    </div>
                  ))}
                  {!item.sharesLineNumber && (
                    <div className="flex items-start gap-1 text-[10px] text-rose-700 font-medium">
                      <span className="text-rose-500 font-bold">•</span>
                      <span>Endpoints share no matching line number in schedule</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 text-xs">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectEdge(item.edgeId);
                    }}
                    className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 text-[11px]"
                  >
                    <Eye className="w-3 h-3" /> Focus Route
                  </button>
                  {onAcknowledgeEdge && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAcknowledgeEdge(item.edgeId);
                      }}
                      className="text-emerald-700 hover:text-emerald-900 bg-emerald-100/60 hover:bg-emerald-100 px-2 py-0.5 rounded font-semibold text-[10px] transition-colors"
                    >
                      Acknowledge
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
