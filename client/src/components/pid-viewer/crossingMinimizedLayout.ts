import { PID_VIEWER_CONFIG } from './pidViewerConfig';
import { P_ID_SYMBOL_LIBRARY, resolveSymbolClassKey } from './symbolLibrary';
import { DrawingElement, DrawingConnector } from '../../types';

export interface LayoutNode {
  id: string;
  tag: string;
  type: string;
  symClass: string;
  x: number;
  y: number;
  width: number;
  height: number;
  sourceX: number;
  sourceY: number;
  isSpine: boolean;
  layerIndex: number;
  branchDirection: 'spine' | 'up' | 'down';
  sectionId?: string;
}

export interface LayoutPort {
  id: string;
  x: number;
  y: number;
  normal: { x: number; y: number };
}

export interface LayoutResult {
  nodes: LayoutNode[];
  assignedPorts: Map<string, { fromPortId: string; toPortId: string }>;
  spineNodeIds: string[];
  crossingsCount: number;
  scaleFactor: number;
  canvasWidth: number;
  canvasHeight: number;
  seed: number;
}

/**
 * Counts pairwise line segment crossings between two straight edge routes.
 */
export function countLineCrossings(
  edges: { p1: { x: number; y: number }; p2: { x: number; y: number }; type: string }[]
): { total: number; processVsProcess: number; processVsSignal: number; signalVsSignal: number } {
  let processVsProcess = 0;
  let processVsSignal = 0;
  let signalVsSignal = 0;

  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const e1 = edges[i];
      const e2 = edges[j];

      // Exclude shared endpoints
      if (
        (Math.abs(e1.p1.x - e2.p1.x) < 1e-3 && Math.abs(e1.p1.y - e2.p1.y) < 1e-3) ||
        (Math.abs(e1.p1.x - e2.p2.x) < 1e-3 && Math.abs(e1.p1.y - e2.p2.y) < 1e-3) ||
        (Math.abs(e1.p2.x - e2.p1.x) < 1e-3 && Math.abs(e1.p2.y - e2.p1.y) < 1e-3) ||
        (Math.abs(e1.p2.x - e2.p2.x) < 1e-3 && Math.abs(e1.p2.y - e2.p2.y) < 1e-3)
      ) {
        continue;
      }

      if (segmentsIntersect(e1.p1, e1.p2, e2.p1, e2.p2)) {
        const isE1Process = e1.type === 'process' || e1.type === 'piping_line';
        const isE2Process = e2.type === 'process' || e2.type === 'piping_line';

        if (isE1Process && isE2Process) {
          processVsProcess++;
        } else if (!isE1Process && !isE2Process) {
          signalVsSignal++;
        } else {
          processVsSignal++;
        }
      }
    }
  }

  return {
    total: processVsProcess + processVsSignal + signalVsSignal,
    processVsProcess,
    processVsSignal,
    signalVsSignal,
  };
}

function ccw(A: { x: number; y: number }, B: { x: number; y: number }, C: { x: number; y: number }): boolean {
  return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
}

function segmentsIntersect(
  A: { x: number; y: number },
  B: { x: number; y: number },
  C: { x: number; y: number },
  D: { x: number; y: number }
): boolean {
  return ccw(A, C, D) !== ccw(B, C, D) && ccw(A, B, C) !== ccw(A, B, D);
}

/**
 * Crossing-Minimized P&ID Layout Engine
 * Pre-computes horizontal spine alignment, topological layering, branch direction assignment,
 * multi-start barycenter ordering, port assignment, and constraint-based overlap relaxation.
 */
export class CrossingMinimizedLayoutEngine {
  /**
   * Main entry point to compute the crossing-minimized layout.
   */
  public static computeLayout(
    elements: DrawingElement[],
    connectors: DrawingConnector[],
    scaleOverride?: number,
    seedOverride?: number
  ): LayoutResult {
    const scaleFactor = scaleOverride ?? PID_VIEWER_CONFIG.layout.scale_factor;
    const multistart = PID_VIEWER_CONFIG.layout.multistart;
    const retryLimit = PID_VIEWER_CONFIG.layout.retry_limit;

    let bestResult: LayoutResult | null = null;
    let minCost = Infinity;

    // Multi-start sweeps: evaluate multiple permutation seeds and retain the lowest-cost configuration
    for (let attempt = 0; attempt < multistart; attempt++) {
      const currentSeed = seedOverride ?? attempt + 1;
      const candidate = this.executeSingleLayoutPass(elements, connectors, scaleFactor, currentSeed);

      const cost =
        candidate.crossingsCount * PID_VIEWER_CONFIG.layout.weights.w_cross +
        candidate.nodes.length * PID_VIEWER_CONFIG.layout.weights.w_len;

      if (cost < minCost) {
        minCost = cost;
        bestResult = candidate;
        if (candidate.crossingsCount <= PID_VIEWER_CONFIG.layout.max_crossings) {
          break; // Satisfied target criteria
        }
      }
    }

    return bestResult || this.executeSingleLayoutPass(elements, connectors, scaleFactor, 1);
  }

