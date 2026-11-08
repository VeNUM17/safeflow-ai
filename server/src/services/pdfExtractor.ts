import fs from 'fs';
import path from 'path';
import Tesseract from 'tesseract.js';

// Using dynamic require or import for PDFParse, XLSX, and Mammoth
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
  mimeType: string,
  originalFileName?: string
): Promise<ExtractedDocumentContent> {
  const ext = path.extname(originalFileName || filePath).toLowerCase();

  // 1. Plain Text and CSV Files
  if (ext === '.txt' || ext === '.csv' || mimeType.startsWith('text/')) {
    try {
      const text = fs.readFileSync(filePath, 'utf8');
      const lines = text.split(/\r?\n/);
      const isReadable = text.trim().length > 0;
      return {
        text,
        pages: [{ pageNumber: 1, text }],
        pagesCount: Math.max(1, Math.ceil(lines.length / 50)),
        isReadable,
        isScanned: false,
        unreadableReason: isReadable ? undefined : 'Text document is completely empty.',
      };
    } catch (err: any) {
      return {
        text: '',
        pages: [],
        pagesCount: 0,
        isReadable: false,
        isScanned: false,
        unreadableReason: `Failed to read text file: ${err.message}`,
      };
    }
  }

  // 2. Microsoft Word DOCX Files
  if (ext === '.docx' || mimeType.includes('wordprocessingml')) {
    try {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      const text = (result.value || '').trim();
      const isReadable = text.length > 0;
      return {
        text,
        pages: [{ pageNumber: 1, text }],
        pagesCount: 1,
        isReadable,
        isScanned: false,
        unreadableReason: isReadable ? undefined : 'Word document contains no extractable text.',
      };
    } catch (err: any) {
      console.error('Word extraction error:', err.message);
      return {
        text: '',
        pages: [],
        pagesCount: 0,
        isReadable: false,
        isScanned: false,
        unreadableReason: `Failed to parse DOCX file: ${err.message}`,
      };
    }
  }

  // 3. Microsoft Excel XLSX / XLS Spreadsheets
  if (
    ext === '.xlsx' ||
    ext === '.xls' ||
    mimeType.includes('spreadsheetml') ||
    mimeType.includes('excel')
  ) {
    try {
      const xlsx = require('xlsx');
      const workbook = xlsx.readFile(filePath);
      const pages: { pageNumber: number; text: string }[] = [];
      let fullText = '';

      workbook.SheetNames.forEach((sheetName: string, idx: number) => {
        const worksheet = workbook.Sheets[sheetName];
        const csv = xlsx.utils.sheet_to_csv(worksheet);
        const sheetText = `[Sheet: ${sheetName}]\n${csv}`;
        pages.push({ pageNumber: idx + 1, text: sheetText });
        fullText += sheetText + '\n\n';
      });

      const trimmed = fullText.trim();
      const isReadable = trimmed.length > 0;

      return {
        text: fullText,
        pages,
        pagesCount: workbook.SheetNames.length,
        isReadable,
        isScanned: false,
        unreadableReason: isReadable ? undefined : 'Spreadsheet contains no data rows or cells.',
      };
    } catch (err: any) {
      console.error('Excel extraction error:', err.message);
      return {
        text: '',
        pages: [],
        pagesCount: 0,
        isReadable: false,
        isScanned: false,
        unreadableReason: `Failed to parse Excel spreadsheet: ${err.message}`,
      };
    }
  }

  // 4. Raster Images and Vector SVG
  if (
    mimeType.startsWith('image/') ||
    ext === '.png' ||
    ext === '.jpg' ||
    ext === '.jpeg' ||
    ext === '.svg' ||
    ext === '.webp'
  ) {
    if (ext === '.svg') {
      try {
        const svgContent = fs.readFileSync(filePath, 'utf8');
        return {
          text: svgContent,
          pages: [{ pageNumber: 1, text: svgContent }],
          pagesCount: 1,
          isReadable: svgContent.length > 0,
          isScanned: false,
        };
      } catch (e: any) {
        // Fall back to OCR if SVG read fails
      }
    }

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

  // 5. PDF Files (Vector & Scanned)
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
