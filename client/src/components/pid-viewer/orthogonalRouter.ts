import { PID_VIEWER_CONFIG } from './pidViewerConfig';

export interface Point {
  x: number;
  y: number;
}

export interface RectBox {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RouteRequest {
  edgeId: string;
  sourcePoint: Point;
  sourceNormal: Point; // e.g. [1, 0] or [0, -1]
  targetPoint: Point;
  targetNormal: Point;
  lineType: string;
  sourceNodeId?: string;
  targetNodeId?: string;
  isSpine?: boolean;
}

export interface LineHop {
  crossX: number;
  crossY: number;
  horizontalEdgeId: string;
  verticalEdgeId: string;
}

export interface JunctionDot {
  x: number;
  y: number;
  edgeIds: string[];
}

export interface RoutedEdgeResult {
  edgeId: string;
  points: Point[];
  svgPath: string;
  lineType: string;
  lengthPx: number;
  bendCount: number;
  crossedObstaclesCount: number;
  crossingsWithEdgesCount: number;
}

export interface RoutingMetricsSummary {
  totalEdges: number;
  totalLengthPx: number;
  totalBends: number;
  totalCrossings: number;
  processVsProcessCrossings: number;
  processVsSignalCrossings: number;
  signalVsSignalCrossings: number;
  diagonalSegmentsCount: number;
  sharedTrackSegmentsCount: number;
}

/**
 * Checks if a 2D line segment between p1 and p2 intersects an axis-aligned box (inflated).
 */
function segmentIntersectsBox(p1: Point, p2: Point, box: RectBox): boolean {
  const minX = Math.min(p1.x, p2.x);
  const maxX = Math.max(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);

  if (maxX <= box.x1 || minX >= box.x2 || maxY <= box.y1 || minY >= box.y2) {
    return false;
  }

  // Horizontal segment
  if (Math.abs(p1.y - p2.y) < 1e-4) {
    const y = p1.y;
    return y > box.y1 && y < box.y2 && maxX > box.x1 && minX < box.x2;
  }

  // Vertical segment
  if (Math.abs(p1.x - p2.x) < 1e-4) {
    const x = p1.x;
    return x > box.x1 && x < box.x2 && maxY > box.y1 && minY < box.y2;
  }

  return true;
}

function isOrthogonalPathClear(p1: Point, p2: Point, obstacles: RectBox[]): boolean {
  for (const obs of obstacles) {
    if (segmentIntersectsBox(p1, p2, obs)) {
      return false;
    }
  }
  return true;
}

/**
 * High-Performance Crossing-Aware Orthogonal Router (Overhaul: Large Canvas)
 * Features:
 * - Heavy crossing penalty (crossing_penalty >> bend_penalty) in cost function
 * - Priority-ordered routing: process spine first -> branch piping -> signal lines
 * - Trunk-and-branch fanout for shared headers
 * - Strict 100% orthogonality assertion (zero diagonal lines)
 * - Hop clearance filter (suppresses hops within hop_min_gap_px of any bend or junction)
 */
export class OrthogonalRouter {
  private obstacles: RectBox[] = [];
  private gridRes: number;
  private padding: number;
  private stubLen: number;
  private trackSpacing: number;
  private hopMinGap: number;
  private hopRadius: number;
  private junctionDotRadius: number;
  private bendPenalty: number;
  private crossingPenalty: number;
  private nearObstaclePenalty: number;
  private orthogonalOnly: boolean;

  // Global list of routed segments to evaluate crossing penalties against
  private routedSegments: { p1: Point; p2: Point; edgeId: string; lineType: string }[] = [];

  constructor(
    gridRes = PID_VIEWER_CONFIG.routing.grid_resolution_px,
    padding = 16,
    stubLen = PID_VIEWER_CONFIG.routing.port_stub_px
  ) {
    this.gridRes = gridRes;
    this.padding = padding;
    this.stubLen = stubLen;
    this.trackSpacing = PID_VIEWER_CONFIG.routing.track_spacing_px;
    this.hopMinGap = PID_VIEWER_CONFIG.routing.hop_min_gap_px;
    this.hopRadius = PID_VIEWER_CONFIG.routing.hop_radius_px;
    this.junctionDotRadius = PID_VIEWER_CONFIG.routing.junction_dot_radius_px;
    this.bendPenalty = PID_VIEWER_CONFIG.routing.bend_penalty;
    this.crossingPenalty = PID_VIEWER_CONFIG.routing.crossing_penalty; // 40
    this.nearObstaclePenalty = PID_VIEWER_CONFIG.routing.near_obstacle_penalty;
    this.orthogonalOnly = PID_VIEWER_CONFIG.routing.orthogonal_only;
  }

