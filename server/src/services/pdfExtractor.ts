import fs from 'fs';
import Tesseract from 'tesseract.js';

// Using dynamic require or import for PDFParse
const pdfLib = require('pdf-parse');
const PDFParse = pdfLib.PDFParse || pdfLib;

export interface ExtractedDocumentContent {
  text: string;
  pages: { pageNumber: number; text: string }[];
  pagesCount: number;
  isReadable: boolean;
  unreadableReason?: string;
  isScanned: boolean;
  textElements?: {
    text: string;
    bbox: { x: number; y: number; w: number; h: number };
    confidence?: number;
  }[];
}

export async function extractTextFromDocument(
  filePath: string,
  mimeType: string
): Promise<ExtractedDocumentContent> {
  // If it's an image format (P&ID)
  if (
    mimeType.startsWith('image/') ||
    filePath.endsWith('.png') ||
    filePath.endsWith('.jpg') ||
    filePath.endsWith('.jpeg') ||
    filePath.endsWith('.svg') ||
    filePath.endsWith('.webp')
  ) {
    try {
      const ocrRes = await Tesseract.recognize(filePath, 'eng');
      const ocrData = ocrRes.data as any;
      const text = ocrData.text || '';
      const textElements: { text: string; bbox: { x: number; y: number; w: number; h: number }; confidence?: number }[] = [];

      if (ocrData.lines) {
        for (const line of ocrData.lines) {
          if (line.words) {
            for (const w of line.words) {
              const b = w.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 };
              textElements.push({
                text: w.text,
                bbox: {
                  x: b.x0,
                  y: b.y0,
                  w: Math.max(1, b.x1 - b.x0),
                  h: Math.max(1, b.y1 - b.y0),
                },
                confidence: (w.confidence || 80) / 100,
              });
            }
          }
        }
      }

      return {
        text,
        pages: [{ pageNumber: 1, text }],
        pagesCount: 1,
        isReadable: text.trim().length > 0,
        isScanned: true,
        unreadableReason: text.trim().length === 0 ? 'OCR could not detect legible text in this image.' : undefined,
        textElements,
      };
    } catch (err: any) {
      console.error('Image OCR extraction error:', err.message);
      return {
        text: '',
        pages: [{ pageNumber: 1, text: '' }],
        pagesCount: 1,
        isReadable: false,
        isScanned: true,
        unreadableReason: `Image OCR processing error: ${err.message}`,
        textElements: [],
      };
    }
  }

  // If it's a PDF
  let parser: any = null;
  try {
    const dataBuffer = fs.readFileSync(filePath);
    
    if (typeof PDFParse === 'function' && PDFParse.prototype && PDFParse.prototype.getText) {
      // v2 Class API
      parser = new PDFParse({ data: dataBuffer });
      const parsed = await parser.getText();
      const pagesCount = parsed.pages ? parsed.pages.length : (parsed.total || 1);
      const pages = (parsed.pages || []).map((p: any) => ({
        pageNumber: p.num || 1,
        text: p.text || '',
      }));
      const fullText = parsed.text || pages.map((p: any) => p.text).join('\n');

      const trimmed = fullText.trim();
      const wordCount = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
      const isScannedOrEmpty = trimmed.length < 100 || wordCount < 15;
      if (isScannedOrEmpty) {
        return {
          text: trimmed,
          pages: pages.length ? pages : [{ pageNumber: 1, text: trimmed }],
          pagesCount,
          isReadable: false,
          isScanned: true,
          unreadableReason:
            'Document contains virtually no extractable digital text (< 100 characters or < 15 words). It appears to be a scanned image or flattened drawing. OCR processing or a high-resolution vector PDF is required.',
        };
      }

      return {
        text: fullText,
        pages: pages.length ? pages : [{ pageNumber: 1, text: fullText }],
        pagesCount,
        isReadable: true,
        isScanned: false,
      };
    } else {
      // v1 Function API fallback
      const data = await PDFParse(dataBuffer);
      const fullText = data.text || '';
      const pagesCount = data.numpages || 1;
      const trimmed = fullText.trim();
      const wordCount = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
      const isScannedOrEmpty = trimmed.length < 100 || wordCount < 15;
      return {
        text: fullText,
        pages: [{ pageNumber: 1, text: fullText }],
        pagesCount,
        isReadable: !isScannedOrEmpty,
        isScanned: isScannedOrEmpty,
        unreadableReason: isScannedOrEmpty
          ? 'Document contains virtually no extractable digital text (< 100 characters or < 15 words). It appears to be a scanned image or flattened drawing. OCR processing or a high-resolution vector PDF is required.'
          : undefined,
      };
    }
  } catch (error: any) {
    return {
      text: '',
      pages: [],
      pagesCount: 0,
      isReadable: false,
      isScanned: false,
      unreadableReason: `Failed to parse PDF binary structure: ${error.message || 'Corrupted file'}`,
    };
  } finally {
    if (parser && typeof parser.destroy === 'function') {
      try {
        await parser.destroy();
      } catch (e) {
        // ignore cleanup error
      }
    }
  }
}
