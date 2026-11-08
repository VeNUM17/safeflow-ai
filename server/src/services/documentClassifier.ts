import fs from 'fs';
import path from 'path';
import { decompressPdfStreams } from './vectorPdfService';

export type DocumentClassificationType = 'vector_pdf' | 'scanned_pdf' | 'raster_image' | 'mixed_pdf';

export interface PageClassification {
  pageNumber: number;
  type: 'vector' | 'scanned' | 'raster_image';
  hasVectorGraphics: boolean;
  hasTextStream: boolean;
  textLength: number;
  confidence: number;
  recommendedPipeline: 'vector' | 'raster';
}

export interface DocumentClassificationResult {
  documentId: string;
  filePath: string;
  fileName: string;
  mimeType: string;
  overallClassification: DocumentClassificationType;
  pageCount: number;
  pages: PageClassification[];
  hasScannedPages: boolean;
  hasVectorPages: boolean;
  recommendedWorkflow: 'vector_primary' | 'raster_primary' | 'hybrid_mixed';
}

/**
 * Classifies uploaded documents into vector PDF, scanned PDF, raster image, or mixed PDF.
 * Checks vector operators, digital text streams, and image wrappers.
 */
export async function classifyDocument(
  filePath: string,
  fileName: string,
  mimeType: string,
  documentId: string
): Promise<DocumentClassificationResult> {
  const ext = path.extname(fileName).toLowerCase();

  // 1. Direct Raster Images (PNG, JPG, JPEG, WebP)
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext) || mimeType.startsWith('image/')) {
    const page: PageClassification = {
      pageNumber: 1,
      type: 'raster_image',
      hasVectorGraphics: false,
      hasTextStream: false,
      textLength: 0,
      confidence: 1.0,
      recommendedPipeline: 'raster',
    };

    return {
      documentId,
      filePath,
      fileName,
      mimeType,
      overallClassification: 'raster_image',
      pageCount: 1,
      pages: [page],
      hasScannedPages: true,
      hasVectorPages: false,
      recommendedWorkflow: 'raster_primary',
    };
  }

  // 2. Vector SVG files
  if (ext === '.svg' || mimeType.includes('svg')) {
    const page: PageClassification = {
      pageNumber: 1,
      type: 'vector',
      hasVectorGraphics: true,
      hasTextStream: true,
      textLength: 500,
      confidence: 1.0,
      recommendedPipeline: 'vector',
    };

    return {
      documentId,
      filePath,
      fileName,
      mimeType,
      overallClassification: 'vector_pdf',
      pageCount: 1,
      pages: [page],
      hasScannedPages: false,
      hasVectorPages: true,
      recommendedWorkflow: 'vector_primary',
    };
  }

  // 3. PDF Files
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const buffer = fs.readFileSync(filePath);
    // Decompress PDF streams to accurately detect vector operators inside compressed contents
    const decompressedStr = decompressPdfStreams(buffer);
    const contentStr = buffer.toString('binary') + '\n' + decompressedStr;

    // Count pages in PDF via /Type /Page references
    const pageMatches = contentStr.match(/\/Type\s*\/Page\b/g);
    const pageCount = pageMatches ? pageMatches.length : 1;

    // Inspect stream operators for vector graphics: ' m', ' l', ' c', ' re', ' S', ' s', ' f'
    const hasVectorOperators =
      /\b[0-9\.\-]+\s+[0-9\.\-]+\s+m\b/.test(decompressedStr) &&
      (/\b[0-9\.\-]+\s+[0-9\.\-]+\s+l\b/.test(decompressedStr) || /\b[0-9\.\-]+\s+[0-9\.\-]+\s+[0-9\.\-]+\s+[0-9\.\-]+\s+re\b/.test(decompressedStr));

    // Check for standard digital text operators: 'BT', 'ET', 'Tj', 'TJ'
    const hasTextOperators =
      (/\bBT\b/.test(decompressedStr) && (/\/Tj\b/.test(decompressedStr) || /\bTJ\b/.test(decompressedStr) || /\bTj\b/.test(decompressedStr))) ||
      /\([^\)]+\)\s*Tj/.test(decompressedStr);

    // Check if drawing is dominated by an embedded raster image /XObject /Image
    const hasEmbeddedImage = /\/Subtype\s*\/Image\b/.test(contentStr);

    const pages: PageClassification[] = [];
    let scannedPagesCount = 0;
    let vectorPagesCount = 0;

    for (let p = 1; p <= pageCount; p++) {
      // In mixed PDFs, determine page suitability
      const isVector = hasVectorOperators && (hasTextOperators || !hasEmbeddedImage);
      if (isVector) {
        vectorPagesCount++;
      } else {
        scannedPagesCount++;
      }

      pages.push({
        pageNumber: p,
        type: isVector ? 'vector' : 'scanned',
        hasVectorGraphics: hasVectorOperators,
        hasTextStream: hasTextOperators,
        textLength: hasTextOperators ? 250 : 20,
        confidence: 0.9,
        recommendedPipeline: isVector ? 'vector' : 'raster',
      });
    }

    let overall: DocumentClassificationType = 'vector_pdf';
    let recommendedWorkflow: 'vector_primary' | 'raster_primary' | 'hybrid_mixed' = 'vector_primary';

    if (vectorPagesCount > 0 && scannedPagesCount > 0) {
      overall = 'mixed_pdf';
      recommendedWorkflow = 'hybrid_mixed';
    } else if (scannedPagesCount > 0 && vectorPagesCount === 0) {
      overall = 'scanned_pdf';
      recommendedWorkflow = 'raster_primary';
    } else {
      overall = 'vector_pdf';
      recommendedWorkflow = 'vector_primary';
    }

    return {
      documentId,
      filePath,
      fileName,
      mimeType,
      overallClassification: overall,
      pageCount,
      pages,
      hasScannedPages: scannedPagesCount > 0,
      hasVectorPages: vectorPagesCount > 0,
      recommendedWorkflow,
    };
  } catch (err: any) {
    // Fallback on error
    return {
      documentId,
      filePath,
      fileName,
      mimeType,
      overallClassification: 'scanned_pdf',
      pageCount: 1,
      pages: [
        {
          pageNumber: 1,
          type: 'scanned',
          hasVectorGraphics: false,
          hasTextStream: false,
          textLength: 0,
          confidence: 0.6,
          recommendedPipeline: 'raster',
        },
      ],
      hasScannedPages: true,
      hasVectorPages: false,
      recommendedWorkflow: 'raster_primary',
    };
  }
}

