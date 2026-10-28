import React from 'react';
import { DrawingElement, DrawingPort } from '../../types';

interface SymbolRendererProps {
  element: DrawingElement;
  isSelected?: boolean;
  isConnecting?: boolean;
  connectingSourcePortId?: string | null;
  onSelect?: (element: DrawingElement, e: React.MouseEvent) => void;
  onPortClick?: (element: DrawingElement, port: DrawingPort, e: React.MouseEvent) => void;
  onStartDrag?: (element: DrawingElement, e: React.MouseEvent) => void;
}

export const SymbolRenderer: React.FC<SymbolRendererProps> = ({
  element,
  isSelected,
  isConnecting,
  connectingSourcePortId,
  onSelect,
  onPortClick,
  onStartDrag,
}) => {
  const { id, tag, type, position, size, rotation, ports, status } = element;
  const w = size.width || 90;
  const h = size.height || 110;
  const isConfirmed = status === 'confirmed';

  // Base stroke color based on status and selection
  const strokeColor = isSelected ? '#2563eb' : isConfirmed ? '#0f172a' : '#d97706';
  const fillColor = isSelected ? '#eff6ff' : '#ffffff';

  const renderShape = () => {
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
      {type !== 'instrument' && type !== 'offpage_connector' && type !== 'junction' && (
        <g transform={`translate(${w / 2}, ${h + 16})`}>
          <rect
            x={-tag.length * 4 - 8}
            y="-10"
            width={tag.length * 8 + 16}
            height="18"
            fill="#ffffff"
            stroke="#e2e8f0"
            strokeWidth="1"
            rx="3"
            opacity="0.9"
          />
          <text
            x="0"
            y="3"
            textAnchor="middle"
            fontFamily="monospace"
            fontSize="11"
            fontWeight="bold"
            fill="#0f172a"
          >
            {tag}
          </text>
        </g>
      )}

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
            <circle cx="0" cy="0" r="10" fill="transparent" />
            {/* Visual port handle */}
            <circle
              cx="0"
              cy="0"
              r={isConnecting ? 6 : 4}
              fill={portColor}
              stroke="#ffffff"
              strokeWidth="2"
              className="transition-all duration-150 group-hover:scale-150"
            />
            {/* Tooltip on hover */}
            <title>{`${port.name} (${port.type})`}</title>
          </g>
        );
      })}
    </g>
  );
};
