import { v4 as uuidv4 } from 'uuid';
import {
  PipePath,
  PipeJunction,
  EquipmentPort,
  DrawingObject,
  ConnectionCandidate,
  Coordinate2D,
  DrawingEvidence,
  FunctionalType,
  FlowDirection,
} from '../types';
import { VectorLineSegment } from './vectorPdfService';

export interface TracedNetworkResult {
  pipePaths: PipePath[];
  junctions: PipeJunction[];
  connectionCandidates: ConnectionCandidate[];
  unresolvedSegments: { id: string; reason: string; coordinates: Coordinate2D[] }[];
}

/**
 * Calculates Euclidean distance between two 2D points
 */
export function pointDistance(p1: Coordinate2D, p2: Coordinate2D): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

/**
 * Calculates minimum perpendicular distance from point P to line segment A -> B
 */
export function pointToSegmentDistance(p: Coordinate2D, a: Coordinate2D, b: Coordinate2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return pointDistance(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return pointDistance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/**
 * Checks if two line segments share an intersection point
 */
export function findLineIntersection(
  p1: Coordinate2D,
  p2: Coordinate2D,
  p3: Coordinate2D,
  p4: Coordinate2D
): { intersects: boolean; point?: Coordinate2D } {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-6) return { intersects: false }; // Parallel

  const u = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const v = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;

  if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
    return {
      intersects: true,
      point: {
        x: p1.x + u * (p2.x - p1.x),
        y: p1.y + u * (p2.y - p1.y),
      },
    };
  }

  return { intersects: false };
}

/**
 * Dedicated Pipe-Tracing Service.
 * Implements continuous polyline stitching, junction & crossing analysis,
 * equipment port proximity matching, and negative endpoint rules.
 */
