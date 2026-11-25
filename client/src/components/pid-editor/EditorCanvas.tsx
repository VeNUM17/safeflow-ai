import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Undo2,
  Redo2,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Move,
  ChevronUp,
  ChevronDown,
  Crosshair,
  Layers,
  Target,
  RotateCw,
  Trash2,
  Eye,
  EyeOff,
  Grid,
} from 'lucide-react';
import {
  DrawingElement,
  DrawingConnector,
  DrawingPort,
  FunctionalType,
} from '../../types';
import { SymbolRenderer } from './SymbolRenderer';
import { PID_VIEWER_CONFIG } from '../pid-viewer/pidViewerConfig';
import { OrthogonalRouter, RouteRequest, LineHop, JunctionDot, Point } from '../pid-viewer/orthogonalRouter';
import { CrossingMinimizedLayoutEngine, LayoutNode } from '../pid-viewer/crossingMinimizedLayout';
import { SectionManager, PidSection, SectionExitMarker } from '../pid-viewer/sectionModel';
import { resolveSymbolClassKey, P_ID_SYMBOL_LIBRARY } from '../pid-viewer/symbolLibrary';
import { LabelPlacer } from '../pid-viewer/labelPlacer';
import { EngineeringTables } from '../pid-viewer/EngineeringTables';

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

