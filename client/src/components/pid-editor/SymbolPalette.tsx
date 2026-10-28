import React, { useState } from 'react';
import { Search, Plus, Layers, Activity, Cpu, ShieldCheck } from 'lucide-react';
import { DrawingElementType } from '../../types';

export interface PaletteItem {
  type: DrawingElementType;
  label: string;
  category: 'Vessels & Storage' | 'Rotating Equipment' | 'Heat Transfer & Separation' | 'Valves & Flow Control' | 'Instrumentation & Connectivity';
  defaultTagPrefix: string;
  description: string;
  defaultWidth: number;
  defaultHeight: number;
}

export const PALETTE_ITEMS: PaletteItem[] = [
  // Vessels & Storage
  {
    type: 'vessel',
    label: 'Vertical Pressure Vessel',
    category: 'Vessels & Storage',
    defaultTagPrefix: 'V',
    description: 'ASME Section VIII Div 1 Dished-Head Pressure Vessel',
    defaultWidth: 100,
    defaultHeight: 150,
  },
  {
    type: 'tank',
    label: 'Atmospheric Storage Tank',
    category: 'Vessels & Storage',
    defaultTagPrefix: 'TK',
    description: 'API-650 Cylindrical Flat Bottom Storage Tank',
    defaultWidth: 110,
    defaultHeight: 140,
  },
  {
    type: 'mixing_tank',
    label: 'Agitated Mixing Tank',
    category: 'Vessels & Storage',
    defaultTagPrefix: 'TK',
    description: 'Chemical Dosing & Blend Vessel with Motor Impeller',
    defaultWidth: 100,
    defaultHeight: 140,
  },
  {
    type: 'reactor',
    label: 'Agitated Chemical Reactor',
    category: 'Vessels & Storage',
    defaultTagPrefix: 'R',
    description: 'Jacketed Reaction Vessel with Top Agitator Drive',
    defaultWidth: 110,
    defaultHeight: 160,
  },

  // Rotating Equipment
  {
    type: 'pump',
    label: 'Centrifugal Pump',
    category: 'Rotating Equipment',
    defaultTagPrefix: 'P',
    description: 'Hermetic Canned or API-610 Centrifugal Pump',
    defaultWidth: 90,
    defaultHeight: 80,
  },
  {
    type: 'compressor',
    label: 'Gas Compressor',
    category: 'Rotating Equipment',
    defaultTagPrefix: 'C',
    description: 'Reciprocating or Rotary Screw Process Compressor',
    defaultWidth: 110,
    defaultHeight: 80,
  },

  // Heat Transfer & Separation
  {
    type: 'heat_exchanger',
    label: 'Shell & Tube Heat Exchanger',
    category: 'Heat Transfer & Separation',
    defaultTagPrefix: 'E',
    description: 'TEMA Shell & Tube Condenser / Evaporator',
    defaultWidth: 130,
    defaultHeight: 80,
  },
  {
    type: 'separator',
    label: 'Phase Separator / Filter',
    category: 'Heat Transfer & Separation',
    defaultTagPrefix: 'S',
    description: 'Vapor-Liquid Demister Separator / Strainer',
    defaultWidth: 90,
    defaultHeight: 120,
  },

  // Valves & Flow Control
  {
    type: 'manual_valve',
    label: 'Manual Isolation Valve',
    category: 'Valves & Flow Control',
    defaultTagPrefix: 'HV',
    description: 'Ball or Gate Isolation Valve with Handwheel',
    defaultWidth: 44,
    defaultHeight: 32,
  },
  {
    type: 'control_valve',
    label: 'Control Valve with Actuator',
    category: 'Valves & Flow Control',
    defaultTagPrefix: 'FCV',
    description: 'Diaphragm-Actuated Modulating Control Valve',
    defaultWidth: 50,
    defaultHeight: 64,
  },
  {
    type: 'check_valve',
    label: 'Check Valve (Non-Return)',
    category: 'Valves & Flow Control',
    defaultTagPrefix: 'CKV',
    description: 'Swing or Piston Check Valve with Directional Arrow',
    defaultWidth: 44,
    defaultHeight: 32,
  },
  {
    type: 'relief_valve',
    label: 'Pressure Safety Valve (PSV)',
    category: 'Valves & Flow Control',
    defaultTagPrefix: 'PSV',
    description: 'Spring-Loaded Pressure Relief Valve with 90° Vent',
    defaultWidth: 48,
    defaultHeight: 48,
  },
  {
    type: 'junction',
    label: 'Process Tie-in Junction',
    category: 'Valves & Flow Control',
    defaultTagPrefix: 'J',
    description: 'Explicit Piping Branch / Tie-in Point',
    defaultWidth: 20,
    defaultHeight: 20,
  },

  // Instrumentation & Connectivity
  {
    type: 'instrument',
    label: 'ISA-5.1 Instrument Balloon',
    category: 'Instrumentation & Connectivity',
    defaultTagPrefix: 'PIC',
    description: 'Discrete Instrument or Shared Control / Display Balloon',
    defaultWidth: 50,
    defaultHeight: 50,
  },
  {
    type: 'offpage_connector',
    label: 'Off-Page Connector',
    category: 'Instrumentation & Connectivity',
    defaultTagPrefix: 'DWG',
    description: 'Flow Transfer to Adjoining Drawing Sheet',
    defaultWidth: 90,
    defaultHeight: 32,
  },
];

