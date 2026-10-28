import React, { useState, useRef } from 'react';
import {
  Upload,
  X,
  FileText,
  AlertCircle,
  CheckCircle2,
  FileCode,
  Layers,
  Sparkles,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onUploadSuccess: () => Promise<void>;
}

export const DocumentUploadModal: React.FC<Props> = ({
  isOpen,
  onClose,
  projectId,
  onUploadSuccess,
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [docTypeHint, setDocTypeHint] = useState<'auto' | 'sds' | 'pid'>('auto');
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    validateAndAddFiles(files);
  };

  const validateAndAddFiles = (newFiles: File[]) => {
    setErrorMsg(null);
    const valid: File[] = [];
    const maxSizeBytes = 50 * 1024 * 1024; // 50MB

    for (const f of newFiles) {
      if (f.size > maxSizeBytes) {
        setErrorMsg(`File "${f.name}" exceeds the 50MB file size limit.`);
        return;
      }
      valid.push(f);
    }

    setSelectedFiles((prev) => [...prev, ...valid]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      validateAndAddFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleRemoveFile = (idx: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    if (!projectId) {
      setErrorMsg('No active project selected. Please select or create a project first.');
      return;
    }

    setIsUploading(true);
    setErrorMsg(null);
    setUploadProgress('Extracting text and running OSHA 1910.119(d)(1) analysis...');

    try {
      const formData = new FormData();
      formData.append('doc_type', docTypeHint);
      for (const file of selectedFiles) {
        formData.append('files', file);
      }

      const res = await fetch(`/api/projects/${projectId}/upload`, {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to upload and extract documents');
      }

      await onUploadSuccess();
      onClose();
      setSelectedFiles([]);
    } catch (err: any) {
      if (err.name === 'TypeError' && err.message?.toLowerCase().includes('fetch')) {
        setErrorMsg('Connection failed: Cannot reach the backend API at http://localhost:5001. Please verify the server is running.');
      } else {
        setErrorMsg(err.message || 'Upload error');
      }
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-600/20 text-cyan-400 border border-cyan-500/30">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                Upload SDS or P&ID Documents
              </h2>
              <p className="text-xs text-slate-400">
                Automated ingestion with text extraction, GHS classification, and diagram parsing.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isUploading}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-xs">
          
          {/* Document Classification Selector */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1.5">
              Document Category:
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'auto', label: 'Auto-Detect', desc: 'Detect by format & content' },
                { id: 'sds', label: 'Safety Data Sheet (SDS)', desc: 'Extract OSHA 7 PSI fields' },
                { id: 'pid', label: 'P&ID Diagram', desc: 'Extract equipment & piping' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDocTypeHint(opt.id as any)}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    docTypeHint === opt.id
                      ? 'bg-cyan-950/40 border-cyan-500 text-slate-100 ring-1 ring-cyan-500/30'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  <div className="font-semibold text-xs">{opt.label}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Drag & Drop Area */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-700 hover:border-cyan-500 bg-slate-950/60 hover:bg-slate-950 p-6 rounded-2xl text-center cursor-pointer transition-all space-y-2"
          >
            <Upload className="w-8 h-8 text-cyan-400 mx-auto" />
            <div className="font-semibold text-slate-200">
              Drop files here or click to browse
            </div>
            <p className="text-[11px] text-slate-400">
              Supports PDF (vector or text) for SDS. Supports PDF, PNG, JPG, JPEG, SVG for P&IDs (Max 50MB).
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.svg,.webp"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Selected Files List */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <div className="font-semibold text-slate-300">
                Selected Files ({selectedFiles.length}):
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {selectedFiles.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800 text-[11px]"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="font-mono text-slate-200 truncate">{f.name}</span>
                      <span className="text-slate-400 font-mono">
                        ({(f.size / 1024).toFixed(0)} KB)
                      </span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFile(i);
                      }}
                      className="text-slate-500 hover:text-rose-400 p-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status / Errors */}
          {errorMsg && (
            <div className="p-3 bg-rose-950/50 border border-rose-800 text-rose-300 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {isUploading && (
            <div className="p-3 bg-cyan-950/40 border border-cyan-800 text-cyan-300 rounded-lg flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
              <span>{uploadProgress || 'Processing document extraction...'}</span>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <div className="text-[11px] text-slate-400">
            Files stored securely on server with validation.
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isUploading}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={isUploading || selectedFiles.length === 0}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white shadow transition-all"
            >
              {isUploading ? 'Extracting...' : 'Upload & Process'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