const CANVAS_WIDTH = PID_VIEWER_CONFIG.canvas.defaultWidth; // 6144
const CANVAS_HEIGHT = PID_VIEWER_CONFIG.canvas.defaultHeight; // 4096

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
  const outerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({
    width: 1400,
    height: 900,
  });

  useEffect(() => {
    const updateSize = () => {
      const el = containerRef.current || outerRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 200 && r.height > 200) {
          setViewportSize({ width: Math.round(r.width), height: Math.round(r.height) });
        }
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Viewport Transformation: Pan, Zoom, and Smooth Animation
  const [zoom, setZoom] = useState<number>(0.26);
  const [pan, setPan] = useState<Point>({ x: 60, y: 40 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });
  const [isAnimating, setIsAnimating] = useState<boolean>(false);

  // Section State
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null);

  // Layout Scale Factor
  const [scaleFactor, setScaleFactor] = useState<number>(PID_VIEWER_CONFIG.layout.scale_factor);

  // Element Dragging State
  const [draggingElementId, setDraggingElementId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
  const [hasMovedDuringDrag, setHasMovedDuringDrag] = useState<boolean>(false);

  // Label Dragging State
  const [draggingLabelElementId, setDraggingLabelElementId] = useState<string | null>(null);
  const [labelDragStart, setLabelDragStart] = useState<Point>({ x: 0, y: 0 });
  const [initialLabelOffset, setInitialLabelOffset] = useState<Point>({ x: 0, y: 0 });

  // Wiring (Port-to-Port Connection) State
  const [connectingSource, setConnectingSource] = useState<{
    elementId: string;
    portId: string;
    portType: DrawingPort['type'];
    x: number;
    y: number;
  } | null>(null);
  const [cursorPos, setCursorPos] = useState<Point>({ x: 0, y: 0 });

  // Spacebar Pan Key State
  const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);

  // Background Reference Calibration
  const [refOffset, setRefOffset] = useState<Point>({ x: 0, y: 0 });
  const [refScale, setRefScale] = useState<number>(1.0);
  const [showRefCalibrate, setShowRefCalibrate] = useState<boolean>(false);

  // Toggles
  const [showSignalLines, setShowSignalLines] = useState<boolean>(true);
  const [showPortPins, setShowPortPins] = useState<boolean>(false);
  const [hoveredConnectorId, setHoveredConnectorId] = useState<string | null>(null);

  // Refs for smooth wheel zooming without listener churn
  const panRef = useRef<Point>(pan);
  panRef.current = pan;
  const zoomRef = useRef<number>(zoom);
  zoomRef.current = zoom;
  const hasPannedRef = useRef<boolean>(false);

  // Native non-passive mouse wheel zoom anchored at cursor (strictly isolates canvas zoom from outer page scroll)
  useEffect(() => {
    const rootEl = outerRef.current || containerRef.current;
    if (!rootEl) return;

    const onNativeWheel = (e: WheelEvent) => {
      // Unconditionally stop page scroll
      e.preventDefault();
      e.stopPropagation();

      const container = containerRef.current || rootEl;
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const currentPan = panRef.current;
      const currentZoom = zoomRef.current;

      const canvasX = (mouseX - currentPan.x) / currentZoom;
      const canvasY = (mouseY - currentPan.y) / currentZoom;

      const zoomDelta = e.deltaY < 0 ? 1.15 : 0.87;
      const nextZoom = Math.min(Math.max(0.15, currentZoom * zoomDelta), 4.0);
      const roundedZoom = parseFloat(nextZoom.toFixed(3));

      const nextPanX = mouseX - canvasX * roundedZoom;
      const nextPanY = mouseY - canvasY * roundedZoom;

      setPan({
        x: Math.round(nextPanX),
        y: Math.round(nextPanY),
      });
      setZoom(roundedZoom);
    };

    rootEl.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => {
      rootEl.removeEventListener('wheel', onNativeWheel);
    };
  }, []);

  // Screen to Canvas coordinate transformation
  const screenToCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current || outerRef.current;
      if (!container) return { x: 0, y: 0 };
      const rect = container.getBoundingClientRect();
      const rawX = (clientX - rect.left - pan.x) / zoom;
      const rawY = (clientY - rect.top - pan.y) / zoom;
      return {
        x: Math.round(rawX),
        y: Math.round(rawY),
      };
    },
    [pan, zoom]
  );

  // Return to Overview Viewport (Guaranteed safe positive scale)
  const returnToOverview = useCallback(() => {
    const width = viewportSize.width > 200 ? viewportSize.width : 1400;
    const height = viewportSize.height > 200 ? viewportSize.height : 900;
    const pad = 60;
    const scaleX = (width - pad * 2) / CANVAS_WIDTH;
    const scaleY = (height - pad * 2) / CANVAS_HEIGHT;
    const nextZoom = Math.max(0.15, Math.min(scaleX, scaleY, 0.45));
    setIsAnimating(true);
    setZoom(parseFloat(nextZoom.toFixed(3)));
    setPan({
      x: Math.round((width - CANVAS_WIDTH * nextZoom) / 2),
      y: Math.round((height - CANVAS_HEIGHT * nextZoom) / 2),
    });
    setActiveSectionId(null);
    setTimeout(() => setIsAnimating(false), PID_VIEWER_CONFIG.zoom.animate_ms);
  }, [viewportSize]);

  // Zoom centered on viewport center
  const zoomByFactor = useCallback(
    (factor: number) => {
      const container = containerRef.current || outerRef.current;
      const width = container ? container.clientWidth : (viewportSize.width || 1200);
      const height = container ? container.clientHeight : (viewportSize.height || 800);
      const currentZoom = zoomRef.current;
      const currentPan = panRef.current;
      const nextZoom = Math.min(Math.max(0.12, parseFloat((currentZoom * factor).toFixed(3))), 4.0);

      const centerX = (width / 2 - currentPan.x) / currentZoom;
      const centerY = (height / 2 - currentPan.y) / currentZoom;

      const nextPanX = width / 2 - centerX * nextZoom;
      const nextPanY = height / 2 - centerY * nextZoom;

      setIsAnimating(false);
      setZoom(nextZoom);
      setPan({ x: Math.round(nextPanX), y: Math.round(nextPanY) });
    },
    [viewportSize]
  );

  // Zoom to a Specific Section (Guaranteed safe positive scale)
  const zoomToSection = useCallback((sec: PidSection) => {
    const width = viewportSize.width > 200 ? viewportSize.width : 1400;
    const height = viewportSize.height > 200 ? viewportSize.height : 900;
    const pad = 60;
    const scaleX = (width - pad * 2) / sec.bounds.width;
    const scaleY = (height - pad * 2) / sec.bounds.height;
    const nextZoom = Math.max(0.35, Math.min(Math.max(scaleX, scaleY), 1.5));
    const clampedZoom = Math.max(PID_VIEWER_CONFIG.zoom.section_min, Math.min(nextZoom, 1.3));

    const centerX = sec.bounds.x + sec.bounds.width / 2;
    const centerY = sec.bounds.y + sec.bounds.height / 2;

    setIsAnimating(true);
    setActiveSectionId(sec.id);
    setZoom(parseFloat(clampedZoom.toFixed(3)));
    setPan({
      x: Math.round(width / 2 - centerX * clampedZoom),
      y: Math.round(height / 2 - centerY * clampedZoom),
    });
    setTimeout(() => setIsAnimating(false), PID_VIEWER_CONFIG.zoom.animate_ms);
  }, [viewportSize]);

  // Initial overview fit on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      returnToOverview();
    }, 120);
    return () => clearTimeout(timer);
  }, []);

  // Elements map
  const elementsMap = useMemo(() => {
    const map = new Map<string, DrawingElement>();
    elements.forEach((el) => map.set(el.id, el));
    return map;
  }, [elements]);

  // Layout Nodes mapping for Section & Router calculation
  const layoutNodes: LayoutNode[] = useMemo(() => {
    return elements.map((el) => {
      const symClass = resolveSymbolClassKey(el.tag, el.type);
      const meta = P_ID_SYMBOL_LIBRARY[symClass];
      const w = el.size.width || (meta ? meta.defaultWidth : 90);
      const h = el.size.height || (meta ? meta.defaultHeight : 110);
      return {
        id: el.id,
        tag: el.tag,
        type: el.type,
        symClass,
        x: el.position.x,
        y: el.position.y,
        width: w,
        height: h,
        sourceX: el.position.x,
        sourceY: el.position.y,
        isSpine: false,
        layerIndex: 0,
        branchDirection: 'spine',
      };
    });
  }, [elements]);

  const layoutNodeMap = useMemo(() => {
    return new Map<string, LayoutNode>(layoutNodes.map((n) => [n.id, n]));
  }, [layoutNodes]);

  // Compute Functional Sections
  const sections = useMemo(() => {
    return SectionManager.computeSections(layoutNodes, connectors);
  }, [layoutNodes, connectors]);

  // Compute Section Exit Markers
  const sectionExitMarkers = useMemo(() => {
    return SectionManager.computeSectionExitMarkers(sections, connectors, layoutNodeMap);
  }, [sections, connectors, layoutNodeMap]);

  // Section Navigation (Prev / Next)
  const navigateSection = useCallback(
    (direction: 'prev' | 'next') => {
      if (sections.length === 0) return;
      if (!activeSectionId) {
        zoomToSection(sections[0]);
        return;
      }
      const currentIndex = sections.findIndex((s) => s.id === activeSectionId);
      if (currentIndex === -1) {
        zoomToSection(sections[0]);
        return;
      }
      const nextIndex =
        direction === 'next'
          ? (currentIndex + 1) % sections.length
          : (currentIndex - 1 + sections.length) % sections.length;
      zoomToSection(sections[nextIndex]);
    },
    [sections, activeSectionId, zoomToSection]
  );

  // Auto-Arrange Layout (Crossing-Minimized Layout Engine)
  const handleAutoArrangeLayout = useCallback(() => {
    onPushHistory?.();
    const result = CrossingMinimizedLayoutEngine.computeLayout(elements, connectors, scaleFactor);
    const resultMap = new Map(result.nodes.map((n) => [n.id, n]));

    const updatedElements = elements.map((el) => {
      const node = resultMap.get(el.id);
      if (!node) return el;
      return {
        ...el,
        position: { x: node.x, y: node.y },
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
      returnToOverview();
    }, 80);
  }, [elements, connectors, scaleFactor, onPushHistory, onUpdateElements, onUpdateConnectors, returnToOverview]);

  // Auto-arrange once on initial mount if elements are at raw coordinates (e.g. max X < 1400 on 6144 canvas)
  const hasAutoArrangedRef = useRef<boolean>(false);
  useEffect(() => {
    if (hasAutoArrangedRef.current) return;
    if (elements.length > 0) {
      const maxX = Math.max(...elements.map((e) => e.position.x));
      if (maxX < 1400) {
        hasAutoArrangedRef.current = true;
        handleAutoArrangeLayout();
      }
    }
  }, [elements, handleAutoArrangeLayout]);



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
    const resultMap = new Map<string, { svgPath: string; points: Point[] }>();

    for (const conn of connectors) {
      if (conn.waypoints && conn.waypoints.length > 0) continue;

      const fromEl = elementsMap.get(conn.from_element_id);
      const toEl = elementsMap.get(conn.to_element_id);
      if (!fromEl || !toEl) continue;

      const fromPort = (fromEl.ports || []).find((p) => p.id === conn.from_port_id);
      const toPort = (toEl.ports || []).find((p) => p.id === conn.to_port_id);

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
      console.warn('OrthogonalRouter error in EditorCanvas:', err);
      return {
        routedResultsMap: resultMap,
        lineHops: [],
        junctionDots: [],
      };
    }
  }, [elements, connectors, elementsMap]);

  // Mouse handlers for Panning and Dragging
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
      hasPannedRef.current = false;
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      hasPannedRef.current = true;
      setPan({
        x: Math.round(e.clientX - panStart.x),
        y: Math.round(e.clientY - panStart.y),
      });
      return;
    }

    const canvasPoint = screenToCanvas(e.clientX, e.clientY);
    if (connectingSource) {
      setCursorPos(canvasPoint);
    }

    // Dragging an Element Symbol
    if (draggingElementId) {
      setHasMovedDuringDrag(true);
      hasPannedRef.current = true;
      let targetX = canvasPoint.x - dragOffset.x;
      let targetY = canvasPoint.y - dragOffset.y;

      // Constrain within engineering drawing canvas
      targetX = Math.max(50, Math.min(CANVAS_WIDTH - 250, targetX));
      targetY = Math.max(50, Math.min(CANVAS_HEIGHT - 250, targetY));

      onUpdateElements(
        elements.map((el) =>
          el.id === draggingElementId ? { ...el, position: { x: targetX, y: targetY } } : el
        )
      );
      return;
    }

    // Dragging an Element Tag Label
    if (draggingLabelElementId) {
      hasPannedRef.current = true;
      const dx = canvasPoint.x - labelDragStart.x;
      const dy = canvasPoint.y - labelDragStart.y;
      const newOffsetX = initialLabelOffset.x + dx;
      const newOffsetY = initialLabelOffset.y + dy;

      onUpdateElements(
        elements.map((el) =>
          el.id === draggingLabelElementId
            ? { ...el, label_offset: { x: Math.round(newOffsetX), y: Math.round(newOffsetY) } }
            : el
        )
      );
      return;
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingElementId(null);
    setDraggingLabelElementId(null);
    setTimeout(() => {
      hasPannedRef.current = false;
    }, 120);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.code === 'Space') {
        setIsSpacePressed(true);
      }
      if (e.key === 'Escape') {
        setConnectingSource(null);
        onSelectElement(null);
        onSelectConnector(null);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedElementId) {
          onUpdateElements(elements.filter((el) => el.id !== selectedElementId));
          onUpdateConnectors(
            connectors.filter(
              (c) => c.from_element_id !== selectedElementId && c.to_element_id !== selectedElementId
            )
          );
          onSelectElement(null);
        } else if (selectedConnectorId) {
          onUpdateConnectors(connectors.filter((c) => c.id !== selectedConnectorId));
          onSelectConnector(null);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) onRedo?.();
        else onUndo?.();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        returnToOverview();
      } else if (e.key === 'f' && !e.ctrlKey && !e.metaKey) {
        returnToOverview();
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
  }, [selectedElementId, selectedConnectorId, elements, connectors, onUndo, onRedo, returnToOverview]);

  // Port Click Handler (Live Wiring)
  const handlePortClick = (element: DrawingElement, port: DrawingPort, e: React.MouseEvent) => {
    e.stopPropagation();

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
      setConnectingSource({
        elementId: element.id,
        portId: port.id,
        portType: port.type,
        x: px,
        y: py,
      });
    } else {
      if (connectingSource.elementId === element.id && connectingSource.portId === port.id) {
        setConnectingSource(null);
        return;
      }

      const isSignalLine = connectingSource.portType === 'signal' || port.type === 'signal';
      const lineFunctionalType: FunctionalType = isSignalLine ? 'signal_line' : 'piping_line';
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
        assigned_chemical_id: null,
        status: 'provisional',
        waypoints: [],
      };

      onPushHistory?.();
      onUpdateConnectors([...connectors, newConnector]);
      setConnectingSource(null);
    }
  };

  // Drag start handlers
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

  const activeSection = sections.find((s) => s.id === activeSectionId);

  return (
    <div
      ref={outerRef}
      className="flex-1 flex flex-col h-full bg-slate-100 overflow-hidden relative select-none overscroll-none"
    >
      {/* 1. Top Section Navigation & Breadcrumbs Bar (Floating White Card) */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-slate-300 shadow-xl text-slate-700">
        <button
          type="button"
          onClick={returnToOverview}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            !activeSectionId
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-current" />
          Full Process Overview
        </button>

        {activeSection && (
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: activeSection.color }}
            />
            <span className="text-xs font-bold text-slate-900">{activeSection.title}</span>
          </div>
        )}

        <div className="flex items-center gap-0.5 border-l border-slate-200 pl-2">
          <button
            type="button"
            onClick={() => navigateSection('prev')}
            className="p-1 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="Previous section (Left arrow)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => navigateSection('next')}
            className="p-1 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="Next section (Right arrow)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Auto-Arrange Layout */}
        <div className="flex items-center border-l border-slate-200 pl-2">
          <button
            type="button"
            onClick={handleAutoArrangeLayout}
            className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
            title="Auto-Arrange Layout: Aligns elements along the process spine with crossing-minimized branches"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>Auto-Arrange</span>
          </button>
        </div>

        {/* Scale Factor Selector */}
        <div className="flex items-center gap-1.5 border-l border-slate-200 pl-2 text-xs">
          <span className="text-slate-500 font-medium">Scale:</span>
          <select
            value={scaleFactor}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setScaleFactor(val);
              setTimeout(() => {
                const res = CrossingMinimizedLayoutEngine.computeLayout(elements, connectors, val);
                const rMap = new Map(res.nodes.map((n) => [n.id, n]));
                onUpdateElements(
                  elements.map((el) => {
                    const node = rMap.get(el.id);
                    return node ? { ...el, position: { x: node.x, y: node.y } } : el;
                  })
                );
              }, 40);
            }}
            className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 outline-hidden cursor-pointer"
          >
            <option value={2.5}>2.5×</option>
            <option value={3.0}>3.0× (Default)</option>
            <option value={4.0}>4.0×</option>
            <option value={5.0}>5.0× (Max Space)</option>
          </select>
        </div>

        {/* Detail Toggle */}
        {onToggleDetailLevel && (
          <div className="flex items-center border-l border-slate-200 pl-2">
            <button
              type="button"
              onClick={onToggleDetailLevel}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                detailLevel === 'high_detail'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
              title="Toggle Detailed View: Shows nozzle port IDs, equipment verifications & full line tags"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>{detailLevel === 'high_detail' ? 'High Detail ON' : 'Detail'}</span>
            </button>
          </div>
        )}

        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5 border-l border-slate-200 pl-2">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="p-1.5 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-25 transition-colors"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className="p-1.5 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-25 transition-colors"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
          <button
            type="button"
            onClick={() => zoomByFactor(1.25)}
            className="p-1.5 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono font-bold text-slate-700 w-11 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => zoomByFactor(0.8)}
            className="p-1.5 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={returnToOverview}
            className="p-1.5 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="Fit Full Overview"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Main Interactive Drawing Canvas Area */}
      <div
        ref={containerRef}
        className={`w-full h-full relative cursor-${isPanning ? 'grabbing' : 'grab'} overflow-hidden overscroll-contain touch-none select-none`}
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
            transition: isAnimating
              ? `transform ${PID_VIEWER_CONFIG.zoom.animate_ms}ms cubic-bezier(0.16, 1, 0.3, 1)`
              : isPanning || draggingElementId || draggingLabelElementId
              ? 'none'
              : 'transform 90ms ease-out',
          }}
          className="absolute top-0 left-0"
        >
          <defs>
            {/* Grid Patterns matching clean engineering paper */}
            <pattern id="large-grid-minor" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#f8fafc" strokeWidth="0.8" />
            </pattern>
            <pattern id="large-grid-major" width="150" height="150" patternUnits="userSpaceOnUse">
              <rect width="150" height="150" fill="url(#large-grid-minor)" />
              <path d="M 150 0 L 0 0 0 150" fill="none" stroke="#f1f5f9" strokeWidth="1.5" />
            </pattern>

            {/* Directional Flow Arrowhead */}
            <marker id="large-flow-arrow" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <polygon points="0,2 10,6 0,10" fill="#0b192c" />
            </marker>
          </defs>

          {/* Base Engineering Paper Background - Clean White Paper (Grid Off) */}
          <rect id="canvas-background-rect" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="#ffffff" />

          {/* Outer Border & Inner Border */}
          <rect x="30" y="30" width={CANVAS_WIDTH - 60} height={CANVAS_HEIGHT - 60} fill="none" stroke="#0b192c" strokeWidth="3.5" pointerEvents="none" />
          <rect x="38" y="38" width={CANVAS_WIDTH - 76} height={CANVAS_HEIGHT - 76} fill="none" stroke="#94a3b8" strokeWidth="1.25" pointerEvents="none" />

          {/* Coordinate Grid Markers (A-H along Top & Bottom, 1-6 along Left & Right) */}
          <g id="border-coordinates" pointerEvents="none" fill="#475569" fontFamily="sans-serif" fontSize="12" fontWeight="bold">
            {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((col, idx) => {
              const xPos = 400 + idx * 750;
              return (
                <g key={`coord-col-${col}`}>
                  <text x={xPos} y="24" textAnchor="middle">{col}</text>
                  <text x={xPos} y={CANVAS_HEIGHT - 12} textAnchor="middle">{col}</text>
                </g>
              );
            })}
            {['1', '2', '3', '4', '5', '6'].map((row, idx) => {
              const yPos = 350 + idx * 700;
              return (
                <g key={`coord-row-${row}`}>
                  <text x="18" y={yPos} textAnchor="middle">{row}</text>
                  <text x={CANVAS_WIDTH - 18} y={yPos} textAnchor="middle">{row}</text>
                </g>
              );
            })}
          </g>

          {/* General Engineering Notes Box (Top-Right) */}
          <g id="engineering-notes-box" transform={`translate(${CANVAS_WIDTH - 1160}, 56)`} pointerEvents="none">
            <rect x="0" y="0" width="1120" height="700" fill="#ffffff" stroke="#0b192c" strokeWidth="2" />
            <rect x="0" y="0" width="1120" height="28" fill="#f8fafc" stroke="#0b192c" strokeWidth="1.5" />
            <text x="560" y="19" textAnchor="middle" fontFamily="sans-serif" fontSize="13" fontWeight="bold" fill="#0b192c">
              NOTES
            </text>
            <g fontFamily="sans-serif" fontSize="10.5" fill="#1e293b">
              <text x="16" y="52">1. ALL EQUIPMENT AND PIPING IN SOUR GAS SERVICE SHALL CONFORM TO NACE MR0175 / ISO 15156. MATERIAL CLASS A1A APPLIES THROUGHOUT.</text>
              <text x="16" y="78">2. PSV-1001 SET PRESSURE 95 BARG. PSV SIZING PER API 520. OUTLET LINE TO SOUR FLARE HEADER. NV-1001 AND NV-1002 (PSV BLOCK VALVES) SHALL BE LOCKED OPEN</text>
              <text x="32" y="96">DURING NORMAL OPERATION.</text>
              <text x="16" y="122">3. BDV-1001 SHALL BE NORMALLY CLOSED. OPENS AUTOMATICALLY ON ESD-1 SIGNAL FROM SIS. MANUAL OPEN CAPABILITY FROM CCR ONLY. BLOWDOWN RATE PER API 521</text>
              <text x="32" y="140">TO ACHIEVE &le; 7 BARG WITHIN 15 MINUTES.</text>
              <text x="16" y="166">4. XV-1001 AND XV-1002 ARE ESD CLASS VALVES. PARTIAL STROKE TESTING (PST) CAPABILITY REQUIRED. PROOF TEST INTERVAL PER SIL ASSESSMENT.</text>
              <text x="16" y="192">5. PIG RECEIVER PG-1001 QUICK-OPENING CLOSURE SHALL BE INTERLOCKED - CLOSURE CANNOT BE OPENED UNLESS INLET PRESSURE IS CONFIRMED ZERO ON PI-1001 AND</text>
              <text x="32" y="210">XV-1001 IS CONFIRMED CLOSED. INTERLOCK LOGIC IN SIS.</text>
              <text x="16" y="236">6. ALL INSTRUMENT CONNECTIONS ON SOUR SERVICE LINES SHALL HAVE DOUBLE BLOCK AND BLEED VALVE ARRANGEMENT ON THE INSTRUMENT ROOT VALVE.</text>
              <text x="16" y="262">7. DRAIN LINE 2"-DR-00101-A1A ROUTES TO CLOSED DRAIN DRUM. NO OPEN DRAINING PERMITTED ON SOUR SERVICE.</text>
            </g>
          </g>

          {/* Engineering Title Block (Bottom-Right) */}
          <g id="engineering-title-block" transform={`translate(${CANVAS_WIDTH - 1500}, ${CANVAS_HEIGHT - 540})`} pointerEvents="none">
            <rect x="0" y="0" width="1460" height="500" fill="#ffffff" stroke="#0b192c" strokeWidth="3" />
            <line x1="0" y1="80" x2="1460" y2="80" stroke="#0b192c" strokeWidth="1.5" />
            <line x1="0" y1="160" x2="1460" y2="160" stroke="#0b192c" strokeWidth="1.5" />
            <line x1="0" y1="320" x2="1460" y2="320" stroke="#0b192c" strokeWidth="1.5" />
            <line x1="0" y1="410" x2="1460" y2="410" stroke="#0b192c" strokeWidth="1.5" />
            <line x1="1050" y1="320" x2="1050" y2="500" stroke="#0b192c" strokeWidth="1.5" />
            <line x1="720" y1="410" x2="720" y2="500" stroke="#0b192c" strokeWidth="1.5" />

            {/* Title Content */}
            <text x="16" y="32" fontFamily="sans-serif" fontSize="11" fontWeight="bold" fill="#64748b">FACILITY:</text>
            <text x="160" y="52" fontFamily="sans-serif" fontSize="16" fontWeight="bold" fill="#0f172a">ONSHORE GAS PROCESSING FACILITY</text>

            <text x="16" y="112" fontFamily="sans-serif" fontSize="11" fontWeight="bold" fill="#64748b">CONTRACTOR:</text>
            <text x="160" y="134" fontFamily="sans-serif" fontSize="16" fontWeight="bold" fill="#0f172a">INTELLIGENT ENGINEERING SOLUTIONS (IES)</text>

            <text x="16" y="196" fontFamily="sans-serif" fontSize="11" fontWeight="bold" fill="#64748b">TITLE:</text>
            <text x="160" y="230" fontFamily="sans-serif" fontSize="20" fontWeight="bold" fill="#0b192c">PIPING &amp; INSTRUMENTATION DIAGRAM</text>
            <text x="160" y="265" fontFamily="sans-serif" fontSize="20" fontWeight="bold" fill="#0b192c">PIG RECEIVER &amp; INLET CONTROL</text>

            <text x="16" y="352" fontFamily="sans-serif" fontSize="11" fontWeight="bold" fill="#64748b">DOCUMENT NO.:</text>
            <text x="180" y="375" fontFamily="monospace" fontSize="18" fontWeight="bold" fill="#0f172a">P&amp;ID-GPF-001-02</text>

            <text x="1070" y="352" fontFamily="sans-serif" fontSize="11" fontWeight="bold" fill="#64748b">REVISION:</text>
            <text x="1240" y="375" fontFamily="sans-serif" fontSize="22" fontWeight="bold" fill="#0b192c">A</text>

            <text x="16" y="442" fontFamily="sans-serif" fontSize="11" fontWeight="bold" fill="#64748b">STATUS:</text>
            <text x="160" y="468" fontFamily="sans-serif" fontSize="15" fontWeight="bold" fill="#059669">ISSUED FOR REVIEW</text>

            <text x="1070" y="442" fontFamily="sans-serif" fontSize="11" fontWeight="bold" fill="#64748b">DATE:</text>
            <text x="1200" y="468" fontFamily="sans-serif" fontSize="15" fontWeight="bold" fill="#0f172a">JUNE 2026</text>
          </g>

          {/* Standard Engineering Tables & Annotations (Instrument Index, Valve Index, Line List, Legend, Inflow/Outflow Banners) */}
          <EngineeringTables />

          {/* Reference Background Layer */}
          {backgroundImageUrl && backgroundVisible && (
            <g id="reference-background-layer" opacity={backgroundOpacity} pointerEvents="none">
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

          {/* 3. Section Overview Bounding Boxes */}
          <g id="sections-overview-layer" pointerEvents="none">
            {sections.map((sec) => {
              const isSecActive = activeSectionId === sec.id;
              const isSecHovered = hoveredSectionId === sec.id;

              return (
                <g key={`sec-${sec.id}`} className="group" pointerEvents="none">
                  <rect
                    x={sec.bounds.x}
                    y={sec.bounds.y}
                    width={sec.bounds.width}
                    height={sec.bounds.height}
                    rx="16"
                    fill={isSecActive ? `${sec.color}08` : isSecHovered ? `${sec.color}05` : 'transparent'}
                    stroke={sec.color}
                    strokeWidth={isSecActive ? 3.5 : isSecHovered ? 2.5 : 1.75}
                    strokeDasharray={isSecActive ? 'none' : '8,6'}
                    pointerEvents="none"
                    className="transition-all duration-200"
                  />

                  {/* Section Title Banner Pill */}
                  <g
                    transform={`translate(${sec.bounds.x + 20}, ${sec.bounds.y - 18})`}
                    className="cursor-pointer"
                    pointerEvents="auto"
                    onMouseEnter={() => setHoveredSectionId(sec.id)}
                    onMouseLeave={() => setHoveredSectionId(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (hasPannedRef.current) return;
                      zoomToSection(sec);
                    }}
                  >
                    <rect
                      x="0"
                      y="0"
                      width={sec.title.length * 9.5 + 44}
                      height="36"
                      rx="8"
                      fill="#ffffff"
                      stroke={sec.color}
                      strokeWidth="2"
                      className="shadow-sm"
                    />
                    <circle cx="16" cy="18" r="6" fill={sec.color} />
                    <text
                      x="28"
                      y="23"
                      fontFamily="system-ui, sans-serif"
                      fontSize="14"
                      fontWeight="bold"
                      fill="#0f172a"
                    >
                      {sec.title}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>

          {/* 4. Section Exit Markers Layer */}
          <g id="section-exit-markers-layer">
            {sectionExitMarkers.map((marker, idx) => {
              const targetSec = sections.find((s) => s.id === marker.targetSectionId);
              return (
                <g
                  key={`marker-${idx}`}
                  transform={`translate(${marker.x}, ${marker.y})`}
                  className="cursor-pointer group"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!hasPannedRef.current && targetSec) zoomToSection(targetSec);
                  }}
                >
                  <rect
                    x="-42"
                    y="-14"
                    width="84"
                    height="28"
                    rx="14"
                    fill="#ffffff"
                    stroke={targetSec?.color || '#2563eb'}
                    strokeWidth="2"
                    className="shadow-sm group-hover:fill-blue-50 transition-colors"
                  />
                  <text
                    x="0"
                    y="4.5"
                    textAnchor="middle"
                    fontFamily="system-ui, sans-serif"
                    fontSize="11"
                    fontWeight="bold"
                    fill={targetSec?.color || '#2563eb'}
                  >
                    {marker.label}
                  </text>
                </g>
              );
            })}
          </g>

          {/* 5. Orthogonal Piping & Connections Layer */}
          <g id="canvas-connectors">
            {connectors.map((conn) => {
              const fromEl = elementsMap.get(conn.from_element_id);
              const toEl = elementsMap.get(conn.to_element_id);
              if (!fromEl || !toEl) return null;

              const isConnSelected = selectedConnectorId === conn.id;
              const isSignal = conn.functional_type === 'signal_line' || (conn.functional_type as string) === 'instrument_signal';
              if (!showSignalLines && isSignal) return null;

              const isHovered = hoveredConnectorId === conn.id;

              const routed = routedResultsMap.get(conn.id);
              let pathD = '';
              let points: Point[] = [];

              if (conn.waypoints && conn.waypoints.length > 0) {
                const fw = fromEl.size.width || 90;
                const fh = fromEl.size.height || 110;
                const tw = toEl.size.width || 90;
                const th = toEl.size.height || 110;
                points = [
                  { x: fromEl.position.x + fw / 2, y: fromEl.position.y + fh / 2 },
                  ...conn.waypoints,
                  { x: toEl.position.x + tw / 2, y: toEl.position.y + th / 2 },
                ];
                pathD = `M ${points[0].x} ${points[0].y}`;
                for (let i = 1; i < points.length; i++) pathD += ` L ${points[i].x} ${points[i].y}`;
              } else if (routed && routed.svgPath && routed.points.length >= 2) {
                pathD = routed.svgPath;
                points = routed.points;
              } else {
                const fw = fromEl.size.width || 90;
                const fh = fromEl.size.height || 110;
                const tw = toEl.size.width || 90;
                const th = toEl.size.height || 110;
                const startX = fromEl.position.x + fw;
                const startY = fromEl.position.y + fh / 2;
                const endX = toEl.position.x;
                const endY = toEl.position.y + th / 2;
                const midX = Math.round((startX + endX) / 2);
                points = [
                  { x: startX, y: startY },
                  { x: midX, y: startY },
                  { x: midX, y: endY },
                  { x: endX, y: endY },
                ];
                pathD = `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
              }

              const strokeColor = isConnSelected
                ? '#2563eb'
                : isHovered
                ? '#38bdf8'
                : isSignal
                ? '#d97706'
                : '#0b192c';

              const strokeWidth = isConnSelected ? 4.5 : isHovered ? 3.5 : isSignal ? 1.75 : 3;

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
                  {/* Invisible thicker stroke for clicking */}
                  <path d={pathD} fill="none" stroke="transparent" strokeWidth="24" />

                  {/* Route Selection / Hover Halo */}
                  {(isConnSelected || isHovered) && (
                    <path
                      d={pathD}
                      fill="none"
                      stroke={isConnSelected ? '#93c5fd' : '#bae6fd'}
                      strokeWidth={strokeWidth + 8}
                      opacity={0.65}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      className="pointer-events-none"
                    />
                  )}

                  {/* Main Line */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={isSignal ? '6,5' : undefined}
                    strokeLinejoin="round"
                    strokeLinecap="square"
                  />

                  {/* Directional Flow Arrow */}
                  {!isSignal && conn.flow_direction !== 'bidirectional' && points.length >= 2 && (
                    <polygon
                      points="-8,-5 6,0 -8,5"
                      fill={strokeColor}
                      stroke="#ffffff"
                      strokeWidth="1"
                      transform={`translate(${midX}, ${midY}) rotate(${angle})`}
                    />
                  )}

                  {/* Clean Line Number Tag */}
                  {conn.line_number && (
                    <g transform={`translate(${midX}, ${midY - 14})`} className="select-none pointer-events-none">
                      <rect
                        x={-conn.line_number.length * 3.8 - 6}
                        y="-9"
                        width={conn.line_number.length * 7.6 + 12}
                        height="18"
                        fill="#ffffff"
                        stroke={isConnSelected ? '#2563eb' : isHovered ? '#38bdf8' : '#cbd5e1'}
                        strokeWidth={isConnSelected ? '2' : isHovered ? '1.5' : '1'}
                        rx="4"
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
                </g>
              );
            })}

            {/* Line Hops (Arc jumps at line crossings) */}
            {lineHops.map((hop: LineHop, i: number) => (
              <path
                key={`hop-${i}`}
                d={`M ${hop.crossX - 7} ${hop.crossY} A 7 7 0 0 1 ${hop.crossX + 7} ${hop.crossY}`}
                fill="none"
                stroke="#0b192c"
                strokeWidth="3.5"
                strokeLinecap="round"
                className="pointer-events-none"
              />
            ))}

            {/* Junction Dots */}
            {junctionDots.map((junc: JunctionDot, i: number) => (
              <circle
                key={`junc-${i}`}
                cx={junc.x}
                cy={junc.y}
                r="3.5"
                fill="#0b192c"
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

          {/* 6. Elements & Symbols Layer */}
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

        {/* 7. Bottom-Right Interactive Overview Minimap with Click-to-Jump */}
        <div className="absolute bottom-5 right-5 z-20 bg-white/95 backdrop-blur-md border border-slate-300 rounded-2xl p-2.5 shadow-2xl flex flex-col items-center">
          <div className="relative w-44 h-28 border border-slate-300 rounded-lg bg-slate-50 overflow-hidden cursor-pointer">
            {/* Sections in Minimap */}
            {sections.map((sec) => (
              <div
                key={`mini-sec-${sec.id}`}
                className="absolute border border-dashed rounded-xs hover:bg-blue-500/20 transition-colors"
                style={{
                  left: `${(sec.bounds.x / CANVAS_WIDTH) * 100}%`,
                  top: `${(sec.bounds.y / CANVAS_HEIGHT) * 100}%`,
                  width: `${(sec.bounds.width / CANVAS_WIDTH) * 100}%`,
                  height: `${(sec.bounds.height / CANVAS_HEIGHT) * 100}%`,
                  borderColor: sec.color,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  zoomToSection(sec);
                }}
              />
            ))}

            {/* Elements in Minimap */}
            {elements.map((n) => (
              <div
                key={`mini-n-${n.id}`}
                className="absolute bg-slate-700 rounded-xs pointer-events-none"
                style={{
                  left: `${(n.position.x / CANVAS_WIDTH) * 100}%`,
                  top: `${(n.position.y / CANVAS_HEIGHT) * 100}%`,
                  width: `${Math.max(2, ((n.size.width || 90) / CANVAS_WIDTH) * 176)}px`,
                  height: `${Math.max(2, ((n.size.height || 110) / CANVAS_HEIGHT) * 112)}px`,
                }}
              />
            ))}

            {/* Viewport Box */}
            {(() => {
              const viewW = (viewportSize.width / (CANVAS_WIDTH * zoom)) * 100;
              const viewH = (viewportSize.height / (CANVAS_HEIGHT * zoom)) * 100;
              const viewLeft = (-pan.x / (CANVAS_WIDTH * zoom)) * 100;
              const viewTop = (-pan.y / (CANVAS_HEIGHT * zoom)) * 100;

              return (
                <div
                  className="absolute border-2 border-blue-600 bg-blue-500/15 pointer-events-none"
                  style={{
                    left: `${Math.max(0, viewLeft)}%`,
                    top: `${Math.max(0, viewTop)}%`,
                    width: `${Math.min(100, viewW)}%`,
                    height: `${Math.min(100, viewH)}%`,
                  }}
                />
              );
            })()}
          </div>
          <span className="text-[10px] text-slate-500 font-mono mt-1 font-semibold">
            {activeSection ? activeSection.title : 'Overview Map (Click section to zoom)'}
          </span>
        </div>
      </div>

      {/* Canvas Footnote / Instructions */}
      <div className="absolute bottom-2 left-4 z-20 pointer-events-none text-[11px] text-slate-500 bg-white/90 backdrop-blur-xs px-2.5 py-1 rounded-md border border-slate-300 shadow-xs flex items-center gap-2">
        <span>Click port to draw piping</span>
        <span>•</span>
        <span>Drag symbol to reposition</span>
        <span>•</span>
        <span>Wheel to zoom (anchored)</span>
        <span>•</span>
        <span>F / Ctrl+0 to Fit Overview</span>
      </div>
    </div>
  );
};
