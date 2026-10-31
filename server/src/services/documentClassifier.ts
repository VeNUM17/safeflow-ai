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