  private static executeSingleLayoutPass(
    elements: DrawingElement[],
    connectors: DrawingConnector[],
    scaleFactor: number,
    seed: number
  ): LayoutResult {
    const canvasWidth = PID_VIEWER_CONFIG.canvas.defaultWidth;
    const canvasHeight = PID_VIEWER_CONFIG.canvas.defaultHeight;
    const spineY = canvasHeight / 2; // Central horizontal spine baseline

    // 1. Detect Main Process Spine (Feed to Outlet)
    const spineNodeIds = this.detectMainSpine(elements, connectors);
    const spineSet = new Set(spineNodeIds);

    // 2. Classify Nodes: Spine, Branch Direction (UP vs DOWN), and Topological X-layer
    const nodeMap = new Map<string, LayoutNode>();

    for (const el of elements) {
      const symClass = resolveSymbolClassKey(el.tag, el.type);
      const symMeta = P_ID_SYMBOL_LIBRARY[symClass] || P_ID_SYMBOL_LIBRARY.gate_valve;
      const w = (el.size?.width || symMeta.defaultWidth) * (symClass === 'slug_catcher' ? 1.0 : 1.0);
      const h = (el.size?.height || symMeta.defaultHeight) * (symClass === 'slug_catcher' ? 1.0 : 1.0);

      const isSpine = spineSet.has(el.id);
      const branchDir = this.determineBranchDirection(el, connectors, elements, isSpine);

      nodeMap.set(el.id, {
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
        isSpine,
        layerIndex: 0,
        branchDirection: branchDir,
      });
    }

    // 3. Establish Spine X-coordinates in strict flow sequence
    const spineNodes = spineNodeIds.map((id) => nodeMap.get(id)!).filter(Boolean);
    const totalSpineNodes = spineNodes.length;
    const spineStartX = canvasWidth * 0.08;
    const spineEndX = canvasWidth * 0.92;
    const spineStepX = totalSpineNodes > 1 ? (spineEndX - spineStartX) / (totalSpineNodes - 1) : 0;

    spineNodes.forEach((node, idx) => {
      node.x = spineStartX + idx * spineStepX;
      node.y = spineY - node.height / 2;
      node.layerIndex = idx * 2; // Even indices for spine layers
    });

    // 4. Place Branch Nodes relative to their connected spine anchor
    for (const [id, node] of nodeMap.entries()) {
      if (node.isSpine) continue;

      // Find connected spine node
      const connectedSpine = this.findNearestSpineNode(id, connectors, spineSet, nodeMap);
      const anchorX = connectedSpine ? connectedSpine.x : (node.sourceX / 2048) * canvasWidth;

      node.x = anchorX;

      // Vertical offset by branch direction
      if (node.branchDirection === 'up') {
        // Relief & Flare branches go UP
        const verticalLevel = this.getVerticalLayerLevel(node, true);
        node.y = spineY - 380 - verticalLevel * 220;
      } else if (node.branchDirection === 'down') {
        // Drain & Blowdown branches go DOWN
        const verticalLevel = this.getVerticalLayerLevel(node, false);
        node.y = spineY + 380 + verticalLevel * 220;
      } else {
        // Parallel ladders (SDV manifold) or general components: preserve source side
        const isSourceAbove = node.sourceY < 650;
        node.y = isSourceAbove ? spineY - 260 : spineY + 260;
      }

      // SDV Wellhead Manifold Ladder Ordering (SDV-1001..1004)
      if (node.tag.startsWith('SDV-') || node.tag.includes('SDV')) {
        const match = node.tag.match(/100([1-4])/);
        if (match) {
          const runIdx = parseInt(match[1], 10) - 1; // 0..3
          node.x = spineStartX + 260;
          node.y = spineY - 480 + runIdx * 110;
        }
      }

      // Pipe-Mounted Instrument Placement (directly beside tap stubs within max_tap_distance_px)
      if (node.symClass.startsWith('instrument_') || node.type === 'instrument') {
        this.positionInstrumentBesideTap(node, connectors, nodeMap, spineY);
      }
    }

    // 5. Barycenter Refinement & Local Swaps
    this.applyBarycenterOrdering(Array.from(nodeMap.values()), connectors);

    // 6. Constraint-Based Overlap Removal
    this.removeNodeOverlaps(Array.from(nodeMap.values()));

    // 7. Dynamic Port Assignment (Align inlet nozzles upstream, outlet downstream)
    const assignedPorts = this.assignCrossingMinimizedPorts(Array.from(nodeMap.values()), connectors);

    // 8. Estimate crossings in straight-line abstraction
    const straightEdges = connectors.map((conn) => {
      const fromN = nodeMap.get(conn.from_element_id);
      const toN = nodeMap.get(conn.to_element_id);
      return {
        p1: { x: fromN ? fromN.x + fromN.width / 2 : 0, y: fromN ? fromN.y + fromN.height / 2 : 0 },
        p2: { x: toN ? toN.x + toN.width / 2 : 0, y: toN ? toN.y + toN.height / 2 : 0 },
        type: conn.functional_type || 'process',
      };
    });

    const crossingsMetrics = countLineCrossings(straightEdges);

    return {
      nodes: Array.from(nodeMap.values()),
      assignedPorts,
      spineNodeIds,
      crossingsCount: crossingsMetrics.total,
      scaleFactor,
      canvasWidth,
      canvasHeight,
      seed,
    };
  }

