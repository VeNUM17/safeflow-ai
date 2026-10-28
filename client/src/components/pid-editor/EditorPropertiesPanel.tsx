import React from 'react';
import {
  Settings,
  Tag,
  FlaskConical,
  FileText,
  Compass,
  ArrowRight,
  Info,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
} from 'lucide-react';
import {
  DrawingElement,
  DrawingConnector,
  DrawingElementType,
  ChemicalRecord,
  DigitalPidDrawing,
  EquipmentStatus,
  FlowDirection,
  FunctionalType,
} from '../../types';

interface EditorPropertiesPanelProps {
  drawing: DigitalPidDrawing;
  selectedElement: DrawingElement | null;
  selectedConnector: DrawingConnector | null;
  chemicals: ChemicalRecord[];
  allElements: DrawingElement[];
  onUpdateElement: (updated: DrawingElement) => void;
  onUpdateConnector: (updated: DrawingConnector) => void;
  onUpdateDrawingMeta: (meta: { title?: string; drawing_number?: string }) => void;
}

export const EditorPropertiesPanel: React.FC<EditorPropertiesPanelProps> = ({
  drawing,
  selectedElement,
  selectedConnector,
  chemicals,
  allElements,
  onUpdateElement,
  onUpdateConnector,
  onUpdateDrawingMeta,
}) => {
  // If an element is selected
  if (selectedElement) {
    const assignedChem = chemicals.find(
      (c) => c.id === selectedElement.assigned_chemical_id
    );

    return (
      <div className="w-80 flex flex-col bg-white border-l border-slate-200 h-full overflow-y-auto select-none shadow-sm text-xs">
        {/* Header */}
        <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-slate-800">
            <Settings className="w-4 h-4 text-blue-600" />
            <span>Equipment Properties</span>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${
              selectedElement.status === 'confirmed'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            {selectedElement.status.toUpperCase()}
          </span>
        </div>

        <div className="p-4 space-y-4">
          {/* Engineering Tag */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
              Engineering Tag
            </label>
            <div className="relative">
              <Tag className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={selectedElement.tag}
                onChange={(e) =>
                  onUpdateElement({
                    ...selectedElement,
                    tag: e.target.value.toUpperCase(),
                  })
                }
                className="w-full pl-8 pr-3 py-1.5 font-mono font-bold text-slate-800 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Internal ID: <span className="font-mono">{selectedElement.id}</span> (Stable)
            </p>
          </div>

          {/* Equipment Type */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
              Equipment Type
            </label>
            <select
              value={selectedElement.type}
              onChange={(e) =>
                onUpdateElement({
                  ...selectedElement,
                  type: e.target.value as DrawingElementType,
                })
              }
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 font-medium"
            >
              <option value="vessel">Vertical Pressure Vessel</option>
              <option value="tank">Atmospheric Storage Tank</option>
              <option value="mixing_tank">Agitated Mixing Tank</option>
              <option value="reactor">Chemical Reactor</option>
              <option value="pump">Centrifugal Pump</option>
              <option value="compressor">Gas Compressor</option>
              <option value="heat_exchanger">Heat Exchanger</option>
              <option value="manual_valve">Manual Isolation Valve</option>
              <option value="control_valve">Control Valve</option>
              <option value="check_valve">Check Valve</option>
              <option value="relief_valve">Pressure Safety Valve (PSV)</option>
              <option value="junction">Process Tie-in Junction</option>
              <option value="instrument">ISA-5.1 Instrument Balloon</option>
              <option value="offpage_connector">Off-Page Connector</option>
              <option value="filter">Filter / Strainer</option>
              <option value="separator">Phase Separator</option>
              <option value="other">Other Equipment</option>
            </select>
          </div>

          {/* Description / Service */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
              Service / Description
            </label>
            <textarea
              rows={2}
              value={selectedElement.description || ''}
              onChange={(e) =>
                onUpdateElement({
                  ...selectedElement,
                  description: e.target.value,
                })
              }
              placeholder="e.g. Ammonia High-Pressure Receiver Drum"
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Review Status */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
              Engineering Review Status
            </label>
            <select
              value={selectedElement.status}
              onChange={(e) =>
                onUpdateElement({
                  ...selectedElement,
                  status: e.target.value as EquipmentStatus,
                })
              }
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 font-medium"
            >
              <option value="provisional">Provisional (Unconfirmed)</option>
              <option value="human_reviewed">Human Reviewed</option>
              <option value="confirmed">Confirmed Engineering Baseline</option>
              <option value="rejected">Rejected / Out of Service</option>
            </select>
          </div>

          {/* Chemical PSI Profile Linkage */}
          <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-blue-900">
              <FlaskConical className="w-3.5 h-3.5 text-blue-600" />
              <span>Assigned Chemical PSI</span>
            </div>
            <select
              value={selectedElement.assigned_chemical_id || ''}
              onChange={(e) =>
                onUpdateElement({
                  ...selectedElement,
                  assigned_chemical_id: e.target.value || null,
                })
              }
              className="w-full px-2 py-1.5 bg-white border border-blue-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500"
            >
              <option value="">-- No chemical assigned --</option>
              {chemicals.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.chemical_name.user_value || c.chemical_name.value} (CAS: {c.cas_number.value})
                </option>
              ))}
            </select>

            {assignedChem && (
              <div className="text-[10px] text-slate-600 space-y-1 pt-1 border-t border-blue-200">
                <div className="flex justify-between">
                  <span className="text-slate-500">PEL:</span>
                  <span className="font-mono font-medium">
                    {assignedChem.psi_parameters.permissible_exposure_limits.user_value ||
                      assignedChem.psi_parameters.permissible_exposure_limits.value ||
                      'Not established'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Reactivity:</span>
                  <span className="truncate max-w-[150px]">
                    {assignedChem.psi_parameters.reactivity_data.value || 'Stable'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Source Drawing Evidence */}
          {selectedElement.source_evidence && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
              <div className="flex items-center gap-1 font-semibold text-slate-700 text-[11px]">
                <FileText className="w-3 h-3 text-slate-500" />
                <span>Source Drawing Evidence</span>
              </div>
              <p className="text-[10px] text-slate-600">
                <span className="font-medium">Doc:</span> {selectedElement.source_evidence.document} (P.{selectedElement.source_evidence.page})
              </p>
              <p className="text-[10px] italic text-slate-500 bg-white p-1.5 rounded border border-slate-200">
                &ldquo;{selectedElement.source_evidence.snippet}&rdquo;
              </p>
            </div>
          )}

          {/* Equipment Specifications & Design Limits */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 font-semibold text-slate-800 text-[11px]">
                <Settings className="w-3.5 h-3.5 text-blue-600" />
                <span>Equipment Specifications</span>
              </div>
              <span className="text-[9px] font-mono text-slate-400">OSHA 1910.119(d)(3)</span>
            </div>

            <div className="space-y-1.5 text-[11px]">
              {/* Material */}
              <div className="flex items-center justify-between p-1.5 bg-white rounded border border-slate-200">
                <span className="text-slate-600">Material:</span>
                <span className="font-mono font-medium text-slate-800">
                  {selectedElement.specifications?.material_of_construction?.value || (
                    <span className="text-rose-600 font-bold text-[10px]">NOT PROVIDED</span>
                  )}
                </span>
              </div>

              {/* Design Pressure */}
              <div className="flex items-center justify-between p-1.5 bg-white rounded border border-slate-200">
                <span className="text-slate-600">Design Press:</span>
                <span className="font-mono font-medium text-slate-800">
                  {selectedElement.specifications?.design_pressure?.value !== null &&
                  selectedElement.specifications?.design_pressure?.value !== undefined ? (
                    `${selectedElement.specifications.design_pressure.value} ${selectedElement.specifications.design_pressure.unit || 'psig'}`
                  ) : (
                    <span className="text-rose-600 font-bold text-[10px]">NOT PROVIDED</span>
                  )}
                </span>
              </div>

              {/* Design Temperature */}
              <div className="flex items-center justify-between p-1.5 bg-white rounded border border-slate-200">
                <span className="text-slate-600">Design Temp:</span>
                <span className="font-mono font-medium text-slate-800">
                  {selectedElement.specifications?.design_temperature?.value !== null &&
                  selectedElement.specifications?.design_temperature?.value !== undefined ? (
                    `${selectedElement.specifications.design_temperature.value} ${selectedElement.specifications.design_temperature.unit || '°F'}`
                  ) : (
                    <span className="text-rose-600 font-bold text-[10px]">NOT PROVIDED</span>
                  )}
                </span>
              </div>

              {/* Capacity */}
              <div className="flex items-center justify-between p-1.5 bg-white rounded border border-slate-200">
                <span className="text-slate-600">Capacity:</span>
                <span className="font-mono font-medium text-slate-800">
                  {selectedElement.specifications?.capacity?.value !== null &&
                  selectedElement.specifications?.capacity?.value !== undefined ? (
                    `${selectedElement.specifications.capacity.value} ${selectedElement.specifications.capacity.unit || 'gallons'}`
                  ) : (
                    <span className="text-rose-600 font-bold text-[10px]">NOT PROVIDED</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Engineering Notes */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
              Engineering Notes
            </label>
            <textarea
              rows={2}
              value={selectedElement.notes || ''}
              onChange={(e) =>
                onUpdateElement({
                  ...selectedElement,
                  notes: e.target.value,
                })
              }
              placeholder="e.g. Design pressure 250 psig @ 150°F"
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>
    );
  }

  // If a connector/line is selected
  if (selectedConnector) {
    const fromEl = allElements.find((e) => e.id === selectedConnector.from_element_id);
    const toEl = allElements.find((e) => e.id === selectedConnector.to_element_id);
    const assignedChem = chemicals.find(
      (c) => c.id === selectedConnector.assigned_chemical_id
    );

    return (
      <div className="w-80 flex flex-col bg-white border-l border-slate-200 h-full overflow-y-auto select-none shadow-sm text-xs">
        {/* Header */}
        <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-slate-800">
            <Compass className="w-4 h-4 text-blue-600" />
            <span>Piping / Line Properties</span>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${
              selectedConnector.functional_type === 'signal_line'
                ? 'bg-sky-100 text-sky-800'
                : 'bg-indigo-100 text-indigo-800'
            }`}
          >
            {selectedConnector.functional_type.replace('_', ' ').toUpperCase()}
          </span>
        </div>

        <div className="p-4 space-y-4">
          {/* Line Number */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
              Line Identifier / Tag
            </label>
            <input
              type="text"
              value={selectedConnector.line_number}
              onChange={(e) =>
                onUpdateConnector({
                  ...selectedConnector,
                  line_number: e.target.value,
                })
              }
              className="w-full px-3 py-1.5 font-mono font-bold text-slate-800 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Connected Equipment */}
          <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">
              Topological Connectivity
            </span>
            <div className="flex items-center justify-between font-mono font-bold text-slate-800">
              <span className="px-2 py-1 bg-white border rounded">{fromEl?.tag || 'Port'}</span>
              <ArrowRight className="w-4 h-4 text-slate-400" />
              <span className="px-2 py-1 bg-white border rounded">{toEl?.tag || 'Port'}</span>
            </div>
          </div>

          {/* Functional Type */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
              Functional Type
            </label>
            <select
              value={selectedConnector.functional_type}
              onChange={(e) =>
                onUpdateConnector({
                  ...selectedConnector,
                  functional_type: e.target.value as FunctionalType,
                })
              }
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 font-medium"
            >
              <option value="piping_line">Process Piping Line</option>
              <option value="utility_line">Utility Line (Water / Steam / Air)</option>
              <option value="signal_line">Instrumentation Signal Line (Non-Process)</option>
            </select>
            {selectedConnector.functional_type === 'signal_line' && (
              <p className="text-[10px] text-sky-700 bg-sky-50 p-2 rounded mt-1 border border-sky-200">
                Notice: Signal lines are electrical/pneumatic instrumentation loops and cannot carry chemical fluids.
              </p>
            )}
          </div>

          {/* Flow Direction */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
              Flow Direction
            </label>
            <select
              value={selectedConnector.flow_direction}
              onChange={(e) =>
                onUpdateConnector({
                  ...selectedConnector,
                  flow_direction: e.target.value as FlowDirection,
                })
              }
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 font-medium"
            >
              <option value="forward">Forward (From → To)</option>
              <option value="reverse">Reverse (To → From)</option>
              <option value="bidirectional">Bidirectional</option>
              <option value="unknown">Unknown / Needs Review</option>
            </select>
          </div>

          {/* Size & Material */}
          {selectedConnector.functional_type !== 'signal_line' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1">
                  Nominal Size
                </label>
                <input
                  type="text"
                  value={selectedConnector.size || ''}
                  onChange={(e) =>
                    onUpdateConnector({
                      ...selectedConnector,
                      size: e.target.value,
                    })
                  }
                  placeholder='e.g. 3"'
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1">
                  Material
                </label>
                <input
                  type="text"
                  value={selectedConnector.material || ''}
                  onChange={(e) =>
                    onUpdateConnector({
                      ...selectedConnector,
                      material: e.target.value,
                    })
                  }
                  placeholder="e.g. Carbon Steel"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* Assigned Chemical */}
          {selectedConnector.functional_type !== 'signal_line' && (
            <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg space-y-2">
              <div className="flex items-center gap-1.5 font-semibold text-blue-900">
                <FlaskConical className="w-3.5 h-3.5 text-blue-600" />
                <span>Chemical Stream Assigned</span>
              </div>
              <select
                value={selectedConnector.assigned_chemical_id || ''}
                onChange={(e) =>
                  onUpdateConnector({
                    ...selectedConnector,
                    assigned_chemical_id: e.target.value || null,
                  })
                }
                className="w-full px-2 py-1.5 bg-white border border-blue-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500"
              >
                <option value="">-- Inherit from Source Equipment --</option>
                {chemicals.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.chemical_name.user_value || c.chemical_name.value}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    );
  }

  // If nothing is selected: Drawing Overview
  return (
    <div className="w-80 flex flex-col bg-white border-l border-slate-200 h-full overflow-y-auto select-none shadow-sm text-xs">
      <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <span className="font-bold text-slate-800 flex items-center gap-1.5">
          <Info className="w-4 h-4 text-blue-600" />
          Drawing Properties
        </span>
        <span
          className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${
            drawing.status === 'approved'
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-amber-100 text-amber-800'
          }`}
        >
          {drawing.status.toUpperCase()}
        </span>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
            Drawing Title
          </label>
          <input
            type="text"
            value={drawing.title}
            onChange={(e) => onUpdateDrawingMeta({ title: e.target.value })}
            className="w-full px-3 py-1.5 font-semibold text-slate-800 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
            Drawing Number
          </label>
          <input
            type="text"
            value={drawing.drawing_number}
            onChange={(e) => onUpdateDrawingMeta({ drawing_number: e.target.value })}
            className="w-full px-3 py-1.5 font-mono font-bold text-slate-800 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 text-slate-700">
          <div className="p-2.5 bg-slate-50 border rounded-lg">
            <span className="text-[10px] text-slate-500 block">Revision</span>
            <span className="font-mono font-bold text-blue-600">{drawing.revision}</span>
          </div>
          <div className="p-2.5 bg-slate-50 border rounded-lg">
            <span className="text-[10px] text-slate-500 block">Mode</span>
            <span className="font-semibold text-slate-700 capitalize">
              {drawing.mode === 'imported_overlay' ? 'Imported Overlay' : 'Scratch Canvas'}
            </span>
          </div>
        </div>

        {/* Statistics */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
          <span className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">
            Digital Topology Count
          </span>
          <div className="flex justify-between">
            <span className="text-slate-600">Equipment Symbols:</span>
            <span className="font-bold font-mono text-slate-800">{drawing.elements.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Process Piping Lines:</span>
            <span className="font-bold font-mono text-slate-800">
              {drawing.connectors.filter((c) => c.functional_type === 'piping_line').length}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Signal Connections:</span>
            <span className="font-bold font-mono text-slate-800">
              {drawing.connectors.filter((c) => c.functional_type === 'signal_line').length}
            </span>
          </div>
        </div>

        {drawing.approved_by && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-1 text-emerald-900">
            <div className="flex items-center gap-1 font-semibold text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Engineering Sign-off Approved</span>
            </div>
            <p className="text-[10px] text-emerald-700">
              Approved by <span className="font-bold">{drawing.approved_by}</span> on{' '}
              {drawing.approved_at?.split('T')[0]}
            </p>
          </div>
        )}

        <div className="text-[11px] text-slate-400 italic">
          Select any equipment symbol or piping line to inspect and modify properties.
        </div>
      </div>
    </div>
  );
};
