import { DrawingElement, DrawingConnector } from '../types';

export interface BoundingBox2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

/**
 * Computes the overall bounding box and centroid of all elements on the canvas
 */
export function computeDiagramBounds(elements: DrawingElement[]): BoundingBox2D {
  if (elements.length === 0) {
    return { minX: 0, minY: 0, maxX: 1200, maxY: 800, width: 1200, height: 800, centerX: 600, centerY: 400 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    const w = el.size.width || 80;
    const h = el.size.height || 80;
    minX = Math.min(minX, el.position.x);
    minY = Math.min(minY, el.position.y);
    maxX = Math.max(maxX, el.position.x + w);
    maxY = Math.max(maxY, el.position.y + h);
  }

  const width = Math.max(maxX - minX, 100);
  const height = Math.max(maxY - minY, 100);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    centerX: minX + width / 2,
    centerY: minY + height / 2,
  };
}

/**
 * Expands or compacts the layout spacing of all elements outward from the centroid.
 * Scales connector waypoints proportionally so piping routes remain attached.
 * @param factor e.g. 1.25 for +25% expansion, 0.8 for -20% compaction
 */
export function spreadElementSpacing(
  elements: DrawingElement[],
  connectors: DrawingConnector[],
  factor: number,
  padding = 60
): { updatedElements: DrawingElement[]; updatedConnectors: DrawingConnector[] } {
  if (elements.length <= 1) {
    return { updatedElements: elements, updatedConnectors: connectors };
  }

  const bounds = computeDiagramBounds(elements);
  const cx = bounds.centerX;
  const cy = bounds.centerY;

  const updatedElements: DrawingElement[] = elements.map((el) => {
    const w = el.size.width || 80;
    const h = el.size.height || 80;
    const elCenterX = el.position.x + w / 2;
    const elCenterY = el.position.y + h / 2;

    const newCenterX = cx + (elCenterX - cx) * factor;
    const newCenterY = cy + (elCenterY - cy) * factor;

    const newX = Math.max(padding, Math.round(newCenterX - w / 2));
    const newY = Math.max(padding, Math.round(newCenterY - h / 2));

    return {
      ...el,
      position: { x: newX, y: newY },
    };
  });

  const updatedConnectors: DrawingConnector[] = connectors.map((conn) => {
    if (!conn.waypoints || conn.waypoints.length === 0) return conn;

    const scaledWaypoints = conn.waypoints.map((wp) => ({
      x: Math.max(padding, Math.round(cx + (wp.x - cx) * factor)),
      y: Math.max(padding, Math.round(cy + (wp.y - cy) * factor)),
    }));

    return {
      ...conn,
      waypoints: scaledWaypoints,
    };
  });

  return { updatedElements, updatedConnectors };
}

/**
 * Iterative Force-Relaxation & Collision Resolution
 * Pushes apart overlapping and tightly bunched components (symbols, tags, inline valves)
 * to eliminate visual crowding while preserving general engineering topology.
 */
export function resolveElementOverlaps(
  elements: DrawingElement[],
  connectors: DrawingConnector[],
  minClearance = 70,
  maxIterations = 8
): { updatedElements: DrawingElement[]; updatedConnectors: DrawingConnector[]; shiftsApplied: number } {
  if (elements.length <= 1) {
    return { updatedElements: elements, updatedConnectors: connectors, shiftsApplied: 0 };
  }

  // Work on a mutable clone of positions
  const positions = elements.map((el) => ({
    id: el.id,
    x: el.position.x,
    y: el.position.y,
    w: el.size.width || 80,
    h: el.size.height || 80,
    tag: el.tag,
    isMajorVessel: el.type === 'vessel' || el.type === 'tank' || el.type === 'reactor',
  }));

  let totalShifts = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    let hadCollision = false;

    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i];
        const b = positions[j];

        // Include buffer for tag badge below element
        const aTotalH = a.h + 24;
        const bTotalH = b.h + 24;

        const overlapX = (a.w + b.w) / 2 + minClearance - Math.abs((a.x + a.w / 2) - (b.x + b.w / 2));
        const overlapY = (aTotalH + bTotalH) / 2 + minClearance - Math.abs((a.y + aTotalH / 2) - (b.y + bTotalH / 2));

        if (overlapX > 0 && overlapY > 0) {
          hadCollision = true;
          totalShifts++;

          // Push apart along axis of least resistance or predominantly horizontal for process flow
          if (overlapX <= overlapY) {
            const shift = Math.ceil(overlapX / 2);
            if (a.x < b.x) {
              if (!a.isMajorVessel) a.x = Math.max(30, a.x - shift);
              b.x += shift;
            } else {
              a.x += shift;
              if (!b.isMajorVessel) b.x = Math.max(30, b.x - shift);
            }
          } else {
            const shift = Math.ceil(overlapY / 2);
            if (a.y < b.y) {
              if (!a.isMajorVessel) a.y = Math.max(30, a.y - shift);
              b.y += shift;
            } else {
              a.y += shift;
              if (!b.isMajorVessel) b.y = Math.max(30, b.y - shift);
            }
          }
        }
      }
    }

    if (!hadCollision) break;
  }

  // Create displacement map to update connector waypoints smoothly
  const posMap = new Map<string, { x: number; y: number; dx: number; dy: number }>();
  positions.forEach((p, idx) => {
    const orig = elements[idx].position;
    posMap.set(p.id, {
      x: p.x,
      y: p.y,
      dx: p.x - orig.x,
      dy: p.y - orig.y,
    });
  });

  const updatedElements: DrawingElement[] = elements.map((el) => {
    const shift = posMap.get(el.id);
    return {
      ...el,
      position: shift ? { x: shift.x, y: shift.y } : el.position,
    };
  });

  // Adjust connector waypoints attached to shifted elements
  const updatedConnectors: DrawingConnector[] = connectors.map((conn) => {
    const fromShift = posMap.get(conn.from_element_id);
    const toShift = posMap.get(conn.to_element_id);

    const waypoints = conn.waypoints;
    if (!waypoints || waypoints.length === 0) return conn;

    const count = waypoints.length;
    // Shift waypoints proportionally between source and target shifts
    const newWaypoints = waypoints.map((wp, index) => {
      const ratio = count > 1 ? index / (count - 1) : 0.5;
      const dx = ((fromShift?.dx || 0) * (1 - ratio)) + ((toShift?.dx || 0) * ratio);
      const dy = ((fromShift?.dy || 0) * (1 - ratio)) + ((toShift?.dy || 0) * ratio);
      return {
        x: Math.round(wp.x + dx),
        y: Math.round(wp.y + dy),
      };
    });

    return {
      ...conn,
      waypoints: newWaypoints,
    };
  });

  return { updatedElements, updatedConnectors, shiftsApplied: totalShifts };
}