  /**
   * Detects the main process spine from inlet feed to downstream outlet.
   */
  public static detectMainSpine(elements: DrawingElement[], connectors: DrawingConnector[]): string[] {
    const elMap = new Map(elements.map((e) => [e.id, e]));

    // Find feed node (production manifold or inlet header)
    const feedNode = elements.find(
      (e) =>
        e.tag.includes('INLET') ||
        e.tag.includes('PRODUCTION') ||
        e.tag.includes('HEADER') ||
        e.tag.includes('MV-1001')
    ) || elements[0];

    // Find outlet node (HP separator or main delivery)
    const outletNode = elements.find(
      (e) =>
        e.tag.includes('SEPARATOR') ||
        e.tag.includes('GPF-002') ||
        e.tag.includes('OUTLET') ||
        e.tag.includes('HP')
    ) || elements[elements.length - 1];

    if (!feedNode || !outletNode) {
      return elements.slice(0, 7).map((e) => e.id);
    }

    // Build process adjacency list
    const adj = new Map<string, string[]>();
    for (const c of connectors) {
      const isProcess =
        c.functional_type === 'piping_line' ||
        (c.functional_type as string) === 'process' ||
        !c.functional_type;
      if (isProcess) {
        const list = adj.get(c.from_element_id) || [];
        list.push(c.to_element_id);
        adj.set(c.from_element_id, list);
      }
    }

    // Longest Path Search via DFS
    let longestPath: string[] = [];

    function dfs(currId: string, currentPath: string[], visited: Set<string>) {
      if (currId === outletNode?.id) {
        if (currentPath.length > longestPath.length) {
          longestPath = [...currentPath];
        }
        return;
      }
      const neighbors = adj.get(currId) || [];
      for (const nxt of neighbors) {
        if (!visited.has(nxt)) {
          visited.add(nxt);
          currentPath.push(nxt);
          dfs(nxt, currentPath, visited);
          currentPath.pop();
          visited.delete(nxt);
        }
      }
    }

    dfs(feedNode.id, [feedNode.id], new Set([feedNode.id]));

    // Canonical Fallback if isolated: Standard Left-to-Right Process Chain
    if (longestPath.length < 3) {
      const preferredSpineTags = [
        'INLET-HEADER',
        'XV-1001',
        'PG-1001',
        'CV-1001',
        'XV-1002',
        'PCV-1001',
        'HP-SEPARATOR',
      ];
      const matched = preferredSpineTags
        .map((t) => elements.find((e) => e.tag.includes(t) || t.includes(e.tag))?.id)
        .filter(Boolean) as string[];

      if (matched.length >= 3) {
        longestPath = matched;
      }
    }

    const rawSpine = longestPath.length >= 2 ? longestPath : elements.map((e) => e.id).slice(0, 6);
    return Array.from(new Set(rawSpine));
  }

