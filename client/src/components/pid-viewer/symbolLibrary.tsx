import React from 'react';
import { ClientRegistryComponent, findClientRegistryComponent } from '../../utils/componentRegistryClient';

export interface PortDefinition {
  id: string;
  name: string;
  type: 'inlet' | 'outlet' | 'signal' | 'bidirectional' | 'drain' | 'vent';
  // Position relative to symbol origin [0, 0] (top-left) or center
  relativePosition: { x: number; y: number };
  normal: { x: number; y: number }; // Unit vector indicating port direction [dx, dy]
}

export interface SymbolMetadata {
  classKey: string;
  displayName: string;
  defaultWidth: number;
  defaultHeight: number;
  ports: PortDefinition[];
  render: (props: SymbolRenderProps) => React.ReactNode;
}

export interface SymbolRenderProps {
  width: number;
  height: number;
  strokeColor: string;
  fillColor?: string;
  tag?: string;
  isSelected?: boolean;
  isHovered?: boolean;
  detailLevel?: 'standard' | 'high_detail';
}

/**
 * Standard Symbol Library for Industrial P&ID Digitization
 * Compliant with ANSI / ISA-5.1 and ISO 10628 P&ID Standards.
 */
export const P_ID_SYMBOL_LIBRARY: Record<string, SymbolMetadata> = {
  // 1. Horizontal Vessel / Slug Catcher (PG-1001) - Scaled as Dominant Centerpiece
  slug_catcher: {
    classKey: 'slug_catcher',
    displayName: 'Horizontal Slug Catcher / Vessel',
    defaultWidth: 480,
    defaultHeight: 180,
    ports: [
      { id: 'N1', name: 'N1 Inlet', type: 'inlet', relativePosition: { x: 0, y: 90 }, normal: { x: -1, y: 0 } },
      { id: 'N2', name: 'N2 Gas Outlet', type: 'outlet', relativePosition: { x: 480, y: 90 }, normal: { x: 1, y: 0 } },
      { id: 'N3', name: 'N3 Liquid Outlet', type: 'outlet', relativePosition: { x: 310, y: 180 }, normal: { x: 0, y: 1 } },
      { id: 'N4', name: 'N4 PSV Nozzle', type: 'outlet', relativePosition: { x: 310, y: 0 }, normal: { x: 0, y: -1 } },
      { id: 'N5', name: 'N5 Drain', type: 'outlet', relativePosition: { x: 170, y: 180 }, normal: { x: 0, y: 1 } },
      { id: 'N6', name: 'N6 Vent', type: 'outlet', relativePosition: { x: 170, y: 0 }, normal: { x: 0, y: -1 } },
      { id: 'N7', name: 'N7 Pig Door', type: 'inlet', relativePosition: { x: 35, y: 140 }, normal: { x: -1, y: 0 } },
    ],
    render: ({ width, height, strokeColor, fillColor = '#ffffff', isSelected }) => {
      const dishW = Math.min(50, width * 0.12);
      const bodyW = width - 2 * dishW;
      const bodyH = height * 0.72;
      const bodyY = height * 0.14;

      return (
        <g id="symbol-slug-catcher">
          {/* Ground Saddle Supports (Legs) */}
          <path
            d={`M ${dishW + bodyW * 0.22} ${bodyY + bodyH} L ${dishW + bodyW * 0.18} ${height} L ${dishW + bodyW * 0.26} ${height} Z
                M ${dishW + bodyW * 0.78} ${bodyY + bodyH} L ${dishW + bodyW * 0.74} ${height} L ${dishW + bodyW * 0.82} ${height} Z`}
            fill="#64748b"
            stroke={strokeColor}
            strokeWidth="1.5"
          />
          {/* Base plate lines */}
          <line x1={dishW + bodyW * 0.14} y1={height} x2={dishW + bodyW * 0.30} y2={height} stroke={strokeColor} strokeWidth="2.5" />
          <line x1={dishW + bodyW * 0.70} y1={height} x2={dishW + bodyW * 0.86} y2={height} stroke={strokeColor} strokeWidth="2.5" />

          {/* Main Vessel Body (Cylindrical shell) */}
          <rect
            x={dishW}
            y={bodyY}
            width={bodyW}
            height={bodyH}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={isSelected ? 3.0 : 2.5}
          />

          {/* Left Ellipsoidal Dish Head */}
          <path
            d={`M ${dishW} ${bodyY} C ${dishW * 0.12} ${bodyY}, ${dishW * 0.12} ${bodyY + bodyH}, ${dishW} ${bodyY + bodyH} Z`}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={isSelected ? 3.0 : 2.5}
          />

          {/* Right Ellipsoidal Dish Head */}
          <path
            d={`M ${dishW + bodyW} ${bodyY} C ${width - dishW * 0.12} ${bodyY}, ${width - dishW * 0.12} ${bodyY + bodyH}, ${dishW + bodyW} ${bodyY + bodyH} Z`}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={isSelected ? 3.0 : 2.5}
          />

          {/* Nozzle Stubs with Flange Bars (Tags positioned outside outline) */}
          {/* N1 Inlet Nozzle (Left) */}
          <line x1="0" y1={height * 0.5} x2={dishW * 0.35} y2={height * 0.5} stroke={strokeColor} strokeWidth="3" />
          <line x1={dishW * 0.35} y1={height * 0.5 - 10} x2={dishW * 0.35} y2={height * 0.5 + 10} stroke={strokeColor} strokeWidth="2.5" />
          <text x="-14" y={height * 0.5 - 8} fontSize="9" fontFamily="monospace" fontWeight="bold" fill="#0f172a" style={{ paintOrder: 'stroke fill', stroke: '#ffffff', strokeWidth: '3px' }}>N1</text>

          {/* N2 Gas Outlet Nozzle (Right) */}
          <line x1={width - dishW * 0.35} y1={height * 0.5} x2={width} y2={height * 0.5} stroke={strokeColor} strokeWidth="3" />
          <line x1={width - dishW * 0.35} y1={height * 0.5 - 10} x2={width - dishW * 0.35} y2={height * 0.5 + 10} stroke={strokeColor} strokeWidth="2.5" />
          <text x={width + 6} y={height * 0.5 - 8} fontSize="9" fontFamily="monospace" fontWeight="bold" fill="#0f172a" style={{ paintOrder: 'stroke fill', stroke: '#ffffff', strokeWidth: '3px' }}>N2</text>

          {/* N4 PSV Nozzle (Top Center-Right) */}
          <line x1={dishW + bodyW * 0.65} y1="0" x2={dishW + bodyW * 0.65} y2={bodyY} stroke={strokeColor} strokeWidth="2.5" />
          <line x1={dishW + bodyW * 0.65 - 8} y1={bodyY - 6} x2={dishW + bodyW * 0.65 + 8} y2={bodyY - 6} stroke={strokeColor} strokeWidth="2.5" />
          <text x={dishW + bodyW * 0.65 + 8} y="-6" fontSize="9" fontFamily="monospace" fontWeight="bold" fill="#0f172a" style={{ paintOrder: 'stroke fill', stroke: '#ffffff', strokeWidth: '3px' }}>N4</text>

          {/* N6 Vent Nozzle (Top Center-Left) */}
          <line x1={dishW + bodyW * 0.28} y1="0" x2={dishW + bodyW * 0.28} y2={bodyY} stroke={strokeColor} strokeWidth="2.5" />
          <line x1={dishW + bodyW * 0.28 - 8} y1={bodyY - 6} x2={dishW + bodyW * 0.28 + 8} y2={bodyY - 6} stroke={strokeColor} strokeWidth="2.5" />
          <text x={dishW + bodyW * 0.28 + 8} y="-6" fontSize="9" fontFamily="monospace" fontWeight="bold" fill="#0f172a" style={{ paintOrder: 'stroke fill', stroke: '#ffffff', strokeWidth: '3px' }}>N6</text>

          {/* N3 Liquid Outlet Nozzle (Bottom Right) */}
          <line x1={dishW + bodyW * 0.65} y1={bodyY + bodyH} x2={dishW + bodyW * 0.65} y2={height} stroke={strokeColor} strokeWidth="2.5" />
          <line x1={dishW + bodyW * 0.65 - 8} y1={bodyY + bodyH + 6} x2={dishW + bodyW * 0.65 + 8} y2={bodyY + bodyH + 6} stroke={strokeColor} strokeWidth="2.5" />
          <text x={dishW + bodyW * 0.65 + 8} y={height + 16} fontSize="9" fontFamily="monospace" fontWeight="bold" fill="#0f172a" style={{ paintOrder: 'stroke fill', stroke: '#ffffff', strokeWidth: '3px' }}>N3</text>

          {/* N5 Drain Nozzle (Bottom Left) */}
          <line x1={dishW + bodyW * 0.28} y1={bodyY + bodyH} x2={dishW + bodyW * 0.28} y2={height} stroke={strokeColor} strokeWidth="2.5" />
          <line x1={dishW + bodyW * 0.28 - 8} y1={bodyY + bodyH + 6} x2={dishW + bodyW * 0.28 + 8} y2={bodyY + bodyH + 6} stroke={strokeColor} strokeWidth="2.5" />
          <text x={dishW + bodyW * 0.28 + 8} y={height + 16} fontSize="9" fontFamily="monospace" fontWeight="bold" fill="#0f172a" style={{ paintOrder: 'stroke fill', stroke: '#ffffff', strokeWidth: '3px' }}>N5</text>

          {/* N7 Pig Door Quick Opening Closure (Hinged hatch) */}
          <g transform={`translate(${dishW * 0.70}, ${bodyY + bodyH * 0.75})`}>
            <ellipse cx="0" cy="0" rx="10" ry="16" fill="#f1f5f9" stroke={strokeColor} strokeWidth="2" />
            <line x1="-5" y1="-18" x2="5" y2="-18" stroke={strokeColor} strokeWidth="2.5" />
            <circle cx="0" cy="-18" r="2.5" fill={strokeColor} />
            <text x="-32" y="26" fontSize="8" fontFamily="monospace" fontWeight="bold" fill="#0f172a" style={{ paintOrder: 'stroke fill', stroke: '#ffffff', strokeWidth: '2.5px' }}>N7</text>
          </g>

          {/* Vessel Internal Process Spec Stencil */}
          <g transform={`translate(${width / 2}, ${bodyY + bodyH / 2 - 8})`} pointerEvents="none">
            <text x="0" y="-8" textAnchor="middle" fontFamily="sans-serif" fontSize="13" fontWeight="900" fill="#0f172a" letterSpacing="0.05em">
              PG-1001
            </text>
            <text x="0" y="8" textAnchor="middle" fontFamily="sans-serif" fontSize="9.5" fontWeight="bold" fill="#334155">
              PIG RECEIVER / SLUG CATCHER
            </text>
            <text x="0" y="22" textAnchor="middle" fontFamily="monospace" fontSize="8.5" fill="#64748b">
              1200 ID x 8000 LG • 90 BARG / 120°C
            </text>
          </g>
        </g>
      );
    },
  },

  // 2. Gate Valve / Isolation Valve
  gate_valve: {
    classKey: 'gate_valve',
    displayName: 'Gate Valve',
    defaultWidth: 36,
    defaultHeight: 36,
    ports: [
      { id: 'in', name: 'Inlet', type: 'inlet', relativePosition: { x: 0, y: 18 }, normal: { x: -1, y: 0 } },
      { id: 'out', name: 'Outlet', type: 'outlet', relativePosition: { x: 36, y: 18 }, normal: { x: 1, y: 0 } },
    ],
    render: ({ width, height, strokeColor, fillColor = '#ffffff', isSelected }) => {
      const hw = width / 2;
      const hh = height / 2;
      return (
        <g id="symbol-gate-valve">
          {/* Two opposed triangles */}
          <polygon points={`0,4 ${hw},${hh} 0,${height - 4}`} fill={fillColor} stroke={strokeColor} strokeWidth={isSelected ? 2.5 : 1.75} strokeLinejoin="round" />
          <polygon points={`${width},4 ${hw},${hh} ${width},${height - 4}`} fill={fillColor} stroke={strokeColor} strokeWidth={isSelected ? 2.5 : 1.75} strokeLinejoin="round" />
          {/* Stem & Handwheel */}
          <line x1={hw} y1={hh} x2={hw} y2="0" stroke={strokeColor} strokeWidth="1.75" />
          <line x1={hw - 8} y1="0" x2={hw + 8} y2="0" stroke={strokeColor} strokeWidth="2.5" />
        </g>
      );
    },
  },

  // 3. Ball Valve
  ball_valve: {
    classKey: 'ball_valve',
    displayName: 'Ball Valve',
    defaultWidth: 36,
    defaultHeight: 36,
    ports: [
      { id: 'in', name: 'Inlet', type: 'inlet', relativePosition: { x: 0, y: 18 }, normal: { x: -1, y: 0 } },
      { id: 'out', name: 'Outlet', type: 'outlet', relativePosition: { x: 36, y: 18 }, normal: { x: 1, y: 0 } },
    ],
    render: ({ width, height, strokeColor, fillColor = '#ffffff', isSelected }) => {
      const hw = width / 2;
      const hh = height / 2;
      return (
        <g id="symbol-ball-valve">
          <polygon points={`0,4 ${hw},${hh} 0,${height - 4}`} fill={fillColor} stroke={strokeColor} strokeWidth={isSelected ? 2.5 : 1.75} strokeLinejoin="round" />
          <polygon points={`${width},4 ${hw},${hh} ${width},${height - 4}`} fill={fillColor} stroke={strokeColor} strokeWidth={isSelected ? 2.5 : 1.75} strokeLinejoin="round" />
          {/* Central ball dot */}
          <circle cx={hw} cy={hh} r="3.5" fill={strokeColor} />
          {/* Lever handle */}
          <line x1={hw} y1={hh} x2={hw} y2="2" stroke={strokeColor} strokeWidth="1.75" />
          <line x1={hw} y1="2" x2={hw + 10} y2="-3" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" />
        </g>
      );
    },
  },

  // 4. Globe Valve
  globe_valve: {
    classKey: 'globe_valve',
    displayName: 'Globe Valve',
    defaultWidth: 36,
    defaultHeight: 36,
    ports: [
      { id: 'in', name: 'Inlet', type: 'inlet', relativePosition: { x: 0, y: 18 }, normal: { x: -1, y: 0 } },
      { id: 'out', name: 'Outlet', type: 'outlet', relativePosition: { x: 36, y: 18 }, normal: { x: 1, y: 0 } },
    ],
    render: ({ width, height, strokeColor, fillColor = '#ffffff', isSelected }) => {
      const hw = width / 2;
      const hh = height / 2;
      return (
        <g id="symbol-globe-valve">
          <polygon points={`0,4 ${hw},${hh} 0,${height - 4}`} fill={fillColor} stroke={strokeColor} strokeWidth={isSelected ? 2.5 : 1.75} strokeLinejoin="round" />
          <polygon points={`${width},4 ${hw},${hh} ${width},${height - 4}`} fill={fillColor} stroke={strokeColor} strokeWidth={isSelected ? 2.5 : 1.75} strokeLinejoin="round" />
          {/* Central hollow circle */}
          <circle cx={hw} cy={hh} r="4" fill="#ffffff" stroke={strokeColor} strokeWidth="1.5" />
          <line x1={hw} y1={hh - 4} x2={hw} y2="0" stroke={strokeColor} strokeWidth="1.75" />
          <line x1={hw - 8} y1="0" x2={hw + 8} y2="0" stroke={strokeColor} strokeWidth="2.5" />
        </g>
      );
    },
  },

  // 5. Check Valve (Non-Return Valve)
  check_valve: {
    classKey: 'check_valve',
    displayName: 'Check Valve',
    defaultWidth: 36,
    defaultHeight: 36,
    ports: [
      { id: 'in', name: 'Inlet', type: 'inlet', relativePosition: { x: 0, y: 18 }, normal: { x: -1, y: 0 } },
      { id: 'out', name: 'Outlet', type: 'outlet', relativePosition: { x: 36, y: 18 }, normal: { x: 1, y: 0 } },
    ],
    render: ({ width, height, strokeColor, fillColor = '#ffffff', isSelected }) => {
      const hw = width / 2;
      const hh = height / 2;
      return (
        <g id="symbol-check-valve">
          <polygon points={`0,4 ${hw},${hh} 0,${height - 4}`} fill={fillColor} stroke={strokeColor} strokeWidth={isSelected ? 2.5 : 1.75} strokeLinejoin="round" />
          <polygon points={`${width},4 ${hw},${hh} ${width},${height - 4}`} fill={fillColor} stroke={strokeColor} strokeWidth={isSelected ? 2.5 : 1.75} strokeLinejoin="round" />
          {/* Internal check flap indicator */}
          <polyline points={`${width * 0.28},${height * 0.25} ${width * 0.72},${hh} ${width * 0.28},${height * 0.75}`} fill="none" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" />
        </g>
      );
    },
  },

  // 6. Needle Valve
  needle_valve: {
    classKey: 'needle_valve',
    displayName: 'Needle Valve',
    defaultWidth: 32,
    defaultHeight: 32,
    ports: [
      { id: 'in', name: 'Inlet', type: 'inlet', relativePosition: { x: 0, y: 16 }, normal: { x: -1, y: 0 } },
      { id: 'out', name: 'Outlet', type: 'outlet', relativePosition: { x: 32, y: 16 }, normal: { x: 1, y: 0 } },
    ],
    render: ({ width, height, strokeColor, fillColor = '#ffffff', isSelected }) => {
      const hw = width / 2;
      const hh = height / 2;
      return (
        <g id="symbol-needle-valve">
          <polygon points={`0,4 ${hw},${hh} 0,${height - 4}`} fill={fillColor} stroke={strokeColor} strokeWidth={isSelected ? 2.5 : 1.75} />
          <polygon points={`${width},4 ${hw},${hh} ${width},${height - 4}`} fill={fillColor} stroke={strokeColor} strokeWidth={isSelected ? 2.5 : 1.75} />
          {/* Diagonal needle stem */}
          <line x1={hw} y1={hh} x2={hw} y2="2" stroke={strokeColor} strokeWidth="1.5" />
          <line x1={hw - 6} y1="2" x2={hw + 6} y2="2" stroke={strokeColor} strokeWidth="2" />
          <line x1={hw - 5} y1={hh + 6} x2={hw + 5} y2={hh - 6} stroke={strokeColor} strokeWidth="1.5" />
        </g>
      );
    },
  },

  // 7. Control Valve (with Pneumatic Diaphragm Actuator)
  control_valve: {
    classKey: 'control_valve',
    displayName: 'Control Valve (Pneumatic Diaphragm)',
    defaultWidth: 40,
    defaultHeight: 52,
    ports: [
      { id: 'in', name: 'Inlet', type: 'inlet', relativePosition: { x: 0, y: 38 }, normal: { x: -1, y: 0 } },
      { id: 'out', name: 'Outlet', type: 'outlet', relativePosition: { x: 40, y: 38 }, normal: { x: 1, y: 0 } },
      { id: 'sig', name: 'Signal Input', type: 'signal', relativePosition: { x: 20, y: 0 }, normal: { x: 0, y: -1 } },
    ],
    render: ({ width, height, strokeColor, fillColor = '#ffffff', isSelected }) => {
      const hw = width / 2;
      const bodyY = height - 24;
      const actDomeY = 16;
      return (
        <g id="symbol-control-valve">
          {/* Valve Body */}
          <polygon points={`0,${bodyY + 2} ${hw},${bodyY + 12} 0,${bodyY + 22}`} fill={fillColor} stroke={strokeColor} strokeWidth={isSelected ? 2.5 : 1.75} strokeLinejoin="round" />
          <polygon points={`${width},${bodyY + 2} ${hw},${bodyY + 12} ${width},${bodyY + 22}`} fill={fillColor} stroke={strokeColor} strokeWidth={isSelected ? 2.5 : 1.75} strokeLinejoin="round" />
          
          {/* Actuator Stem */}
          <line x1={hw} y1={bodyY + 12} x2={hw} y2={actDomeY} stroke={strokeColor} strokeWidth="2" />

          {/* Diaphragm Dome (Half ellipse top) */}
          <path
            d={`M ${hw - 14} ${actDomeY} C ${hw - 14} 2, ${hw + 14} 2, ${hw + 14} ${actDomeY} Z`}
            fill="#f8fafc"
            stroke={strokeColor}
            strokeWidth="2"
          />
          {/* Positioner box indicator */}
          <rect x={hw + 3} y={actDomeY + 2} width="8" height="8" fill="#e2e8f0" stroke={strokeColor} strokeWidth="1" />
        </g>
      );
    },
  },

  // 8. ESD Valve / Emergency Shutdown Valve (XV / SDV / BDV)
  esd_valve: {
    classKey: 'esd_valve',
    displayName: 'Emergency Shutdown / Blowdown Valve (ESD)',
    defaultWidth: 40,
    defaultHeight: 56,
    ports: [
      { id: 'in', name: 'Inlet', type: 'inlet', relativePosition: { x: 0, y: 40 }, normal: { x: -1, y: 0 } },
      { id: 'out', name: 'Outlet', type: 'outlet', relativePosition: { x: 40, y: 40 }, normal: { x: 1, y: 0 } },
      { id: 'sig', name: 'Signal Input', type: 'signal', relativePosition: { x: 20, y: 0 }, normal: { x: 0, y: -1 } },
    ],
    render: ({ width, height, strokeColor, fillColor = '#ffffff', tag, isSelected }) => {
      const hw = width / 2;
      const bodyY = height - 24;
      const actBoxY = 18;
      const isBlowdown = tag?.includes('BDV');

      return (
        <g id="symbol-esd-valve">
          {/* Valve Body */}
          <polygon points={`0,${bodyY + 2} ${hw},${bodyY + 12} 0,${bodyY + 22}`} fill={fillColor} stroke={strokeColor} strokeWidth={isSelected ? 2.5 : 1.75} strokeLinejoin="round" />
          <polygon points={`${width},${bodyY + 2} ${hw},${bodyY + 12} ${width},${bodyY + 22}`} fill={fillColor} stroke={strokeColor} strokeWidth={isSelected ? 2.5 : 1.75} strokeLinejoin="round" />
          
          {/* Stem */}
          <line x1={hw} y1={bodyY + 12} x2={hw} y2={actBoxY} stroke={strokeColor} strokeWidth="2" />

          {/* Actuator Box with ESD or BDV label */}
          <rect
            x={hw - 14}
            y="2"
            width="28"
            height={actBoxY - 2}
            rx="2"
            fill="#f1f5f9"
            stroke={strokeColor}
            strokeWidth="1.75"
          />
          <text
            x={hw}
            y={actBoxY - 5}
            textAnchor="middle"
            fontFamily="sans-serif"
            fontSize="8"
            fontWeight="bold"
            fill="#0f172a"
          >
            {isBlowdown ? 'BDV' : 'ESD'}
          </text>
        </g>
      );
    },
  },

  // 9. Pressure Safety Relief Valve (PSV)
  relief_valve: {
    classKey: 'relief_valve',
    displayName: 'Pressure Safety Relief Valve (PSV)',
    defaultWidth: 42,
    defaultHeight: 46,
    ports: [
      { id: 'in', name: 'Inlet (Bottom)', type: 'inlet', relativePosition: { x: 14, y: 46 }, normal: { x: 0, y: 1 } },
      { id: 'out', name: 'Discharge (Right)', type: 'outlet', relativePosition: { x: 42, y: 22 }, normal: { x: 1, y: 0 } },
    ],
    render: ({ width, height, strokeColor, fillColor = '#ffffff', isSelected }) => {
      const vx = 14;
      const vy = 22;
      return (
        <g id="symbol-psv">
          {/* Inlet line from bottom to center */}
          <line x1={vx} y1={height} x2={vx} y2={vy} stroke={strokeColor} strokeWidth="2.5" />
          {/* Angle valve body triangles */}
          <polygon points={`${vx - 10},${vy + 8} ${vx},${vy} ${vx + 10},${vy + 8}`} fill={fillColor} stroke={strokeColor} strokeWidth={isSelected ? 2.5 : 1.75} />
          {/* Discharge pipe to right */}
          <line x1={vx} y1={vy} x2={width} y2={vy} stroke={strokeColor} strokeWidth="2.5" />
          
          {/* Spring Bonnet (Upper housing) */}
          <rect x={vx - 6} y="4" width="12" height="14" fill="#f8fafc" stroke={strokeColor} strokeWidth="1.75" />
          {/* Spring indication */}
          <line x1={vx} y1="6" x2={vx} y2="16" stroke={strokeColor} strokeWidth="1" strokeDasharray="2,2" />
          {/* Manual test lever */}
          <line x1={vx} y1="4" x2={vx + 8} y2="0" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" />
        </g>
      );
    },
  },

  // 10. Instrument Bubble - Field Mounted (Circle)
  instrument_field: {
    classKey: 'instrument_field',
    displayName: 'Field Mounted Instrument',
    defaultWidth: 40,
    defaultHeight: 40,
    ports: [
      { id: 'top', name: 'Top Connection', type: 'signal', relativePosition: { x: 20, y: 0 }, normal: { x: 0, y: -1 } },
      { id: 'bot', name: 'Bottom Connection', type: 'signal', relativePosition: { x: 20, y: 40 }, normal: { x: 0, y: 1 } },
      { id: 'left', name: 'Left Connection', type: 'signal', relativePosition: { x: 0, y: 20 }, normal: { x: -1, y: 0 } },
      { id: 'right', name: 'Right Connection', type: 'signal', relativePosition: { x: 40, y: 20 }, normal: { x: 1, y: 0 } },
    ],
    render: ({ width, height, strokeColor, fillColor = '#ffffff', tag, isSelected }) => {
      const r = width / 2 - 2;
      const parts = (tag || '').split('-');
      const prefix = parts[0] || 'PT';
      const loop = parts.slice(1).join('-') || '1001';

      return (
        <g id="symbol-inst-field">
          <circle cx={width / 2} cy={height / 2} r={r} fill={fillColor} stroke={strokeColor} strokeWidth={isSelected ? 2.5 : 1.75} />
          <text x={width / 2} y={height / 2 - 2} textAnchor="middle" fontFamily="sans-serif" fontSize="9.5" fontWeight="bold" fill="#0f172a">
            {prefix}
          </text>
          <text x={width / 2} y={height / 2 + 10} textAnchor="middle" fontFamily="monospace" fontSize="8.5" fontWeight="bold" fill="#334155">
            {loop}
          </text>
        </g>
      );
    },
  },

  // 11. Instrument Bubble - DCS Shared Display (Circle with Single Horizontal Line)
  instrument_dcs: {
    classKey: 'instrument_dcs',
    displayName: 'DCS / Shared Display Instrument',
    defaultWidth: 40,
    defaultHeight: 40,
    ports: [
      { id: 'top', name: 'Top Connection', type: 'signal', relativePosition: { x: 20, y: 0 }, normal: { x: 0, y: -1 } },
      { id: 'bot', name: 'Bottom Connection', type: 'signal', relativePosition: { x: 20, y: 40 }, normal: { x: 0, y: 1 } },
      { id: 'left', name: 'Left Connection', type: 'signal', relativePosition: { x: 0, y: 20 }, normal: { x: -1, y: 0 } },
      { id: 'right', name: 'Right Connection', type: 'signal', relativePosition: { x: 40, y: 20 }, normal: { x: 1, y: 0 } },
    ],
    render: ({ width, height, strokeColor, fillColor = '#ffffff', tag, isSelected }) => {
      const r = width / 2 - 2;
      const parts = (tag || '').split('-');
      const prefix = parts[0] || 'PIC';
      const loop = parts.slice(1).join('-') || '1001';

      return (
        <g id="symbol-inst-dcs">
          <circle cx={width / 2} cy={height / 2} r={r} fill={fillColor} stroke={strokeColor} strokeWidth={isSelected ? 2.5 : 1.75} />
          {/* Single horizontal line for DCS / Control Room */}
          <line x1={width / 2 - r} y1={height / 2} x2={width / 2 + r} y2={height / 2} stroke={strokeColor} strokeWidth="1.5" />
          <text x={width / 2} y={height / 2 - 4} textAnchor="middle" fontFamily="sans-serif" fontSize="9" fontWeight="bold" fill="#0f172a">
            {prefix}
          </text>
          <text x={width / 2} y={height / 2 + 11} textAnchor="middle" fontFamily="monospace" fontSize="8.5" fontWeight="bold" fill="#334155">
            {loop}
          </text>
        </g>
      );
    },
  },

  // 12. Instrument Bubble - SIS / Safety Interlock (Circle with Double Horizontal Line)
  instrument_sis: {
    classKey: 'instrument_sis',
    displayName: 'Safety Instrumented System (SIS)',
    defaultWidth: 44,
    defaultHeight: 44,
    ports: [
      { id: 'top', name: 'Top Connection', type: 'signal', relativePosition: { x: 22, y: 0 }, normal: { x: 0, y: -1 } },
      { id: 'bot', name: 'Bottom Connection', type: 'signal', relativePosition: { x: 22, y: 44 }, normal: { x: 0, y: 1 } },
      { id: 'left', name: 'Left Connection', type: 'signal', relativePosition: { x: 0, y: 22 }, normal: { x: -1, y: 0 } },
      { id: 'right', name: 'Right Connection', type: 'signal', relativePosition: { x: 44, y: 22 }, normal: { x: 1, y: 0 } },
    ],
    render: ({ width, height, strokeColor, fillColor = '#ffffff', tag, isSelected }) => {
      const r = width / 2 - 2;
      const parts = (tag || '').split('-');
      const prefix = parts[0] || 'SIS';
      const loop = parts.slice(1).join('-') || 'LS-1001';

      return (
        <g id="symbol-inst-sis">
          <circle cx={width / 2} cy={height / 2} r={r} fill={fillColor} stroke={strokeColor} strokeWidth={isSelected ? 2.5 : 2.0} />
          {/* Double horizontal lines indicating Safety Instrumented System */}
          <line x1={width / 2 - r * 0.95} y1={height / 2 - 3} x2={width / 2 + r * 0.95} y2={height / 2 - 3} stroke={strokeColor} strokeWidth="1.25" />
          <line x1={width / 2 - r * 0.95} y1={height / 2 + 3} x2={width / 2 + r * 0.95} y2={height / 2 + 3} stroke={strokeColor} strokeWidth="1.25" />
          <text x={width / 2} y={height / 2 - 6} textAnchor="middle" fontFamily="sans-serif" fontSize="8.5" fontWeight="900" fill="#dc2626">
            {prefix}
          </text>
          <text x={width / 2} y={height / 2 + 13} textAnchor="middle" fontFamily="monospace" fontSize="8" fontWeight="bold" fill="#0f172a">
            {loop}
          </text>
        </g>
      );
    },
  },

  // 13. Sight Glass / Level Gauge (LG-1001)
  sight_glass: {
    classKey: 'sight_glass',
    displayName: 'Level Gauge (Sight Glass)',
    defaultWidth: 32,
    defaultHeight: 64,
    ports: [
      { id: 'top', name: 'Upper Isolation Tap', type: 'inlet', relativePosition: { x: 0, y: 8 }, normal: { x: -1, y: 0 } },
      { id: 'bot', name: 'Lower Isolation Tap', type: 'outlet', relativePosition: { x: 0, y: 56 }, normal: { x: -1, y: 0 } },
    ],
    render: ({ width, height, strokeColor, isSelected }) => {
      return (
        <g id="symbol-sight-glass">
          {/* Upper & lower connecting stubs */}
          <line x1="0" y1="8" x2="10" y2="8" stroke={strokeColor} strokeWidth="2" />
          <line x1="0" y1={height - 8} x2="10" y2={height - 8} stroke={strokeColor} strokeWidth="2" />
          {/* Vertical glass tube */}
          <rect x="10" y="4" width="12" height={height - 8} fill="#f8fafc" stroke={strokeColor} strokeWidth={isSelected ? 2.5 : 1.75} rx="2" />
          {/* Diagonal liquid level hatching */}
          <line x1="10" y1="20" x2="22" y2="14" stroke="#0284c7" strokeWidth="1.5" />
          <line x1="10" y1="32" x2="22" y2="26" stroke="#0284c7" strokeWidth="1.5" />
          <line x1="10" y1="44" x2="22" y2="38" stroke="#0284c7" strokeWidth="1.5" />
          <text x="26" y={height / 2 + 3} fontSize="7.5" fontFamily="monospace" fontWeight="bold" fill="#475569">LG</text>
        </g>
      );
    },
  },

  // 14. Off-Page Connector (Pennant / Arrow Flag)
  offpage_connector: {
    classKey: 'offpage_connector',
    displayName: 'Off-Page Connector',
    defaultWidth: 120,
    defaultHeight: 36,
    ports: [
      { id: 'in', name: 'Inlet', type: 'inlet', relativePosition: { x: 0, y: 18 }, normal: { x: -1, y: 0 } },
      { id: 'out', name: 'Outlet', type: 'outlet', relativePosition: { x: 120, y: 18 }, normal: { x: 1, y: 0 } },
    ],
    render: ({ width, height, strokeColor, fillColor = '#f8fafc', tag, isSelected }) => {
      const tipW = 16;
      return (
        <g id="symbol-offpage-connector">
          {/* Pennant / Arrow shape */}
          <polygon
            points={`0,0 ${width - tipW},0 ${width},${height / 2} ${width - tipW},${height} 0,${height}`}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={isSelected ? 2.5 : 1.75}
            strokeLinejoin="round"
          />
          <text
            x={(width - tipW) / 2}
            y={height / 2 + 4}
            textAnchor="middle"
            fontFamily="sans-serif"
            fontSize="9"
            fontWeight="bold"
            fill="#0f172a"
          >
            {tag || 'TO NEXT SHEET'}
          </text>
        </g>
      );
    },
  },

  // 15. SDV Repeating Group Bank ("SDV Bank ×4")
  sdv_bank: {
    classKey: 'sdv_bank',
    displayName: 'SDV Manifold Bank (4× SDV-1001..1004)',
    defaultWidth: 110,
    defaultHeight: 180,
    ports: [
      { id: 'in', name: 'Manifold Common Inlet', type: 'inlet', relativePosition: { x: 0, y: 90 }, normal: { x: -1, y: 0 } },
      { id: 'out1', name: 'SDV-1001 Run', type: 'outlet', relativePosition: { x: 110, y: 24 }, normal: { x: 1, y: 0 } },
      { id: 'out2', name: 'SDV-1002 Run', type: 'outlet', relativePosition: { x: 110, y: 68 }, normal: { x: 1, y: 0 } },
      { id: 'out3', name: 'SDV-1003 Run', type: 'outlet', relativePosition: { x: 110, y: 112 }, normal: { x: 1, y: 0 } },
      { id: 'out4', name: 'SDV-1004 Run', type: 'outlet', relativePosition: { x: 110, y: 156 }, normal: { x: 1, y: 0 } },
    ],
    render: ({ width, height, strokeColor, isSelected }) => {
      return (
        <g id="symbol-sdv-bank">
          {/* Outer enclosure box with dashed border */}
          <rect
            x="4"
            y="4"
            width={width - 8}
            height={height - 8}
            rx="6"
            fill="#f8fafc"
            stroke={strokeColor}
            strokeWidth={isSelected ? 2 : 1.25}
            strokeDasharray="4,3"
          />
          {/* Header Bar */}
          <line x1="20" y1="20" x2="20" y2={height - 20} stroke={strokeColor} strokeWidth="3" />
          {/* 4 Mini Valve Runs */}
          {[24, 68, 112, 156].map((yVal, idx) => (
            <g key={`sdv-run-${idx}`}>
              <line x1="20" y1={yVal} x2="48" y2={yVal} stroke={strokeColor} strokeWidth="1.5" />
              {/* Mini valve */}
              <polygon points={`48,${yVal - 6} 64,${yVal} 48,${yVal + 6}`} fill="#ffffff" stroke={strokeColor} strokeWidth="1.2" />
              <polygon points={`80,${yVal - 6} 64,${yVal} 80,${yVal + 6}`} fill="#ffffff" stroke={strokeColor} strokeWidth="1.2" />
              <line x1="80" y1={yVal} x2={width} y2={yVal} stroke={strokeColor} strokeWidth="1.5" />
              <text x="64" y={yVal - 8} textAnchor="middle" fontSize="7" fontFamily="monospace" fontWeight="bold" fill="#0f172a">
                {`SDV-${1001 + idx}`}
              </text>
            </g>
          ))}
          {/* Summary Label */}
          <text
            x={width / 2}
            y={height - 8}
            textAnchor="middle"
            fontSize="8"
            fontFamily="sans-serif"
            fontWeight="bold"
            fill="#475569"
          >
            WELLHEAD INLETS (×4)
          </text>
        </g>
      );
    },
  },
};

