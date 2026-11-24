import { PID_VIEWER_CONFIG } from './pidViewerConfig';
import { Point, RectBox } from './orthogonalRouter';

export interface PlacedLabel {
  elementId: string;
  tag: string;
  x: number;
  y: number;
  width: number;
  height: number;
  anchorPosition: 'below' | 'right' | 'above' | 'left';
  importance: 'major' | 'normal' | 'detailed';
}

export interface PlacedLineNumber {
  edgeId: string;
  lineNumber: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number; // 0 for horizontal, 90 or -90 for vertical
}

/**
 * Checks overlap between two 2D axis-aligned bounding boxes.
 */
function boxesOverlap(b1: RectBox, b2: RectBox): boolean {
  return !(b1.x2 <= b2.x1 || b1.x1 >= b2.x2 || b1.y2 <= b2.y1 || b1.y1 >= b2.y2);
}

/**
 * Computes overlap area between two boxes.
 */
function overlapArea(b1: RectBox, b2: RectBox): number {
  const xOverlap = Math.max(0, Math.min(b1.x2, b2.x2) - Math.max(b1.x1, b2.x1));
  const yOverlap = Math.max(0, Math.min(b1.y2, b2.y2) - Math.max(b1.y1, b2.y1));
  return xOverlap * yOverlap;
}

export class LabelPlacer {
  /**
   * Places engineering tag labels beside symbols with automatic collision avoidance
   * and clean SVG halo styling (no opaque rectangular chips).
   */
  public static placeSymbolLabels(
    elements: { id: string; tag: string; type: string; x: number; y: number; width: number; height: number }[],
    existingObstacles: RectBox[] = []
  ): PlacedLabel[] {
    const placed: PlacedLabel[] = [];
    const occupiedBoxes: RectBox[] = [...existingObstacles];

    // Add all symbol bounding boxes as initial obstacles
    for (const el of elements) {
      occupiedBoxes.push({
        id: `sym-${el.id}`,
        x1: el.x - 4,
        y1: el.y - 4,
        x2: el.x + el.width + 4,
        y2: el.y + el.height + 4,
      });
    }

    const candidateOrder = PID_VIEWER_CONFIG.labels.candidate_positions; // ['below', 'right', 'above', 'left']

    for (const el of elements) {
      // Do not place external floating tag labels for instruments (text rendered inside circle bubble)
      // or for slug catcher PG-1001 (title stencil rendered inside body)
      if (
        el.type === 'instrument' ||
        el.type.startsWith('instrument_') ||
        el.type === 'slug_catcher' ||
        el.tag === 'PG-1001'
      ) {
        continue;
      }

      const tagText = el.tag;
      const fontPx = PID_VIEWER_CONFIG.labels.font_px;
      const labelW = Math.max(tagText.length * (fontPx * 0.68) + 12, 38);
      const labelH = fontPx + 6;

      // Candidate bounding boxes
      const candidateMap: Record<'below' | 'right' | 'above' | 'left', RectBox> = {
        below: {
          id: `lbl-${el.id}`,
          x1: el.x + el.width / 2 - labelW / 2,
          y1: el.y + el.height + 4,
          x2: el.x + el.width / 2 + labelW / 2,
          y2: el.y + el.height + 4 + labelH,
        },
        right: {
          id: `lbl-${el.id}`,
          x1: el.x + el.width + 6,
          y1: el.y + el.height / 2 - labelH / 2,
          x2: el.x + el.width + 6 + labelW,
          y2: el.y + el.height / 2 + labelH / 2,
        },
        above: {
          id: `lbl-${el.id}`,
          x1: el.x + el.width / 2 - labelW / 2,
          y1: el.y - labelH - 4,
          x2: el.x + el.width / 2 + labelW / 2,
          y2: el.y - 4,
        },
        left: {
          id: `lbl-${el.id}`,
          x1: el.x - labelW - 6,
          y1: el.y + el.height / 2 - labelH / 2,
          x2: el.x - 6,
          y2: el.y + el.height / 2 + labelH / 2,
        },
      };

      // Score each candidate: evaluate overlap penalty
      let bestPos: 'below' | 'right' | 'above' | 'left' = candidateOrder[0];
      let bestBox = candidateMap[bestPos];
      let minOverlap = Infinity;

      for (const pos of candidateOrder) {
        const box = candidateMap[pos];
        let totalOverlap = 0;
        for (const obs of occupiedBoxes) {
          if (obs.id === `sym-${el.id}`) continue; // Ignore own symbol
          totalOverlap += overlapArea(box, obs);
        }

        if (totalOverlap === 0) {
          bestPos = pos;
          bestBox = box;
          minOverlap = 0;
          break; // Found clear collision-free spot
        }

        if (totalOverlap < minOverlap) {
          minOverlap = totalOverlap;
          bestPos = pos;
          bestBox = box;
        }
      }

      // Determine importance for semantic zoom
      const isMajor =
        el.tag.startsWith('PG-') ||
        el.tag.startsWith('XV-') ||
        el.tag.startsWith('PCV-') ||
        el.tag.startsWith('BDV-') ||
        el.tag.startsWith('SDV-') ||
        el.tag.startsWith('PSV-');

      placed.push({
        elementId: el.id,
        tag: tagText,
        x: bestBox.x1,
        y: bestBox.y1,
        width: labelW,
        height: labelH,
        anchorPosition: bestPos,
        importance: isMajor ? 'major' : 'normal',
      });

      // Mark area as occupied
      occupiedBoxes.push(bestBox);
    }

    return placed;
  }

