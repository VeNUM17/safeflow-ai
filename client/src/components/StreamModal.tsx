import React, { useState, useEffect } from 'react';
import { X, Waves, ArrowRight, ShieldCheck, AlertCircle, Save, Info } from 'lucide-react';
import {
  ProcessStream,
  EquipmentTag,
  PipingLine,
  ChemicalRecord,
  FlowBasis,
  StreamPhase,
  FlowDirection,
  CreateStreamInput,
} from '../types';

interface StreamModalProps {
  isOpen: boolean;
  onClose: () => void;
  stream: ProcessStream | null; // null if creating
  projectId: string;
  equipment: EquipmentTag[];
  lines: PipingLine[];
  chemicals: ChemicalRecord[];
  onSave: (streamData: any) => Promise<void>;
  defaultSourceTag?: string;
  defaultDestTag?: string;
}

export const StreamModal: React.FC<StreamModalProps> = ({
  isOpen,
  onClose,
  stream,
  projectId,
  equipment,
  lines,
  chemicals,
  onSave,
  defaultSourceTag,
  defaultDestTag,
}) => {
  const isEditing = !!stream;

  const [streamNumber, setStreamNumber] = useState('');
  const [sourceTag, setSourceTag] = useState('');
  const [destTag, setDestTag] = useState('');
  const [connectedLineId, setConnectedLineId] = useState<string>('');
  const [materialDescription, setMaterialDescription] = useState('');
  const [assignedChemicalId, setAssignedChemicalId] = useState<string>('');
  const [flowDirection, setFlowDirection] = useState<FlowDirection>('forward');
  const [basis, setBasis] = useState<FlowBasis>('volumetric');
  const [unit, setUnit] = useState('m3/h');
  const [normalFlow, setNormalFlow] = useState<string>('');
  const [minFlow, setMinFlow] = useState<string>('');
  const [maxFlow, setMaxFlow] = useState<string>('');
  const [designFlow, setDesignFlow] = useState<string>('');
  const [actualFlow, setActualFlow] = useState<string>('');
  const [operatingPressure, setOperatingPressure] = useState<string>('');
  const [pressureUnit, setPressureUnit] = useState('bar(g)');
  const [operatingTemperature, setOperatingTemperature] = useState<string>('');
  const [temperatureUnit, setTemperatureUnit] = useState('°C');
  const [phase, setPhase] = useState<StreamPhase>('liquid');
  const [pipeDiameter, setPipeDiameter] = useState('');
  const [pipeSpec, setPipeSpec] = useState('');
  const [instrumentTags, setInstrumentTags] = useState('');
  const [notes, setNotes] = useState('');
  const [reviewer, setReviewer] = useState('Process Engineer');
  const [changeReason, setChangeReason] = useState('Manual process stream data entry');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (stream) {
      setStreamNumber(stream.stream_number || '');
      setSourceTag(stream.source_equipment_tag || '');
      setDestTag(stream.destination_equipment_tag || '');
      setConnectedLineId(stream.connected_line_id || '');
      setMaterialDescription(stream.material_description || '');
      setAssignedChemicalId(stream.assigned_chemical_id || '');
      setFlowDirection(stream.flow_direction || 'forward');
      setBasis(stream.flow_rates.basis || 'volumetric');
      setUnit(stream.flow_rates.unit || 'm3/h');
      setNormalFlow(stream.flow_rates.normal !== null && stream.flow_rates.normal !== undefined ? String(stream.flow_rates.normal) : '');
      setMinFlow(stream.flow_rates.min !== null && stream.flow_rates.min !== undefined ? String(stream.flow_rates.min) : '');
      setMaxFlow(stream.flow_rates.max !== null && stream.flow_rates.max !== undefined ? String(stream.flow_rates.max) : '');
      setDesignFlow(stream.flow_rates.design !== null && stream.flow_rates.design !== undefined ? String(stream.flow_rates.design) : '');
      setActualFlow(stream.flow_rates.actual !== null && stream.flow_rates.actual !== undefined ? String(stream.flow_rates.actual) : '');
      setOperatingPressure(stream.operating_pressure.value !== null && stream.operating_pressure.value !== undefined ? String(stream.operating_pressure.value) : '');
      setPressureUnit(stream.operating_pressure.unit || 'bar(g)');
      setOperatingTemperature(stream.operating_temperature.value !== null && stream.operating_temperature.value !== undefined ? String(stream.operating_temperature.value) : '');
      setTemperatureUnit(stream.operating_temperature.unit || '°C');
      setPhase(stream.phase || 'liquid');
      setPipeDiameter(stream.pipe_nominal_diameter || '');
      setPipeSpec(stream.pipe_spec || '');
      setInstrumentTags((stream.associated_instrument_tags || []).join(', '));
      setNotes(stream.notes || '');
      setChangeReason('Updated process stream data');
    } else {
      setStreamNumber(`STR-${Math.floor(100 + Math.random() * 900)}`);
      setSourceTag(defaultSourceTag || '');
      setDestTag(defaultDestTag || '');
      setConnectedLineId('');
      setMaterialDescription('Process Fluid');
      setAssignedChemicalId('');
      setFlowDirection('forward');
      setBasis('volumetric');
      setUnit('m3/h');
      setNormalFlow('');
      setMinFlow('');
      setMaxFlow('');
      setDesignFlow('');
      setActualFlow('');
      setOperatingPressure('');
      setPressureUnit('bar(g)');
      setOperatingTemperature('');
      setTemperatureUnit('°C');
      setPhase('liquid');
      setPipeDiameter('');
      setPipeSpec('');
      setInstrumentTags('');
      setNotes('');
      setChangeReason('Manual stream entry');
    }
    setError(null);
  }, [stream, isOpen, defaultSourceTag, defaultDestTag]);

  if (!isOpen) return null;

  // Auto-populate line attributes when a connected line is selected
  const handleLineSelection = (lineId: string) => {
    setConnectedLineId(lineId);
    if (!lineId) return;
    const line = lines.find((l) => l.id === lineId);
    if (line) {
      if (line.from_equipment && !sourceTag) setSourceTag(line.from_equipment);
      if (line.to_equipment && !destTag) setDestTag(line.to_equipment);
      if (line.size && !pipeDiameter) setPipeDiameter(line.size);
      if (line.material && !pipeSpec) setPipeSpec(line.material);
      if (line.assigned_chemical_id && !assignedChemicalId) setAssignedChemicalId(line.assigned_chemical_id);
      if (line.stream_label && !materialDescription) setMaterialDescription(line.stream_label);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceTag.trim() || !destTag.trim()) {
      setError('Both source equipment and destination equipment tags are required.');
      return;
    }

    setSaving(true);
    setError(null);

    const parsedNormal = normalFlow.trim() !== '' && !isNaN(Number(normalFlow)) ? Number(normalFlow) : null;
    const parsedMin = minFlow.trim() !== '' && !isNaN(Number(minFlow)) ? Number(minFlow) : null;
    const parsedMax = maxFlow.trim() !== '' && !isNaN(Number(maxFlow)) ? Number(maxFlow) : null;
    const parsedDesign = designFlow.trim() !== '' && !isNaN(Number(designFlow)) ? Number(designFlow) : null;
    const parsedActual = actualFlow.trim() !== '' && !isNaN(Number(actualFlow)) ? Number(actualFlow) : null;

    const parsedPressure = operatingPressure.trim() !== '' && !isNaN(Number(operatingPressure)) ? Number(operatingPressure) : null;
    const parsedTemp = operatingTemperature.trim() !== '' && !isNaN(Number(operatingTemperature)) ? Number(operatingTemperature) : null;

    const tagsArray = instrumentTags
      .split(',')
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t.length > 0);

    const streamData: Partial<CreateStreamInput> = {
      project_id: projectId,
      stream_number: streamNumber.trim() || `STR-${Date.now().toString(36).toUpperCase()}`,
      source_equipment_tag: sourceTag.trim().toUpperCase(),
      destination_equipment_tag: destTag.trim().toUpperCase(),
      connected_line_id: connectedLineId || null,
      line_number: lines.find((l) => l.id === connectedLineId)?.line_number || null,
      material_description: materialDescription.trim() || 'Process Stream Fluid',
      assigned_chemical_id: assignedChemicalId || null,
      flow_direction: flowDirection,
      flow_rates: {
        normal: parsedNormal,
        min: parsedMin,
        max: parsedMax,
        design: parsedDesign,
        actual: parsedActual,
        unit: unit.trim() || 'm3/h',
        basis: basis,
      },
      operating_pressure: {
        value: parsedPressure,
        unit: pressureUnit.trim() || 'bar(g)',
        status: parsedPressure !== null ? 'user_entered' : 'not_provided',
      },
      operating_temperature: {
        value: parsedTemp,
        unit: temperatureUnit.trim() || '°C',
        status: parsedTemp !== null ? 'user_entered' : 'not_provided',
      },
      phase: phase,
      pipe_nominal_diameter: pipeDiameter.trim() || null,
      pipe_spec: pipeSpec.trim() || null,
      associated_instrument_tags: tagsArray,
      notes: notes.trim() || null,
      data_origin: isEditing ? (stream?.data_origin || 'manual_entry') : 'manual_entry',
      verification_status: isEditing ? (stream?.verification_status || 'unverified') : 'unverified',
      reviewer: reviewer.trim() || 'Process Engineer',
    };

    try {
      await onSave(streamData);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save process stream');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-cyan-950/80 border border-cyan-500/30 rounded-xl text-cyan-400">
              <Waves className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100">
                {isEditing ? `Edit Process Stream: ${stream.stream_number}` : 'Manually Add Process Stream'}
              </h3>
              <p className="text-xs text-slate-400">
                Define numerical flow rates, operating conditions, metallurgy, and instrument linkages.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-5">
          {/* Stream Identity & Routing */}
          <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>Stream Identification & Connectivity</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Stream ID / Number *
                </label>
                <input
                  type="text"
                  value={streamNumber}
                  onChange={(e) => setStreamNumber(e.target.value)}
                  placeholder="e.g. STR-101"
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Source Equipment (From) *
                </label>
                <input
                  type="text"
                  value={sourceTag}
                  onChange={(e) => setSourceTag(e.target.value)}
                  placeholder="e.g. V-101"
                  list="equipment-source-list"
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono uppercase"
                />
                <datalist id="equipment-source-list">
                  {equipment.map((e) => (
                    <option key={e.id} value={e.tag}>
                      {e.tag} - {e.description}
                    </option>
                  ))}
                </datalist>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Destination Equipment (To) *
                </label>
                <input
                  type="text"
                  value={destTag}
                  onChange={(e) => setDestTag(e.target.value)}
                  placeholder="e.g. P-101A"
                  list="equipment-dest-list"
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono uppercase"
                />
                <datalist id="equipment-dest-list">
                  {equipment.map((e) => (
                    <option key={e.id} value={e.tag}>
                      {e.tag} - {e.description}
                    </option>
                  ))}
                </datalist>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Link to P&ID Piping Line (Optional)
                </label>
                <select
                  value={connectedLineId}
                  onChange={(e) => handleLineSelection(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                >
                  <option value="">-- No explicit line link --</option>
                  {lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.line_number} ({l.from_equipment} &rarr; {l.to_equipment})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Flow Direction
                </label>
                <select
                  value={flowDirection}
                  onChange={(e) => setFlowDirection(e.target.value as FlowDirection)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="forward">Forward (Source &rarr; Destination)</option>
                  <option value="reverse">Reverse (Destination &rarr; Source)</option>
                  <option value="bidirectional">Bidirectional (&harr;)</option>
                  <option value="unknown">Unknown Direction</option>
                </select>
              </div>
            </div>
          </div>

          {/* Chemical & Process Composition */}
          <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>Material & Chemical Characterization</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Material / Fluid Description
                </label>
                <input
                  type="text"
                  value={materialDescription}
                  onChange={(e) => setMaterialDescription(e.target.value)}
                  placeholder="e.g. Liquid Anhydrous Ammonia, High Pressure"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Assigned PSI Chemical Profile
                </label>
                <select
                  value={assignedChemicalId}
                  onChange={(e) => setAssignedChemicalId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="">-- No chemical profile linked --</option>
                  {chemicals.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.chemical_name?.user_value || c.chemical_name?.value || c.id} {c.cas_number?.value ? `(${c.cas_number.value})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Fluid Phase
                </label>
                <select
                  value={phase}
                  onChange={(e) => setPhase(e.target.value as StreamPhase)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="liquid">Liquid</option>
                  <option value="gas">Gas</option>
                  <option value="vapor">Vapor</option>
                  <option value="solid">Solid / Slurry</option>
                  <option value="multiphase">Multiphase</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Pipe Nominal Diameter
                </label>
                <input
                  type="text"
                  value={pipeDiameter}
                  onChange={(e) => setPipeDiameter(e.target.value)}
                  placeholder='e.g. 3", DN80'
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Pipe Material / Spec
                </label>
                <input
                  type="text"
                  value={pipeSpec}
                  onChange={(e) => setPipeSpec(e.target.value)}
                  placeholder="e.g. ASTM A333 Gr 6, CS"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Numerical Flow Rates */}
          <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>Numerical Flow-Rate Baseline</span>
              </div>
              <div className="text-[11px] text-slate-400 italic">
                Leave blank if value is unknown (do not enter 0 for unmeasured data)
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-2 border-b border-slate-800/80">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Flow Rate Basis
                </label>
                <select
                  value={basis}
                  onChange={(e) => setBasis(e.target.value as FlowBasis)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="volumetric">Volumetric Flow</option>
                  <option value="mass">Mass Flow</option>
                  <option value="molar">Molar Flow</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Flow Unit
                </label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                >
                  <optgroup label="Volumetric">
                    <option value="m3/h">m3/h</option>
                    <option value="gpm">gpm</option>
                    <option value="l/min">l/min</option>
                    <option value="scfh">scfh (Standard ft3/h)</option>
                    <option value="Nm3/h">Nm3/h</option>
                  </optgroup>
                  <optgroup label="Mass">
                    <option value="kg/h">kg/h</option>
                    <option value="kg/s">kg/s</option>
                    <option value="lb/h">lb/h</option>
                    <option value="t/h">t/h (Metric ton/h)</option>
                  </optgroup>
                  <optgroup label="Molar">
                    <option value="kmol/h">kmol/h</option>
                    <option value="lbmol/h">lbmol/h</option>
                  </optgroup>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-cyan-300 block mb-1">
                  Normal Flow
                </label>
                <input
                  type="number"
                  step="any"
                  value={normalFlow}
                  onChange={(e) => setNormalFlow(e.target.value)}
                  placeholder="e.g. 25.0"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Minimum Flow
                </label>
                <input
                  type="number"
                  step="any"
                  value={minFlow}
                  onChange={(e) => setMinFlow(e.target.value)}
                  placeholder="e.g. 8.0"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Maximum Flow
                </label>
                <input
                  type="number"
                  step="any"
                  value={maxFlow}
                  onChange={(e) => setMaxFlow(e.target.value)}
                  placeholder="e.g. 35.0"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Design Flow
                </label>
                <input
                  type="number"
                  step="any"
                  value={designFlow}
                  onChange={(e) => setDesignFlow(e.target.value)}
                  placeholder="e.g. 40.0"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Actual / Live Flow
                </label>
                <input
                  type="number"
                  step="any"
                  value={actualFlow}
                  onChange={(e) => setActualFlow(e.target.value)}
                  placeholder="e.g. 24.8"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Operating Conditions & Instrumentation */}
          <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>Operating Conditions & Instrumentation</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Operating Pressure
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={operatingPressure}
                    onChange={(e) => setOperatingPressure(e.target.value)}
                    placeholder="e.g. 13.5"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
                <div className="w-24">
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Unit
                  </label>
                  <input
                    type="text"
                    value={pressureUnit}
                    onChange={(e) => setPressureUnit(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Operating Temperature
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={operatingTemperature}
                    onChange={(e) => setOperatingTemperature(e.target.value)}
                    placeholder="e.g. -10.0"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
                <div className="w-24">
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Unit
                  </label>
                  <input
                    type="text"
                    value={temperatureUnit}
                    onChange={(e) => setTemperatureUnit(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                Associated Flow Instrument Tags (Comma-separated)
              </label>
              <input
                type="text"
                value={instrumentTags}
                onChange={(e) => setInstrumentTags(e.target.value)}
                placeholder="e.g. FIT-101, FIC-101, FCV-101, FAL-101, FE-101"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono uppercase"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Recognized ISA tags: FI (Indicator), FT (Transmitter), FIC (Indicating Controller), FCV (Control Valve), FE (Element), FO (Orifice).
              </p>
            </div>
          </div>

          {/* Governance & Audit Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                Reviewer / Engineer Name
              </label>
              <input
                type="text"
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                Change Reason
              </label>
              <input
                type="text"
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-300 block mb-1">
              Engineering Notes / Source Evidence
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Normal flow rate obtained from Heat & Material Balance Rev 2, Table 4."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Process Stream'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