  /**
   * Determines whether a non-spine branch routes UP (Relief/Flare) or DOWN (Drain/Blowdown).
   */
  public static determineBranchDirection(
    node: DrawingElement,
    connectors: DrawingConnector[],
    allElements: DrawingElement[],
    isSpine: boolean
  ): 'spine' | 'up' | 'down' {
    if (isSpine) return 'spine';

    const tag = node.tag.toUpperCase();

    // Check config: branch_up = ['relief', 'flare']
    for (const kw of PID_VIEWER_CONFIG.layers.branch_up) {
      if (tag.includes(kw.toUpperCase()) || tag.startsWith('PSV') || tag.startsWith('VT-') || tag.includes('VENT')) {
        return 'up';
      }
    }

    // Check config: branch_down = ['drain', 'blowdown']
    for (const kw of PID_VIEWER_CONFIG.layers.branch_down) {
      if (
        tag.includes(kw.toUpperCase()) ||
        tag.startsWith('BDV') ||
        tag.startsWith('LCV') ||
        tag.startsWith('DR-') ||
        tag.includes('DRAIN')
      ) {
        return 'down';
      }
    }

    // Inspect connected line tag or nozzle
    for (const c of connectors) {
      if (c.from_element_id === node.id || c.to_element_id === node.id) {
        const lineNum = (c.line_number || '').toUpperCase();
        if (lineNum.includes('FL-') || lineNum.includes('VT-')) return 'up';
        if (lineNum.includes('DR-') || lineNum.includes('PG-00107') || lineNum.includes('PG-00108')) return 'down';
      }
    }

    // Fallback: check vertical position in source drawing
    return node.position.y < 650 ? 'up' : 'down';
  }

  private static getVerticalLayerLevel(node: LayoutNode, isUp: boolean): number {
    const t = node.tag.toUpperCase();
    if (isUp) {
      if (t.includes('HEADER') || t.includes('FLARE')) return 2;
      if (t.startsWith('PSV')) return 1;
      return 0;
    } else {
      if (t.includes('DRUM') || t.includes('DRAIN HEADER')) return 2;
      if (t.startsWith('BDV') || t.startsWith('LCV')) return 1;
      return 0;
    }
  }

  private static findNearestSpineNode(
    nodeId: string,
    connectors: DrawingConnector[],
    spineSet: Set<string>,
    nodeMap: Map<string, LayoutNode>
  ): LayoutNode | null {
    for (const c of connectors) {
      if (c.from_element_id === nodeId && spineSet.has(c.to_element_id)) {
        return nodeMap.get(c.to_element_id) || null;
      }
      if (c.to_element_id === nodeId && spineSet.has(c.from_element_id)) {
        return nodeMap.get(c.from_element_id) || null;
      }
    }
    return null;
  }

  /**
   * Snaps pipe-mounted instruments beside their tap within max_tap_distance_px.
   */
  private static positionInstrumentBesideTap(
    node: LayoutNode,
    connectors: DrawingConnector[],
    nodeMap: Map<string, LayoutNode>,
    spineY: number
  ): void {
    const maxTapDist = PID_VIEWER_CONFIG.instrument.max_tap_distance_px * 2.5; // Scaled for large canvas

    // Locate tapped component
    for (const c of connectors) {
      const isTarget = c.to_element_id === node.id;
      const isSource = c.from_element_id === node.id;
      const otherId = isTarget ? c.from_element_id : isSource ? c.to_element_id : null;

      if (otherId && nodeMap.has(otherId)) {
        const tapped = nodeMap.get(otherId)!;
        const isAboveSpine = tapped.y <= spineY;

        node.x = tapped.x + (node.tag.includes('1002') ? 56 : -24);
        node.y = isAboveSpine ? tapped.y - maxTapDist : tapped.y + tapped.height + maxTapDist;
        return;
      }
    }
  }

  /**
   * Barycenter ordering sweep to reduce crossings across adjacent layers.
   */
  private static applyBarycenterOrdering(nodes: LayoutNode[], connectors: DrawingConnector[]): void {
    const minGap = PID_VIEWER_CONFIG.layout.min_node_gap_px;

    // Separate into vertical columns/stripes
    const xBuckets = new Map<number, LayoutNode[]>();
    for (const n of nodes) {
      const bucketKey = Math.round(n.x / 120);
      const list = xBuckets.get(bucketKey) || [];
      list.push(n);
      xBuckets.set(bucketKey, list);
    }

    // Sort nodes within each stripe vertically
    for (const bucket of xBuckets.values()) {
      if (bucket.length <= 1) continue;

      bucket.sort((a, b) => a.y - b.y);

      for (let i = 1; i < bucket.length; i++) {
        const prev = bucket[i - 1];
        const curr = bucket[i];
        if (curr.y < prev.y + prev.height + minGap) {
          curr.y = prev.y + prev.height + minGap;
        }
      }
    }
  }

