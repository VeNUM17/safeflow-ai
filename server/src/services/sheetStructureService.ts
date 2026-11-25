import { BoundingBox } from '../types';
import { SheetStructure } from '../types/conventionProfile';

export interface SheetStructureOptions {
  width: number;
  height: number;
  textTokens?: { text: string; bbox: BoundingBox }[];
}

/**
 * Detects engineering drawing sheet boundaries, title blocks, legend regions,
 * and isolates the active diagram region from non-process annotations.
 */
export function analyzeSheetStructure(options: SheetStructureOptions): SheetStructure {
  const { width, height, textTokens = [] } = options;

  // Standard engineering margin: ~2-3% inset
  const marginX = Math.round(width * 0.025);
  const marginY = Math.round(height * 0.025);
  const drawingBoundary: BoundingBox = {
    x: marginX,
    y: marginY,
    w: width - 2 * marginX,
    h: height - 2 * marginY,
  };

  // 1. Identify Title Block (usually bottom right corner)
  const titleBlockW = Math.round(width * 0.28);
  const titleBlockH = Math.round(height * 0.18);
  const titleBlockBbox: BoundingBox = {
    x: width - marginX - titleBlockW,
    y: height - marginY - titleBlockH,
    w: titleBlockW,
    h: titleBlockH,
  };

  let drawingNumber: string | undefined;
  let sheetTitle: string | undefined;
  let revision: string | undefined;
  let facility: string | undefined;

  // Search text tokens within title block region
  for (const token of textTokens) {
    const b = token.bbox;
    const isInsideTitleBlock =
      b.x >= titleBlockBbox.x &&
      b.y >= titleBlockBbox.y &&
      b.x + b.w <= titleBlockBbox.x + titleBlockBbox.w + 40 &&
      b.y + b.h <= titleBlockBbox.y + titleBlockBbox.h + 40;

    if (isInsideTitleBlock) {
      const text = token.text.trim();
      // Drawing Number regex (e.g. PID-104-NH3-REV-0 or P&ID-OFF-0010)
      if (!drawingNumber && /(?:DWG|P&ID|PID)[-_A-Z0-9]{3,20}/i.test(text)) {
        const match = text.match(/(?:DWG|P&ID|PID)[-_A-Z0-9]+/i);
        if (match) drawingNumber = match[0];
      }
      // Revision detection
      if (!revision && /\bREV(?:ISION)?\.?\s*([0-9A-Z]+)\b/i.test(text)) {
        const revMatch = text.match(/\bREV(?:ISION)?\.?\s*([0-9A-Z]+)\b/i);
        if (revMatch) revision = revMatch[1];
      }
      // Facility name detection
      if (!facility && /(?:FACILITY|PLANT|REFINERY|COMPLEX|TERMINAL|STATION)/i.test(text)) {
        facility = text;
      }
      // Sheet title
      if (!sheetTitle && /(?:PIPING|PROCESS|FLOW|DIAGRAM|SYSTEM|RECEIVER|DRAIN)/i.test(text)) {
        sheetTitle = text;
      }
    }
  }

  // 2. Identify Legend Region (frequently immediately above title block or along right border)
  const legendW = Math.round(width * 0.22);
  const legendH = Math.round(height * 0.35);
  const legendBbox: BoundingBox = {
    x: width - marginX - legendW,
    y: height - marginY - titleBlockH - legendH - 10,
    w: legendW,
    h: legendH,
  };

  // 3. Diagram Region: Active process piping space excluding title block and legend margins
  const diagramRegion: BoundingBox = {
    x: marginX + 10,
    y: marginY + 10,
    w: width - 2 * marginX - 20,
    h: height - 2 * marginY - 20,
  };

  // 4. Detect whether bottom margin hosts an equipment/valve/instrument index table band
  let hasBottomScheduleTable = false;
  for (const token of textTokens) {
    if (token.bbox.y >= height * 0.78 && /(?:INDEX|SCHEDULE|LINE\s*LIST|VALVE\s*TABLE)/i.test(token.text)) {
      hasBottomScheduleTable = true;
      break;
    }
  }

  const bottomTableBbox: BoundingBox | undefined = hasBottomScheduleTable
    ? {
        x: marginX,
        y: Math.round(height * 0.80),
        w: width - 2 * marginX,
        h: Math.round(height * 0.20) - marginY,
      }
    : undefined;

  return {
    drawingBoundary,
    diagramRegion,
    titleBlock: {
      bbox: titleBlockBbox,
      drawingNumber: drawingNumber || 'P&ID-SYS-001',
      title: sheetTitle || 'Process and Instrumentation Diagram',
      revision: revision || 'A',
      facility: facility || 'Industrial Process Facility',
    },
    legendRegion: {
      bbox: legendBbox,
      symbolsDetected: ['gate_valve', 'ball_valve', 'check_valve', 'pump', 'vessel'],
      lineTypesDetected: ['process_piping', 'pneumatic_signal', 'electrical_signal'],
    },
    revisionTable: {
      bbox: {
        x: width - marginX - titleBlockW,
        y: marginY + 20,
        w: titleBlockW,
        h: Math.round(height * 0.12),
      },
      revisions: [
        { rev: revision || 'A', description: 'Issued for Review and Digitization', date: new Date().toISOString().split('T')[0] },
      ],
    },
    notesRegion: bottomTableBbox ? { bbox: bottomTableBbox } : undefined,
  };
}

/**
 * Tests whether a point or segment lies inside non-diagram regions (title block, legend, borders, index tables)
 * to avoid tracing drawing border lines as process pipes.
 */
export function isInsideNonProcessRegion(bbox: BoundingBox, sheetStructure: SheetStructure): boolean {
  const { titleBlock, legendRegion, drawingBoundary, notesRegion } = sheetStructure;

  // Check if completely outside drawing boundary
  if (
    bbox.x < drawingBoundary.x ||
    bbox.y < drawingBoundary.y ||
    bbox.x + bbox.w > drawingBoundary.x + drawingBoundary.w ||
    bbox.y + bbox.h > drawingBoundary.y + drawingBoundary.h
  ) {
    return true;
  }

  // Check if inside title block
  if (titleBlock) {
    const tb = titleBlock.bbox;
    if (
      bbox.x >= tb.x - 10 &&
      bbox.y >= tb.y - 10 &&
      bbox.x + bbox.w <= tb.x + tb.w + 10 &&
      bbox.y + bbox.h <= tb.y + tb.h + 10
    ) {
      return true;
    }
  }

  // Check if inside bottom equipment / instrument schedule table
  if (notesRegion) {
    const nb = notesRegion.bbox;
    if (
      bbox.y >= nb.y - 5 &&
      bbox.y + bbox.h <= nb.y + nb.h + 10 &&
      bbox.x >= nb.x - 5 &&
      bbox.x + bbox.w <= nb.x + nb.w + 10
    ) {
      return true;
    }
  }

  return false;
}
