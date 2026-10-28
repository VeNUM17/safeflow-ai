import React, { useState } from 'react';
import {
  FileText,
  FileWarning,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Trash2,
} from 'lucide-react';
import { DocumentRecord } from '../types';

interface Props {
  documents: DocumentRecord[];
  onOpenUploadModal: () => void;
  onDeleteDocument: (id: string) => Promise<void>;
}

export const DocumentsView: React.FC<Props> = ({
  documents,
  onOpenUploadModal,
  onDeleteDocument,
}) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (doc: DocumentRecord) => {
    const confirmMsg = `Are you sure you want to delete "${doc.name}"?\n\nThis will permanently remove the document and any PSI chemical records or provisional equipment tags extracted from it.`;
    if (!window.confirm(confirmMsg)) return;

    setDeletingId(doc.id);
    try {
      await onDeleteDocument(doc.id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            Uploaded Project Documents ({documents.length})
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Primary Safety Data Sheets (SDSs) and Piping & Instrumentation Diagrams (P&IDs) with text readability and removal actions.
          </p>
        </div>

        <button
          onClick={onOpenUploadModal}
          className="flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow transition-all"
        >
          <Upload className="w-3.5 h-3.5" />
          Upload More Files
        </button>
      </div>

      {documents.length === 0 ? (
        <div className="bg-slate-900/50 p-12 rounded-2xl border border-slate-800 text-center text-slate-400 text-xs space-y-2">
          <FileText className="w-10 h-10 mx-auto text-slate-600" />
          <p>No documents uploaded yet. Add SDS PDFs or P&ID diagrams to begin.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc) => {
            const isReadable = doc.is_readable;
            const isSds = doc.doc_type === 'sds';
            const isDeleting = deletingId === doc.id;

            return (
              <div
                key={doc.id}
                className={`bg-slate-900 rounded-xl border p-4 flex flex-col justify-between transition-all ${
                  !isReadable
                    ? 'border-rose-700/60 bg-rose-950/10'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="space-y-3">
                  
                  {/* Top line: Type, Readability, and Delete button */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase border ${
                        isSds
                          ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                          : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                      }`}
                    >
                      {doc.doc_type.toUpperCase()}
                    </span>

                    <div className="flex items-center gap-2">
                      {isReadable ? (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Readable
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-rose-400 animate-pulse">
                          <FileWarning className="w-3.5 h-3.5" />
                          Unreadable
                        </span>
                      )}

                      <button
                        onClick={() => handleDelete(doc)}
                        disabled={isDeleting}
                        className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-slate-800 transition-colors ml-1"
                        title="Delete this uploaded file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* File title */}
                  <div>
                    <h3 className="font-bold text-slate-200 text-xs font-mono truncate" title={doc.name}>
                      {doc.name}
                    </h3>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                      <span>{(doc.size_bytes / 1024).toFixed(0)} KB</span>
                      <span>•</span>
                      <span>{doc.pages_count} {doc.pages_count === 1 ? 'Page' : 'Pages'}</span>
                    </div>
                  </div>

                  {/* Unreadable warning banner */}
                  {!isReadable && (
                    <div className="bg-rose-950/40 p-2.5 rounded-lg border border-rose-800/40 text-[11px] text-rose-300 space-y-1">
                      <div className="font-semibold text-rose-400 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Extraction Incomplete Warning:
                      </div>
                      <p className="leading-relaxed">
                        {doc.unreadable_reason ||
                          'Virtually no extractable digital text detected. File appears to be a scanned drawing or flattened raster bitmap.'}
                      </p>
                    </div>
                  )}

                  {/* Chemical associations */}
                  {doc.chemical_ids.length > 0 && (
                    <div className="text-[11px] text-slate-400">
                      <span className="font-semibold text-slate-300">Extracted Chemical IDs: </span>
                      <span className="font-mono text-cyan-400">{doc.chemical_ids.join(', ')}</span>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="mt-4 pt-3 border-t border-slate-800 text-[10px] text-slate-500 font-mono flex items-center justify-between">
                  <span>Uploaded: {new Date(doc.upload_timestamp).toLocaleDateString()}</span>
                  <button
                    onClick={() => handleDelete(doc)}
                    disabled={isDeleting}
                    className="text-rose-400/80 hover:text-rose-300 flex items-center gap-1 text-[11px] transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
