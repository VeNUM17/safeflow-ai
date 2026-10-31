import fs from 'fs';
import zlib from 'zlib';
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
 * Decodes ASCII85 encoded byte streams found in PDF documents
 */
export function decodeAscii85(str: string): Buffer {
  let cleaned = str.replace(/[\s\r\n]+/g, '');
  const tilde = cleaned.indexOf('~>');
  if (tilde !== -1) cleaned = cleaned.substring(0, tilde);
  if (cleaned.startsWith('<~')) cleaned = cleaned.substring(2);

  const out: number[] = [];
  let tuple = 0;
  let count = 0;

  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned.charCodeAt(i);
    if (c === 122 && count === 0) { // 'z' represents four zero bytes
      out.push(0, 0, 0, 0);
      continue;
    }
    tuple = tuple * 85 + (c - 33);
    count++;
    if (count === 5) {
      out.push((tuple >>> 24) & 0xff, (tuple >>> 16) & 0xff, (tuple >>> 8) & 0xff, tuple & 0xff);
      tuple = 0;
      count = 0;
    }
  }
  if (count > 0) {
    for (let j = 0; j < 5 - count; j++) {
      tuple = tuple * 85 + 84;
    }
    for (let k = 0; k < count - 1; k++) {
      out.push((tuple >>> (24 - 8 * k)) & 0xff);
    }
  }
  return Buffer.from(out);
}

/**
 * Extracts and decompresses all stream contents from a PDF buffer
 */
export function decompressPdfStreams(buffer: Buffer): string {
  const fileStr = buffer.toString('latin1');
  let combinedDecompressed = '';

  const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
  let match;

  while ((match = streamRegex.exec(fileStr)) !== null) {
    const streamContent = match[1];
    const streamHeader = fileStr.substring(Math.max(0, match.index - 300), match.index);

    try {
      let rawBuffer: Buffer;
      if (streamHeader.includes('ASCII85Decode')) {
        rawBuffer = decodeAscii85(streamContent);
      } else {
        rawBuffer = Buffer.from(streamContent, 'latin1');
      }

      let decompressed: Buffer;
      if (streamHeader.includes('FlateDecode')) {
        try {
          decompressed = zlib.unzipSync(rawBuffer);
        } catch {
          decompressed = zlib.inflateRawSync(rawBuffer);
        }
      } else {
        decompressed = rawBuffer;
      }

      combinedDecompressed += '\n' + decompressed.toString('latin1');
    } catch {
      // If decompression fails for a non-deflated stream, append raw content
      combinedDecompressed += '\n' + streamContent;
    }
  }

  return combinedDecompressed || fileStr;
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
    dimensions: { width: 1200, height: 850 },
    lines: [],
    textElements: [],
    symbolContours: [],
  };

  try {
    let content = '';
    if (filePath && fs.existsSync(filePath)) {
      if (filePath.endsWith('.svg')) {
        content = fs.readFileSync(filePath, 'utf8');
      } else {
        // PDF: Decompress content streams from actual PDF buffer
        const buf = fs.readFileSync(filePath);
        content = decompressPdfStreams(buf);
      }
    } else if (rawContent) {
      content = rawContent;
    }

    if (!content) return result;

    // 1. Detect SVG format
    if (content.includes('<svg')) {
      return extractSvgVectorContent(content);
    }

    // 2. Parse PDF vector stream operators
    // Line commands: m (moveto) followed by l (lineto)
    const lineRegex = /([0-9\.\-]+)\s+([0-9\.\-]+)\s+m\s+([0-9\.\-]+)\s+([0-9\.\-]+)\s+l/g;
    let match;
    let lineIdx = 0;

    while ((match = lineRegex.exec(content)) !== null) {
      lineIdx++;
      const x1 = parseFloat(match[1]);
      const y1 = parseFloat(match[2]);
      const x2 = parseFloat(match[3]);
      const y2 = parseFloat(match[4]);

      const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
      if (length < 2) continue; // Noise filter

      let hint: VectorLineSegment['classificationHint'] = 'process_pipe';
      if (length > 1000 || x1 < 25 || y1 < 25) {
        hint = 'border_or_annotation';
      } else if (length < 18) {
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

    // 3. Parse PDF Text with coordinates (Tm and Tj)
    const textRegex = /1\s+0\s+0\s+1\s+([0-9\.\-]+)\s+([0-9\.\-]+)\s+Tm\s*\(([^()]*)\)\s*Tj/g;
    let textMatch;
    let textIdx = 0;

    while ((textMatch = textRegex.exec(content)) !== null) {
      textIdx++;
      const x = parseFloat(textMatch[1]);
      const y = parseFloat(textMatch[2]);
      const rawText = textMatch[3]?.trim();
      if (!rawText) continue;

      result.textElements.push({
        id: `vec-txt-${textIdx}`,
        page: 1,
        text: rawText,
        bbox: {
          x,
          y,
          w: Math.max(30, rawText.length * 8),
          h: 16,
        },
        fontSize: 12,
        rotation: 0,
      });
    }

    // Fallback: older Td text operators if Tm was not matched
    if (result.textElements.length === 0) {
      const fallbackRegex = /(?:([0-9\.\-]+)\s+([0-9\.\-]+)\s+(?:Td|Tm))?[^()]*\(([^\)]+)\)\s*Tj/g;
      let fbMatch;
      let curX = 100;
      let curY = 100;
      while ((fbMatch = fallbackRegex.exec(content)) !== null) {
        textIdx++;
        if (fbMatch[1] && fbMatch[2]) {
          curX = Math.abs(parseFloat(fbMatch[1]));
          curY = Math.abs(parseFloat(fbMatch[2]));
        }
        const str = fbMatch[3]?.trim();
        if (!str) continue;
        result.textElements.push({
          id: `vec-txt-${textIdx}`,
          page: 1,
          text: str,
          bbox: { x: curX, y: curY, w: Math.max(30, str.length * 8), h: 16 },
          fontSize: 12,
          rotation: 0,
        });
      }
    }
  } catch (err: any) {
    console.error('Vector geometry extraction error:', err.message);
  }

  return result;
}

function extractSvgVectorContent(svgString: string): VectorPdfExtractionResult {
  const result: VectorPdfExtractionResult = {
    pageCount: 1,
    dimensions: { width: 1200, height: 850 },
    lines: [],
    textElements: [],
    symbolContours: [],
  };

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
