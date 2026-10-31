import { v4 as uuidv4 } from 'uuid';
import {
  CommonDrawingModel,
  ProcessDescriptionExtraction,
  DrawingObject,
  PipePath,
  PipeJunction,
  EquipmentPort,
  ConnectionCandidate,
} from '../types';
import { classifyDocument } from './documentClassifier';
import { extractVectorGeometry } from './vectorPdfService';
import { preprocessRasterImage } from './rasterPreprocessingService';
import { recognizeDrawingText } from './ocrService';
import { detectDrawingSymbols } from './symbolDetectionService';
import { tracePipingNetwork } from './pipeTracingService';
import { reconcileConnections } from './connectionReconciliationService';
import { parseProcessDescription } from './processDescriptionService';

export interface ProcessDrawingOptions {
  filePath: string;
  fileName: string;
  mimeType: string;
  documentId: string;
  rawContent?: string;
  processDescription?: ProcessDescriptionExtraction | null;
}

/**
 * Normalizes any drawing (Vector PDF, Scanned PDF, PNG, JPG, SVG, Mixed PDF) into the
 * standardized CommonDrawingModel representation.
 */
export async function normalizeDrawing(
  options: ProcessDrawingOptions
): Promise<CommonDrawingModel> {
  const { filePath, fileName, mimeType, documentId, rawContent, processDescription } = options;

  // 1. Classify Document
  const classification = await classifyDocument(filePath, fileName, mimeType, documentId);

  // 2. Extract Geometry & Text according to pipeline
  let vectorLines: any[] = [];
  let textElements: any[] = [];

  if (classification.recommendedWorkflow === 'vector_primary' || classification.overallClassification === 'vector_pdf') {
    const vecResult = extractVectorGeometry(filePath, rawContent);
    vectorLines = vecResult.lines;
    textElements = vecResult.textElements;
  } else {
    // Raster Pipeline Fallback
    const rasterResult = preprocessRasterImage({ width: 1920, height: 1080 });
    // Convert raster tracks to line segments
    vectorLines = rasterResult.candidateLineTracks.map((t, idx) => ({
      id: `raster-line-${idx}`,
      page: 1,
      start: t.start,
      end: t.end,
      strokeWidth: t.thickness,
      isDashed: false,
      classificationHint: 'process_pipe' as const,
    }));
  }

  // 3. OCR & Tag Recognition
  const ocrResult = recognizeDrawingText(textElements);

  // 4. Symbol & Port Detection
  const { objects, ports } = detectDrawingSymbols(ocrResult.equipmentTags, fileName, 1);

  // 5. Pipe Tracing & Physical Connectivity Detection
  const tracingResult = tracePipingNetwork(
    vectorLines,
    objects,
    ports,
    ocrResult.lineTags,
    [], // flow arrows
    fileName,
    1
  );

  // 6. Hybrid Connection Reconciliation
  let effectiveProcessDescription = processDescription;
  if (!effectiveProcessDescription && rawContent) {
    effectiveProcessDescription = parseProcessDescription(
      documentId,
      rawContent,
      objects.map((o) => o.tag)
    );
  }

  const reconciliation = reconcileConnections(
    tracingResult.connectionCandidates,
    effectiveProcessDescription
  );

  return {
    document_id: documentId,
    document_name: fileName,
    page_count: classification.pageCount,
    document_classification: classification.overallClassification,
    objects,
    pipe_paths: tracingResult.pipePaths,
    junctions: tracingResult.junctions,
    ports,
    connection_candidates: reconciliation.reconciledCandidates,
    reconciliation_summary: reconciliation.summary,
    processed_at: new Date().toISOString(),
  };
}
