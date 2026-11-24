import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Download,
  AlertTriangle,
  Compass,
  ArrowUpRight,
  Sparkles,
  Layers,
  MapPin,
  X,
  ExternalLink,
} from 'lucide-react';
import { PID_VIEWER_CONFIG } from './pidViewerConfig';
import { P_ID_SYMBOL_LIBRARY } from './symbolLibrary';
import { CrossingMinimizedLayoutEngine, LayoutNode } from './crossingMinimizedLayout';
import { SectionManager, PidSection, SectionExitMarker } from './sectionModel';
import { OrthogonalRouter, RouteRequest, Point } from './orthogonalRouter';
import { LabelPlacer } from './labelPlacer';
import { ReviewQueuePanel, FlaggedEdgeItem } from './ReviewQueuePanel';
import { DrawingElement, DrawingConnector } from '../../types';

export interface PidCleanViewerProps {
  elements: DrawingElement[];
  connectors: DrawingConnector[];
  selectedElementId: string | null;
  selectedConnectorId: string | null;
  backgroundImageUrl?: string | null;
  onSelectElement: (element: DrawingElement | null) => void;
  onSelectConnector: (connector: DrawingConnector | null) => void;
  className?: string;
}

const CANVAS_WIDTH = PID_VIEWER_CONFIG.canvas.defaultWidth; // 6144
const CANVAS_HEIGHT = PID_VIEWER_CONFIG.canvas.defaultHeight; // 4096