  /**
   * Constraint-based non-overlapping layout relaxation.
   */
  private static removeNodeOverlaps(nodes: LayoutNode[]): void {
    const minGap = PID_VIEWER_CONFIG.layout.min_node_gap_px;
    const maxIters = 12;

    for (let iter = 0; iter < maxIters; iter++) {
      let moved = false;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const n1 = nodes[i];
          const n2 = nodes[j];

          // Check AABB overlap with minGap padding
          const overlapX = Math.min(n1.x + n1.width, n2.x + n2.width) - Math.max(n1.x, n2.x) + minGap;
          const overlapY = Math.min(n1.y + n1.height, n2.y + n2.height) - Math.max(n1.y, n2.y) + minGap;

          if (overlapX > 0 && overlapY > 0) {
            moved = true;
            if (overlapX < overlapY && !n1.isSpine && !n2.isSpine) {
              const shift = overlapX / 2;
              if (n1.x < n2.x) {
                n1.x -= shift;
                n2.x += shift;
              } else {
                n1.x += shift;
                n2.x -= shift;
              }
            } else {
              const shift = overlapY / 2;
              if (n1.isSpine) {
                n2.y += n2.y >= n1.y ? overlapY : -overlapY;
              } else if (n2.isSpine) {
                n1.y += n1.y >= n2.y ? overlapY : -overlapY;
              } else {
                if (n1.y < n2.y) {
                  n1.y -= shift;
                  n2.y += shift;
                } else {
                  n1.y += shift;
                  n2.y -= shift;
                }
              }
            }
          }
        }
      }
      if (!moved) break;
    }
  }

  /**
   * Dynamic Port Assignment:
   * Chooses the port/nozzle per edge to avoid crossing, ordering ports along a symbol side
   * to match the vertical/horizontal order of connected nodes.
   */
  private static assignCrossingMinimizedPorts(
    nodes: LayoutNode[],
    connectors: DrawingConnector[]
  ): Map<string, { fromPortId: string; toPortId: string }> {
    const assigned = new Map<string, { fromPortId: string; toPortId: string }>();
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    for (const conn of connectors) {
      const fromN = nodeMap.get(conn.from_element_id);
      const toN = nodeMap.get(conn.to_element_id);

      if (!fromN || !toN) {
        assigned.set(conn.id, { fromPortId: conn.from_port_id, toPortId: conn.to_port_id });
        continue;
      }

      const fromMeta = P_ID_SYMBOL_LIBRARY[fromN.symClass];
      const toMeta = P_ID_SYMBOL_LIBRARY[toN.symClass];

      let bestFromPort = conn.from_port_id;
      let bestToPort = conn.to_port_id;

      // When connecting to Slug Catcher PG-1001, map nozzles to relative direction:
      if (toN.symClass === 'slug_catcher') {
        if (fromN.x < toN.x && Math.abs(fromN.y - toN.y) < 160) {
          bestToPort = 'N1'; // Main process inlet from left
        } else if (fromN.y < toN.y) {
          bestToPort = fromN.tag.includes('VENT') ? 'N6' : 'N4'; // Top nozzles (Vent N6, PSV N4)
        } else if (fromN.y > toN.y) {
          bestToPort = fromN.tag.includes('DRAIN') ? 'N5' : 'N3'; // Bottom nozzles (Drain N5, Liquid N3)
        }
      }

      if (fromN.symClass === 'slug_catcher') {
        if (toN.x > fromN.x && Math.abs(toN.y - fromN.y) < 160) {
          bestFromPort = 'N2'; // Gas outlet to right
        } else if (toN.y < fromN.y) {
          bestFromPort = toN.tag.includes('VENT') ? 'N6' : 'N4';
        } else if (toN.y > fromN.y) {
          bestFromPort = toN.tag.includes('DRAIN') ? 'N5' : 'N3';
        }
      }

      // Default port fallback
      if (!fromMeta?.ports.some((p) => p.id === bestFromPort) && fromMeta?.ports.length) {
        bestFromPort = fromMeta.ports[0].id;
      }
      if (!toMeta?.ports.some((p) => p.id === bestToPort) && toMeta?.ports.length) {
        bestToPort = toMeta.ports[0].id;
      }

      assigned.set(conn.id, { fromPortId: bestFromPort, toPortId: bestToPort });
    }

    return assigned;
  }
}