/**
 * Resolves the renderer key through the shared registry, with local fallbacks
 * for offline operation and legacy drawing records.
 */
export function resolveSymbolClassKey(
  tag: string,
  rawType?: string,
  components?: ClientRegistryComponent[],
  classId?: string
): string {
  const t = (tag || '').trim().toUpperCase();
  const registryComponent = findClientRegistryComponent(t, rawType, components, classId);
  if (registryComponent) return registryComponent.symbol.key;
  if (t.includes('SDV_BANK') || t.includes('SDV-BANK') || t.includes('SDV BANK')) return 'sdv_bank';
  const rendererByType: Record<string, string> = {
    vessel: 'vessel',
    tank: 'tank',
    mixing_tank: 'tank',
    pump: 'pump',
    compressor: 'compressor',
    heat_exchanger: 'heat_exchanger',
    column: 'column',
    separator: 'separator',
    reactor: 'reactor',
    agitator: 'agitator',
    manual_valve: 'gate_valve',
    isolation_valve: 'esd_valve',
    control_valve: 'control_valve',
    drain_valve: 'gate_valve',
    check_valve: 'check_valve',
    relief_valve: 'relief_valve',
    instrument: 'instrument_field',
    offpage_connector: 'offpage_connector',
  };
  return rendererByType[(rawType || '').toLowerCase()] || 'gate_valve';
}