export const PidCleanViewer: React.FC<PidCleanViewerProps> = ({
  elements,
  connectors,
  selectedElementId,
  selectedConnectorId,
  backgroundImageUrl,
  onSelectElement,
  onSelectConnector,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Viewport State: Pan, Zoom, and Animated Transition
  const [zoom, setZoom] = useState<number>(0.28); // Start at overview level
  const [pan, setPan] = useState<Point>({ x: 60, y: 40 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });
  const [isAnimating, setIsAnimating] = useState<boolean>(false);

  // Section State
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  // Hover & Focus Highlighting
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null);

  // Review Queue Side Drawer
  const [isReviewQueueOpen, setIsReviewQueueOpen] = useState<boolean>(false);

  // Scale factor setting (default 3.0, up to 5.0)
  const [scaleFactor, setScaleFactor] = useState<number>(PID_VIEWER_CONFIG.layout.scale_factor);

  // 1. Pipeline Stage 1: Crossing-Minimized Layout Computation (Cached in useMemo)
  const layout = useMemo(() => {
    return CrossingMinimizedLayoutEngine.computeLayout(elements, connectors, scaleFactor);
  }, [elements, connectors, scaleFactor]);

  const nodeMap = useMemo(() => {
    return new Map<string, LayoutNode>(layout.nodes.map((n) => [n.id, n]));
  }, [layout.nodes]);

  // 2. Pipeline Stage 2: Section Partitioning & Exit Markers
  const sections = useMemo(() => {
    return SectionManager.computeSections(layout.nodes, connectors);
  }, [layout.nodes, connectors]);

  const sectionExitMarkers = useMemo(() => {
    return SectionManager.computeSectionExitMarkers(sections, connectors, nodeMap);
  }, [sections, connectors, nodeMap]);

  // 3. Pipeline Stage 3: Crossing-Aware Orthogonal Routing
  const { routedEdges, lineHops, junctionDots, routingMetrics } = useMemo(() => {
    const router = new OrthogonalRouter();

    // Map all layout nodes as obstacles
    const obstacles = layout.nodes.map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
    }));

    router.setObstacles(obstacles);

    const requests: RouteRequest[] = [];
    const spineSet = new Set(layout.spineNodeIds);

    for (const conn of connectors) {
      const fromN = nodeMap.get(conn.from_element_id);
      const toN = nodeMap.get(conn.to_element_id);
      if (!fromN || !toN) continue;

      const fromMeta = P_ID_SYMBOL_LIBRARY[fromN.symClass];
      const toMeta = P_ID_SYMBOL_LIBRARY[toN.symClass];

      const assigned = layout.assignedPorts.get(conn.id);
      const fromPortId = assigned ? assigned.fromPortId : conn.from_port_id;
      const toPortId = assigned ? assigned.toPortId : conn.to_port_id;

      let fromPortDef = fromMeta?.ports.find((p) => p.id === fromPortId) || fromMeta?.ports[0];
      let toPortDef = toMeta?.ports.find((p) => p.id === toPortId) || toMeta?.ports[0];

      const fromRelX = fromPortDef ? fromPortDef.relativePosition.x : fromN.width;
      const fromRelY = fromPortDef ? fromPortDef.relativePosition.y : fromN.height / 2;
      const toRelX = toPortDef ? toPortDef.relativePosition.x : 0;
      const toRelY = toPortDef ? toPortDef.relativePosition.y : toN.height / 2;

      const sourcePoint: Point = {
        x: Math.round(fromN.x + fromRelX),
        y: Math.round(fromN.y + fromRelY),
      };
      const targetPoint: Point = {
        x: Math.round(toN.x + toRelX),
        y: Math.round(toN.y + toRelY),
      };

      const sourceNormal: Point = fromPortDef ? fromPortDef.normal : { x: 1, y: 0 };
      const targetNormal: Point = toPortDef ? toPortDef.normal : { x: -1, y: 0 };

      const isSpineEdge = spineSet.has(fromN.id) && spineSet.has(toN.id);

      requests.push({
        edgeId: conn.id,
        sourcePoint,
        sourceNormal,
        targetPoint,
        targetNormal,
        lineType: conn.functional_type || 'process',
        sourceNodeId: fromN.id,
        targetNodeId: toN.id,
        isSpine: isSpineEdge,
      });
    }

    const { results, hops, junctions, metrics } = router.routeAllEdges(requests);

    return {
      routedEdges: results,
      lineHops: hops,
      junctionDots: junctions,
      routingMetrics: metrics,
    };
  }, [layout, connectors, nodeMap]);

  // 4. Pipeline Stage 4: Collision-Free Labels
  const { placedLabels, placedLineNumbers } = useMemo(() => {
    const elItems = layout.nodes.map((n) => ({
      id: n.id,
      tag: n.tag,
      type: n.symClass,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
    }));

    const allLabels = LabelPlacer.placeSymbolLabels(elItems);

    const edgeItems = routedEdges.map((re) => {
      const conn = connectors.find((c) => c.id === re.edgeId);
      return {
        edgeId: re.edgeId,
        lineNumber: conn?.line_number,
        points: re.points,
      };
    });

    const lineNums = LabelPlacer.placeLineNumbers(
      edgeItems,
      elItems.map((e) => ({ id: e.id, x1: e.x, y1: e.y, x2: e.x + e.width, y2: e.y + e.height }))
    );

    return { placedLabels: allLabels, placedLineNumbers: lineNums };
  }, [layout.nodes, routedEdges, connectors]);

  // Semantic Zoom Level:
  const isOverview = zoom < PID_VIEWER_CONFIG.zoom.overview_max; // < 0.35
  const isDetail = zoom >= PID_VIEWER_CONFIG.zoom.detail_min; // >= 1.2
  const visibleLabels = useMemo(() => {
    return LabelPlacer.filterLabelsByZoom(placedLabels, zoom);
  }, [placedLabels, zoom]);

  // Connected Path Highlighting Set
  const highlightedComponentIds = useMemo(() => {
    const activeTarget = hoveredNodeId || selectedElementId;
    const activeEdge = hoveredEdgeId || selectedConnectorId;

    if (!activeTarget && !activeEdge) return null;

    const matchedNodes = new Set<string>();
    const matchedEdges = new Set<string>();

    if (activeTarget) {
      matchedNodes.add(activeTarget);
      connectors.forEach((conn) => {
        if (conn.from_element_id === activeTarget || conn.to_element_id === activeTarget) {
          matchedEdges.add(conn.id);
          matchedNodes.add(conn.from_element_id);
          matchedNodes.add(conn.to_element_id);
        }
      });
    }

    if (activeEdge) {
      matchedEdges.add(activeEdge);
      const edge = connectors.find((c) => c.id === activeEdge);
      if (edge) {
        matchedNodes.add(edge.from_element_id);
        matchedNodes.add(edge.to_element_id);
      }
    }

    return { nodes: matchedNodes, edges: matchedEdges };
  }, [hoveredNodeId, selectedElementId, hoveredEdgeId, selectedConnectorId, connectors]);

  // Flagged Suspicious Edges for Review Queue
  const flaggedEdges: FlaggedEdgeItem[] = useMemo(() => {
    const items: FlaggedEdgeItem[] = [];

    for (const routed of routedEdges) {
      const conn = connectors.find((c) => c.id === routed.edgeId);
      if (!conn) continue;

      const fromN = nodeMap.get(conn.from_element_id);
      const toN = nodeMap.get(conn.to_element_id);
      const fromTag = fromN?.tag || 'UNKNOWN';
      const toTag = toN?.tag || 'UNKNOWN';

      const warningReasons: string[] = [];
      const needsReview = Boolean((conn as any).needs_review);

      if (needsReview) {
        warningReasons.push('Marked for review in topology extraction');
      }

      if (fromN && toN) {
        const manhattan = Math.abs(fromN.x - toN.x) + Math.abs(fromN.y - toN.y);
        if (routed.lengthPx > Math.max(manhattan * 2.8, 1200)) {
          warningReasons.push(`Excessive piping length (${Math.round(routed.lengthPx)}px)`);
        }
      }

      if (routed.crossedObstaclesCount > 2) {
        warningReasons.push(`Traverses across ${routed.crossedObstaclesCount} unrelated equipment boundaries`);
      }

      if (warningReasons.length > 0 || needsReview) {
        items.push({
          edgeId: conn.id,
          sourceNodeId: fromTag,
          sourcePort: conn.from_port_id,
          targetNodeId: toTag,
          targetPort: conn.to_port_id,
          lineType: conn.functional_type || 'process',
          lineNumber: conn.line_number,
          confidence: conn.confidence ?? 0.85,
          needsReview,
          lengthPx: routed.lengthPx,
          crossedObstaclesCount: routed.crossedObstaclesCount,
          sharesLineNumber: Boolean(conn.line_number),
          warningReasons,
        });
      }
    }

    return items;
  }, [routedEdges, connectors, nodeMap]);

  // Navigation: Smooth Zoom to Section
  const zoomToSection = useCallback(
    (sec: PidSection) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const margin = 100;

      const scaleX = (rect.width - margin * 2) / sec.bounds.width;
      const scaleY = (rect.height - margin * 2) / sec.bounds.height;
      const targetZoom = Math.min(Math.max(scaleX, scaleY) * 0.9, 1.4);

      const targetPanX = (rect.width - sec.bounds.width * targetZoom) / 2 - sec.bounds.x * targetZoom;
      const targetPanY = (rect.height - sec.bounds.height * targetZoom) / 2 - sec.bounds.y * targetZoom;

      setIsAnimating(true);
      setActiveSectionId(sec.id);
      window.location.hash = `section=${sec.hashKey}`;

      setZoom(parseFloat(targetZoom.toFixed(3)));
      setPan({ x: Math.round(targetPanX), y: Math.round(targetPanY) });

      setTimeout(() => setIsAnimating(false), PID_VIEWER_CONFIG.zoom.animate_ms + 50);
    },
    []
  );

  // Return to Overview
  const returnToOverview = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const margin = 40;

    const scaleX = (rect.width - margin * 2) / CANVAS_WIDTH;
    const scaleY = (rect.height - margin * 2) / CANVAS_HEIGHT;
    const fitScale = Math.min(scaleX, scaleY, 0.32);

    setIsAnimating(true);
    setActiveSectionId(null);
    window.location.hash = '';

    setZoom(parseFloat(fitScale.toFixed(3)));
    setPan({
      x: Math.round((rect.width - CANVAS_WIDTH * fitScale) / 2),
      y: Math.round((rect.height - CANVAS_HEIGHT * fitScale) / 2),
    });

    setTimeout(() => setIsAnimating(false), PID_VIEWER_CONFIG.zoom.animate_ms + 50);
  }, []);

  // Sequential Section Navigation: Next / Prev
  const navigateSection = useCallback(
    (direction: 'next' | 'prev') => {
      if (sections.length === 0) return;
      if (!activeSectionId) {
        zoomToSection(sections[0]);
        return;
      }
      const currIdx = sections.findIndex((s) => s.id === activeSectionId);
      let targetIdx = direction === 'next' ? currIdx + 1 : currIdx - 1;
      if (targetIdx >= sections.length) targetIdx = 0;
      if (targetIdx < 0) targetIdx = sections.length - 1;
      zoomToSection(sections[targetIdx]);
    },
    [activeSectionId, sections, zoomToSection]
  );

  // Keyboard navigation: Escape returns to overview, Left/Right cycles sections
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        returnToOverview();
      } else if (e.key === 'ArrowRight') {
        navigateSection('next');
      } else if (e.key === 'ArrowLeft') {
        navigateSection('prev');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [returnToOverview, navigateSection]);

  // Deep linking with URL hash (#section=...)
  useEffect(() => {
    const checkHash = () => {
      const hash = window.location.hash.replace('#', '');
      const match = hash.match(/section=([a-zA-Z0-9_-]+)/);
      if (match) {
        const sec = sections.find((s) => s.hashKey === match[1] || s.id === match[1]);
        if (sec && sec.id !== activeSectionId) {
          zoomToSection(sec);
        }
      }
    };
    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, [sections, activeSectionId, zoomToSection]);

  // Initial fit to overview on mount
  useEffect(() => {
    if (!window.location.hash.includes('section=')) {
      returnToOverview();
    }
  }, [returnToOverview]);

  // Mouse wheel zoom anchored at cursor
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.86;
    const newZoom = Math.min(3.5, Math.max(0.12, parseFloat((zoom * zoomFactor).toFixed(3))));

    const newPanX = mouseX - ((mouseX - pan.x) / zoom) * newZoom;
    const newPanY = mouseY - ((mouseY - pan.y) / zoom) * newZoom;

    if (newZoom < PID_VIEWER_CONFIG.zoom.overview_max && activeSectionId) {
      setActiveSectionId(null);
      window.location.hash = '';
    }

    setZoom(newZoom);
    setPan({ x: Math.round(newPanX), y: Math.round(newPanY) });
  };

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (
      (e.button === 0 && (e.target as HTMLElement).tagName === 'svg') ||
      (e.target as HTMLElement).id === 'canvas-background-rect'
    ) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Standalone SVG Export Handler
  const handleExportSvg = () => {
    if (!svgRef.current) return;
    const svgContent = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SafeFlow_PID_Clean_Drawing_${new Date().toISOString().slice(0, 10)}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const activeSection = sections.find((s) => s.id === activeSectionId);

  return (
    <div className={`relative flex h-full w-full bg-slate-950 overflow-hidden ${className}`}>
      {/* Top Floating Control Bar */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        {/* Section Navigation & Breadcrumbs */}
        <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl px-4 py-2 shadow-xl flex items-center gap-3 pointer-events-auto">
          {activeSection ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={returnToOverview}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors flex items-center gap-1"
                title="Return to full overview (or press Esc)"
              >
                <Compass className="w-3.5 h-3.5" /> Overview
              </button>
              <span className="text-slate-400 font-mono text-xs">/</span>
              <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: activeSection.color }} />
                {activeSection.title}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-blue-600" /> Full Process Overview
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                ({sections.length} functional sections • {layout.nodes.length} nodes)
              </span>
            </div>
          )}

          {/* Section Step Navigator */}
          <div className="h-4 w-px bg-slate-200 mx-1" />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => navigateSection('prev')}
              className="p-1 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              title="Previous section (Left arrow)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => navigateSection('next')}
              className="p-1 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              title="Next section (Right arrow)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Scale Factor Selector */}
          <div className="h-4 w-px bg-slate-200 mx-1" />
          <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
            <span>Canvas Scale:</span>
            <select
              value={scaleFactor}
              onChange={(e) => setScaleFactor(parseFloat(e.target.value))}
              className="bg-slate-100 text-xs font-bold text-slate-800 rounded px-1.5 py-0.5 border border-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="2.5">2.5×</option>
              <option value="3.0">3.0× (Default)</option>
              <option value="4.0">4.0×</option>
              <option value="5.0">5.0× (Max Space)</option>
            </select>
          </div>
        </div>

        {/* Right Action Controls: Review Queue, Export SVG, Zoom Toolbar */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Topology Review Queue Badge */}
          <button
            type="button"
            onClick={() => setIsReviewQueueOpen(!isReviewQueueOpen)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold shadow-lg flex items-center gap-1.5 transition-all ${
              isReviewQueueOpen
                ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-300'
                : flaggedEdges.length > 0
                ? 'bg-white/95 text-amber-700 border border-amber-300 hover:bg-amber-50'
                : 'bg-white/95 text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Review Queue
            {flaggedEdges.length > 0 && (
              <span className="ml-0.5 bg-amber-600 text-white text-[10px] font-mono px-1.5 py-0.2 rounded-full">
                {flaggedEdges.length}
              </span>
            )}
          </button>

          {/* Export SVG Button */}
          <button
            type="button"
            onClick={handleExportSvg}
            className="px-3 py-1.5 bg-white/95 hover:bg-white text-slate-700 hover:text-blue-700 border border-slate-200 rounded-xl text-xs font-bold shadow-lg flex items-center gap-1.5 transition-all"
            title="Export clean standalone vector SVG"
          >
            <Download className="w-4 h-4 text-blue-600" />
            Export SVG
          </button>

          {/* Zoom Toolbar */}
          <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-xl p-1 shadow-lg flex items-center gap-1">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3.5, parseFloat((z + 0.15).toFixed(2))))}
              className="p-1.5 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <span className="font-mono text-xs text-slate-700 px-1 font-semibold min-w-[42px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.12, parseFloat((z - 0.15).toFixed(2))))}
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
      </div>

      {/* Main Canvas Area */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className={`flex-1 relative w-full h-full cursor-${isPanning ? 'grabbing' : 'grab'} select-none`}
      >
        <svg
          ref={svgRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            transition: isAnimating
              ? `transform ${PID_VIEWER_CONFIG.zoom.animate_ms}ms cubic-bezier(0.16, 1, 0.3, 1)`
              : isPanning
              ? 'none'
              : 'transform 90ms ease-out',
          }}
          className="absolute top-0 left-0"
        >
          <defs>
            {/* Grid Patterns */}
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

          {/* Base Paper Background */}
          <rect id="canvas-background-rect" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="#ffffff" />
          <rect width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="url(#large-grid-major)" pointerEvents="none" />

          {/* Outer Border & Engineering Title Block */}
          <rect x="30" y="30" width={CANVAS_WIDTH - 60} height={CANVAS_HEIGHT - 60} fill="none" stroke="#0b192c" strokeWidth="3.5" pointerEvents="none" />
          <rect x="38" y="38" width={CANVAS_WIDTH - 76} height={CANVAS_HEIGHT - 76} fill="none" stroke="#94a3b8" strokeWidth="1.25" pointerEvents="none" />

          {/* 1. Section Overview Bounding Boxes */}
          <g id="sections-overview-layer">
            {sections.map((sec) => {
              const isSecActive = activeSectionId === sec.id;
              const isSecHovered = hoveredSectionId === sec.id;

              return (
                <g
                  key={`sec-${sec.id}`}
                  className="cursor-pointer group"
                  onMouseEnter={() => setHoveredSectionId(sec.id)}
                  onMouseLeave={() => setHoveredSectionId(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    zoomToSection(sec);
                  }}
                >
                  {/* Dashed Section Boundary Box */}
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
                    className="transition-all duration-200"
                  />

                  {/* Section Title Banner Pill */}
                  <g transform={`translate(${sec.bounds.x + 20}, ${sec.bounds.y - 18})`}>
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

          {/* 2. Orthogonal Piping & Connections Layer */}
          <g id="orthogonal-piping-layer">
            {routedEdges.map((edge) => {
              const conn = connectors.find((c) => c.id === edge.edgeId);
              if (!conn) return null;

              const isSelected = selectedConnectorId === edge.edgeId;
              const isHovered = hoveredEdgeId === edge.edgeId;
              const isFlagged = flaggedEdges.some((f) => f.edgeId === edge.edgeId);
              const isDimmed = highlightedComponentIds && !highlightedComponentIds.edges.has(edge.edgeId);

              const fType = conn.functional_type || 'process';
              const isSignal = fType === 'signal_line' || (fType as string) === 'instrument_signal';
              const isRelief = fType.includes('relief') || conn.line_number?.includes('FL-') || conn.line_number?.includes('VT-');

              let styleConfig = PID_VIEWER_CONFIG.lineStyles.process;
              if (isFlagged) {
                styleConfig = PID_VIEWER_CONFIG.lineStyles.suspicious_review;
              } else if (isSignal) {
                styleConfig = PID_VIEWER_CONFIG.lineStyles.instrument_signal;
              } else if (isRelief) {
                styleConfig = PID_VIEWER_CONFIG.lineStyles.relief_flare;
              }

              const strokeColor = isSelected
                ? PID_VIEWER_CONFIG.canvas.accentSelectedColor
                : isHovered
                ? PID_VIEWER_CONFIG.canvas.accentHoverColor
                : isFlagged
                ? PID_VIEWER_CONFIG.lineStyles.suspicious_review.stroke
                : styleConfig.stroke;

              const strokeWidth = isSelected ? styleConfig.strokeWidth + 2 : styleConfig.strokeWidth;

              return (
                <g
                  key={edge.edgeId}
                  className="cursor-pointer group"
                  opacity={isDimmed ? PID_VIEWER_CONFIG.canvas.dimmedOpacity : 1.0}
                  onMouseEnter={() => setHoveredEdgeId(edge.edgeId)}
                  onMouseLeave={() => setHoveredEdgeId(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectConnector(conn);
                    onSelectElement(null);
                  }}
                >
                  {/* Invisible Thick Click Target */}
                  <path d={edge.svgPath} fill="none" stroke="transparent" strokeWidth="24" />

                  {/* Selection / Hover Halo */}
                  {(isSelected || isHovered) && (
                    <path
                      d={edge.svgPath}
                      fill="none"
                      stroke={isSelected ? '#93c5fd' : '#bae6fd'}
                      strokeWidth={strokeWidth + 8}
                      opacity={0.7}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  )}

                  {/* Main Orthogonal Process Path */}
                  <path
                    d={edge.svgPath}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={styleConfig.strokeDasharray}
                    strokeLinejoin="round"
                    strokeLinecap="square"
                  />

                  {/* Directional Flow Arrow */}
                  {!isSignal && conn.flow_direction !== 'bidirectional' && edge.points.length >= 2 && (() => {
                    const midIdx = Math.floor(edge.points.length / 2);
                    const pA = edge.points[midIdx - 1];
                    const pB = edge.points[midIdx];
                    const midX = (pA.x + pB.x) / 2;
                    const midY = (pA.y + pB.y) / 2;
                    const angle = Math.atan2(pB.y - pA.y, pB.x - pA.x) * (180 / Math.PI);
                    return (
                      <polygon
                        points="-8,-5 6,0 -8,5"
                        fill={strokeColor}
                        transform={`translate(${midX}, ${midY}) rotate(${angle})`}
                      />
                    );
                  })()}
                </g>
              );
            })}
          </g>

          {/* 3. Line Hops & Junction Dots Layer */}
          <g id="hops-and-junctions-layer" pointerEvents="none">
            {junctionDots.map((junc, idx) => (
              <circle
                key={`junc-${idx}`}
                cx={junc.x}
                cy={junc.y}
                r={PID_VIEWER_CONFIG.routing.junction_dot_radius_px}
                fill={PID_VIEWER_CONFIG.canvas.primaryLineworkColor}
              />
            ))}
          </g>

          {/* 4. Section Exit / Entry Markers */}
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
                    if (targetSec) zoomToSection(targetSec);
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

          {/* 5. Elements & Symbols Layer */}
          <g id="elements-layer">
            {layout.nodes.map((node) => {
              const isSelected = selectedElementId === node.id;
              const isHovered = hoveredNodeId === node.id;
              const isDimmed = highlightedComponentIds && !highlightedComponentIds.nodes.has(node.id);

              const symMeta = P_ID_SYMBOL_LIBRARY[node.symClass] || P_ID_SYMBOL_LIBRARY.gate_valve;
              const strokeColor = isSelected
                ? PID_VIEWER_CONFIG.canvas.accentSelectedColor
                : isHovered
                ? PID_VIEWER_CONFIG.canvas.accentHoverColor
                : PID_VIEWER_CONFIG.canvas.primaryLineworkColor;

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  opacity={isDimmed ? PID_VIEWER_CONFIG.canvas.dimmedOpacity : 1.0}
                  className="cursor-pointer group"
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    const rawEl = elements.find((el) => el.id === node.id) || null;
                    onSelectElement(rawEl);
                    onSelectConnector(null);
                  }}
                >
                  {/* Selection Bounding Halo */}
                  {isSelected && (
                    <rect
                      x="-8"
                      y="-8"
                      width={node.width + 16}
                      height={node.height + 16}
                      rx="8"
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="2.5"
                      strokeDasharray="5,5"
                    />
                  )}

                  {/* Render Symbol Graphic */}
                  {symMeta.render({
                    width: node.width,
                    height: node.height,
                    strokeColor,
                    fillColor: '#ffffff',
                    tag: node.tag,
                    isSelected,
                    isHovered,
                    detailLevel: isDetail ? 'high_detail' : 'standard',
                  })}
                </g>
              );
            })}
          </g>

          {/* 6. Collision-Free SVG Halo Engineering Tags */}
          <g id="labels-layer" pointerEvents="none">
            {visibleLabels.map((lbl) => {
              const isDimmed = highlightedComponentIds && !highlightedComponentIds.nodes.has(lbl.elementId);
              const isSelected = selectedElementId === lbl.elementId;
              const haloPx = PID_VIEWER_CONFIG.labels.halo_px;
              const fontPx = PID_VIEWER_CONFIG.labels.font_px;

              return (
                <g
                  key={`label-${lbl.elementId}`}
                  transform={`translate(${lbl.x}, ${lbl.y})`}
                  opacity={isDimmed ? PID_VIEWER_CONFIG.canvas.dimmedOpacity : 1.0}
                >
                  <text
                    x={lbl.width / 2}
                    y={lbl.height / 2 + 4}
                    textAnchor="middle"
                    fontFamily="system-ui, -apple-system, sans-serif"
                    fontSize={fontPx}
                    fontWeight="bold"
                    fill={isSelected ? '#2563eb' : '#0b192c'}
                    style={{
                      paintOrder: 'stroke fill',
                      stroke: '#ffffff',
                      strokeWidth: `${haloPx + (isSelected ? 1 : 0)}px`,
                      strokeLinejoin: 'round',
                      strokeLinecap: 'round',
                    }}
                  >
                    {lbl.tag}
                  </text>
                </g>
              );
            })}
          </g>

          {/* 7. Line Numbers Layer Along Routed Segments */}
          {!isOverview && (
            <g id="line-numbers-layer" pointerEvents="none">
              {placedLineNumbers.map((ln, idx) => {
                const isDimmed = highlightedComponentIds && !highlightedComponentIds.edges.has(ln.edgeId);
                const isSelected = selectedConnectorId === ln.edgeId;
                const haloPx = PID_VIEWER_CONFIG.labels.halo_px;

                return (
                  <g
                    key={`ln-${idx}`}
                    transform={`translate(${ln.x}, ${ln.y})`}
                    opacity={isDimmed ? PID_VIEWER_CONFIG.canvas.dimmedOpacity : 1.0}
                  >
                    <text
                      x={ln.width / 2}
                      y={ln.height / 2 + 4}
                      textAnchor="middle"
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      fontSize={PID_VIEWER_CONFIG.labels.font_px - 1}
                      fontWeight="600"
                      fill={isSelected ? '#2563eb' : '#334155'}
                      style={{
                        paintOrder: 'stroke fill',
                        stroke: '#ffffff',
                        strokeWidth: `${haloPx}px`,
                        strokeLinejoin: 'round',
                        strokeLinecap: 'round',
                      }}
                    >
                      {ln.lineNumber}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
        </svg>

        {/* Bottom Right Minimap with Section Click-to-Jump */}
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
            {layout.nodes.map((n) => (
              <div
                key={`mini-n-${n.id}`}
                className="absolute bg-slate-700 rounded-xs pointer-events-none"
                style={{
                  left: `${(n.x / CANVAS_WIDTH) * 100}%`,
                  top: `${(n.y / CANVAS_HEIGHT) * 100}%`,
                  width: `${Math.max(2, (n.width / CANVAS_WIDTH) * 176)}px`,
                  height: `${Math.max(2, (n.height / CANVAS_HEIGHT) * 112)}px`,
                }}
              />
            ))}

            {/* Viewport Box */}
            {containerRef.current && (() => {
              const rect = containerRef.current.getBoundingClientRect();
              const viewW = (rect.width / (CANVAS_WIDTH * zoom)) * 100;
              const viewH = (rect.height / (CANVAS_HEIGHT * zoom)) * 100;
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

      {/* Review Queue Drawer */}
      <ReviewQueuePanel
        isOpen={isReviewQueueOpen}
        onClose={() => setIsReviewQueueOpen(false)}
        items={flaggedEdges}
        selectedEdgeId={selectedConnectorId}
        onSelectEdge={(edgeId) => {
          const conn = connectors.find((c) => c.id === edgeId);
          if (conn) {
            onSelectConnector(conn);
            onSelectElement(null);
          }
        }}
      />
    </div>
  );
};
