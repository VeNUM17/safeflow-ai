import React, { useEffect, useState } from 'react';
import { DrawingElement, DrawingPort } from '../../types';
import { P_ID_SYMBOL_LIBRARY, resolveSymbolClassKey } from '../pid-viewer/symbolLibrary';
import { ClientComponentRegistry, loadComponentRegistry } from '../../utils/componentRegistryClient';

interface SymbolRendererProps {
  element: DrawingElement;
  isSelected?: boolean;
  isConnecting?: boolean;
  connectingSourcePortId?: string | null;
  detailLevel?: 'standard' | 'high_detail';
  showPortPins?: boolean;
  zoom?: number;
  isRouteSource?: boolean;
  isRouteTarget?: boolean;
  onSelect?: (element: DrawingElement, e: React.MouseEvent) => void;
  onPortClick?: (element: DrawingElement, port: DrawingPort, e: React.MouseEvent) => void;
  onStartDrag?: (element: DrawingElement, e: React.MouseEvent) => void;
  onStartDragLabel?: (element: DrawingElement, e: React.MouseEvent) => void;
}

export const SymbolRenderer: React.FC<SymbolRendererProps> = ({
  element,
  isSelected,
  isConnecting,
  connectingSourcePortId,
  detailLevel = 'standard',
  showPortPins = false,
  zoom = 1.0,
  isRouteSource = false,
  isRouteTarget = false,
  onSelect,
  onPortClick,
  onStartDrag,
  onStartDragLabel,
}) => {
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [componentRegistry, setComponentRegistry] = useState<ClientComponentRegistry | null>(null);
  const { id, tag, type, position, size, rotation, ports, status } = element;
  const w = size.width || 90;
  const h = size.height || 110;
  const isConfirmed = status === 'confirmed';

  useEffect(() => {
    let active = true;
    loadComponentRegistry().then((registry) => {
      if (active) setComponentRegistry(registry);
    });
    return () => { active = false; };
  }, []);

  // Base stroke color based on status and selection
  const strokeColor = isSelected ? '#2563eb' : isConfirmed ? '#0f172a' : '#d97706';
  const fillColor = isSelected ? '#eff6ff' : '#ffffff';

  const renderShape = () => {
    // Check rich P&ID SVG Symbol Library first
    const symClass = resolveSymbolClassKey(tag, type, componentRegistry?.components, element.component_class_id);
    const symMeta = P_ID_SYMBOL_LIBRARY[symClass];
    if (symMeta) {
      return symMeta.render({
        width: w,
        height: h,
        strokeColor,
        fillColor,
        tag,
        isSelected,
        isHovered,
        detailLevel,
      });
    }

    switch (type) {
      case 'vessel': {
        const headH = Math.min(22, h * 0.2);
        return (
          <g>
            <rect x="0" y={headH} width={w} height={h - 2 * headH} fill={fillColor} stroke={strokeColor} strokeWidth="2.5" />
            <path d={`M 0 ${headH} C 0 0, ${w} 0, ${w} ${headH}`} fill={fillColor} stroke={strokeColor} strokeWidth="2.5" />
            <path d={`M 0 ${h - headH} C 0 ${h}, ${w} ${h}, ${w} ${h - headH}`} fill={fillColor} stroke={strokeColor} strokeWidth="2.5" />
            <line x1={w * 0.2} y1={h} x2={w * 0.15} y2={h + 12} stroke={strokeColor} strokeWidth="2" />
            <line x1={w * 0.8} y1={h} x2={w * 0.85} y2={h + 12} stroke={strokeColor} strokeWidth="2" />
          </g>
        );
      }

      case 'tank':
      case 'mixing_tank': {
        const coneH = Math.min(18, h * 0.18);
        return (
          <g>
            <rect x="0" y={coneH} width={w} height={h - coneH} fill={fillColor} stroke={strokeColor} strokeWidth="2.5" />
            <path d={`M 0 ${coneH} L ${w / 2} 0 L ${w} ${coneH} Z`} fill="#f1f5f9" stroke={strokeColor} strokeWidth="2.5" />
            {type === 'mixing_tank' && (
              <>
                <rect x={w / 2 - 10} y="-16" width="20" height="16" fill="#64748b" stroke={strokeColor} strokeWidth="2" />
                <line x1={w / 2} y1="0" x2={w / 2} y2={h * 0.75} stroke="#0284c7" strokeWidth="2" strokeDasharray="3,2" />
                <line x1={w * 0.25} y1={h * 0.7} x2={w * 0.75} y2={h * 0.7} stroke="#0284c7" strokeWidth="3" />
              </>
            )}
          </g>
        );
      }

      case 'reactor': {
        const headH = Math.min(18, h * 0.18);
        return (
          <g>
            <rect x="0" y={headH} width={w} height={h - 2 * headH} fill={fillColor} stroke={strokeColor} strokeWidth="2.5" />
            <path d={`M 0 ${headH} C 0 2, ${w} 2, ${w} ${headH}`} fill={fillColor} stroke={strokeColor} strokeWidth="2.5" />
            <path d={`M 0 ${h - headH} C 0 ${h - 2}, ${w} ${h - 2}, ${w} ${h - headH}`} fill={fillColor} stroke={strokeColor} strokeWidth="2.5" />
            <rect x={w / 2 - 12} y="-18" width="24" height="18" fill="#64748b" stroke={strokeColor} strokeWidth="2" />
            <line x1={w / 2} y1="0" x2={w / 2} y2={h * 0.75} stroke="#0284c7" strokeWidth="2" strokeDasharray="4,2" />
            <line x1={w * 0.2} y1={h * 0.55} x2={w * 0.8} y2={h * 0.55} stroke="#0284c7" strokeWidth="3" />
            <line x1={w * 0.2} y1={h * 0.75} x2={w * 0.8} y2={h * 0.75} stroke="#0284c7" strokeWidth="3" />
          </g>
        );
      }

      case 'pump': {
        const r = Math.min(w, h) / 2 - 4;
        const cx = w / 2;
        const cy = h / 2;
        return (
          <g>
            <circle cx={cx} cy={cy} r={r} fill={fillColor} stroke={strokeColor} strokeWidth="2.5" />
            <path d={`M ${cx} ${cy - r} L ${w} ${cy - r} L ${w} ${cy - r + 12} L ${cx + 10} ${cy - r + 12}`} fill={strokeColor} />
            <circle cx={cx} cy={cy} r="4" fill={strokeColor} />
            <path d={`M ${cx - r * 0.6} ${cy + r * 0.4} L ${cx} ${cy - r * 0.6} L ${cx + r * 0.6} ${cy + r * 0.4} Z`} fill="none" stroke="#64748b" strokeWidth="1.5" />
          </g>
        );
      }

      case 'compressor': {
        return (
          <g>
            <polygon points={`0,${h * 0.1} ${w},${h * 0.3} ${w},${h * 0.7} 0,${h * 0.9}`} fill={fillColor} stroke={strokeColor} strokeWidth="2.5" />
            <line x1={w * 0.3} y1={h * 0.2} x2={w * 0.3} y2={h * 0.8} stroke="#64748b" strokeWidth="2" />
            <line x1={w * 0.6} y1={h * 0.25} x2={w * 0.6} y2={h * 0.75} stroke="#64748b" strokeWidth="2" />
          </g>
        );
      }

      case 'heat_exchanger': {
        const r = h / 2;
        return (
          <g>
            <rect x={r * 0.5} y="0" width={w - r} height={h} fill={fillColor} stroke={strokeColor} strokeWidth="2.5" />
            <path d={`M ${r * 0.5} 0 C 0 0, 0 ${h}, ${r * 0.5} ${h}`} fill={fillColor} stroke={strokeColor} strokeWidth="2.5" />
            <path d={`M ${w - r * 0.5} 0 C ${w} 0, ${w} ${h}, ${w - r * 0.5} ${h}`} fill={fillColor} stroke={strokeColor} strokeWidth="2.5" />
            <line x1={r * 0.6} y1={h * 0.33} x2={w - r * 0.6} y2={h * 0.33} stroke="#0284c7" strokeWidth="1.5" strokeDasharray="3,3" />
            <line x1={r * 0.6} y1={h * 0.66} x2={w - r * 0.6} y2={h * 0.66} stroke="#0284c7" strokeWidth="1.5" strokeDasharray="3,3" />
          </g>
        );
      }

      case 'manual_valve':
      case 'isolation_valve':
      case 'drain_valve': {
        return (
          <g>
            <polygon points={`0,0 ${w / 2},${h / 2} 0,${h}`} fill={strokeColor} stroke={strokeColor} strokeWidth="1.5" />
            <polygon points={`${w},0 ${w / 2},${h / 2} ${w},${h}`} fill={strokeColor} stroke={strokeColor} strokeWidth="1.5" />
            <line x1={w / 2} y1={h / 2} x2={w / 2} y2="-8" stroke={strokeColor} strokeWidth="2" />
            <line x1={w / 2 - 10} y1="-8" x2={w / 2 + 10} y2="-8" stroke={strokeColor} strokeWidth="2.5" />
          </g>
        );
      }

      case 'control_valve': {
        return (
          <g>
            <polygon points={`0,${h * 0.3} ${w / 2},${h * 0.7} 0,${h}`} fill={strokeColor} stroke={strokeColor} strokeWidth="1.5" />
            <polygon points={`${w},${h * 0.3} ${w / 2},${h * 0.7} ${w},${h}`} fill={strokeColor} stroke={strokeColor} strokeWidth="1.5" />
            <line x1={w / 2} y1={h * 0.7} x2={w / 2} y2={h * 0.2} stroke={strokeColor} strokeWidth="2" />
            <path d={`M ${w / 2 - 14} ${h * 0.2} C ${w / 2 - 14} 0, ${w / 2 + 14} 0, ${w / 2 + 14} ${h * 0.2} Z`} fill="#e2e8f0" stroke={strokeColor} strokeWidth="2" />
          </g>
        );
      }

      case 'check_valve': {
        return (
          <g>
            <polygon points={`0,0 ${w / 2},${h / 2} 0,${h}`} fill={strokeColor} stroke={strokeColor} strokeWidth="1.5" />
            <polygon points={`${w},0 ${w / 2},${h / 2} ${w},${h}`} fill={strokeColor} stroke={strokeColor} strokeWidth="1.5" />
            <polyline points={`${w * 0.2},${h * 0.2} ${w * 0.8},${h * 0.5} ${w * 0.2},${h * 0.8}`} fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
        );
      }

      case 'relief_valve': {
        return (
          <g>
            <polygon points={`0,${h / 2} ${w / 2},${h / 2} ${w / 4},${h}`} fill="#dc2626" stroke="#dc2626" strokeWidth="1.5" />
            <line x1={w / 4} y1={h / 2} x2={w / 4} y2="0" stroke={strokeColor} strokeWidth="2" />
            <rect x={w / 4 - 6} y="2" width="12" height="16" fill={fillColor} stroke={strokeColor} strokeWidth="1.5" />
            <line x1={w / 4} y1={h / 2} x2={w} y2={h / 2} stroke="#dc2626" strokeWidth="3" />
            <polyline points={`${w - 6},${h / 2 - 4} ${w},${h / 2} ${w - 6},${h / 2 + 4}`} fill="none" stroke="#dc2626" strokeWidth="2" />
          </g>
        );
      }

      case 'instrument': {
        const r = Math.min(w, h) / 2;
        const cx = w / 2;
        const cy = h / 2;
        const parts = tag.split('-');
        return (
          <g>
            <circle cx={cx} cy={cy} r={r - 2} fill="#ffffff" stroke={isSelected ? '#2563eb' : '#0284c7'} strokeWidth="2" />
            <line x1="2" y1={cy} x2={w - 2} y2={cy} stroke="#0284c7" strokeWidth="1.5" />
            <text x={cx} y={cy - 4} textAnchor="middle" fontFamily="sans-serif" fontSize="11" fontWeight="bold" fill="#0f172a">
              {parts[0] || 'PIC'}
            </text>
            <text x={cx} y={cy + 13} textAnchor="middle" fontFamily="sans-serif" fontSize="11" fontWeight="bold" fill="#0f172a">
              {parts[1] || '101'}
            </text>
          </g>
        );
      }

      case 'offpage_connector': {
        return (
          <g>
            <polygon points={`0,0 ${w - 14},0 ${w},${h / 2} ${w - 14},${h} 0,${h}`} fill="#f1f5f9" stroke={strokeColor} strokeWidth="2" />
            <text x={(w - 14) / 2} y={h / 2 + 4} textAnchor="middle" fontFamily="sans-serif" fontSize="11" fontWeight="bold" fill="#334155">
              {tag || 'TO DWG'}
            </text>
          </g>
        );
      }

      case 'junction': {
        return (
          <circle cx={w / 2} cy={h / 2} r="6" fill={strokeColor} />
        );
      }

      case 'filter':
      case 'separator':
      default: {
        return (
          <g>
            <rect x="0" y="0" width={w} height={h} rx="6" fill={fillColor} stroke={strokeColor} strokeWidth="2.5" />
            <line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke="#94a3b8" strokeDasharray="3,3" />
          </g>
        );
      }
    }
  };

  return (
    <g
      id={`symbol-${id}`}
      transform={`translate(${position.x}, ${position.y}) rotate(${rotation || 0} ${w / 2} ${h / 2})`}
      className="cursor-move select-none"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(element, e);
      }}
      onMouseDown={(e) => {
        if (e.button === 0) {
          onStartDrag?.(element, e);
        }
      }}
    >
      {/* Route Source Highlight */}
      {isRouteSource && (
        <g className="pointer-events-none">
          <rect
            x="-10"
            y="-10"
            width={w + 20}
            height={h + 20}
            fill="rgba(16, 185, 129, 0.08)"
            stroke="#10b981"
            strokeWidth="2.5"
            strokeDasharray="5,3"
            rx="6"
          />
          <g transform={`translate(${w / 2}, -16)`}>
            <rect x="-35" y="-9" width="70" height="18" fill="#10b981" rx="4" />
            <text x="0" y="4" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold">
              ▲ FROM
            </text>
          </g>
        </g>
      )}

      {/* Route Target Highlight */}
      {isRouteTarget && (
        <g className="pointer-events-none">
          <rect
            x="-10"
            y="-10"
            width={w + 20}
            height={h + 20}
            fill="rgba(59, 130, 246, 0.08)"
            stroke="#3b82f6"
            strokeWidth="2.5"
            strokeDasharray="5,3"
            rx="6"
          />
          <g transform={`translate(${w / 2}, -16)`}>
            <rect x="-30" y="-9" width="60" height="18" fill="#3b82f6" rx="4" />
            <text x="0" y="4" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold">
              ▼ TO
            </text>
          </g>
        </g>
      )}

      {/* Selection Bounding Box */}
      {isSelected && (
        <rect
          x="-8"
          y="-8"
          width={w + 16}
          height={h + 16}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="1.5"
          strokeDasharray="4,4"
          rx="4"
        />
      )}

      {/* Symbol Graphics */}
      {renderShape()}

      {/* Engineering Tag Label (unless balloon or junction) */}
      {type !== 'instrument' && type !== 'offpage_connector' && type !== 'junction' && (() => {
        const offsetX = element.label_offset?.x || 0;
        const offsetY = element.label_offset?.y || 0;
        const defaultLabelX = w / 2;
        const defaultLabelY = h + 16;
        const labelCenterX = defaultLabelX + offsetX;
        const labelCenterY = defaultLabelY + offsetY;
        const isDisplaced = offsetX !== 0 || offsetY !== 0;

        // Semantic font size scaling: clamp minimum size so tags remain readable even at 40% zoom
        const labelScale = zoom < 0.65 ? Math.min(1.4, 0.75 / zoom) : 1.0;

        return (
          <g>
            {/* Leader line if tag is displaced from default location */}
            {isDisplaced && (
              <line
                x1={w / 2}
                y1={h / 2}
                x2={labelCenterX}
                y2={labelCenterY}
                stroke="#94a3b8"
                strokeWidth="1.25"
                strokeDasharray="3,2"
              />
            )}
            <g
              transform={`translate(${labelCenterX}, ${labelCenterY}) scale(${labelScale})`}
              className="cursor-move group/tag select-none"
              onMouseDown={(e) => {
                e.stopPropagation();
                onStartDragLabel?.(element, e);
              }}
            >
              <title>Drag tag label to reposition without changing connections</title>
              <rect
                x={-Math.max(tag.length * 4.5, 28) - 10}
                y="-10"
                width={Math.max(tag.length * 9, 56) + 20}
                height={detailLevel === 'high_detail' ? "30" : "18"}
                fill="#ffffff"
                stroke={isSelected ? "#2563eb" : isDisplaced ? "#6366f1" : "#cbd5e1"}
                strokeWidth={isSelected || isDisplaced ? "1.5" : "1"}
                rx="4"
                className="shadow-xs group-hover/tag:stroke-blue-500 transition-colors"
                opacity="0.98"
              />
              <text
                x="0"
                y="3"
                textAnchor="middle"
                fontFamily="monospace"
                fontSize="11"
                fontWeight="bold"
                fill="#0f172a"
                style={{
                  paintOrder: 'stroke fill',
                  stroke: '#ffffff',
                  strokeWidth: '3.5px',
                  strokeLinejoin: 'round',
                }}
              >
                {tag}
              </text>
              {detailLevel === 'high_detail' && (
                <text
                  x="0"
                  y="15"
                  textAnchor="middle"
                  fontFamily="sans-serif"
                  fontSize="8"
                  fontWeight="600"
                  fill={isConfirmed ? "#059669" : "#d97706"}
                >
                  {isConfirmed ? '✓ VERIFIED' : 'PROVISIONAL'} • {type.toUpperCase()}
                </text>
              )}
            </g>
          </g>
        );
      })()}

      {/* Interactive Port Connection Dots */}
      {ports.map((port) => {
        // Calculate port center relative to element origin
        let px = w / 2;
        let py = h / 2;
        if (Math.abs(port.position.x) > w / 2 || Math.abs(port.position.y) > h / 2) {
          px = port.position.x;
          py = port.position.y;
        } else {
          px += port.position.x;
          py += port.position.y;
        }

        const isPortSource = connectingSourcePortId === port.id;
        const isSignalPort = port.type === 'signal';
        const portColor = isPortSource
          ? '#e11d48'
          : isSignalPort
          ? '#0284c7'
          : '#10b981';

        return (
          <g
            key={port.id}
            transform={`translate(${px}, ${py})`}
            className="cursor-crosshair group"
            onClick={(e) => {
              e.stopPropagation();
              onPortClick?.(element, port, e);
            }}
          >
            {/* Extended click target */}
            <circle cx="0" cy="0" r="12" fill="transparent" />
            {/* Visual port handle (clean decluttered mode: subtle 1.5px pinhead unless hovered/selected) */}
            {(() => {
              const shouldHighlight = isConnecting || isSelected || isHovered || showPortPins || detailLevel === 'high_detail';
              return (
                <circle
                  cx="0"
                  cy="0"
                  r={isConnecting ? 6 : shouldHighlight ? 4.5 : 1.5}
                  opacity={shouldHighlight ? 1 : 0.35}
                  fill={portColor}
                  stroke={shouldHighlight ? "#ffffff" : "none"}
                  strokeWidth={shouldHighlight ? 1.5 : 0}
                  className="transition-all duration-150 group-hover:scale-150 shadow-sm"
                />
              );
            })()}
            {/* High-detail port label badge */}
            {(detailLevel === 'high_detail' || isSelected) && (
              <g transform="translate(0, -9)" className="pointer-events-none">
                <rect
                  x={-port.name.length * 3 - 4}
                  y="-8"
                  width={port.name.length * 6 + 8}
                  height="12"
                  rx="3"
                  fill="#0f172a"
                  opacity="0.85"
                />
                <text
                  x="0"
                  y="1"
                  textAnchor="middle"
                  fontFamily="monospace"
                  fontSize="7.5"
                  fontWeight="bold"
                  fill="#ffffff"
                >
                  {port.name}
                </text>
              </g>
            )}
            {/* Tooltip on hover */}
            <title>{`${port.name} (${port.type})`}</title>
          </g>
        );
      })}
    </g>
  );
};