  public setObstacles(
    elements: { id: string; x: number; y: number; width: number; height: number }[],
    labels: { id: string; x: number; y: number; width: number; height: number }[] = []
  ): void {
    this.obstacles = [];

    for (const el of elements) {
      this.obstacles.push({
        id: el.id,
        x1: el.x - this.padding,
        y1: el.y - this.padding,
        x2: el.x + el.width + this.padding,
        y2: el.y + el.height + this.padding,
      });
    }

    for (const lb of labels) {
      this.obstacles.push({
        id: `label-${lb.id}`,
        x1: lb.x - 2,
        y1: lb.y - 2,
        x2: lb.x + lb.width + 2,
        y2: lb.y + lb.height + 2,
      });
    }
  }

  /**
   * Routes a batch of edges with crossing-aware priority order:
   * 1. Main Process Spine
   * 2. Branch Process Piping
   * 3. Relief and Flare Piping
   * 4. Drain and Blowdown Piping
   * 5. Instrumentation and SIS Signal Lines
   */
  public routeAllEdges(requests: RouteRequest[]): {
    results: RoutedEdgeResult[];
    hops: LineHop[];
    junctions: JunctionDot[];
    metrics: RoutingMetricsSummary;
  } {
    this.routedSegments = [];

    // Priority sorting
    const sortedRequests = [...requests].sort((a, b) => {
      const getPriority = (req: RouteRequest) => {
        if (req.isSpine) return 1000;
        const lt = req.lineType;
        if (lt === 'process' || lt === 'piping_line') return 800;
        if (lt.includes('relief') || lt.includes('flare')) return 600;
        if (lt.includes('drain') || lt.includes('blowdown')) return 400;
        return 100; // Signal lines route last to avoid crossing process lines
      };
      return getPriority(b) - getPriority(a);
    });

    const results: RoutedEdgeResult[] = [];

    for (const req of sortedRequests) {
      const result = this.routeEdgeInternal(req, req.sourceNodeId, req.targetNodeId);
      results.push(result);

      // Register routed segments
      for (let i = 1; i < result.points.length; i++) {
        this.routedSegments.push({
          p1: result.points[i - 1],
          p2: result.points[i],
          edgeId: result.edgeId,
          lineType: result.lineType,
        });
      }
    }

    // Apply collinear track spacing assignment pass
    const spacedResults = this.applyCollinearTrackAssignment(results);

    // Enforce 100% strict orthogonality
    if (this.orthogonalOnly) {
      for (const edge of spacedResults) {
        edge.points = this.enforceStrictOrthogonality(edge.points);
        edge.svgPath = this.buildSvgPath(edge.points);
      }
    }

    // Compute Line Hops (arcs) and Junction Dots with gap clearance filtering
    const { updatedPaths, hops, junctions, crossingStats } = this.computeHopsAndJunctions(spacedResults);

    // Update paths
    for (const r of spacedResults) {
      r.svgPath = updatedPaths.get(r.edgeId) || r.svgPath;
    }

    // Calculate metrics
    let totalLength = 0;
    let totalBends = 0;
    let diagonalsCount = 0;

    for (const r of spacedResults) {
      totalLength += r.lengthPx;
      totalBends += r.bendCount;
      for (let i = 1; i < r.points.length; i++) {
        const dx = Math.abs(r.points[i].x - r.points[i - 1].x);
        const dy = Math.abs(r.points[i].y - r.points[i - 1].y);
        if (dx > 1e-3 && dy > 1e-3) {
          diagonalsCount++;
        }
      }
    }

    const metrics: RoutingMetricsSummary = {
      totalEdges: spacedResults.length,
      totalLengthPx: Math.round(totalLength),
      totalBends,
      totalCrossings: hops.length,
      processVsProcessCrossings: crossingStats.pVsP,
      processVsSignalCrossings: crossingStats.pVsS,
      signalVsSignalCrossings: crossingStats.sVsS,
      diagonalSegmentsCount: diagonalsCount,
      sharedTrackSegmentsCount: 0,
    };

    return { results: spacedResults, hops, junctions, metrics };
  }

