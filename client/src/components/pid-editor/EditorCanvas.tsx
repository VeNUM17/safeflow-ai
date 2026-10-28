import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Undo2,
  Redo2,
  Grid,
  Eye,
  EyeOff,
  Sliders,
  Trash2,
  RotateCw,
  Plus,
} from 'lucide-react';
import {
  DrawingElement,
  DrawingConnector,
  DrawingPort,
  FunctionalType,
} from '../../types';
import { SymbolRenderer } from './SymbolRenderer';

interface EditorCanvasProps {
  elements: DrawingElement[];
  connectors: DrawingConnector[];
  selectedElementId: string | null;
  selectedConnectorId: string | null;
  backgroundImageUrl?: string | null;
  backgroundVisible: boolean;
  backgroundOpacity: number;
  onUpdateElements: (elements: DrawingElement[]) => void;
  onUpdateConnectors: (connectors: DrawingConnector[]) => void;
  onSelectElement: (element: DrawingElement | null) => void;
  onSelectConnector: (connector: DrawingConnector | null) => void;
  onToggleBackgroundVisible: () => void;
  onChangeBackgroundOpacity: (opacity: number) => void;
  onPushHistory?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const EditorCanvas: React.FC<EditorCanvasProps> = ({
  elements,
  connectors,
  selectedElementId,
  selectedConnectorId,
  backgroundImageUrl,
  backgroundVisible,
  backgroundOpacity,
  onUpdateElements,
  onUpdateConnectors,
  onSelectElement,
  onSelectConnector,
  onToggleBackgroundVisible,
  onChangeBackgroundOpacity,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Viewport Transformation: Pan & Zoom
  const [zoom, setZoom] = useState<number>(0.85);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 40, y: 40 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Grid Snapping
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const GRID_SIZE = 20;

  // Dragging Element State
  const [draggingElementId, setDraggingElementId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Connection Tool State
  const [connectingSource, setConnectingSource] = useState<{
    elementId: string;
    portId: string;
    portType: DrawingPort['type'];
    x: number;
    y: number;
  } | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Canvas Dimensions
  const CANVAS_WIDTH = 2400;
  const CANVAS_HEIGHT = 1600;

  // Helper to convert screen coordinates to SVG canvas space
  const screenToCanvas = useCallback(
    (clientX: number, clientY: number) => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      const rawX = (clientX - rect.left - pan.x) / zoom;
      const rawY = (clientY - rect.top - pan.y) / zoom;
      return {
        x: Math.round(rawX),
        y: Math.round(rawY),
      };
    },
    [pan, zoom]
  );

  // Pan handlers
  const handleMouseDownBackground = (e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 1 || e.altKey) {
      // Deselect if clicking pure background
      onSelectElement(null);
      onSelectConnector(null);
      if (connectingSource) {
        setConnectingSource(null);
      }
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
      return;
    }

    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    setCursorPos({ x, y });

    if (draggingElementId) {
      let targetX = x - dragOffset.x;
      let targetY = y - dragOffset.y;

      if (snapToGrid) {
        targetX = Math.round(targetX / GRID_SIZE) * GRID_SIZE;
        targetY = Math.round(targetY / GRID_SIZE) * GRID_SIZE;
      }

      // Constrain within canvas bounds
      targetX = Math.max(10, Math.min(CANVAS_WIDTH - 120, targetX));
      targetY = Math.max(10, Math.min(CANVAS_HEIGHT - 120, targetY));

      onUpdateElements(
        elements.map((el) =>
          el.id === draggingElementId ? { ...el, position: { x: targetX, y: targetY } } : el
        )
      );
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingElementId(null);
  };

  // Zoom controls
  const handleZoomIn = () => setZoom((prev) => Math.min(2.5, prev * 1.2));
  const handleZoomOut = () => setZoom((prev) => Math.max(0.2, prev / 1.2));
  const handleResetZoom = () => {
    setZoom(1.0);
    setPan({ x: 40, y: 40 });
  };
  const handleFitToView = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = (rect.width - 60) / CANVAS_WIDTH;
    const scaleY = (rect.height - 60) / CANVAS_HEIGHT;
    const fitScale = Math.min(scaleX, scaleY, 1.0);
    setZoom(fitScale);
    setPan({
      x: (rect.width - CANVAS_WIDTH * fitScale) / 2,
      y: (rect.height - CANVAS_HEIGHT * fitScale) / 2,
    });
  };

  // Element drag start
  const handleStartDragElement = (element: DrawingElement, e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectElement(element);
    onSelectConnector(null);
    const canvasPoint = screenToCanvas(e.clientX, e.clientY);
    setDraggingElementId(element.id);
    setDragOffset({
      x: canvasPoint.x - element.position.x,
      y: canvasPoint.y - element.position.y,
    });
  };

  // Port click (start or complete connection)
  const handlePortClick = (element: DrawingElement, port: DrawingPort, e: React.MouseEvent) => {
    e.stopPropagation();

    // Calculate port coordinate
    const w = element.size.width || 90;
    const h = element.size.height || 110;
    let px = element.position.x + w / 2;
    let py = element.position.y + h / 2;
    if (Math.abs(port.position.x) > w / 2 || Math.abs(port.position.y) > h / 2) {
      px = element.position.x + port.position.x;
      py = element.position.y + port.position.y;
    } else {
      px += port.position.x;
      py += port.position.y;
    }

    if (!connectingSource) {
      // Start connection
      setConnectingSource({
        elementId: element.id,
        portId: port.id,
        portType: port.type,
        x: px,
        y: py,
      });
    } else {
      // Complete connection
      if (connectingSource.elementId === element.id && connectingSource.portId === port.id) {
        // Clicked the same port: cancel
        setConnectingSource(null);
        return;
      }

      // Check if either port is signal
      const isSignalLine =
        connectingSource.portType === 'signal' || port.type === 'signal';

      const lineFunctionalType: FunctionalType = isSignalLine
        ? 'signal_line'
        : 'piping_line';

      const fromEl = elements.find((el) => el.id === connectingSource.elementId);
      const lineNum = isSignalLine
        ? `SIG-${Math.floor(100 + Math.random() * 900)}`
        : `L-${fromEl?.tag || '100'}-${Math.floor(100 + Math.random() * 900)}`;

      const newConnector: DrawingConnector = {
        id: `conn-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        line_number: lineNum,
        from_element_id: connectingSource.elementId,
        from_port_id: connectingSource.portId,
        to_element_id: element.id,
        to_port_id: port.id,
        functional_type: lineFunctionalType,
        flow_direction: 'forward',
        size: isSignalLine ? undefined : '3"',
        material: isSignalLine ? undefined : 'Carbon Steel (A106-B)',
        assigned_chemical_id: isSignalLine ? null : fromEl?.assigned_chemical_id || null,
        status: 'provisional',
        confidence: 0.9,
      };

      onUpdateConnectors([...connectors, newConnector]);
      setConnectingSource(null);
      onSelectConnector(newConnector);
    }
  };

  // Rotate selected element
  const handleRotateSelected = () => {
    if (!selectedElementId) return;
    onUpdateElements(
      elements.map((el) =>
        el.id === selectedElementId
          ? { ...el, rotation: ((el.rotation || 0) + 90) % 360 }
          : el
      )
    );
  };

  // Delete selected item
  const handleDeleteSelected = () => {
    if (selectedElementId) {
      onUpdateElements(elements.filter((el) => el.id !== selectedElementId));
      onUpdateConnectors(
        connectors.filter(
          (c) =>
            c.from_element_id !== selectedElementId && c.to_element_id !== selectedElementId
        )
      );
      onSelectElement(null);
    } else if (selectedConnectorId) {
      onUpdateConnectors(connectors.filter((c) => c.id !== selectedConnectorId));
      onSelectConnector(null);
    }
  };

  // Keyboard shortcuts (Delete, Escape, Undo, Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDeleteSelected();
      } else if (e.key === 'Escape') {
        setConnectingSource(null);
        onSelectElement(null);
        onSelectConnector(null);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          onRedo?.();
        } else {
          onUndo?.();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Calculate dynamic connector paths
  const elementsMap = new Map<string, DrawingElement>();
  elements.forEach((el) => elementsMap.set(el.id, el));

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-900 overflow-hidden relative select-none">
      {/* Top Floating Canvas Toolbar */}
      <div className="absolute top-3 left-4 z-20 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md p-1.5 rounded-lg border border-slate-700/80 shadow-xl text-slate-300">
        <button
          onClick={handleZoomIn}
          className="p-1.5 hover:bg-slate-800 hover:text-white rounded transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-1.5 hover:bg-slate-800 hover:text-white rounded transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleResetZoom}
          className="px-2 py-1 text-xs font-mono hover:bg-slate-800 hover:text-white rounded transition-colors"
          title="Reset Zoom to 100%"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={handleFitToView}
          className="p-1.5 hover:bg-slate-800 hover:text-white rounded transition-colors"
          title="Fit to View"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-slate-700 mx-1" />

        <button
          onClick={() => setSnapToGrid(!snapToGrid)}
          className={`p-1.5 rounded transition-colors ${
            snapToGrid
              ? 'bg-blue-600/30 text-blue-400 border border-blue-500/50'
              : 'hover:bg-slate-800 hover:text-white'
          }`}
          title="Snap to Grid (20px)"
        >
          <Grid className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-slate-700 mx-1" />

        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="p-1.5 hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent rounded transition-colors"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="p-1.5 hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent rounded transition-colors"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        {(selectedElementId || selectedConnectorId) && (
          <>
            <div className="w-px h-4 bg-slate-700 mx-1" />
            {selectedElementId && (
              <button
                onClick={handleRotateSelected}
                className="p-1.5 hover:bg-slate-800 text-blue-400 hover:text-blue-300 rounded transition-colors"
                title="Rotate 90° Clockwise"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={handleDeleteSelected}
              className="p-1.5 hover:bg-red-950/60 text-red-400 hover:text-red-300 rounded transition-colors"
              title="Delete Selected Item"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Background Reference Overlay Controls */}
      {backgroundImageUrl && (
        <div className="absolute top-3 right-4 z-20 flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700/80 shadow-xl text-slate-300 text-xs">
          <span className="font-semibold text-slate-400 flex items-center gap-1">
            <Sliders className="w-3.5 h-3.5 text-blue-400" />
            Ref Drawing:
          </span>
          <button
            onClick={onToggleBackgroundVisible}
            className={`p-1 rounded transition-colors ${
              backgroundVisible ? 'text-blue-400' : 'text-slate-500'
            }`}
            title={backgroundVisible ? 'Hide Reference Image' : 'Show Reference Image'}
          >
            {backgroundVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <input
            type="range"
            min="0.05"
            max="1.0"
            step="0.05"
            value={backgroundOpacity}
            onChange={(e) => onChangeBackgroundOpacity(parseFloat(e.target.value))}
            className="w-20 accent-blue-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
            title={`Reference Opacity: ${Math.round(backgroundOpacity * 100)}%`}
          />
          <span className="font-mono text-[11px] text-slate-400 w-8">
            {Math.round(backgroundOpacity * 100)}%
          </span>
        </div>
      )}

      {/* Main Interactive Drawing Canvas Area */}
      <div
        ref={containerRef}
        className="w-full h-full relative cursor-grab active:cursor-grabbing overflow-hidden"
        onMouseDown={handleMouseDownBackground}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <svg
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
          className="shadow-2xl bg-white transition-transform duration-75"
        >
          <defs>
            {/* Grid Pattern */}
            <pattern
              id="editor-grid-pattern"
              width={GRID_SIZE}
              height={GRID_SIZE}
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1" cy="1" r="1" fill="#cbd5e1" opacity="0.6" />
            </pattern>
            {/* Major 100px Grid */}
            <pattern
              id="editor-major-grid"
              width={GRID_SIZE * 5}
              height={GRID_SIZE * 5}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${GRID_SIZE * 5} 0 L 0 0 0 ${GRID_SIZE * 5}`}
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="1"
              />
            </pattern>
          </defs>

          {/* Canvas Background & Grid */}
          <rect width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="#ffffff" />
          <rect width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="url(#editor-grid-pattern)" />
          <rect width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="url(#editor-major-grid)" />

          {/* Locked Reference Background Layer (Original uploaded drawing) */}
          {backgroundImageUrl && backgroundVisible && (
            <g
              id="reference-background-layer"
              opacity={backgroundOpacity}
              pointerEvents="none"
            >
              <image
                href={backgroundImageUrl}
                x="0"
                y="0"
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                preserveAspectRatio="xMidYMid meet"
              />
            </g>
          )}

          {/* Connectors (Piping & Signal Lines) Layer */}
          <g id="canvas-connectors">
            {connectors.map((conn) => {
              const fromEl = elementsMap.get(conn.from_element_id);
              const toEl = elementsMap.get(conn.to_element_id);
              if (!fromEl || !toEl) return null;

              const fromPort = fromEl.ports.find((p) => p.id === conn.from_port_id);
              const toPort = toEl.ports.find((p) => p.id === conn.to_port_id);

              const fw = fromEl.size.width || 90;
              const fh = fromEl.size.height || 110;
              let startX = fromEl.position.x + fw / 2;
              let startY = fromEl.position.y + fh / 2;
              if (fromPort) {
                if (Math.abs(fromPort.position.x) > fw / 2 || Math.abs(fromPort.position.y) > fh / 2) {
                  startX = fromEl.position.x + fromPort.position.x;
                  startY = fromEl.position.y + fromPort.position.y;
                } else {
                  startX += fromPort.position.x;
                  startY += fromPort.position.y;
                }
              }

              const tw = toEl.size.width || 90;
              const th = toEl.size.height || 110;
              let endX = toEl.position.x + tw / 2;
              let endY = toEl.position.y + th / 2;
              if (toPort) {
                if (Math.abs(toPort.position.x) > tw / 2 || Math.abs(toPort.position.y) > th / 2) {
                  endX = toEl.position.x + toPort.position.x;
                  endY = toEl.position.y + toPort.position.y;
                } else {
                  endX += toPort.position.x;
                  endY += toPort.position.y;
                }
              }

              // Path points
              const points: { x: number; y: number }[] = [{ x: startX, y: startY }];
              if (conn.waypoints && conn.waypoints.length > 0) {
                conn.waypoints.forEach((wp) => points.push({ x: wp.x, y: wp.y }));
              } else {
                // Default orthogonal routing
                if (Math.abs(startX - endX) > 20 && Math.abs(startY - endY) > 20) {
                  const midX = (startX + endX) / 2;
                  points.push({ x: midX, y: startY });
                  points.push({ x: midX, y: endY });
                }
              }
              points.push({ x: endX, y: endY });

              let pathD = `M ${points[0].x} ${points[0].y}`;
              for (let i = 1; i < points.length; i++) {
                pathD += ` L ${points[i].x} ${points[i].y}`;
              }

              const isConnSelected = selectedConnectorId === conn.id;
              const isSignal = conn.functional_type === 'signal_line';
              const strokeColor = isConnSelected
                ? '#2563eb'
                : isSignal
                ? '#0284c7'
                : '#0f172a';
              const strokeWidth = isConnSelected ? 4 : isSignal ? 2 : 3;

              // Midpoint calculation for flow arrow & tag
              const midIndex = Math.floor(points.length / 2);
              const pA = points[midIndex - 1] || points[0];
              const pB = points[midIndex] || points[points.length - 1];
              const midX = (pA.x + pB.x) / 2;
              const midY = (pA.y + pB.y) / 2;
              const angle = Math.atan2(pB.y - pA.y, pB.x - pA.x) * (180 / Math.PI);

              return (
                <g
                  key={conn.id}
                  id={`connector-${conn.id}`}
                  className="cursor-pointer group"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectConnector(conn);
                    onSelectElement(null);
                  }}
                >
                  {/* Invisible thicker stroke for easy clicking */}
                  <path d={pathD} fill="none" stroke="transparent" strokeWidth="16" />

                  {/* Visual Line */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={isSignal ? '6,4' : undefined}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    className="transition-colors"
                  />

                  {/* Flow Direction Arrow */}
                  {!isSignal && conn.flow_direction !== 'bidirectional' && (
                    <polygon
                      points="-7,-4 5,0 -7,4"
                      fill={strokeColor}
                      transform={`translate(${midX}, ${midY}) rotate(${angle})`}
                    />
                  )}

                  {/* Line Number Label */}
                  {conn.line_number && (
                    <g transform={`translate(${midX}, ${midY - 10})`}>
                      <rect
                        x={-conn.line_number.length * 3.5 - 4}
                        y="-8"
                        width={conn.line_number.length * 7 + 8}
                        height="16"
                        fill="#ffffff"
                        stroke={isConnSelected ? '#2563eb' : '#e2e8f0'}
                        strokeWidth="1"
                        rx="3"
                        opacity="0.95"
                      />
                      <text
                        x="0"
                        y="4"
                        textAnchor="middle"
                        fontFamily="monospace"
                        fontSize="10"
                        fontWeight="bold"
                        fill={isConnSelected ? '#2563eb' : '#475569'}
                      >
                        {conn.line_number}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>

          {/* Active Live Wiring Wire */}
          {connectingSource && (
            <g id="active-wiring-rubberband">
              <line
                x1={connectingSource.x}
                y1={connectingSource.y}
                x2={cursorPos.x}
                y2={cursorPos.y}
                stroke={connectingSource.portType === 'signal' ? '#0284c7' : '#e11d48'}
                strokeWidth="2.5"
                strokeDasharray="5,4"
                strokeLinecap="round"
              />
              <circle
                cx={cursorPos.x}
                cy={cursorPos.y}
                r="5"
                fill={connectingSource.portType === 'signal' ? '#0284c7' : '#e11d48'}
              />
            </g>
          )}

          {/* Elements Layer */}
          <g id="canvas-elements">
            {elements.map((el) => (
              <SymbolRenderer
                key={el.id}
                element={el}
                isSelected={selectedElementId === el.id}
                isConnecting={!!connectingSource}
                connectingSourcePortId={
                  connectingSource?.elementId === el.id ? connectingSource.portId : null
                }
                onSelect={(elem) => {
                  onSelectElement(elem);
                  onSelectConnector(null);
                }}
                onPortClick={handlePortClick}
                onStartDrag={handleStartDragElement}
              />
            ))}
          </g>
        </svg>
      </div>

      {/* Canvas Footnote / Instructions */}
      <div className="absolute bottom-2 left-4 z-20 pointer-events-none text-[11px] text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded-md border border-slate-700/60 flex items-center gap-2">
        <span>Click port to draw piping</span>
        <span>•</span>
        <span>Drag symbol to reposition</span>
        <span>•</span>
        <span>Delete key removes item</span>
        <span>•</span>
        <span>Pan with Alt+Drag</span>
      </div>
    </div>
  );
};
