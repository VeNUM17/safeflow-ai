import React, { useState, useEffect } from 'react';
import {
  Grid,
  ShieldAlert,
  Info,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Save,
  Layers,
} from 'lucide-react';
import { HazopRiskMatrixConfig } from '../../types';

interface RiskMatrixConfigViewProps {
  projectId: string;
}

export const RiskMatrixConfigView: React.FC<RiskMatrixConfigViewProps> = ({ projectId }) => {
  const [matrix, setMatrix] = useState<HazopRiskMatrixConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{
    severity: number;
    likelihood: number;
    risk_level: 'Low' | 'Medium' | 'High' | 'Critical';
    acceptance_action: string;
  } | null>(null);

  const fetchMatrix = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/hazop/matrix`);
      const data = await res.json();
      if (data.success && data.data) {
        setMatrix(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch risk matrix config:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatrix();
  }, [projectId]);

  const getCellColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'Critical':
        return 'bg-rose-950/80 text-rose-300 border-rose-600/50 hover:bg-rose-900/90';
      case 'High':
        return 'bg-amber-950/80 text-amber-300 border-amber-600/50 hover:bg-amber-900/90';
      case 'Medium':
        return 'bg-sky-950/80 text-sky-300 border-sky-600/50 hover:bg-sky-900/90';
      case 'Low':
      default:
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-600/50 hover:bg-emerald-900/90';
    }
  };

  if (loading || !matrix) {
    return (
      <div className="p-8 text-center text-slate-400 bg-slate-900/60 rounded-xl border border-slate-800">
        <div className="inline-block animate-spin w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full mb-2"></div>
        <p className="text-xs">Loading IEC 61882 Risk Matrix Configuration...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-900/80 rounded-xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Grid className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-slate-100 text-sm">IEC 61882 / CCPS 5×5 Risk Ranking Matrix</h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950 text-cyan-400 border border-cyan-800">
              Rev {matrix.version}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Standard Reference: <span className="text-slate-300 font-medium">{matrix.standard_reference}</span>
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-500"></span>
            <span className="text-slate-300">Low (Broadly Acceptable)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-sky-500"></span>
            <span className="text-slate-300">Medium (ALARP)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-500"></span>
            <span className="text-slate-300">High (LOPA Req.)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-rose-500"></span>
            <span className="text-slate-300">Critical (Intolerable)</span>
          </div>
        </div>
      </div>

      {/* Interactive 5x5 Matrix Grid */}
      <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-4">
        <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
          Severity (Consequence Impact) vs. Likelihood (Frequency per Year)
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="p-3 text-left text-xs font-bold text-slate-400 border border-slate-800 bg-slate-900/90 w-48">
                  Severity \ Likelihood
                </th>
                {matrix.likelihood_levels.map((lh) => (
                  <th
                    key={lh.level}
                    className="p-3 text-center text-xs font-bold text-slate-300 border border-slate-800 bg-slate-900/90 min-w-[130px]"
                  >
                    <div>L{lh.level} - {lh.label}</div>
                    <div className="text-[10px] font-mono text-slate-400 mt-0.5">{lh.frequency_per_year}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...matrix.severity_levels].reverse().map((sev) => (
                <tr key={sev.level}>
                  <td className="p-3 text-xs border border-slate-800 bg-slate-900/60 font-medium text-slate-200">
                    <div className="font-bold text-slate-100">S{sev.level} - {sev.label}</div>
                    <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{sev.safety_impact}</div>
                  </td>
                  {matrix.likelihood_levels.map((lh) => {
                    const cell = matrix.cells.find(
                      (c) => c.severity === sev.level && c.likelihood === lh.level
                    );
                    const isSelected =
                      selectedCell?.severity === sev.level && selectedCell?.likelihood === lh.level;
                    const riskLevel = cell?.risk_level || 'Low';
                    return (
                      <td
                        key={lh.level}
                        onClick={() =>
                          setSelectedCell(
                            cell || {
                              severity: sev.level,
                              likelihood: lh.level,
                              risk_level: 'Low',
                              acceptance_action: '',
                            }
                          )
                        }
                        className={`p-3 text-center border cursor-pointer transition-all ${getCellColor(
                          riskLevel
                        )} ${isSelected ? 'ring-2 ring-white z-10 scale-[1.02]' : ''}`}
                      >
                        <div className="font-bold text-sm">{riskLevel}</div>
                        <div className="text-[10px] font-mono opacity-80 mt-0.5">
                          S{sev.level} × L{lh.level}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Cell Action Criterion Inspector */}
      {selectedCell && (
        <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-700 flex items-start gap-4 animate-in fade-in">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              selectedCell.risk_level === 'Critical'
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                : selectedCell.risk_level === 'High'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                : selectedCell.risk_level === 'Medium'
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
            }`}
          >
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-slate-100">
                Severity {selectedCell.severity} × Likelihood {selectedCell.likelihood} Rating:{' '}
                <span
                  className={
                    selectedCell.risk_level === 'Critical'
                      ? 'text-rose-400'
                      : selectedCell.risk_level === 'High'
                      ? 'text-amber-400'
                      : selectedCell.risk_level === 'Medium'
                      ? 'text-sky-400'
                      : 'text-emerald-400'
                  }
                >
                  {selectedCell.risk_level}
                </span>
              </h4>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              <strong className="text-slate-100">Mandatory Safety Acceptance Criteria:</strong>{' '}
              {selectedCell.acceptance_action}
            </p>
          </div>
        </div>
      )}

      {/* Severity & Likelihood Definitions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Severity Scale */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            Severity Classification (S1 to S5)
          </h4>
          <div className="space-y-2 text-xs">
            {matrix.severity_levels.map((sev) => (
              <div key={sev.level} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">
                    S{sev.level}: {sev.label}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">{sev.economic_impact}</span>
                </div>
                <div className="text-[11px] text-slate-300 mt-1">
                  <span className="text-cyan-400">Personnel:</span> {sev.safety_impact}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  <span className="text-emerald-400">Environment:</span> {sev.environmental_impact}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Likelihood Scale */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Info className="w-4 h-4 text-cyan-400" />
            Likelihood Classification (L1 to L5)
          </h4>
          <div className="space-y-2 text-xs">
            {matrix.likelihood_levels.map((lh) => (
              <div key={lh.level} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">
                    L{lh.level}: {lh.label}
                  </span>
                  <span className="text-[10px] text-cyan-400 font-mono bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800">
                    {lh.frequency_per_year}
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 mt-1">{lh.description}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