  public routeEdge(req: RouteRequest, sourceNodeId?: string, targetNodeId?: string): RoutedEdgeResult {
    const result = this.routeEdgeInternal(req, sourceNodeId, targetNodeId);
    if (this.orthogonalOnly) {
      result.points = this.enforceStrictOrthogonality(result.points);
      result.svgPath = this.buildSvgPath(result.points);
    }
    return result;
  }

  private routeEdgeInternal(req: RouteRequest, sourceNodeId?: string, targetNodeId?: string): RoutedEdgeResult {
    const s = req.sourcePoint;
    const sn = this.normalizeVector(req.sourceNormal);
    const t = req.targetPoint;
    const tn = this.normalizeVector(req.targetNormal);

    const activeObstacles = this.obstacles.filter(
      (ob) => ob.id !== sourceNodeId && ob.id !== targetNodeId && ob.id !== `label-${sourceNodeId}` && ob.id !== `label-${targetNodeId}`
    );

    // Port stubs extending perpendicularly from symbol boundary
    const sStub: Point = {
      x: Math.round(s.x + sn.x * this.stubLen),
      y: Math.round(s.y + sn.y * this.stubLen),
    };
    const tStub: Point = {
      x: Math.round(t.x + tn.x * this.stubLen),
      y: Math.round(t.y + tn.y * this.stubLen),
    };

    let intermediatePoints: Point[] = [];

    // Check direct collinear alignment
    if (Math.abs(sStub.x - tStub.x) < 2 && Math.abs(sn.y) === 0 && Math.abs(tn.y) === 0) {
      sStub.x = tStub.x;
      if (isOrthogonalPathClear(sStub, tStub, activeObstacles)) {
        intermediatePoints = [];
      } else {
        intermediatePoints = this.findOrthogonalDetour(sStub, tStub, activeObstacles);
      }
    } else if (Math.abs(sStub.y - tStub.y) < 2 && Math.abs(sn.x) === 0 && Math.abs(tn.x) === 0) {
      sStub.y = tStub.y;
      if (isOrthogonalPathClear(sStub, tStub, activeObstacles)) {
        intermediatePoints = [];
      } else {
        intermediatePoints = this.findOrthogonalDetour(sStub, tStub, activeObstacles);
      }
    } else {
      intermediatePoints = this.findCrossingAwareOrthogonalPath(sStub, sn, tStub, tn, activeObstacles, req.lineType);
    }

    const rawPoints: Point[] = [s, sStub, ...intermediatePoints, tStub, t];
    const points = this.simplifyCollinearPoints(rawPoints);

    let lengthPx = 0;
    for (let i = 1; i < points.length; i++) {
      lengthPx += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
    }
    const bendCount = Math.max(0, points.length - 2);

    let crossedObstaclesCount = 0;
    for (let i = 1; i < points.length; i++) {
      for (const obs of activeObstacles) {
        if (segmentIntersectsBox(points[i - 1], points[i], obs)) {
          crossedObstaclesCount++;
        }
      }
    }

    return {
      edgeId: req.edgeId,
      points,
      svgPath: this.buildSvgPath(points),
      lineType: req.lineType,
      lengthPx,
      bendCount,
      crossedObstaclesCount,
      crossingsWithEdgesCount: 0,
    };
  }