import { DocumentCategory } from '../types';

export interface CategoryClassificationResult {
  category: DocumentCategory;
  confidence: number;
  matchedKeywords: string[];
  reason: string;
}

/**
 * Automatically classifies engineering documents into one of the 11 industrial categories
 * based on filename patterns, MIME types, document structure, and content semantics.
 */
export function classifyEngineeringCategory(
  fileName: string,
  text: string = '',
  mimeType: string = ''
): CategoryClassificationResult {
  const lowerName = fileName.toLowerCase();
  const lowerText = text.toLowerCase();
  const ext = path.extname(fileName).toLowerCase();

  // Category score accumulator
  const scores: Record<DocumentCategory, { score: number; keywords: string[] }> = {
    sds: { score: 0, keywords: [] },
    pid: { score: 0, keywords: [] },
    pfd: { score: 0, keywords: [] },
    bfd: { score: 0, keywords: [] },
    stream_table: { score: 0, keywords: [] },
    equipment_datasheet: { score: 0, keywords: [] },
    basis_of_design: { score: 0, keywords: [] },
    process_design_philosophy: { score: 0, keywords: [] },
    operating_philosophy: { score: 0, keywords: [] },
    control_philosophy: { score: 0, keywords: [] },
    shutdown_philosophy: { score: 0, keywords: [] },
  };

  const addScore = (cat: DocumentCategory, points: number, keyword: string) => {
    scores[cat].score += points;
    if (!scores[cat].keywords.includes(keyword)) {
      scores[cat].keywords.push(keyword);
    }
  };

  // 1. FILENAME HEURISTICS (Strong initial indicator)
  if (lowerName.includes('sds') || lowerName.includes('msds') || lowerName.includes('safety_data')) {
    addScore('sds', 60, 'filename:sds');
  }
  if (
    lowerName.includes('p&id') ||
    lowerName.includes('pid') ||
    lowerName.includes('piping') ||
    lowerName.includes('piping_and_instrumentation')
  ) {
    addScore('pid', 60, 'filename:pid');
  }
  if (lowerName.includes('pfd') || lowerName.includes('process_flow_diagram')) {
    addScore('pfd', 60, 'filename:pfd');
  }
  if (lowerName.includes('bfd') || lowerName.includes('block_flow_diagram') || lowerName.includes('block_diagram')) {
    addScore('bfd', 60, 'filename:bfd');
  }
  if (
    lowerName.includes('stream') ||
    lowerName.includes('h&mb') ||
    lowerName.includes('heat_and_material_balance') ||
    lowerName.includes('stream_table') ||
    (ext === '.xlsx' && (lowerName.includes('balance') || lowerName.includes('flow')))
  ) {
    addScore('stream_table', 50, 'filename:stream_table');
  }
  if (
    lowerName.includes('datasheet') ||
    lowerName.includes('data_sheet') ||
    lowerName.includes('equip_spec') ||
    lowerName.includes('vessel_spec') ||
    lowerName.includes('pump_spec')
  ) {
    addScore('equipment_datasheet', 60, 'filename:datasheet');
  }
  if (lowerName.includes('basis_of_design') || lowerName.includes('design_basis') || lowerName.includes('bod')) {
    addScore('basis_of_design', 60, 'filename:bod');
  }
  if (
    lowerName.includes('process_design_philosophy') ||
    lowerName.includes('design_philosophy') ||
    lowerName.includes('overpressure_philosophy') ||
    lowerName.includes('relief_philosophy')
  ) {
    addScore('process_design_philosophy', 60, 'filename:process_design_philosophy');
  }
  if (
    lowerName.includes('operating_philosophy') ||
    lowerName.includes('operating_manual') ||
    lowerName.includes('sop') ||
    lowerName.includes('operating_procedure')
  ) {
    addScore('operating_philosophy', 60, 'filename:operating_philosophy');
  }
  if (
    lowerName.includes('control_philosophy') ||
    lowerName.includes('control_narrative') ||
    lowerName.includes('process_control')
  ) {
    addScore('control_philosophy', 60, 'filename:control_philosophy');
  }
  if (
    lowerName.includes('shutdown') ||
    lowerName.includes('emergency_shutdown') ||
    lowerName.includes('esd') ||
    lowerName.includes('cause_and_effect') ||
    lowerName.includes('c&e')
  ) {
    addScore('shutdown_philosophy', 60, 'filename:shutdown_philosophy');
  }

  // 2. CONTENT & SEMANTIC KEYWORDS HEURISTICS
  const checkTerms = (cat: DocumentCategory, terms: { term: string; pts: number }[]) => {
    for (const { term, pts } of terms) {
      if (lowerText.includes(term)) {
        addScore(cat, pts, term);
      }
    }
  };

  // SDS
  checkTerms('sds', [
    { term: 'safety data sheet', pts: 40 },
    { term: 'material safety data sheet', pts: 40 },
    { term: 'hazard statements', pts: 25 },
    { term: 'precautionary statements', pts: 25 },
    { term: 'section 1: identification', pts: 30 },
    { term: 'section 2: hazards identification', pts: 30 },
    { term: 'section 8: exposure controls', pts: 30 },
    { term: 'cas number', pts: 20 },
    { term: 'cas no', pts: 20 },
    { term: 'permissible exposure limit', pts: 20 },
    { term: 'ghs classification', pts: 25 },
  ]);

  // P&ID
  checkTerms('pid', [
    { term: 'piping and instrumentation diagram', pts: 45 },
    { term: 'piping & instrumentation diagram', pts: 45 },
    { term: 'valve index', pts: 30 },
    { term: 'instrument index', pts: 30 },
    { term: 'line list', pts: 30 },
    { term: 'closed drain drum', pts: 20 },
    { term: 'sour flare header', pts: 20 },
    { term: 'fail closed', pts: 15 },
    { term: 'fail open', pts: 15 },
  ]);

  // PFD
  checkTerms('pfd', [
    { term: 'process flow diagram', pts: 45 },
    { term: 'heat & material balance summary', pts: 35 },
    { term: 'major process flow', pts: 25 },
    { term: 'process flow scheme', pts: 30 },
  ]);

  // BFD
  checkTerms('bfd', [
    { term: 'block flow diagram', pts: 45 },
    { term: 'overall block flow', pts: 35 },
    { term: 'battery limits', pts: 25 },
    { term: 'unit block diagram', pts: 30 },
  ]);

  // Stream Table
  checkTerms('stream_table', [
    { term: 'stream table', pts: 45 },
    { term: 'heat and material balance table', pts: 40 },
    { term: 'mole fraction', pts: 25 },
    { term: 'mass flow rate', pts: 25 },
    { term: 'molar flow rate', pts: 25 },
    { term: 'operating temperature', pts: 15 },
    { term: 'operating pressure', pts: 15 },
    { term: 'vapor fraction', pts: 20 },
    { term: 'liquid fraction', pts: 20 },
    { term: 'stream number', pts: 25 },
    { term: 'stream no', pts: 25 },
  ]);

  // Equipment Datasheet
  checkTerms('equipment_datasheet', [
    { term: 'equipment datasheet', pts: 45 },
    { term: 'mechanical datasheet', pts: 40 },
    { term: 'vessel datasheet', pts: 40 },
    { term: 'pump datasheet', pts: 40 },
    { term: 'heat exchanger datasheet', pts: 40 },
    { term: 'material of construction', pts: 25 },
    { term: 'design pressure', pts: 20 },
    { term: 'design temperature', pts: 20 },
    { term: 'corrosion allowance', pts: 25 },
    { term: 'nozzle schedule', pts: 30 },
    { term: 'shell and tube', pts: 20 },
    { term: 'relief valve set pressure', pts: 25 },
    { term: 'asme section viii', pts: 25 },
  ]);

  // Basis of Design
  checkTerms('basis_of_design', [
    { term: 'basis of design', pts: 45 },
    { term: 'design basis', pts: 40 },
    { term: 'project design basis', pts: 40 },
    { term: 'feed envelope', pts: 30 },
    { term: 'plant design capacity', pts: 25 },
    { term: 'ambient design conditions', pts: 25 },
    { term: 'design margins', pts: 20 },
  ]);

  // Process Design Philosophy
  checkTerms('process_design_philosophy', [
    { term: 'process design philosophy', pts: 45 },
    { term: 'overpressure protection philosophy', pts: 35 },
    { term: 'relief and depressuring philosophy', pts: 35 },
    { term: 'sparing philosophy', pts: 30 },
    { term: 'venting and flaring philosophy', pts: 35 },
    { term: 'api 520 / 521', pts: 25 },
  ]);

  // Operating Philosophy
  checkTerms('operating_philosophy', [
    { term: 'operating philosophy', pts: 45 },
    { term: 'operating manual', pts: 35 },
    { term: 'standard operating procedure', pts: 35 },
    { term: 'startup procedure', pts: 30 },
    { term: 'normal operating procedures', pts: 30 },
    { term: 'turndown limits', pts: 25 },
  ]);

  // Control Philosophy
  checkTerms('control_philosophy', [
    { term: 'control philosophy', pts: 45 },
    { term: 'process control narrative', pts: 40 },
    { term: 'control narrative', pts: 40 },
    { term: 'control loop description', pts: 35 },
    { term: 'split-range control', pts: 30 },
    { term: 'override control', pts: 25 },
    { term: 'distributed control system', pts: 20 },
  ]);

  // Shutdown and ESD Philosophy
  checkTerms('shutdown_philosophy', [
    { term: 'shutdown philosophy', pts: 45 },
    { term: 'emergency shutdown philosophy', pts: 45 },
    { term: 'esd philosophy', pts: 40 },
    { term: 'cause and effect matrix', pts: 40 },
    { term: 'cause & effect matrix', pts: 40 },
    { term: 'c&e matrix', pts: 35 },
    { term: 'safety instrumented system', pts: 35 },
    { term: 'sil rating', pts: 30 },
    { term: 'interlock logic', pts: 30 },
    { term: 'emergency depressuring', pts: 25 },
  ]);

  // 3. FILE EXTENSION INFLUENCE
  if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
    addScore('stream_table', 30, 'extension:spreadsheet');
  }
  if (['.png', '.jpg', '.jpeg', '.svg', '.webp'].includes(ext)) {
    // Drawings lean toward P&ID, PFD, BFD
    addScore('pid', 15, 'extension:drawing');
  }

  // 4. FIND WINNING CATEGORY
  let winningCategory: DocumentCategory = 'sds';
  let highestScore = 0;

  for (const [cat, data] of Object.entries(scores) as [DocumentCategory, { score: number; keywords: string[] }][]) {
    if (data.score > highestScore) {
      highestScore = data.score;
      winningCategory = cat;
    }
  }

  // If score is zero or negligible, provide smart fallback
  if (highestScore === 0) {
    if (['.png', '.jpg', '.jpeg', '.svg'].includes(ext)) {
      winningCategory = 'pid';
      highestScore = 20;
      scores.pid.keywords.push('raster/vector drawing fallback');
    } else if (ext === '.xlsx' || ext === '.csv') {
      winningCategory = 'stream_table';
      highestScore = 20;
      scores.stream_table.keywords.push('spreadsheet tabular fallback');
    } else {
      winningCategory = 'sds';
      highestScore = 15;
      scores.sds.keywords.push('default text document fallback');
    }
  }

  const confidence = Math.min(1.0, Math.max(0.35, highestScore / 100));
  const matched = scores[winningCategory].keywords;

  return {
    category: winningCategory,
    confidence: Number(confidence.toFixed(2)),
    matchedKeywords: matched,
    reason: `Identified as ${winningCategory.toUpperCase()} (confidence: ${(confidence * 100).toFixed(0)}%) based on: ${matched.join(', ')}`,
  };
}
