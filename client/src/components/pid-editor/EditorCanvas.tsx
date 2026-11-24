import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
  Sparkles,
  Crosshair,
  Move,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Tag,
  Layers,
  Target,
  Spline,
} from 'lucide-react';
import {
  DrawingElement,
  DrawingConnector,
  DrawingPort,
  FunctionalType,
} from '../../types';
import { SymbolRenderer } from './SymbolRenderer';
import { computeDiagramBounds } from '../../utils/pidDeclutter';
import { OrthogonalRouter, RouteRequest, LineHop, JunctionDot } from '../pid-viewer/orthogonalRouter';
import { CrossingMinimizedLayoutEngine, LayoutNode } from '../pid-viewer/crossingMinimizedLayout';
import { SectionManager, PidSection } from '../pid-viewer/sectionModel';
import { resolveSymbolClassKey } from '../pid-viewer/symbolLibrary';

interface EditorCanvasProps {
  elements: DrawingElement[];
  connectors: DrawingConnector[];
  selectedElementId: string | null;
  selectedConnectorId: string | null;
  backgroundImageUrl?: string | null;
  backgroundVisible: boolean;
  backgroundOpacity: number;
  detailLevel?: 'standard' | 'high_detail';
  onToggleDetailLevel?: () => void;
  onUpdateElements: (elements: DrawingElement[]) => void;
  onUpdateConnectors: (connectors: DrawingConnector[]) => void;
  onSelectElement: (element: DrawingElement | null) => void;
  onSelectConnector: (connector: DrawingConnector | null) => void;
  onToggleBackgroundVisible: () => void;
  onChangeBackgroundOpacity: (opacity: number) => void;
  onPushHistory?: () => void;
  showPartitionGrid?: boolean;
  partitionGridType?: '2x2' | '3x3' | '4x4';
  partitionZones?: { id: string; name: string; row?: number; col?: number; bbox: { x: number; y: number; w: number; h: number }; elementCount: number; connectionCount: number }[];
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
  detailLevel = 'standard',
  onToggleDetailLevel,
  onUpdateElements,
  onUpdateConnectors,
  onSelectElement,
  onSelectConnector,
  onToggleBackgroundVisible,
  onChangeBackgroundOpacity,
  onPushHistory,
  showPartitionGrid = false,
  partitionGridType = '3x3',
  partitionZones = [],
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Viewport Transformation: Pan & Zoom
  const [zoom, setZoom] = useState<number>(0.95);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 60, y: 60 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Grid Snapping
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const GRID_SIZE = 20;

  // Dragging Element State
  const [draggingElementId, setDraggingElementId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hasMovedDuringDrag, setHasMovedDuringDrag] = useState<boolean>(false);