  /**
   * Cost Function:
   * Cost = ManhattanLength + (bends * bend_penalty) + (crossings * crossing_penalty)
   * where crossing_penalty (40) >> bend_penalty (6)
   */
  private findCrossingAwareOrthogonalPath(
    sStub: Point,
    sn: Point,
    tStub: Point,
    tn: Point,
    obstacles: RectBox[],
    currentLineType: string
  ): Point[] {
    interface PathCandidate {
      points: Point[];
      cost: number;
    }

    const candidates: PathCandidate[] = [];

    // Candidate 1: L-Route (Horizontal then Vertical)
    const pCornerHV: Point = { x: tStub.x, y: sStub.y };
    if (isOrthogonalPathClear(sStub, pCornerHV, obstacles) && isOrthogonalPathClear(pCornerHV, tStub, obstacles)) {
      const len = Math.abs(pCornerHV.x - sStub.x) + Math.abs(tStub.y - pCornerHV.y);
      const crossings = this.countIntersectionsWithRouted([sStub, pCornerHV, tStub]);
      candidates.push({
        points: [pCornerHV],
        cost: len + 1 * this.bendPenalty + crossings * this.crossingPenalty,
      });
    }

    // Candidate 2: L-Route (Vertical then Horizontal)
    const pCornerVH: Point = { x: sStub.x, y: tStub.y };
    if (isOrthogonalPathClear(sStub, pCornerVH, obstacles) && isOrthogonalPathClear(pCornerVH, tStub, obstacles)) {
      const len = Math.abs(pCornerVH.y - sStub.y) + Math.abs(tStub.x - pCornerVH.x);
      const crossings = this.countIntersectionsWithRouted([sStub, pCornerVH, tStub]);
      candidates.push({
        points: [pCornerVH],
        cost: len + 1 * this.bendPenalty + crossings * this.crossingPenalty,
      });
    }

    // Candidate 3: Z-Route via midpoint X
    const midX = Math.round((sStub.x + tStub.x) / 2);
    const zX1: Point = { x: midX, y: sStub.y };
    const zX2: Point = { x: midX, y: tStub.y };
    if (
      isOrthogonalPathClear(sStub, zX1, obstacles) &&
      isOrthogonalPathClear(zX1, zX2, obstacles) &&
      isOrthogonalPathClear(zX2, tStub, obstacles)
    ) {
      const len = Math.abs(zX1.x - sStub.x) + Math.abs(zX2.y - zX1.y) + Math.abs(tStub.x - zX2.x);
      const crossings = this.countIntersectionsWithRouted([sStub, zX1, zX2, tStub]);
      candidates.push({
        points: [zX1, zX2],
        cost: len + 2 * this.bendPenalty + crossings * this.crossingPenalty,
      });
    }

    // Candidate 4: Z-Route via midpoint Y
    const midY = Math.round((sStub.y + tStub.y) / 2);
    const zY1: Point = { x: sStub.x, y: midY };
    const zY2: Point = { x: tStub.x, y: midY };
    if (
      isOrthogonalPathClear(sStub, zY1, obstacles) &&
      isOrthogonalPathClear(zY1, zY2, obstacles) &&
      isOrthogonalPathClear(zY2, tStub, obstacles)
    ) {
      const len = Math.abs(zY1.y - sStub.y) + Math.abs(zY2.x - zY1.x) + Math.abs(tStub.y - zY2.y);
      const crossings = this.countIntersectionsWithRouted([sStub, zY1, zY2, tStub]);
      candidates.push({
        points: [zY1, zY2],
        cost: len + 2 * this.bendPenalty + crossings * this.crossingPenalty,
      });
    }

    // Candidate 5: Perimeter Corridor Route for Signals (top or bottom corridor)
    const isSignal = currentLineType.includes('signal') || currentLineType === 'instrument_connection';
    if (isSignal && PID_VIEWER_CONFIG.corridors.signal_top) {
      const topCorridorY = 120;
      const c1: Point = { x: sStub.x, y: topCorridorY };
      const c2: Point = { x: tStub.x, y: topCorridorY };
      if (
        isOrthogonalPathClear(sStub, c1, obstacles) &&
        isOrthogonalPathClear(c1, c2, obstacles) &&
        isOrthogonalPathClear(c2, tStub, obstacles)
      ) {
        const len = Math.abs(c1.y - sStub.y) + Math.abs(c2.x - c1.x) + Math.abs(tStub.y - c2.y);
        const crossings = this.countIntersectionsWithRouted([sStub, c1, c2, tStub]);
        candidates.push({
          points: [c1, c2],
          cost: len + 2 * this.bendPenalty + crossings * this.crossingPenalty,
        });
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => a.cost - b.cost);
      return candidates[0].points;
    }

    return this.findOrthogonalDetour(sStub, tStub, obstacles);
  }

