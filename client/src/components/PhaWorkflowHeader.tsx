import React from 'react';
import {
  Upload,
  Cpu,
  Edit3,
  CheckCircle,
  FileCheck,
  Network,
  ClipboardList,
  ShieldCheck,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { PhaWorkflowStage } from '../types';

interface PhaWorkflowHeaderProps {
  currentStage: PhaWorkflowStage;
  graphApproved: boolean;
  phaApprovedCount: number;
  totalPhaNodes: number;
  hazopReady: boolean;
  onSelectStage?: (stage: PhaWorkflowStage) => void;
}

const STAGES: {
  id: PhaWorkflowStage;
  label: string;
  shortLabel: string;
  icon: React.FC<{ className?: string }>;
  description: string;
}[] = [
  {
    id: 'upload',
    label: '1. P&ID Upload',
    shortLabel: 'Upload',
    icon: Upload,
    description: 'Upload P&ID and SDS documentation',
  },
  {
    id: 'provisional_graph',
    label: '2. Provisional Graph',
    shortLabel: 'Provisional',
    icon: Cpu,
    description: 'Automated ML extraction & candidate connections',
  },
  {
    id: 'graph_review',
    label: '3. Engineering Review & Edit',
    shortLabel: 'P&ID Edit',
    icon: Edit3,
    description: 'Human engineering review and manual P&ID graph corrections',
  },
  {
    id: 'validation',
    label: '4. Graph Validation',
    shortLabel: 'Validation',
    icon: CheckCircle,
    description: 'Topological and engineering consistency checks',
  },
  {
    id: 'graph_approval',
    label: '5. Graph Sign-Off',
    shortLabel: 'Approval Gate',
    icon: FileCheck,
    description: 'Lead process safety engineer formal sign-off',
  },
  {
    id: 'node_segmentation',
    label: '6. Node Segmentation',
    shortLabel: 'Segmentation',
    icon: Network,
    description: 'Partition process graph into candidate PHA study nodes',
  },
  {
    id: 'node_review',
    label: '7. Study Node Review',
    shortLabel: 'Node Review',
    icon: ClipboardList,
    description: 'Define boundaries, operating limits, and process intent',
  },
  {
    id: 'hazop_readiness',
    label: '8. HAZOP Readiness',
    shortLabel: 'HAZOP Ready',
    icon: ShieldCheck,
    description: 'Verify prerequisites before conducting deviation analysis',
  },
];

const STAGE_ORDER: PhaWorkflowStage[] = [
  'upload',
  'provisional_graph',
  'graph_review',
  'validation',
  'graph_approval',
  'node_segmentation',
  'node_review',
  'hazop_readiness',
];

export const PhaWorkflowHeader: React.FC<PhaWorkflowHeaderProps> = ({
  currentStage,
  graphApproved,
  phaApprovedCount,
  totalPhaNodes,
  hazopReady,
  onSelectStage,
}) => {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);

  const getStageStatus = (stageId: PhaWorkflowStage, idx: number) => {
    if (stageId === 'graph_approval') {
      return graphApproved ? 'completed' : idx === currentIndex ? 'active' : 'pending';
    }
    if (stageId === 'hazop_readiness') {
      return hazopReady ? 'completed' : idx === currentIndex ? 'active' : 'pending';
    }
    if (idx < currentIndex) return 'completed';
    if (idx === currentIndex) return 'active';
    return 'pending';
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-md">
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            PHA Workflow Pipeline:
          </span>
          <span className="text-xs font-bold text-cyan-400">
            Stage {currentIndex + 1} of 8 — {STAGES.find((s) => s.id === currentStage)?.label}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {graphApproved ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
              <CheckCircle className="w-3 h-3" /> Graph Approved
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-500/40 text-amber-300">
              <AlertTriangle className="w-3 h-3" /> Unapproved Topology
            </span>
          )}

          {hazopReady ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-bold">
              <ShieldCheck className="w-3 h-3" /> HAZOP Ready
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400">
              Nodes: {phaApprovedCount}/{totalPhaNodes} Approved
            </span>
          )}
        </div>
      </div>

      {/* Horizontal Flow Steps */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5">
        {STAGES.map((s, idx) => {
          const status = getStageStatus(s.id, idx);
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              onClick={() => onSelectStage?.(s.id)}
              className={`flex items-center gap-1.5 p-2 rounded-lg text-left transition-all border text-xs ${
                status === 'completed'
                  ? 'bg-slate-950 border-emerald-500/30 text-emerald-300 hover:bg-slate-800'
                  : status === 'active'
                  ? 'bg-cyan-950/60 border-cyan-500 text-cyan-200 ring-1 ring-cyan-500 shadow-sm'
                  : 'bg-slate-950/60 border-slate-800/80 text-slate-500 hover:text-slate-300'
              }`}
            >
              <div
                className={`p-1 rounded ${
                  status === 'completed'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : status === 'active'
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'bg-slate-800 text-slate-500'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="overflow-hidden">
                <div className="font-semibold text-[11px] truncate leading-tight">
                  {s.shortLabel}
                </div>
                <div className="text-[9px] text-slate-400 truncate hidden sm:block">
                  {status === 'completed' ? 'Completed' : status === 'active' ? 'Current' : 'Upcoming'}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