interface SymbolPaletteProps {
  onAddSymbol: (item: PaletteItem) => void;
}

export const SymbolPalette: React.FC<SymbolPaletteProps> = ({ onAddSymbol }) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const categories = [
    'All',
    'Vessels & Storage',
    'Rotating Equipment',
    'Heat Transfer & Separation',
    'Valves & Flow Control',
    'Instrumentation & Connectivity',
  ];

  const filteredItems = PALETTE_ITEMS.filter((item) => {
    const matchesSearch =
      item.label.toLowerCase().includes(search.toLowerCase()) ||
      item.description.toLowerCase().includes(search.toLowerCase()) ||
      item.defaultTagPrefix.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="w-80 flex flex-col bg-white border-r border-slate-200 h-full select-none shadow-sm">
      <div className="p-3 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-blue-600" />
            Symbol Palette
          </span>
          <span className="text-[11px] bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full">
            {filteredItems.length} items
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Search symbols (e.g. pump, PSV)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Category Pills */}
        <div className="flex gap-1 overflow-x-auto mt-2 pb-1 scrollbar-thin">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`text-[10px] whitespace-nowrap px-2 py-1 rounded transition-colors ${
                selectedCategory === cat
                  ? 'bg-blue-600 text-white font-medium shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {cat === 'Heat Transfer & Separation' ? 'Heat/Sep' : cat === 'Instrumentation & Connectivity' ? 'Instruments' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Palette Items List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredItems.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs">
            No engineering symbols match &quot;{search}&quot;
          </div>
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.type + item.label}
              onClick={() => onAddSymbol(item)}
              className="p-2.5 bg-slate-50 hover:bg-blue-50/70 border border-slate-200 hover:border-blue-300 rounded-lg cursor-pointer transition-all flex items-center justify-between group shadow-2xs hover:shadow-sm"
            >
              <div className="flex-1 pr-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-xs text-slate-800 group-hover:text-blue-700">
                    {item.label}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-200 group-hover:bg-blue-200 text-slate-700 rounded">
                    {item.defaultTagPrefix}-###
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                  {item.description}
                </div>
              </div>
              <button
                type="button"
                className="w-7 h-7 flex items-center justify-center rounded-md bg-white border border-slate-200 text-slate-600 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 shadow-2xs transition-colors shrink-0"
                title="Add to Canvas"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Legend Footnote */}
      <div className="p-2.5 border-t border-slate-200 bg-slate-50/80 text-[10px] text-slate-500 flex items-center justify-between">
        <span className="flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          ISA-5.1 & ASME Compliant
        </span>
        <span>Click to place</span>
      </div>
    </div>
  );
};