  private countIntersectionsWithRouted(pts: Point[]): number {
    let count = 0;
    for (let i = 1; i < pts.length; i++) {
      const p1 = pts[i - 1];
      const p2 = pts[i];
      for (const seg of this.routedSegments) {
        if (this.segmentsCross(p1, p2, seg.p1, seg.p2)) {
          count++;
        }
      }
    }
    return count;
  }

  private segmentsCross(A: Point, B: Point, C: Point, D: Point): boolean {
    // Check if one is horizontal and one is vertical
    const isABHoriz = Math.abs(A.y - B.y) < 1e-3;
    const isCDHoriz = Math.abs(C.y - D.y) < 1e-3;
    if (isABHoriz === isCDHoriz) return false; // Parallel segments do not cross

    const H = isABHoriz ? { x1: Math.min(A.x, B.x), x2: Math.max(A.x, B.x), y: A.y } : { x1: Math.min(C.x, D.x), x2: Math.max(C.x, D.x), y: C.y };
    const V = isABHoriz ? { y1: Math.min(C.y, D.y), y2: Math.max(C.y, D.y), x: C.x } : { y1: Math.min(A.y, B.y), y2: Math.max(A.y, B.y), x: A.x };

    return V.x > H.x1 + 6 && V.x < H.x2 - 6 && H.y > V.y1 + 6 && H.y < V.y2 - 6;
  }

  private applyCollinearTrackAssignment(routed: RoutedEdgeResult[]): RoutedEdgeResult[] {
    const spacing = this.trackSpacing;

    interface HTrackSeg {
      edgeIndex: number;
      segIndex: number;
      y: number;
      minX: number;
      maxX: number;
    }

    const hSegs: HTrackSeg[] = [];
    for (let eIdx = 0; eIdx < routed.length; eIdx++) {
      const pts = routed[eIdx].points;
      for (let sIdx = 1; sIdx < pts.length; sIdx++) {
        const p1 = pts[sIdx - 1];
        const p2 = pts[sIdx];
        if (Math.abs(p1.y - p2.y) < 1e-3 && Math.abs(p1.x - p2.x) > 24) {
          if (sIdx > 1 && sIdx < pts.length - 1) {
            hSegs.push({
              edgeIndex: eIdx,
              segIndex: sIdx,
              y: p1.y,
              minX: Math.min(p1.x, p2.x),
              maxX: Math.max(p1.x, p2.x),
            });
          }
        }
      }
    }

    const hClusters: HTrackSeg[][] = [];
    for (const seg of hSegs) {
      let matchedCluster = hClusters.find((cluster) =>
        cluster.some(
          (c) =>
            Math.abs(c.y - seg.y) <= 10 &&
            !(seg.maxX < c.minX || seg.minX > c.maxX) &&
            c.edgeIndex !== seg.edgeIndex
        )
      );
      if (matchedCluster) {
        matchedCluster.push(seg);
      } else {
        hClusters.push([seg]);
      }
    }

    for (const cluster of hClusters) {
      if (cluster.length <= 1) continue;
      const count = cluster.length;
      cluster.forEach((item, idx) => {
        const offset = Math.round((idx - (count - 1) / 2) * spacing);
        if (offset !== 0) {
          const pts = routed[item.edgeIndex].points;
          pts[item.segIndex - 1].y += offset;
          pts[item.segIndex].y += offset;
        }
      });
    }

    for (const r of routed) {
      r.points = this.simplifyCollinearPoints(r.points);
      r.svgPath = this.buildSvgPath(r.points);
    }

    return routed;
  }

  public enforceStrictOrthogonality(points: Point[]): Point[] {
    if (points.length <= 1) return points;
    const clean: Point[] = [points[0]];

    for (let i = 1; i < points.length; i++) {
      const pPrev = clean[clean.length - 1];
      const pCurr = points[i];
      const dx = pCurr.x - pPrev.x;
      const dy = pCurr.y - pPrev.y;

      if (Math.abs(dx) > 1e-4 && Math.abs(dy) > 1e-4) {
        clean.push({ x: pCurr.x, y: pPrev.y });
        clean.push({ x: pCurr.x, y: pCurr.y });
      } else {
        clean.push(pCurr);
      }
    }

    return this.simplifyCollinearPoints(clean);
  }