export function tracePipingNetwork(
  segments: VectorLineSegment[],
  equipmentObjects: DrawingObject[],
  availablePorts: EquipmentPort[],
  lineAnnotations: { tag: string; bbox: { x: number; y: number; w: number; h: number } }[],
  flowArrows: { position: Coordinate2D; angle: number }[],
  documentName: string,
  pageNumber = 1
): TracedNetworkResult {
  const pipePaths: PipePath[] = [];
  const junctions: PipeJunction[] = [];
  const connectionCandidates: ConnectionCandidate[] = [];
  const unresolvedSegments: { id: string; reason: string; coordinates: Coordinate2D[] }[] = [];

  // Filter out borders and annotations
  const candidateSegments = segments.filter(
    (s) => s.classificationHint === 'process_pipe' || s.classificationHint === 'signal_line'
  );

  // Group continuous segments into polylines
  const CONNECTION_TOLERANCE_PX = 15; // Max gap between connected collinear/orthogonal segments
  const PORT_TOLERANCE_PX = 45; // Max distance to confirm an equipment port connection

  const usedSegmentIds = new Set<string>();

  for (const seg of candidateSegments) {
    if (usedSegmentIds.has(seg.id)) continue;
    usedSegmentIds.add(seg.id);

    const pathCoords: Coordinate2D[] = [{ ...seg.start }, { ...seg.end }];
    const isSignal = seg.classificationHint === 'signal_line' || seg.isDashed;
    const pathId = `path-${uuidv4().substring(0, 8)}`;

    // Try chaining consecutive segments from end
    let extended = true;
    while (extended) {
      extended = false;
      const tail = pathCoords[pathCoords.length - 1];

      for (const other of candidateSegments) {
        if (usedSegmentIds.has(other.id)) continue;

        // Check if other.start matches tail
        if (pointDistance(tail, other.start) <= CONNECTION_TOLERANCE_PX) {
          pathCoords.push({ ...other.end });
          usedSegmentIds.add(other.id);
          extended = true;
          break;
        }
        // Check if other.end matches tail
        if (pointDistance(tail, other.end) <= CONNECTION_TOLERANCE_PX) {
          pathCoords.push({ ...other.start });
          usedSegmentIds.add(other.id);
          extended = true;
          break;
        }
      }
    }

    // Associate nearest line tag annotation
    let matchedLineTag: string | null = null;
    const midPoint = pathCoords[Math.floor(pathCoords.length / 2)];
    for (const ann of lineAnnotations) {
      const annCenter = { x: ann.bbox.x + ann.bbox.w / 2, y: ann.bbox.y + ann.bbox.h / 2 };
      if (pointDistance(midPoint, annCenter) < 120) {
        matchedLineTag = ann.tag;
        break;
      }
    }

    // Check Flow Arrow
    let flowDirection: FlowDirection = 'unknown';
    let matchedArrow = null;
    for (const arr of flowArrows) {
      for (let i = 0; i < pathCoords.length - 1; i++) {
        const segDist = pointToSegmentDistance(arr.position, pathCoords[i], pathCoords[i + 1]);
        if (segDist < 30) {
          flowDirection = arr.angle > 90 && arr.angle < 270 ? 'reverse' : 'forward';
          matchedArrow = {
            position: arr.position,
            angle: arr.angle,
            direction: flowDirection as 'forward' | 'reverse',
            confidence: 0.85,
          };
          break;
        }
      }
      if (matchedArrow) break;
    }

    // Find Start and End Port Connection Candidates
    const head = pathCoords[0];
    const tail = pathCoords[pathCoords.length - 1];

    let startCandidate = null;
    let endCandidate = null;

    // Search ports within PORT_TOLERANCE_PX
    for (const port of availablePorts) {
      const distHead = pointDistance(head, port.position);
      if (distHead <= PORT_TOLERANCE_PX) {
        if (!startCandidate || distHead < startCandidate.distance) {
          startCandidate = {
            equipment_tag: port.equipment_tag,
            equipment_id: port.equipment_id,
            port_id: port.id,
            distance: distHead,
            confidence: Math.max(0.6, 1.0 - distHead / PORT_TOLERANCE_PX),
          };
        }
      }

      const distTail = pointDistance(tail, port.position);
      if (distTail <= PORT_TOLERANCE_PX) {
        if (!endCandidate || distTail < endCandidate.distance) {
          endCandidate = {
            equipment_tag: port.equipment_tag,
            equipment_id: port.equipment_id,
            port_id: port.id,
            distance: distTail,
            confidence: Math.max(0.6, 1.0 - distTail / PORT_TOLERANCE_PX),
          };
        }
      }
    }

    const pathEvidence: DrawingEvidence = {
      source_document: documentName,
      page_number: pageNumber,
      bounding_box: {
        x: Math.min(...pathCoords.map((c) => c.x)),
        y: Math.min(...pathCoords.map((c) => c.y)),
        w: Math.max(...pathCoords.map((c) => c.x)) - Math.min(...pathCoords.map((c) => c.x)),
        h: Math.max(...pathCoords.map((c) => c.y)) - Math.min(...pathCoords.map((c) => c.y)),
      },
      recognition_method: 'heuristic_tracing',
      supporting_text: matchedLineTag || 'Traced pipe segment',
      confidence: 0.85,
    };

    const pipePath: PipePath = {
      id: pathId,
      page: pageNumber,
      coordinates: pathCoords,
      line_tag: matchedLineTag,
      functional_type: isSignal ? 'signal_line' : 'piping_line',
      flow_direction: flowDirection,
      junction_ids: [],
      start_candidate: startCandidate,
      end_candidate: endCandidate,
      is_continuous: true,
      crossings: [],
      flow_arrow: matchedArrow,
      confidence: 0.85,
      evidence: pathEvidence,
    };

    pipePaths.push(pipePath);

    // Evaluate connectivity under strict negative rules
    if (startCandidate && endCandidate && startCandidate.equipment_tag !== endCandidate.equipment_tag) {
      // Confirmed physical connectivity through geometric pipe tracing!
      const candidateId = `cand-${uuidv4().substring(0, 8)}`;
      connectionCandidates.push({
        id: candidateId,
        source_equipment: startCandidate.equipment_tag || 'UNKNOWN',
        source_port: startCandidate.port_id,
        destination_equipment: endCandidate.equipment_tag || 'UNKNOWN',
        destination_port: endCandidate.port_id,
        associated_pipe_paths: [pathId],
        line_number: matchedLineTag,
        functional_type: isSignal ? 'signal_line' : 'piping_line',
        flow_direction: flowDirection,
        connection_evidence: [pathEvidence],
        confidence: (startCandidate.confidence + endCandidate.confidence) / 2,
        recognition_status: 'visually_supported',
        verification_status: 'unverified',
        is_manually_corrected: false,
      });
    } else {
      // Unresolved endpoint: either head or tail did not land on confirmed port
      unresolvedSegments.push({
        id: pathId,
        reason: !startCandidate && !endCandidate
          ? 'Both pipe endpoints are dangling or unattached to confirmed equipment ports.'
          : !startCandidate
          ? `Inlet endpoint of path is unattached (outlet near ${endCandidate?.equipment_tag}).`
          : `Outlet endpoint of path is unattached (inlet near ${startCandidate?.equipment_tag}).`,
        coordinates: pathCoords,
      });
    }
  }

  // Crossing and Junction Detection
  for (let i = 0; i < pipePaths.length; i++) {
    for (let j = i + 1; j < pipePaths.length; j++) {
      const p1 = pipePaths[i];
      const p2 = pipePaths[j];

      for (let s1 = 0; s1 < p1.coordinates.length - 1; s1++) {
        for (let s2 = 0; s2 < p2.coordinates.length - 1; s2++) {
          const inter = findLineIntersection(
            p1.coordinates[s1],
            p1.coordinates[s1 + 1],
            p2.coordinates[s2],
            p2.coordinates[s2 + 1]
          );

          if (inter.intersects && inter.point) {
            // CRITICAL CROSSING RULE:
            // Check for junction dot vs crossing jump / bridge
            // In standard P&ID conventions, crossing lines without an explicit junction dot
            // are UNCONNECTED CROSSINGS.
            const hasJunctionDot = false; // By default without explicit dot evidence, lines cross without connecting
            const junctionId = `junc-${uuidv4().substring(0, 8)}`;

            junctions.push({
              id: junctionId,
              page: pageNumber,
              coordinates: inter.point,
              junction_type: hasJunctionDot ? 'cross_junction' : 'unconnected_crossing',
              has_junction_dot: hasJunctionDot,
              connected_path_ids: hasJunctionDot ? [p1.id, p2.id] : [],
              evidence: {
                source_document: documentName,
                page_number: pageNumber,
                bounding_box: { x: inter.point.x - 5, y: inter.point.y - 5, w: 10, h: 10 },
                recognition_method: 'heuristic_tracing',
                supporting_text: hasJunctionDot ? 'T-junction or cross-junction with dot' : 'Unconnected crossing (no junction dot)',
                confidence: 0.9,
              },
              confidence: 0.9,
            });

            p1.crossings.push({
              crossing_point: inter.point,
              other_path_id: p2.id,
              is_connected: hasJunctionDot,
              has_bridge_symbol: false,
              confidence: 0.9,
            });

            p2.crossings.push({
              crossing_point: inter.point,
              other_path_id: p1.id,
              is_connected: hasJunctionDot,
              has_bridge_symbol: false,
              confidence: 0.9,
            });
          }
        }
      }
    }
  }

  return {
    pipePaths,
    junctions,
    connectionCandidates,
    unresolvedSegments,
  };
}