  /**
   * Places line number labels along routed edge segments.
   */
  public static placeLineNumbers(
    routedEdges: { edgeId: string; lineNumber?: string; points: Point[] }[],
    symbolBoxes: RectBox[] = []
  ): PlacedLineNumber[] {
    const placed: PlacedLineNumber[] = [];

    for (const edge of routedEdges) {
      if (!edge.lineNumber || edge.points.length < 2) continue;

      const numText = edge.lineNumber;
      const fontPx = PID_VIEWER_CONFIG.labels.font_px;
      const labelW = numText.length * (fontPx * 0.62) + 10;
      const labelH = fontPx + 4;

      // Find longest segment
      let bestSegment: { p1: Point; p2: Point; length: number; isVertical: boolean } | null = null;
      let maxLen = -1;

      for (let i = 1; i < edge.points.length; i++) {
        const p1 = edge.points[i - 1];
        const p2 = edge.points[i];
        const len = Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
        const isVert = Math.abs(p1.x - p2.x) < 1e-3;

        if (len < labelW + 8) continue;

        if (len > maxLen) {
          maxLen = len;
          bestSegment = { p1, p2, length: len, isVertical: isVert };
        }
      }

      if (!bestSegment) {
        const midIdx = Math.floor(edge.points.length / 2);
        const p1 = edge.points[midIdx - 1] || edge.points[0];
        const p2 = edge.points[midIdx] || edge.points[edge.points.length - 1];
        bestSegment = {
          p1,
          p2,
          length: Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y),
          isVertical: Math.abs(p1.x - p2.x) < 1e-3,
        };
      }

      const midX = (bestSegment.p1.x + bestSegment.p2.x) / 2;
      const midY = (bestSegment.p1.y + bestSegment.p2.y) / 2;

      placed.push({
        edgeId: edge.edgeId,
        lineNumber: numText,
        x: midX - labelW / 2,
        y: bestSegment.isVertical ? midY - labelH / 2 : midY - labelH - 2,
        width: labelW,
        height: labelH,
        angle: bestSegment.isVertical ? 90 : 0,
      });
    }

    return placed;
  }

  /**
   * Filters placed labels based on semantic zoom level:
   * - Overview (< 0.35): Major equipment and key tags
   * - Section (0.35 - 1.2): Standard tags and valves
   * - Detail (> 1.2): All annotations and attributes
   */
  public static filterLabelsByZoom(labels: PlacedLabel[], zoom: number): PlacedLabel[] {
    const { overview_max } = PID_VIEWER_CONFIG.zoom;
    if (zoom < overview_max) {
      // Show only major equipment & valves at overview zoom
      return labels.filter((lbl) => lbl.importance === 'major');
    }
    return labels;
  }
}