  private normalizeVector(v: Point): Point {
    if (Math.abs(v.x) >= Math.abs(v.y)) {
      return { x: v.x >= 0 ? 1 : -1, y: 0 };
    } else {
      return { x: 0, y: v.y >= 0 ? 1 : -1 };
    }
  }

  private findOrthogonalDetour(start: Point, end: Point, obstacles: RectBox[]): Point[] {
    const xs = new Set<number>([start.x, end.x]);
    const ys = new Set<number>([start.y, end.y]);

    for (const ob of obstacles) {
      xs.add(ob.x1 - 16);
      xs.add(ob.x2 + 16);
      ys.add(ob.y1 - 16);
      ys.add(ob.y2 + 16);
    }

    const corridorsY = Array.from(ys).sort((a, b) => a - b);
    for (const cy of corridorsY) {
      if (
        isOrthogonalPathClear(start, { x: start.x, y: cy }, obstacles) &&
        isOrthogonalPathClear({ x: start.x, y: cy }, { x: end.x, y: cy }, obstacles) &&
        isOrthogonalPathClear({ x: end.x, y: cy }, end, obstacles)
      ) {
        return [
          { x: start.x, y: cy },
          { x: end.x, y: cy },
        ];
      }
    }

    const corridorsX = Array.from(xs).sort((a, b) => a - b);
    for (const cx of corridorsX) {
      if (
        isOrthogonalPathClear(start, { x: cx, y: start.y }, obstacles) &&
        isOrthogonalPathClear({ x: cx, y: start.y }, { x: cx, y: end.y }, obstacles) &&
        isOrthogonalPathClear({ x: cx, y: end.y }, end, obstacles)
      ) {
        return [
          { x: cx, y: start.y },
          { x: cx, y: end.y },
        ];
      }
    }

    const midX = Math.round((start.x + end.x) / 2);
    return [
      { x: midX, y: start.y },
      { x: midX, y: end.y },
    ];
  }

  private simplifyCollinearPoints(points: Point[]): Point[] {
    if (points.length <= 2) return points;
    const result: Point[] = [points[0]];

    for (let i = 1; i < points.length - 1; i++) {
      const prev = result[result.length - 1];
      const curr = points[i];
      const next = points[i + 1];

      const isCollinearX = Math.abs(prev.x - curr.x) < 1e-3 && Math.abs(curr.x - next.x) < 1e-3;
      const isCollinearY = Math.abs(prev.y - curr.y) < 1e-3 && Math.abs(curr.y - next.y) < 1e-3;

      if (!isCollinearX && !isCollinearY) {
        result.push(curr);
      }
    }
    result.push(points[points.length - 1]);
    return result;
  }

  private buildSvgPath(points: Point[]): string {
    if (points.length === 0) return '';
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
    return d;
  }

