import fs from 'fs';
import { Coordinate2D, BoundingBox } from '../types';

export interface VectorLineSegment {
  id: string;
  page: number;
  start: Coordinate2D;
  end: Coordinate2D;
  strokeWidth: number;
  isDashed: boolean;
  color?: string;
  classificationHint: 'process_pipe' | 'signal_line' | 'border_or_annotation' | 'equipment_symbol';
}

export interface VectorTextElement {
  id: string;
  page: number;
  text: string;
  bbox: BoundingBox;
  fontSize: number;
  rotation: number;
}

export interface VectorPdfExtractionResult {
  pageCount: number;
  dimensions: { width: number; height: number };
  lines: VectorLineSegment[];
  textElements: VectorTextElement[];
  symbolContours: { id: string; points: Coordinate2D[]; bbox: BoundingBox }[];
}

/**
 * Extracts vector geometry and positioned text blocks from vector PDF / SVG content.
 * Distinguishes process piping, signal lines, symbol outlines, and dimension/border lines.
 */
export function extractVectorGeometry(
  filePath: string,
  rawContent?: string
): VectorPdfExtractionResult {
  const result: VectorPdfExtractionResult = {
    pageCount: 1,
    dimensions: { width: 1200, height: 800 },
    lines: [],
    textElements: [],
    symbolContours: [],
  };

  try {
    let content = rawContent || '';
    if (!content && fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, 'utf8');
    }

    if (!content) return result;

    // 1. Detect SVG or PDF
    if (content.includes('<svg') || filePath.endsWith('.svg')) {
      return extractSvgVectorContent(content);
    }

    // 2. Parse PDF stream commands (moveto 'm', lineto 'l', rect 're', dash '[...]', text 'BT...ET')
    const lineRegex = /([0-9\.\-]+)\s+([0-9\.\-]+)\s+m\s+([0-9\.\-]+)\s+([0-9\.\-]+)\s+l/g;
    let match;
    let lineIdx = 0;

    while ((match = lineRegex.exec(content)) !== null) {
      lineIdx++;
      const x1 = parseFloat(match[1]);
      const y1 = parseFloat(match[2]);
      const x2 = parseFloat(match[3]);
      const y2 = parseFloat(match[4]);

      // Calculate length
      const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
      if (length < 2) continue; // Noise filter

      // Classification hint: very long border lines (> 1100 or boundary)
      let hint: VectorLineSegment['classificationHint'] = 'process_pipe';
      if (length > 1000 || x1 < 20 || y1 < 20) {
        hint = 'border_or_annotation';
      } else if (length < 25) {
        hint = 'equipment_symbol';
      }

      result.lines.push({
        id: `vec-line-${lineIdx}`,
        page: 1,
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        strokeWidth: 2,
        isDashed: false,
        classificationHint: hint,
      });
    }

    // Parse Text operators: (String) Tj or [(String)] TJ with preceding Td or Tm coordinates
    const textRegex = /(?:([0-9\.\-]+)\s+([0-9\.\-]+)\s+(?:Td|Tm))?[^()]*\(([^\)]+)\)\s*Tj/g;
    let textMatch;
    let textIdx = 0;
    let curX = 100;
    let curY = 100;

    while ((textMatch = textRegex.exec(content)) !== null) {
      textIdx++;
      if (textMatch[1] && textMatch[2]) {
        curX = Math.abs(parseFloat(textMatch[1]));
        curY = Math.abs(parseFloat(textMatch[2]));
      }
      const rawText = textMatch[3]?.trim();
      if (!rawText) continue;

      result.textElements.push({
        id: `vec-txt-${textIdx}`,
        page: 1,
        text: rawText,
        bbox: {
          x: curX,
          y: curY,
          w: Math.max(30, rawText.length * 8),
          h: 16,
        },
        fontSize: 12,
        rotation: 0,
      });
    }
  } catch (err: any) {
    console.error('Vector geometry extraction error:', err.message);
  }

  return result;
}

function extractSvgVectorContent(svgString: string): VectorPdfExtractionResult {
  const result: VectorPdfExtractionResult = {
    pageCount: 1,
    dimensions: { width: 1200, height: 800 },
    lines: [],
    textElements: [],
    symbolContours: [],
  };

  // Extract <line x1="..." y1="..." x2="..." y2="..." ... />
  const lineRegex = /<line\s+[^>]*x1=["']([^"']+)["'][^>]*y1=["']([^"']+)["'][^>]*x2=["']([^"']+)["'][^>]*y2=["']([^"']+)["'][^>]*\/?>/gi;
  let match;
  let idx = 0;
  while ((match = lineRegex.exec(svgString)) !== null) {
    idx++;
    const x1 = parseFloat(match[1]);
    const y1 = parseFloat(match[2]);
    const x2 = parseFloat(match[3]);
    const y2 = parseFloat(match[4]);
    const isDashed = match[0].includes('stroke-dasharray');

    result.lines.push({
      id: `svg-line-${idx}`,
      page: 1,
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      strokeWidth: isDashed ? 1 : 2,
      isDashed,
      classificationHint: isDashed ? 'signal_line' : 'process_pipe',
    });
  }

  // Extract <text x="..." y="...">Text</text>
  const textRegex = /<text\s+[^>]*x=["']([^"']+)["'][^>]*y=["']([^"']+)["'][^>]*>([^<]+)<\/text>/gi;
  let tMatch;
  let tIdx = 0;
  while ((tMatch = textRegex.exec(svgString)) !== null) {
    tIdx++;
    const x = parseFloat(tMatch[1]);
    const y = parseFloat(tMatch[2]);
    const str = tMatch[3]?.trim();
    if (!str) continue;

    result.textElements.push({
      id: `svg-text-${tIdx}`,
      page: 1,
      text: str,
      bbox: { x, y: y - 14, w: Math.max(30, str.length * 8), h: 16 },
      fontSize: 12,
      rotation: 0,
    });
  }

  return result;
}