  // Dragging Label State (Reposition tag badges without altering process connectivity)
  const [draggingLabelElementId, setDraggingLabelElementId] = useState<string | null>(null);
  const [labelDragStart, setLabelDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [initialLabelOffset, setInitialLabelOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Spacebar Hand/Pan Mode
  const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);

  // Connection Tool State
  const [connectingSource, setConnectingSource] = useState<{
    elementId: string;
    portId: string;
    portType: DrawingPort['type'];
    x: number;
    y: number;
  } | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Reference Image Natural Dimensions & 1:1 Scale Calibration
  const [imageNaturalSize, setImageNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [refOffset, setRefOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [refScale, setRefScale] = useState<number>(1.0);
  const [showRefCalibrate, setShowRefCalibrate] = useState<boolean>(false);

  // Decluttering, Layer Filtering & Visual Clarity
  const [showSignalLines, setShowSignalLines] = useState<boolean>(true);
  const [lineLabelMode, setLineLabelMode] = useState<'hover' | 'all'>('hover');
  const [showPortPins, setShowPortPins] = useState<boolean>(false);
  const [hoveredConnectorId, setHoveredConnectorId] = useState<string | null>(null);

  useEffect(() => {
    if (!backgroundImageUrl) {
      setImageNaturalSize(null);
      return;
    }
    const img = new Image();
    img.src = backgroundImageUrl;
    img.onload = () => {
      setImageNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
  }, [backgroundImageUrl]);

  // High-Resolution Engineering Canvas Dimensions (1:1 aligned to Reference Drawing)
  const CANVAS_WIDTH = imageNaturalSize ? imageNaturalSize.width : 2400;
  const CANVAS_HEIGHT = imageNaturalSize ? imageNaturalSize.height : 1600;

  const [showSections, setShowSections] = useState<boolean>(false);

  // Native non-passive mouse wheel zoom anchored at cursor (isolates canvas zoom from outer page scroll)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      setZoom((prevZoom) => {
        const canvasX = (mouseX - pan.x) / prevZoom;
        const canvasY = (mouseY - pan.y) / prevZoom;

        const zoomDelta = e.deltaY < 0 ? 1.15 : 0.87;
        const nextZoom = Math.min(Math.max(0.2, prevZoom * zoomDelta), 4.0);
        const roundedZoom = parseFloat(nextZoom.toFixed(2));

        const nextPanX = mouseX - canvasX * roundedZoom;
        const nextPanY = mouseY - canvasY * roundedZoom;

        setPan({
          x: Math.round(nextPanX),
          y: Math.round(nextPanY),
        });

        return roundedZoom;
      });
    };

    container.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', onNativeWheel);
    };
  }, [pan.x, pan.y]);

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
    if (e.button === 0 || e.button === 1 || e.altKey || isSpacePressed) {
      if (e.button === 0 && !e.altKey && !isSpacePressed) {
        onSelectElement(null);
        onSelectConnector(null);
        if (connectingSource) {
          setConnectingSource(null);
        }
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

    // Dragging tag label independently
    if (draggingLabelElementId) {
      const dx = x - labelDragStart.x;
      const dy = y - labelDragStart.y;
      onUpdateElements(
        elements.map((el) =>
          el.id === draggingLabelElementId
            ? {
                ...el,
                label_offset: {
                  x: Math.round(initialLabelOffset.x + dx),
                  y: Math.round(initialLabelOffset.y + dy),
                },
              }
            : el
        )
      );
      return;
    }

    // Dragging equipment symbol
    if (draggingElementId) {
      setHasMovedDuringDrag(true);
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
    setDraggingLabelElementId(null);
    setHasMovedDuringDrag(false);
  };

  // Zoom controls
  const handleZoomIn = () => setZoom((prev) => Math.min(3.5, parseFloat((prev * 1.2).toFixed(2))));
  const handleZoomOut = () => setZoom((prev) => Math.max(0.2, parseFloat((prev / 1.2).toFixed(2))));
  const handleResetZoom = () => {
    setZoom(1.0);
    setPan({ x: 40, y: 40 });
  };

  // Fit entire P&ID drawing page in view
  const handleFitToPage = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const PADDING = 40;
    const scaleX = (rect.width - PADDING * 2) / CANVAS_WIDTH;
    const scaleY = (rect.height - PADDING * 2) / CANVAS_HEIGHT;
    const fitScale = Math.min(scaleX, scaleY, 1.0);
    const safeZoom = Math.max(0.2, parseFloat(fitScale.toFixed(2)));
    setZoom(safeZoom);
    setPan({
      x: Math.round((rect.width - CANVAS_WIDTH * safeZoom) / 2),
      y: Math.round((rect.height - CANVAS_HEIGHT * safeZoom) / 2),
    });
  };

  // Fit diagram equipment content into viewport
  const handleFitToContent = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (elements.length === 0) {
      handleFitToPage();
      return;
    }
    const bounds = computeDiagramBounds(elements);
    const PADDING = 70;
    const scaleX = (rect.width - PADDING * 2) / bounds.width;
    const scaleY = (rect.height - PADDING * 2) / bounds.height;
    const fitScale = Math.min(scaleX, scaleY, 1.4);
    const safeZoom = Math.max(0.35, Math.min(1.4, parseFloat(fitScale.toFixed(2))));
    setZoom(safeZoom);
    setPan({
      x: Math.round(rect.width / 2 - bounds.centerX * safeZoom),
      y: Math.round(rect.height / 2 - bounds.centerY * safeZoom),
    });
  };

  // Focus and center camera on a selected equipment item
  const handleFocusElement = (element: DrawingElement) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const targetZoom = 1.3;
    const elWidth = element.size.width || 90;
    const elHeight = element.size.height || 110;
    const elCenterX = element.position.x + elWidth / 2;
    const elCenterY = element.position.y + elHeight / 2;

    setZoom(targetZoom);
    setPan({
      x: Math.round(rect.width / 2 - elCenterX * targetZoom),
      y: Math.round(rect.height / 2 - elCenterY * targetZoom),
    });
  };

  // Focus and frame camera on a selected pipe route from source to destination
  const handleFocusConnector = (conn: DrawingConnector) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    const fromEl = elements.find((e) => e.id === conn.from_element_id);
    const toEl = elements.find((e) => e.id === conn.to_element_id);

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const includePoint = (px: number, py: number) => {
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    };

    if (fromEl) {
      includePoint(fromEl.position.x, fromEl.position.y);
      includePoint(fromEl.position.x + (fromEl.size.width || 90), fromEl.position.y + (fromEl.size.height || 110));
    }
    if (toEl) {
      includePoint(toEl.position.x, toEl.position.y);
      includePoint(toEl.position.x + (toEl.size.width || 90), toEl.position.y + (toEl.size.height || 110));
    }
    (conn.waypoints || []).forEach((wp) => includePoint(wp.x, wp.y));

    if (!isFinite(minX)) return;

    const routeWidth = Math.max(maxX - minX, 100);
    const routeHeight = Math.max(maxY - minY, 100);
    const PADDING = 140;

    const scaleX = (rect.width - PADDING) / routeWidth;
    const scaleY = (rect.height - PADDING) / routeHeight;
    const fitScale = Math.min(scaleX, scaleY, 1.4);
    const safeZoom = Math.max(0.4, Math.min(1.4, parseFloat(fitScale.toFixed(2))));

    const routeCenterX = minX + routeWidth / 2;
    const routeCenterY = minY + routeHeight / 2;

    setZoom(safeZoom);
    setPan({
      x: Math.round(rect.width / 2 - routeCenterX * safeZoom),
      y: Math.round(rect.height / 2 - routeCenterY * safeZoom),
    });
  };

  // Element drag start (records state snapshot immediately for reliable Undo)
  const handleStartDragElement = (element: DrawingElement, e: React.MouseEvent) => {
    e.stopPropagation();
    onPushHistory?.();
    onSelectElement(element);
    onSelectConnector(null);
    const canvasPoint = screenToCanvas(e.clientX, e.clientY);
    setDraggingElementId(element.id);
    setHasMovedDuringDrag(false);
    setDragOffset({
      x: canvasPoint.x - element.position.x,
      y: canvasPoint.y - element.position.y,
    });
  };

  // Label drag start (records state snapshot for Undo)
  const handleStartDragLabel = (element: DrawingElement, e: React.MouseEvent) => {
    e.stopPropagation();
    onPushHistory?.();
    onSelectElement(element);
    onSelectConnector(null);
    const canvasPoint = screenToCanvas(e.clientX, e.clientY);
    setDraggingLabelElementId(element.id);
    setLabelDragStart(canvasPoint);
    setInitialLabelOffset({
      x: element.label_offset?.x || 0,
      y: element.label_offset?.y || 0,
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

  // Keyboard shortcuts (Delete, Escape, Undo, Redo, Spacebar Pan, Fit)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.code === 'Space') {
        setIsSpacePressed(true);
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
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        handleFitToPage();
      } else if (e.key === 'f' && !e.ctrlKey && !e.metaKey) {
        handleFitToPage();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  });

  // Calculate dynamic connector paths
  const elementsMap = new Map<string, DrawingElement>();
  elements.forEach((el) => elementsMap.set(el.id, el));

  const selectedElement = elements.find((e) => e.id === selectedElementId) || null;
  const selectedConnector = connectors.find((c) => c.id === selectedConnectorId) || null;

  // Auto-Arrange Layout (Clean Horizontal Process Spine + Crossing-Minimized Branches)
  const handleAutoArrangeLayout = () => {
    onPushHistory?.();
    const result = CrossingMinimizedLayoutEngine.computeLayout(elements, connectors);

    const layoutNodeMap = new Map(result.nodes.map((n) => [n.id, n]));
    const updatedElements = elements.map((el) => {
      const layoutNode = layoutNodeMap.get(el.id);
      if (!layoutNode) return el;
      return {
        ...el,
        position: { x: layoutNode.x, y: layoutNode.y },
      };
    });

    const updatedConnectors = connectors.map((conn) => {
      const assigned = result.assignedPorts.get(conn.id);
      if (!assigned) return conn;
      return {
        ...conn,
        from_port_id: assigned.fromPortId,
        to_port_id: assigned.toPortId,
        waypoints: [],
      };
    });

    onUpdateElements(updatedElements);
    onUpdateConnectors(updatedConnectors);

    setTimeout(() => {
      handleFitToContent();
    }, 60);
  };

  // Compute Functional Sections
  const computedSections = useMemo(() => {
    const layoutNodes: LayoutNode[] = elements.map((el) => ({
      id: el.id,
      tag: el.tag,
      type: el.type,
      symClass: resolveSymbolClassKey(el.tag, el.type),
      x: el.position.x,
      y: el.position.y,
      width: el.size.width || 90,
      height: el.size.height || 110,
      sourceX: el.position.x,
      sourceY: el.position.y,
      isSpine: false,
      layerIndex: 0,
      branchDirection: 'spine',
    }));
    return SectionManager.computeSections(layoutNodes, connectors);
  }, [elements, connectors]);

  // Crossing-Aware Orthogonal Edge Routing
  const { routedResultsMap, lineHops, junctionDots } = useMemo(() => {
    const router = new OrthogonalRouter();

    const obstacles = elements.map((el) => ({
      id: el.id,
      x: el.position.x,
      y: el.position.y,
      width: el.size.width || 90,
      height: el.size.height || 110,
    }));
    router.setObstacles(obstacles);

    const requests: RouteRequest[] = [];
    const resultMap = new Map<string, { svgPath: string; points: { x: number; y: number }[] }>();

    for (const conn of connectors) {
      if (conn.waypoints && conn.waypoints.length > 0) continue;

      const fromEl = elementsMap.get(conn.from_element_id);
      const toEl = elementsMap.get(conn.to_element_id);
      if (!fromEl || !toEl) continue;

      const fromPort = fromEl.ports.find((p) => p.id === conn.from_port_id);
      const toPort = toEl.ports.find((p) => p.id === conn.to_port_id);

      const fw = fromEl.size.width || 90;
      const fh = fromEl.size.height || 110;
      let startX = fromEl.position.x + fw / 2;
      let startY = fromEl.position.y + fh / 2;
      let startNormal = { x: 1, y: 0 };
      if (fromPort) {
        if (Math.abs(fromPort.position.x) > fw / 2 || Math.abs(fromPort.position.y) > fh / 2) {
          startX = fromEl.position.x + fromPort.position.x;
          startY = fromEl.position.y + fromPort.position.y;
        } else {
          startX += fromPort.position.x;
          startY += fromPort.position.y;
        }
        if (fromPort.position.x < -10) startNormal = { x: -1, y: 0 };
        else if (fromPort.position.x > 10) startNormal = { x: 1, y: 0 };
        else if (fromPort.position.y < -10) startNormal = { x: 0, y: -1 };
        else if (fromPort.position.y > 10) startNormal = { x: 0, y: 1 };
      }

      const tw = toEl.size.width || 90;
      const th = toEl.size.height || 110;
      let endX = toEl.position.x + tw / 2;
      let endY = toEl.position.y + th / 2;
      let endNormal = { x: -1, y: 0 };
      if (toPort) {
        if (Math.abs(toPort.position.x) > tw / 2 || Math.abs(toPort.position.y) > th / 2) {
          endX = toEl.position.x + toPort.position.x;
          endY = toEl.position.y + toPort.position.y;
        } else {
          endX += toPort.position.x;
          endY += toPort.position.y;
        }
        if (toPort.position.x < -10) endNormal = { x: -1, y: 0 };
        else if (toPort.position.x > 10) endNormal = { x: 1, y: 0 };
        else if (toPort.position.y < -10) endNormal = { x: 0, y: -1 };
        else if (toPort.position.y > 10) endNormal = { x: 0, y: 1 };
      }

      requests.push({
        edgeId: conn.id,
        sourcePoint: { x: Math.round(startX), y: Math.round(startY) },
        sourceNormal: startNormal,
        targetPoint: { x: Math.round(endX), y: Math.round(endY) },
        targetNormal: endNormal,
        lineType: conn.functional_type || 'process',
        sourceNodeId: fromEl.id,
        targetNodeId: toEl.id,
      });
    }

    try {
      const { results, hops, junctions } = router.routeAllEdges(requests);
      for (const r of results) {
        resultMap.set(r.edgeId, { svgPath: r.svgPath, points: r.points });
      }
      return {
        routedResultsMap: resultMap,
        lineHops: hops,
        junctionDots: junctions,
      };
    } catch (err) {
      console.warn('OrthogonalRouter fallback in EditorCanvas:', err);
      return {
        routedResultsMap: resultMap,
        lineHops: [],
        junctionDots: [],
      };
    }
  }, [elements, connectors, elementsMap]);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-900 overflow-hidden relative select-none">
      {/* Top Floating Canvas Toolbar */}
      <div className="absolute top-3 left-4 z-20 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md p-1.5 rounded-lg border border-slate-700/80 shadow-xl text-slate-300">
        <button
          onClick={handleZoomIn}
          className="p-1.5 hover:bg-slate-800 hover:text-white rounded transition-colors"
          title="Zoom In (or Wheel Up)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-1.5 hover:bg-slate-800 hover:text-white rounded transition-colors"
          title="Zoom Out (or Wheel Down)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleResetZoom}
          className="px-2 py-1 text-xs font-mono font-bold hover:bg-slate-800 text-blue-400 hover:text-white rounded transition-colors"
          title="Reset Zoom to 100%"
        >
          {Math.round(zoom * 100)}%
        </button>

        {/* Quick Zoom Presets */}
        <div className="hidden sm:flex items-center gap-0.5 bg-slate-950/80 rounded p-0.5 border border-slate-800">
          {[0.5, 0.75, 1.0, 1.5, 2.0].map((level) => (
            <button
              key={level}
              onClick={() => setZoom(level)}
              className={`px-1.5 py-0.5 text-[10px] font-mono rounded transition-colors ${
                Math.abs(zoom - level) < 0.05
                  ? 'bg-blue-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title={`Zoom to ${Math.round(level * 100)}%`}
            >
              {Math.round(level * 100)}%
            </button>
          ))}
        </div>

        {/* Fit to Page & Fit to Content Controls */}
        <div className="flex items-center gap-1 bg-slate-950/80 rounded p-0.5 border border-slate-800">
          <button
            onClick={handleFitToPage}
            className="px-2 py-1 text-xs font-semibold hover:bg-slate-800 text-blue-400 hover:text-blue-300 rounded flex items-center gap-1 transition-colors"
            title="Fit entire P&ID drawing page into view (Press F or Ctrl+0)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Fit Page</span>
          </button>
          <button
            onClick={handleFitToContent}
            className="px-2 py-1 text-xs font-semibold hover:bg-slate-800 text-emerald-400 hover:text-emerald-300 rounded flex items-center gap-1 transition-colors"
            title="Fit diagram equipment content into viewport"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Fit Content</span>
          </button>
        </div>

        {/* Contextual Focus Controls on Selection */}
        {selectedElement && (
          <button
            onClick={() => handleFocusElement(selectedElement)}
            className="px-2.5 py-1 text-xs font-semibold bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/50 rounded flex items-center gap-1.5 transition-all shadow-xs animate-pulse-glow"
            title={`Center and focus view on ${selectedElement.tag}`}
          >
            <Target className="w-3.5 h-3.5 text-blue-400" />
            <span>Focus {selectedElement.tag}</span>
          </button>
        )}
        {selectedConnector && (
          <button
            onClick={() => handleFocusConnector(selectedConnector)}
            className="px-2.5 py-1 text-xs font-semibold bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 border border-cyan-500/50 rounded flex items-center gap-1.5 transition-all shadow-xs animate-pulse-glow"
            title={`Frame full route ${selectedConnector.line_number || 'Pipe Route'}`}
          >
            <Spline className="w-3.5 h-3.5 text-cyan-400" />
            <span>Focus Route</span>
          </button>
        )}

        <div className="w-px h-4 bg-slate-700 mx-1" />

        {/* Detail Level Toggle */}
        {onToggleDetailLevel && (
          <button
            onClick={onToggleDetailLevel}
            className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all ${
              detailLevel === 'high_detail'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Toggle Detailed View: Shows nozzle port IDs, equipment verifications & full line tags"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
            <span className="hidden md:inline">{detailLevel === 'high_detail' ? 'High Detail ON' : 'Detail'}</span>
          </button>
        )}

        <div className="w-px h-4 bg-slate-700 mx-1" />

        {/* Auto-Arrange Crossing-Minimized Layout */}
        <button
          onClick={handleAutoArrangeLayout}
          className="px-2.5 py-1 text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border border-amber-500/50 rounded flex items-center gap-1.5 transition-all shadow-xs"
          title="Auto-Arrange Layout: Aligns elements along the process spine with crossing-minimized branches and nozzles"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">Auto-Arrange</span>
        </button>

        {/* Functional Sections Toggle */}
        <button
          onClick={() => setShowSections(!showSections)}
          className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all ${
            showSections
              ? 'bg-purple-600/30 text-purple-300 border border-purple-500/50'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
          title="Toggle Functional Section Boundaries (Inlet, Slug Catcher, Relief, Drain, SIS)"
        >
          <Layers className="w-3.5 h-3.5 text-purple-400" />
          <span className="hidden sm:inline">Sections</span>
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

        <div className="w-px h-4 bg-slate-700 mx-1" />

        {/* Visual Layer Toggles */}
        <div className="flex items-center gap-1 bg-slate-950/60 p-0.5 rounded border border-slate-800">
          <button
            onClick={() => setShowSignalLines(!showSignalLines)}
            className={`px-2 py-1 text-xs font-medium rounded flex items-center gap-1 transition-colors ${
              showSignalLines
                ? 'bg-sky-600/30 text-sky-300 border border-sky-500/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Toggle Instrument Signal Lines (hide to inspect pure process piping)"
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{showSignalLines ? 'Signals ON' : 'Piping Only'}</span>
          </button>

          <button
            onClick={() => setLineLabelMode((m) => (m === 'all' ? 'hover' : 'all'))}
            className={`px-2 py-1 text-xs font-medium rounded flex items-center gap-1 transition-colors ${
              lineLabelMode === 'all'
                ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title={lineLabelMode === 'all' ? 'Showing all line number tags' : 'Clean View: Line tags appear on hover/selection'}
          >
            <Tag className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{lineLabelMode === 'all' ? 'All Tags' : 'Clean Tags'}</span>
          </button>

          <button
            onClick={() => setShowPortPins(!showPortPins)}
            className={`px-2 py-1 text-xs font-medium rounded flex items-center gap-1 transition-colors ${
              showPortPins
                ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title={showPortPins ? 'Showing all port connection pins' : 'Clean Port Pins: Pins show on hover or wiring'}
          >
            <span className={`w-2 h-2 rounded-full ${showPortPins ? 'bg-emerald-400' : 'bg-slate-500'}`} />
            <span className="hidden lg:inline">{showPortPins ? 'Pins ON' : 'Clean Pins'}</span>
          </button>
        </div>

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

          <div className="w-px h-4 bg-slate-700 mx-0.5" />

          {/* 1:1 Exact Scale Overlap Button */}
          <button
            onClick={() => {
              setRefOffset({ x: 0, y: 0 });
              setRefScale(1.0);
              setPan({ x: 40, y: 40 });
              setZoom(1.0);
            }}
            className="px-2 py-0.5 bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white rounded text-[11px] font-semibold border border-blue-500/40 flex items-center gap-1 transition-colors"
            title="Snap Canvas & Drawing to 1:1 Exact Scale Overlap"
          >
            <Crosshair className="w-3 h-3 text-blue-300" />
            <span>1:1 Match</span>
          </button>

          {/* Fine Calibration Toggle */}
          <button
            onClick={() => setShowRefCalibrate(!showRefCalibrate)}
            className={`p-1 rounded transition-colors ${
              showRefCalibrate
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Nudge & Fine-Tune Image Calibration"
          >
            <Move className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Floating Image Fine-Calibration Widget */}
      {backgroundImageUrl && backgroundVisible && showRefCalibrate && (
        <div className="absolute top-14 right-4 z-20 bg-slate-900/95 backdrop-blur-md p-2.5 rounded-xl border border-slate-700 shadow-2xl text-slate-200 text-xs space-y-2 select-none w-52">
          <div className="flex items-center justify-between pb-1 border-b border-slate-800">
            <span className="font-bold text-[11px] text-slate-300 flex items-center gap-1">
              <Move className="w-3 h-3 text-indigo-400" />
              Calibrate Image Overlay
            </span>
            <span className="font-mono text-[10px] text-slate-500">
              {Math.round(refScale * 100)}% scale
            </span>
          </div>

          <div className="text-[10px] text-slate-400 flex items-center justify-between">
            <span>Offset: ({refOffset.x}px, {refOffset.y}px)</span>
            <button
              onClick={() => {
                setRefOffset({ x: 0, y: 0 });
                setRefScale(1.0);
              }}
              className="text-blue-400 hover:underline"
            >
              Reset
            </button>
          </div>

          {/* Nudge D-Pad */}
          <div className="flex flex-col items-center gap-1 pt-1">
            <button
              onClick={() => setRefOffset((prev) => ({ ...prev, y: prev.y - 5 }))}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
              title="Nudge Up 5px"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setRefOffset((prev) => ({ ...prev, x: prev.x - 5 }))}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                title="Nudge Left 5px"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="w-3 h-3 rounded-full bg-indigo-500/40 border border-indigo-400" />
              <button
                onClick={() => setRefOffset((prev) => ({ ...prev, x: prev.x + 5 }))}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                title="Nudge Right 5px"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              onClick={() => setRefOffset((prev) => ({ ...prev, y: prev.y + 5 }))}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
              title="Nudge Down 5px"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Scale Fine-Tuning */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[11px]">
            <span className="text-slate-400">Scale factor:</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setRefScale((s) => parseFloat(Math.max(0.5, s - 0.02).toFixed(3)))}
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-mono text-[10px]"
                title="Shrink image 2%"
              >
                -2%
              </button>
              <button
                onClick={() => setRefScale((s) => parseFloat(Math.min(2.0, s + 0.02).toFixed(3)))}
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-mono text-[10px]"
                title="Enlarge image 2%"
              >
                +2%
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Interactive Drawing Canvas Area */}
      <div
        ref={containerRef}
        className="w-full h-full relative cursor-grab active:cursor-grabbing overflow-hidden overscroll-contain touch-none"
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
            transition: isPanning || draggingElementId || draggingLabelElementId ? 'none' : 'transform 180ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          className="shadow-2xl bg-white"
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

          {/* Partition Grid Overlay (Dividing big P&ID into small precision zones) */}
          {showPartitionGrid && (
            <g id="partition-grid-overlay" pointerEvents="none">
              {(() => {
                const [rows, cols] = partitionGridType.split('x').map((n) => parseInt(n, 10));
                const cellW = CANVAS_WIDTH / cols;
                const cellH = CANVAS_HEIGHT / rows;
                const zones = [];
                let idx = 0;
                for (let r = 0; r < rows; r++) {
                  for (let c = 0; c < cols; c++) {
                    idx++;
                    const x = Math.round(c * cellW);
                    const y = Math.round(r * cellH);
                    const w = Math.round(cellW);
                    const h = Math.round(cellH);
                    const zoneEq = elements.filter(
                      (el) =>
                        el.position.x >= x &&
                        el.position.x < x + w &&
                        el.position.y >= y &&
                        el.position.y < y + h
                    );
                    const customInfo = partitionZones.find((pz) => pz.row === r && pz.col === c);

                    zones.push(
                      <g key={`zone-${r}-${c}`}>
                        <rect
                          x={x}
                          y={y}
                          width={w}
                          height={h}
                          fill="#2563eb"
                          fillOpacity={idx % 2 === 0 ? 0.03 : 0.015}
                          stroke="#3b82f6"
                          strokeWidth="2"
                          strokeDasharray="8 6"
                        />
                        <foreignObject x={x + 10} y={y + 10} width={220} height={50}>
                          <div className="bg-slate-900/90 border border-blue-500/60 rounded px-2.5 py-1 text-[11px] shadow-md backdrop-blur-xs">
                            <div className="font-bold text-blue-300 flex items-center justify-between">
                              <span>Part {idx} [{r+1},{c+1}]</span>
                              <span className="text-[10px] bg-blue-900/70 text-blue-200 px-1.5 py-0.2 rounded font-mono">
                                {zoneEq.length} Assets
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {customInfo?.name || `Sub-Drawing Area [${x},${y}]`}
                            </div>
                          </div>
                        </foreignObject>
                      </g>
                    );
                  }
                }
                return zones;
              })()}
            </g>
          )}

          {/* Locked Reference Background Layer (Original uploaded drawing - 1:1 Scale Overlap) */}
          {backgroundImageUrl && backgroundVisible && (
            <g
              id="reference-background-layer"
              opacity={backgroundOpacity}
              pointerEvents="none"
            >
              <image
                href={backgroundImageUrl}
                x={refOffset.x}
                y={refOffset.y}
                width={Math.round(CANVAS_WIDTH * refScale)}
                height={Math.round(CANVAS_HEIGHT * refScale)}
                preserveAspectRatio="none"
              />
            </g>
          )}

          {/* Functional Sections Layer */}
          {showSections && (
            <g id="canvas-sections">
              {computedSections.map((sec: PidSection) => (
                <g
                  key={sec.id}
                  id={`section-${sec.id}`}
                  className="cursor-pointer group"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (containerRef.current) {
                      const rect = containerRef.current.getBoundingClientRect();
                      const pad = 40;
                      const scaleX = rect.width / (sec.bounds.width + pad * 2);
                      const scaleY = rect.height / (sec.bounds.height + pad * 2);
                      const nextZoom = Math.min(Math.max(0.4, Math.min(scaleX, scaleY)), 2.5);
                      const centerX = sec.bounds.x + sec.bounds.width / 2;
                      const centerY = sec.bounds.y + sec.bounds.height / 2;
                      setZoom(parseFloat(nextZoom.toFixed(2)));
                      setPan({
                        x: Math.round(rect.width / 2 - centerX * nextZoom),
                        y: Math.round(rect.height / 2 - centerY * nextZoom),
                      });
                    }
                  }}
                >
                  <rect
                    x={sec.bounds.x}
                    y={sec.bounds.y}
                    width={sec.bounds.width}
                    height={sec.bounds.height}
                    fill={sec.color}
                    fillOpacity="0.04"
                    stroke={sec.color}
                    strokeWidth="1.5"
                    strokeDasharray="6,4"
                    rx="8"
                    className="group-hover:stroke-width-2 transition-all"
                  />
                  <g transform={`translate(${sec.bounds.x + 12}, ${sec.bounds.y + 16})`}>
                    <rect
                      x="-4"
                      y="-12"
                      width={sec.title.length * 6.8 + 16}
                      height="18"
                      fill="#0f172a"
                      stroke={sec.color}
                      strokeWidth="1"
                      rx="4"
                      opacity="0.95"
                    />
                    <text
                      x="4"
                      y="1"
                      fill={sec.color}
                      fontFamily="sans-serif"
                      fontSize="9.5"
                      fontWeight="bold"
                    >
                      {sec.title}
                    </text>
                  </g>
                </g>
              ))}
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

              // Path points and SVG path calculation via Crossing-Aware Orthogonal Router
              let pathD = '';
              let points: { x: number; y: number }[] = [];

              if (conn.waypoints && conn.waypoints.length > 0) {
                points = [{ x: startX, y: startY }, ...conn.waypoints, { x: endX, y: endY }];
                pathD = `M ${points[0].x} ${points[0].y}`;
                for (let i = 1; i < points.length; i++) {
                  pathD += ` L ${points[i].x} ${points[i].y}`;
                }
              } else {
                const routed = routedResultsMap.get(conn.id);
                if (routed && routed.svgPath && routed.points.length >= 2) {
                  pathD = routed.svgPath;
                  points = routed.points;
                } else {
                  // Fallback strict orthogonal segments
                  const midX = Math.round((startX + endX) / 2);
                  points = [
                    { x: startX, y: startY },
                    { x: midX, y: startY },
                    { x: midX, y: endY },
                    { x: endX, y: endY },
                  ];
                  pathD = `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
                }
              }

              const isConnSelected = selectedConnectorId === conn.id;
              const isSignal = conn.functional_type === 'signal_line';
              if (!showSignalLines && isSignal) {
                return null;
              }
              const isHovered = hoveredConnectorId === conn.id;
              const strokeColor = isConnSelected
                ? '#2563eb'
                : isHovered
                ? '#38bdf8'
                : isSignal
                ? '#d97706'
                : '#0f172a';
              const strokeWidth = isConnSelected ? 4.5 : isHovered ? 3.5 : isSignal ? 1.75 : 3;

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
                  onMouseEnter={() => setHoveredConnectorId(conn.id)}
                  onMouseLeave={() => setHoveredConnectorId(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectConnector(conn);
                    onSelectElement(null);
                  }}
                >
                  {/* Invisible thicker stroke for easy clicking */}
                  <path d={pathD} fill="none" stroke="transparent" strokeWidth="18" />

                  {/* Route Selection / Hover Glowing Halo */}
                  {(isConnSelected || isHovered) && (
                    <path
                      d={pathD}
                      fill="none"
                      stroke={isConnSelected ? '#38bdf8' : '#7dd3fc'}
                      strokeWidth={strokeWidth + 8}
                      opacity={isConnSelected ? 0.45 : 0.25}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      className="pointer-events-none"
                    />
                  )}

                  {/* Visual Line */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={isSignal ? '5,4' : undefined}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    className="transition-colors"
                  />

                  {/* Animated flow traveling dashes on selected process route */}
                  {isConnSelected && !isSignal && (
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="2"
                      strokeDasharray="6,8"
                      className="animate-flow-dash pointer-events-none"
                      opacity="0.85"
                    />
                  )}

                  {/* Flow Direction Arrow */}
                  {!isSignal && conn.flow_direction !== 'bidirectional' && (
                    <polygon
                      points="-8,-5 6,0 -8,5"
                      fill={isConnSelected ? '#1d4ed8' : strokeColor}
                      stroke="#ffffff"
                      strokeWidth="1"
                      transform={`translate(${midX}, ${midY}) rotate(${angle})`}
                    />
                  )}

                  {/* Line Number Label with Crisp Opaque Pill Background */}
                  {conn.line_number && (lineLabelMode === 'all' || isConnSelected || isHovered) && (
                    <g transform={`translate(${midX}, ${midY - 12})`} className="select-none pointer-events-none">
                      <rect
                        x={-conn.line_number.length * 3.8 - 6}
                        y="-9"
                        width={conn.line_number.length * 7.6 + 12}
                        height="18"
                        fill="#ffffff"
                        stroke={isConnSelected ? '#2563eb' : isHovered ? '#38bdf8' : '#cbd5e1'}
                        strokeWidth={isConnSelected ? '2' : isHovered ? '1.5' : '1'}
                        rx="4"
                        opacity="0.98"
                        className="shadow-xs"
                      />
                      <text
                        x="0"
                        y="4"
                        textAnchor="middle"
                        fontFamily="monospace"
                        fontSize="10"
                        fontWeight="bold"
                        fill={isConnSelected ? '#1d4ed8' : isHovered ? '#0284c7' : '#0f172a'}
                        style={{
                          paintOrder: 'stroke fill',
                          stroke: '#ffffff',
                          strokeWidth: '3.5px',
                          strokeLinejoin: 'round',
                        }}
                      >
                        {conn.line_number}
                      </text>
                    </g>
                  )}

                  {/* Midpoint Route Context HUD on Selection */}
                  {isConnSelected && fromEl && toEl && (
                    <g transform={`translate(${midX}, ${midY + 22})`} className="pointer-events-none select-none">
                      <rect
                        x="-125"
                        y="-10"
                        width="250"
                        height="20"
                        fill="#0f172a"
                        stroke="#38bdf8"
                        strokeWidth="1.5"
                        rx="5"
                        opacity="0.96"
                        className="shadow-md"
                      />
                      <text
                        x="0"
                        y="4"
                        textAnchor="middle"
                        fontFamily="sans-serif"
                        fontSize="9.5"
                        fontWeight="600"
                        fill="#f8fafc"
                      >
                        {fromEl.tag} ➔ {toEl.tag} • {conn.size || '3"'} • {conn.material || 'CS'} • {conn.flow_direction.toUpperCase()}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Line Hops (Arc jumps at orthogonal line crossings) */}
            {lineHops.map((hop: LineHop, i: number) => (
              <path
                key={`hop-${i}`}
                d={`M ${hop.crossX - 7} ${hop.crossY} A 7 7 0 0 1 ${hop.crossX + 7} ${hop.crossY}`}
                fill="none"
                stroke="#0f172a"
                strokeWidth="3.5"
                strokeLinecap="round"
                className="pointer-events-none"
              />
            ))}

            {/* Junction Dots (ISA-5.1 connection points) */}
            {junctionDots.map((junc: JunctionDot, i: number) => (
              <circle
                key={`junc-${i}`}
                cx={junc.x}
                cy={junc.y}
                r="3.5"
                fill="#0f172a"
                stroke="#ffffff"
                strokeWidth="1"
                className="pointer-events-none"
              />
            ))}
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
            {elements.map((el) => {
              const selectedConn = connectors.find((c) => c.id === selectedConnectorId);
              const isRouteSource = selectedConn?.from_element_id === el.id;
              const isRouteTarget = selectedConn?.to_element_id === el.id;

              return (
                <SymbolRenderer
                  key={el.id}
                  element={el}
                  isSelected={selectedElementId === el.id}
                  isConnecting={!!connectingSource}
                  detailLevel={detailLevel}
                  showPortPins={showPortPins}
                  zoom={zoom}
                  isRouteSource={isRouteSource}
                  isRouteTarget={isRouteTarget}
                  connectingSourcePortId={
                    connectingSource?.elementId === el.id ? connectingSource.portId : null
                  }
                  onSelect={(elem) => {
                    onSelectElement(elem);
                    onSelectConnector(null);
                  }}
                  onPortClick={handlePortClick}
                  onStartDrag={handleStartDragElement}
                  onStartDragLabel={handleStartDragLabel}
                />
              );
            })}
          </g>
        </svg>
      </div>

      {/* Canvas Footnote / Instructions */}
      <div className="absolute bottom-2 left-4 z-20 pointer-events-none text-[11px] text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded-md border border-slate-700/60 flex items-center gap-2">
        <span>Click port to draw piping</span>
        <span>•</span>
        <span>Drag symbol or label to reposition</span>
        <span>•</span>
        <span>F / Ctrl+0 to Fit Page</span>
        <span>•</span>
        <span>Spacebar / Alt+Drag to Pan</span>
      </div>
    </div>
  );
};