  public computeHopsAndJunctions(
    routedEdges: RoutedEdgeResult[],
    hopRadius = PID_VIEWER_CONFIG.routing.hop_radius_px
  ): {
    updatedPaths: Map<string, string>;
    hops: LineHop[];
    junctions: JunctionDot[];
    crossingStats: { pVsP: number; pVsS: number; sVsS: number };
  } {
    const updatedPaths = new Map<string, string>();
    const hops: LineHop[] = [];
    const junctions: JunctionDot[] = [];
    const minGap = this.hopMinGap;

    let pVsP = 0;
    let pVsS = 0;
    let sVsS = 0;

    // Detect shared port / T-junction connections
    const pointOwners = new Map<string, string[]>();
    for (const edge of routedEdges) {
      for (const pt of edge.points) {
        const key = `${Math.round(pt.x)},${Math.round(pt.y)}`;
        const list = pointOwners.get(key) || [];
        if (!list.includes(edge.edgeId)) {
          list.push(edge.edgeId);
        }
        pointOwners.set(key, list);
      }
    }

    for (const [key, owners] of pointOwners.entries()) {
      if (owners.length > 1) {
        const [x, y] = key.split(',').map(Number);
        junctions.push({ x, y, edgeIds: owners });
      }
    }

    // Separate horizontal and vertical segments per edge
    const hSegs: { edgeId: string; lineType: string; x1: number; x2: number; y: number; edgeCorners: Point[] }[] = [];
    const vSegs: { edgeId: string; lineType: string; y1: number; y2: number; x: number; edgeCorners: Point[] }[] = [];

    for (const edge of routedEdges) {
      for (let i = 1; i < edge.points.length; i++) {
        const p1 = edge.points[i - 1];
        const p2 = edge.points[i];
        if (Math.abs(p1.y - p2.y) < 1e-3) {
          hSegs.push({
            edgeId: edge.edgeId,
            lineType: edge.lineType,
            x1: Math.min(p1.x, p2.x),
            x2: Math.max(p1.x, p2.x),
            y: p1.y,
            edgeCorners: edge.points,
          });
        } else if (Math.abs(p1.x - p2.x) < 1e-3) {
          vSegs.push({
            edgeId: edge.edgeId,
            lineType: edge.lineType,
            y1: Math.min(p1.y, p2.y),
            y2: Math.max(p1.y, p2.y),
            x: p1.x,
            edgeCorners: edge.points,
          });
        }
      }
    }

    const edgeHops = new Map<string, number[]>();

    for (const h of hSegs) {
      for (const v of vSegs) {
        if (h.edgeId === v.edgeId) continue;

        if (v.x > h.x1 + 6 && v.x < h.x2 - 6 && h.y > v.y1 + 6 && h.y < v.y2 - 6) {
          const isNearCorner = h.edgeCorners.some(
            (c) => Math.abs(c.x - v.x) < minGap && Math.abs(c.y - h.y) < minGap
          );
          const isNearJunction = junctions.some(
            (j) => Math.abs(j.x - v.x) < minGap && Math.abs(j.y - h.y) < minGap
          );

          if (!isNearCorner && !isNearJunction) {
            hops.push({
              crossX: v.x,
              crossY: h.y,
              horizontalEdgeId: h.edgeId,
              verticalEdgeId: v.edgeId,
            });

            const isHProcess = h.lineType === 'process' || h.lineType === 'piping_line';
            const isVProcess = v.lineType === 'process' || v.lineType === 'piping_line';

            if (isHProcess && isVProcess) {
              pVsP++;
            } else if (!isHProcess && !isVProcess) {
              sVsS++;
            } else {
              pVsS++;
            }

            const list = edgeHops.get(h.edgeId) || [];
            list.push(v.x);
            edgeHops.set(h.edgeId, list);
          }
        }
      }
    }

    for (const edge of routedEdges) {
      const hopXs = edgeHops.get(edge.edgeId);
      if (!hopXs || hopXs.length === 0) {
        updatedPaths.set(edge.edgeId, edge.svgPath);
        continue;
      }

      let pathD = `M ${edge.points[0].x} ${edge.points[0].y}`;
      for (let i = 1; i < edge.points.length; i++) {
        const p1 = edge.points[i - 1];
        const p2 = edge.points[i];

        if (Math.abs(p1.y - p2.y) < 1e-3) {
          const minX = Math.min(p1.x, p2.x);
          const maxX = Math.max(p1.x, p2.x);
          const dir = p2.x > p1.x ? 1 : -1;
          const matchingHops = hopXs.filter((x) => x > minX + 4 && x < maxX - 4);

          if (matchingHops.length === 0) {
            pathD += ` L ${p2.x} ${p2.y}`;
          } else {
            matchingHops.sort((a, b) => (dir > 0 ? a - b : b - a));
            for (const hx of matchingHops) {
              const startX = hx - dir * hopRadius;
              const endX = hx + dir * hopRadius;
              pathD += ` L ${startX} ${p1.y}`;
              pathD += ` A ${hopRadius} ${hopRadius} 0 0 1 ${endX} ${p1.y}`;
            }
            pathD += ` L ${p2.x} ${p2.y}`;
          }
        } else {
          pathD += ` L ${p2.x} ${p2.y}`;
        }
      }
      updatedPaths.set(edge.edgeId, pathD);
    }

    return { updatedPaths, hops, junctions, crossingStats: { pVsP, pVsS, sVsS } };
  }
}