export function getViewerSymbolMetadata(
  tag: string,
  rawType: string | undefined,
  components: ClientRegistryComponent[] | undefined,
  classId?: string
): SymbolMetadata | undefined {
  const key = resolveSymbolClassKey(tag, rawType, components, classId);
  const existing = P_ID_SYMBOL_LIBRARY[key];
  if (existing) return existing;

  const registeredComponent = findClientRegistryComponent(tag, rawType, components, classId);
  const fallbackType = (rawType || '').toLowerCase();
  const fallbackTypes = new Set([
    'vessel', 'tank', 'mixing_tank', 'pump', 'compressor', 'heat_exchanger', 'column', 'separator', 'reactor', 'agitator',
  ]);
  const component = registeredComponent || (fallbackTypes.has(fallbackType)
    ? {
        class_id: `legacy.${fallbackType}`,
        name: fallbackType.replace(/_/g, ' '),
        category: 'equipment' as const,
        equipment_type: fallbackType,
        tag_prefixes: [],
        aliases: [],
        symbol: { key, viewBox: '0 0 100 100', variants: [] },
        ports: [
          { id: 'in', x: 0, y: 50, dir: 'left' as const, kind: 'process' as const, role: 'inlet' as const },
          { id: 'out', x: 100, y: 50, dir: 'right' as const, kind: 'process' as const, role: 'outlet' as const },
        ],
        inline: false,
        default_size_mm: { w: 1000, h: 1000 },
      }
    : undefined);
  if (!component || component.category === 'line') return undefined;
  const [, , viewWidth, viewHeight] = component.symbol.viewBox.split(/\s+/).map(Number);
  const width = viewWidth || 100;
  const height = viewHeight || 100;
  const ports: PortDefinition[] = component.ports.map((port) => ({
    id: port.id,
    name: port.id,
    type: port.role,
    relativePosition: {
      x: viewWidth ? (port.x / viewWidth) * width : width / 2,
      y: viewHeight ? (port.y / viewHeight) * height : height / 2,
    },
    normal: port.dir === 'left' ? { x: -1, y: 0 }
      : port.dir === 'right' ? { x: 1, y: 0 }
      : port.dir === 'up' ? { x: 0, y: -1 }
      : { x: 0, y: 1 },
  }));

  return {
    classKey: component.symbol.key,
    displayName: component.name,
    defaultWidth: width,
    defaultHeight: height,
    ports,
    render: ({ width: w, height: h, strokeColor, fillColor = '#ffffff', isSelected, tag: symbolTag }) => {
      const midX = w / 2;
      const midY = h / 2;
      const lineWidth = isSelected ? 2.5 : 1.75;
      let shape: React.ReactNode;

      switch (component.equipment_type) {
        case 'pump':
          shape = <><circle cx={midX} cy={midY} r={Math.min(w, h) * 0.31} fill={fillColor} stroke={strokeColor} strokeWidth={lineWidth} /><path d={`M ${midX - 6} ${midY + 8} L ${midX + 10} ${midY} L ${midX - 6} ${midY - 8} Z`} fill={strokeColor} /></>;
          break;
        case 'compressor':
          shape = <><circle cx={midX} cy={midY} r={Math.min(w, h) * 0.34} fill={fillColor} stroke={strokeColor} strokeWidth={lineWidth} /><path d={`M ${midX - 10} ${midY} Q ${midX} ${midY - 12} ${midX + 10} ${midY} Q ${midX} ${midY + 12} ${midX - 10} ${midY}`} fill="none" stroke={strokeColor} strokeWidth={lineWidth} /></>;
          break;
        case 'heat_exchanger':
          shape = <><rect x={w * 0.12} y={h * 0.2} width={w * 0.76} height={h * 0.6} rx={h * 0.3} fill={fillColor} stroke={strokeColor} strokeWidth={lineWidth} /><path d={`M ${w * 0.24} ${h * 0.68} L ${w * 0.76} ${h * 0.32} M ${w * 0.24} ${h * 0.32} L ${w * 0.76} ${h * 0.68}`} stroke={strokeColor} strokeWidth={lineWidth} /></>;
          break;
        case 'column':
          shape = <><rect x={w * 0.3} y={h * 0.08} width={w * 0.4} height={h * 0.84} rx={w * 0.2} fill={fillColor} stroke={strokeColor} strokeWidth={lineWidth} />{[0.3, 0.45, 0.6, 0.75].map((ratio) => <line key={ratio} x1={w * 0.34} y1={h * ratio} x2={w * 0.66} y2={h * ratio} stroke={strokeColor} strokeWidth="1.25" />)}</>;
          break;
        case 'reactor':
          shape = <><path d={`M ${w * 0.24} ${h * 0.2} Q ${midX} ${h * 0.03} ${w * 0.76} ${h * 0.2} L ${w * 0.76} ${h * 0.77} Q ${midX} ${h * 0.97} ${w * 0.24} ${h * 0.77} Z`} fill={fillColor} stroke={strokeColor} strokeWidth={lineWidth} /><line x1={midX} y1={h * 0.12} x2={midX} y2={h * 0.77} stroke={strokeColor} strokeWidth={lineWidth} /><line x1={w * 0.35} y1={h * 0.58} x2={w * 0.65} y2={h * 0.58} stroke={strokeColor} strokeWidth={lineWidth} /></>;
          break;
        case 'tank':
        case 'mixing_tank':
          shape = <><rect x={w * 0.16} y={h * 0.2} width={w * 0.68} height={h * 0.72} fill={fillColor} stroke={strokeColor} strokeWidth={lineWidth} /><path d={`M ${w * 0.16} ${h * 0.2} L ${midX} ${h * 0.06} L ${w * 0.84} ${h * 0.2}`} fill={fillColor} stroke={strokeColor} strokeWidth={lineWidth} /></>;
          break;
        default:
          shape = <><rect x={w * 0.2} y={h * 0.12} width={w * 0.6} height={h * 0.76} rx={component.equipment_type === 'vessel' ? w * 0.28 : 2} fill={fillColor} stroke={strokeColor} strokeWidth={lineWidth} /><line x1={w * 0.25} y1={midY} x2={w * 0.75} y2={midY} stroke={strokeColor} strokeWidth="1.2" /></>;
      }

      return (
        <g aria-label={component.name}>
          {shape}
          {symbolTag && <title>{`${component.name}: ${symbolTag}`}</title>}
        </g>
      );
    },
  };
}
