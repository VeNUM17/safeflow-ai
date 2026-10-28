import React from 'react';
import { X, Download, FileJson, FileCode, CheckCircle2 } from 'lucide-react';
import { DigitalPidDrawing } from '../../types';

interface DrawingExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  drawing: DigitalPidDrawing;
}

export const DrawingExportModal: React.FC<DrawingExportModalProps> = ({
  isOpen,
  onClose,
  drawing,
}) => {
  if (!isOpen) return null;

  const handleDownloadJson = () => {
    window.open(`/api/drawings/${drawing.id}/export/json`, '_blank');
  };

  const handleDownloadSvg = () => {
    window.open(`/api/drawings/${drawing.id}/export/svg`, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-slate-800 text-sm">Export Digital P&ID Drawing</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-200 text-slate-500 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-[10px] text-slate-500 font-semibold uppercase block">
              Active Drawing
            </span>
            <div className="font-bold text-slate-800 text-sm mt-0.5">
              {drawing.drawing_number} — {drawing.title} ({drawing.revision})
            </div>
            <div className="text-slate-500 text-[11px] mt-1 flex items-center gap-2">
              <span>Status: <strong className="text-slate-700 capitalize">{drawing.status}</strong></span>
              <span>•</span>
              <span>{drawing.elements.length} Symbols</span>
              <span>•</span>
              <span>{drawing.connectors.length} Connections</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            {/* JSON Export Card */}
            <div className="p-4 rounded-xl border border-slate-200 hover:border-blue-400 bg-white hover:bg-blue-50/30 transition-all flex flex-col justify-between group">
              <div>
                <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center mb-2.5">
                  <FileJson className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-slate-800 text-xs group-hover:text-blue-700">
                  Digital Drawing Schema (JSON)
                </h4>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Full structured definition with symbols, ports, orthogonal coordinates, waypoints, and chemical PSI bindings.
                </p>
              </div>
              <button
                onClick={handleDownloadJson}
                className="mt-4 w-full py-2 px-3 bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 font-semibold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Download JSON
              </button>
            </div>

            {/* SVG Export Card */}
            <div className="p-4 rounded-xl border border-slate-200 hover:border-blue-400 bg-white hover:bg-blue-50/30 transition-all flex flex-col justify-between group">
              <div>
                <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2.5">
                  <FileCode className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-slate-800 text-xs group-hover:text-emerald-700">
                  Standalone Vector Drawing (SVG)
                </h4>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Complete vector rendering including ASME/ISA symbols, flow arrows, standard Title Block, and Symbol Legend.
                </p>
              </div>
              <button
                onClick={handleDownloadSvg}
                className="mt-4 w-full py-2 px-3 bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-700 font-semibold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Download SVG
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
