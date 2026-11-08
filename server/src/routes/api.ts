import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../storage/store';
import { extractTextFromDocument } from '../services/pdfExtractor';
import { parseSdsContent } from '../services/sdsParser';
import { parsePidDocument } from '../services/pidParser';
import { buildProcessTopologyGraph } from '../services/graphService';
import { exportProjectToJson, exportProjectToCsv } from '../services/exportService';
import { exportDrawingToJson, exportDrawingToSvg } from '../services/drawingExportService';
import { parseProcessDescription } from '../services/processDescriptionService';
import { normalizeDrawing } from '../services/drawingNormalizationService';
import { validateCandidateTopology } from '../services/topologyValidationService';
import { classifyDocument } from '../services/documentClassifier';
import { generateDigitalPidFromExtracted } from '../services/digitalDrawingGenerator';
import { DocumentRecord, DocumentCategory, DocumentType, PipingLine, EquipmentTag, createDefaultSpecifications, ProcessStream } from '../types';
import { parseGasCompositionReportText } from '../services/chemicalIdentificationEngine';
import { evaluateEquipmentChemicalMapping, evaluateProjectChemicalMappings } from '../services/chemicalMappingEngine';
import { validateProjectPsiCompleteness } from '../services/psiValidationService';
import { attachChemicalContextToPhaNode } from '../services/phaService';
import { parsePfdOrBfdDocument } from '../services/pfdParser';
import { parseStreamTableDocument } from '../services/streamTableParser';
import { parseDatasheetDocument } from '../services/datasheetParser';
import { parsePhilosophyDocument } from '../services/philosophyParser';
import {
  buildUnifiedEngineeringMatrix,
  getUnifiedEquipmentContext,
} from '../services/unifiedEngineeringService';
import {
  detectCrossDocumentDiscrepancies,
  resolveEngineeringDiscrepancy,
} from '../services/crossDocumentConsistencyService';

const router = Router();

const getParam = (val: unknown): string => {
  if (Array.isArray(val)) return String(val[0] || '');
  return String(val || '');
};

import { classifyEngineeringCategory } from '../services/documentClassifier';

// Configure Multer for secure file uploads
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/svg+xml',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'text/plain',
];

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = [
      '.pdf',
      '.png',
      '.jpg',
      '.jpeg',
      '.svg',
      '.webp',
      '.docx',
      '.doc',
      '.xlsx',
      '.xls',
      '.csv',
      '.txt',
    ];

    if (ALLOWED_MIME_TYPES.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Supported formats: PDF, DOCX, XLSX, CSV, TXT, PNG, JPG, JPEG, SVG, WebP.`));
    }
  },
});

// --- PROJECTS ---
router.get('/projects', (req: Request, res: Response) => {
  const projects = store.listProjects();
  res.json({ success: true, data: projects });
});

router.get('/projects/:id', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const project = store.getProject(id);
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }
  const summary = store.getDashboardSummary(id);
  res.json({ success: true, data: { project, summary } });
});

router.post('/projects', (req: Request, res: Response) => {
  const { name, description } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Project name is required' });
  }

  const proj = store.createProject(name.trim(), description?.trim() || '');
  res.status(201).json({ success: true, data: proj });
});

router.delete('/projects/:id', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const deleted = store.deleteProject(id);
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }
  res.json({ success: true, message: 'Project and all associated data deleted successfully' });
});

// --- DOCUMENTS & UPLOAD ---
router.get('/projects/:id/documents', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const docs = store.listDocuments(id);
  res.json({ success: true, data: docs });
});

router.delete('/documents/:id', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const result = store.deleteDocument(id);
  if (!result.success) {
    return res.status(404).json({ success: false, error: 'Document not found' });
  }

  const summary = result.projectId ? store.getDashboardSummary(result.projectId) : undefined;
  res.json({
    success: true,
    message: 'Document and its associated extractions deleted successfully',
    data: { summary },
  });
});

router.patch('/documents/:id', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const updates = req.body;
  const updated = store.updateDocumentMetadata(id, updates);
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Document not found' });
  }
  res.json({ success: true, data: updated });
});

router.get('/projects/:id/discrepancies', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  let discs = store.listDiscrepancies(id);
  if (discs.length === 0) {
    discs = detectCrossDocumentDiscrepancies(id, store);
  }
  res.json({ success: true, data: discs });
});

router.post('/projects/:id/discrepancies/detect', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const discs = detectCrossDocumentDiscrepancies(id, store);
  res.json({
    success: true,
    data: discs,
    message: `Detected ${discs.length} cross-document consistency checks`,
  });
});

router.post('/discrepancies/:id/resolve', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const { status, resolution_notes, resolved_by } = req.body;
  const success = store.resolveDiscrepancy(id, { status, resolution_notes, resolved_by });
  if (!success) {
    return res.status(404).json({ success: false, error: 'Discrepancy not found' });
  }
  res.json({ success: true, message: 'Discrepancy updated successfully' });
});

router.get('/projects/:id/engineering-matrix', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  let matrix = store.listEngineeringMatrix(id);
  if (matrix.length === 0) {
    matrix = buildUnifiedEngineeringMatrix(id, store);
  }
  res.json({ success: true, data: matrix });
});

router.post('/projects/:id/engineering-matrix/synchronize', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const matrix = buildUnifiedEngineeringMatrix(id, store);
  res.json({
    success: true,
    data: matrix,
    message: `Synchronized ${matrix.length} entities in Unified Engineering Matrix`,
  });
});

router.get('/projects/:id/engineering-matrix/:entityType/:entityTag', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const entityType = getParam(req.params.entityType);
  const entityTag = getParam(req.params.entityTag);

  let entry = store.getEngineeringMatrixEntry(id, entityType, entityTag);
  if (!entry) {
    buildUnifiedEngineeringMatrix(id, store);
    entry = store.getEngineeringMatrixEntry(id, entityType, entityTag);
  }

  if (!entry) {
    return res.status(404).json({ success: false, error: 'Entity not found in Unified Engineering Matrix' });
  }
  res.json({ success: true, data: entry });
});

router.get('/projects/:id/equipment/:tag/unified', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const tag = getParam(req.params.tag);
  const context = getUnifiedEquipmentContext(id, tag, store);
  if (!context) {
    return res.status(404).json({ success: false, error: `Unified context for equipment ${tag} not found` });
  }
  res.json({ success: true, data: context });
});

router.get('/projects/:id/philosophy-rules', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const rules = store.listPhilosophyRules(id);
  res.json({ success: true, data: rules });
});

router.get('/projects/:id/pfd-extractions', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const extractions = store.listPfdExtractions(id);
  res.json({ success: true, data: extractions });
});

router.get('/documents/:id/pfd-extraction', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const extraction = store.getPfdExtraction(id);
  if (!extraction) {
    return res.status(404).json({ success: false, error: 'PFD/BFD extraction not found for this document' });
  }
  res.json({ success: true, data: extraction });
});

router.get('/projects/:id/stream-table-extractions', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const extractions = store.listStreamTableExtractions(id);
  res.json({ success: true, data: extractions });
});

router.get('/documents/:id/stream-table-extraction', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const extraction = store.getStreamTableExtraction(id);
  if (!extraction) {
    return res.status(404).json({ success: false, error: 'Stream table extraction not found for this document' });
  }
  res.json({ success: true, data: extraction });
});

router.get('/projects/:id/datasheet-extractions', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const extractions = store.listDatasheetExtractions(id);
  res.json({ success: true, data: extractions });
});

router.get('/documents/:id/datasheet-extraction', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const extraction = store.getDatasheetExtraction(id);
  if (!extraction) {
    return res.status(404).json({ success: false, error: 'Datasheet extraction not found for this document' });
  }
  res.json({ success: true, data: extraction });
});

router.get('/projects/:id/philosophy-extractions', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const extractions = store.listPhilosophyExtractions(id);
  res.json({ success: true, data: extractions });
});

router.get('/documents/:id/philosophy-extraction', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const extraction = store.getPhilosophyExtraction(id);
  if (!extraction) {
    return res.status(404).json({ success: false, error: 'Philosophy extraction not found for this document' });
  }
  res.json({ success: true, data: extraction });
});

router.post('/documents/:id/reclassify', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const doc = store.getDocument(id);
  if (!doc) {
    return res.status(404).json({ success: false, error: 'Document not found' });
  }
  const { category, reason } = req.body;
  if (!category) {
    return res.status(400).json({ success: false, error: 'Category is required' });
  }
  const updated = store.updateDocumentMetadata(id, {
    category,
    user_overridden_category: category,
    notes: reason ? `${doc.notes ? doc.notes + '; ' : ''}Manually reclassified to ${category}: ${reason}` : doc.notes,
  });
  res.json({ success: true, data: updated, message: `Document reclassified to ${category}` });
});

router.post(
  '/projects/:id/upload',
  upload.array('files', 10),
  async (req: Request, res: Response) => {
    const projectId = getParam(req.params.id);
    const project = store.getProject(projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files provided' });
    }

    // Explicit category or doc_type hint from user (e.g. 'sds', 'pid', 'pfd', 'stream_table', etc. or 'auto')
    const requestedCategory = (req.body.category || req.body.doc_type || 'auto') as string;
    const revision = (req.body.revision as string) || 'A';
    const sourceOrg = (req.body.source_organization as string) || 'Engineering Team';

    const processedDocs: DocumentRecord[] = [];
    const newChemicals: any[] = [];
    const newEquipment: any[] = [];
    const newLines: any[] = [];
    const newStreams: any[] = [];
    const newPhilosophyRules: any[] = [];

    for (const file of files) {
      const docId = uuidv4();

      // Extract document text using universal multi-format reader (PDF, Word DOCX, Excel XLSX, CSV, Images)
      const extracted = await extractTextFromDocument(file.path, file.mimetype, file.originalname);

      // Automated 11-category classification
      const classification = classifyEngineeringCategory(file.originalname, extracted.text, file.mimetype);

      let determinedCategory: DocumentCategory = classification.category;
      let userOverridden: DocumentCategory | null = null;

      if (requestedCategory && requestedCategory !== 'auto') {
        determinedCategory = requestedCategory as DocumentCategory;
        userOverridden = requestedCategory as DocumentCategory;
      }

      const docRecord: DocumentRecord = {
        id: docId,
        project_id: projectId,
        name: file.originalname,
        original_filename: file.originalname,
        file_path: `/uploads/${file.filename}`,
        mime_type: file.mimetype,
        size_bytes: file.size,
        doc_type: determinedCategory,
        category: determinedCategory,
        category_confidence: userOverridden ? 1.0 : classification.confidence,
        user_overridden_category: userOverridden,
        revision,
        source_organization: sourceOrg,
        upload_timestamp: new Date().toISOString(),
        pages_count: extracted.pagesCount,
        is_readable: extracted.isReadable,
        unreadable_reason: extracted.unreadableReason,
        is_scanned_ocr_attempted: extracted.isScanned,
        chemical_ids: [],
        extraction_status: extracted.isReadable ? 'completed' : 'failed',
        verification_status: 'unverified',
        notes: userOverridden ? `User confirmed category: ${userOverridden}` : classification.reason,
      };

      store.addDocument(docRecord);
      processedDocs.push(docRecord);

      // If document is readable and is SDS, run OSHA PSI extractor
      if (determinedCategory === 'sds' && extracted.isReadable) {
        const chemical = parseSdsContent(
          extracted,
          docId,
          file.originalname,
          projectId
        );
        store.addChemical(chemical);
        docRecord.chemical_ids.push(chemical.id);
        newChemicals.push(chemical);
      }

      // If document is P&ID, run P&ID extractor
      if (determinedCategory === 'pid') {
        const existingChems = store.listChemicals(projectId);
        const { equipment, lines, streams } = parsePidDocument(
          extracted,
          docId,
          file.originalname,
          projectId,
          existingChems
        );
        store.addEquipment(equipment);
        store.addLines(lines);
        if (streams && streams.length > 0) {
          store.addStreams(streams);
          newStreams.push(...streams);
        }
        newEquipment.push(...equipment);
        newLines.push(...lines);

        // Run authoritative drawing normalization & pipe tracing
        try {
          const rawRelPath = docRecord.file_path.replace(/^\//, '');
          let absoluteDiskPath = path.resolve(process.cwd(), rawRelPath);
          if (!fs.existsSync(absoluteDiskPath)) {
            absoluteDiskPath = path.resolve(process.cwd(), 'server', rawRelPath);
          }
          if (!fs.existsSync(absoluteDiskPath)) {
            absoluteDiskPath = path.resolve(__dirname, `../../${docRecord.file_path}`);
          }

          const processDesc = store.getProcessDescription(projectId);
          const drawingModel = await normalizeDrawing({
            filePath: absoluteDiskPath,
            fileName: file.originalname,
            mimeType: file.mimetype,
            documentId: docId,
            rawContent: extracted.text,
            textElements: extracted.textElements,
            processDescription: processDesc,
          });
          store.saveCommonDrawingModel(drawingModel);

          // Synchronize visually traced candidate connections into authoritative topology
          const validCandIds = drawingModel.connection_candidates
            .filter((c) => c.recognition_status !== 'conflicting')
            .map((c) => c.id);
          if (validCandIds.length > 0) {
            store.syncCandidateConnectionsToTopology(projectId, validCandIds, 'Hybrid P&ID Recognition Engine');
          }
        } catch (normErr: any) {
          console.error('Auto drawing normalization error:', normErr.message);
        }

        // Auto-generate Digital P&ID Drawing for the Digital P&ID Editor Studio
        try {
          const allEq = store.listEquipment(projectId);
          const allLines = store.listLines(projectId);
          const allStreams = store.listStreams(projectId);
          const digitalDrawing = generateDigitalPidFromExtracted(
            projectId,
            docId,
            file.originalname,
            allEq,
            allLines,
            allStreams
          );
          store.saveDrawing(digitalDrawing, 'Auto Digital P&ID Generator', 'Initial digital schematic generated from uploaded P&ID');
        } catch (drawErr: any) {
          console.error('Auto digital drawing generation error:', drawErr.message);
        }
      }

      // If document is PFD or BFD, run dedicated PFD/BFD extraction processor
      if ((determinedCategory === 'pfd' || determinedCategory === 'bfd') && extracted.isReadable) {
        try {
          const existingLines = store.listLines(projectId);
          const existingEquipment = store.listEquipment(projectId);
          const pfdResult = parsePfdOrBfdDocument(
            extracted,
            docId,
            file.originalname,
            projectId,
            determinedCategory,
            existingLines,
            existingEquipment
          );
          store.savePfdExtraction(pfdResult.extraction);
          if (pfdResult.equipment.length > 0) {
            store.addEquipment(
              pfdResult.equipment,
              'PFD/BFD Parser',
              `Extracted major unit operations from ${determinedCategory.toUpperCase()}`
            );
            newEquipment.push(...pfdResult.equipment);
          }
          if (pfdResult.streams.length > 0) {
            store.addStreams(
              pfdResult.streams,
              'PFD/BFD Parser',
              `Extracted primary process streams from ${determinedCategory.toUpperCase()}`
            );
            newStreams.push(...pfdResult.streams);
          }
        } catch (pfdErr: any) {
          console.error(`Auto ${determinedCategory.toUpperCase()} extraction error:`, pfdErr.message);
        }
      }

      // If document is Stream Table (H&MB), run dedicated stream table extraction processor
      if (determinedCategory === 'stream_table' && extracted.isReadable) {
        try {
          const existingStreams = store.listStreams(projectId);
          const existingLines = store.listLines(projectId);
          const stResult = parseStreamTableDocument(
            extracted,
            docId,
            file.originalname,
            projectId,
            existingStreams,
            existingLines
          );
          store.saveStreamTableExtraction(stResult.extraction);
          if (stResult.streams.length > 0) {
            store.addStreams(
              stResult.streams,
              'Stream Table Parser',
              `Extracted Heat & Material Balance streams from ${file.originalname}`
            );
            newStreams.push(...stResult.streams);
          }
        } catch (stErr: any) {
          console.error('Auto Stream Table extraction error:', stErr.message);
        }
      }

      // If document is Equipment Datasheet, run dedicated datasheet extraction processor
      if (determinedCategory === 'equipment_datasheet' && extracted.isReadable) {
        try {
          const existingEquipment = store.listEquipment(projectId);
          const dsResult = parseDatasheetDocument(
            extracted,
            docId,
            file.originalname,
            projectId,
            existingEquipment
          );
          store.saveDatasheetExtraction(dsResult.extraction);
          if (dsResult.equipment.length > 0) {
            store.addEquipment(
              dsResult.equipment,
              'Datasheet Parser',
              `Extracted mechanical design specifications from ${file.originalname}`
            );
            newEquipment.push(...dsResult.equipment);
          }
        } catch (dsErr: any) {
          console.error('Auto Datasheet extraction error:', dsErr.message);
        }
      }

      // If document is Engineering Philosophy / Basis of Design, run philosophy processor
      const isPhilosophyDoc = [
        'basis_of_design',
        'process_design_philosophy',
        'operating_philosophy',
        'control_philosophy',
        'shutdown_philosophy',
      ].includes(determinedCategory);

      if (isPhilosophyDoc && extracted.isReadable) {
        try {
          const philResult = parsePhilosophyDocument(
            extracted,
            docId,
            file.originalname,
            projectId,
            determinedCategory
          );
          store.savePhilosophyExtraction(philResult.extraction);
          if (philResult.rules.length > 0) {
            store.addPhilosophyRules(philResult.rules);
            newPhilosophyRules.push(...philResult.rules);
          }
        } catch (philErr: any) {
          console.error('Auto Philosophy extraction error:', philErr.message);
        }
      }
    }

    // Refresh Unified Engineering Matrix and run Cross-Document Consistency checks
    try {
      buildUnifiedEngineeringMatrix(projectId, store);
      detectCrossDocumentDiscrepancies(projectId, store);
    } catch (matrixErr: any) {
      console.error('Unified Engineering Matrix auto-sync error:', matrixErr.message);
    }

    const summary = store.getDashboardSummary(projectId);

    res.status(201).json({
      success: true,
      data: {
        documents: processedDocs,
        chemicals_added: newChemicals.length,
        equipment_tags_added: newEquipment.length,
        piping_lines_added: newLines.length,
        streams_added: newStreams.length,
        philosophy_rules_added: newPhilosophyRules.length,
        summary,
      },
    });
  }
);

// --- CHEMICALS & PSI FIELDS ---
router.get('/projects/:id/chemicals', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const chems = store.listChemicals(id);
  res.json({ success: true, data: chems });
});

router.get('/chemicals/:id', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const chem = store.getChemical(id);
  if (!chem) {
    return res.status(404).json({ success: false, error: 'Chemical record not found' });
  }
  res.json({ success: true, data: chem });
});

router.post('/projects/:id/chemicals/check-duplicate', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const { chemical_name, cas_number, exclude_id } = req.body;
  if (!chemical_name && !cas_number) {
    return res.json({ success: true, is_potential_duplicate: false, matches: [] });
  }
  const result = store.checkDuplicateChemical(projectId, chemical_name || '', cas_number, exclude_id);
  res.json({ success: true, ...result });
});

router.post('/projects/:id/chemicals', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const { chemical_name } = req.body;
  if (!chemical_name || !String(chemical_name).trim()) {
    return res.status(400).json({ success: false, error: 'chemical_name is required' });
  }
  const chem = store.createManualChemical(projectId, req.body, req.body.reviewer);
  res.status(201).json({ success: true, data: chem });
});

router.put('/chemicals/:id', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const updatedChem = store.updateChemical(id, req.body, req.body.reviewer, req.body.change_reason);
  if (!updatedChem) {
    return res.status(404).json({ success: false, error: 'Chemical record not found' });
  }
  res.json({ success: true, data: updatedChem });
});

router.delete('/chemicals/:id', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const reviewer = req.body?.reviewer || 'Process Safety Engineer';
  const reason = req.body?.reason || 'Manual chemical deletion';
  const success = store.deleteChemical(id, reviewer, reason);
  if (!success) {
    return res.status(404).json({ success: false, error: 'Chemical record not found' });
  }
  res.json({ success: true, message: 'Chemical deleted successfully' });
});

router.post('/chemicals/:id/link-sds', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const { sds_document_id, reviewer } = req.body;
  if (!sds_document_id) {
    return res.status(400).json({ success: false, error: 'sds_document_id is required' });
  }
  const result = store.linkSdsToChemical(id, sds_document_id, reviewer);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

router.patch('/chemicals/:id/fields/:fieldKey', (req: Request, res: Response) => {
  const chemId = getParam(req.params.id);
  const fieldKey = getParam(req.params.fieldKey);
  const { user_value, review_status, notes } = req.body;

  if (!['needs_review', 'confirmed', 'rejected', 'missing'].includes(review_status)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid review_status. Must be needs_review, confirmed, rejected, or missing.',
    });
  }

  const updatedChem = store.updatePsiField(chemId, fieldKey, {
    user_value,
    review_status,
    notes,
  });

  if (!updatedChem) {
    return res.status(404).json({ success: false, error: 'Chemical record not found' });
  }

  const summary = store.getDashboardSummary(updatedChem.project_id);

  res.json({ success: true, data: { chemical: updatedChem, summary } });
});

// --- CONFLICTS ---
router.get('/projects/:id/conflicts', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const conflicts = store.listConflicts(id);
  res.json({ success: true, data: conflicts });
});

router.post('/conflicts/:id/resolve', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const { resolved_value, resolution_notes } = req.body;
  if (!resolved_value || !resolution_notes) {
    return res.status(400).json({
      success: false,
      error: 'resolved_value and resolution_notes are required to resolve a conflict',
    });
  }

  const resolved = store.resolveConflict(id, resolved_value, resolution_notes);
  if (!resolved) {
    return res.status(404).json({ success: false, error: 'Conflict record not found' });
  }

  const summary = store.getDashboardSummary(resolved.project_id);
  res.json({ success: true, data: { conflict: resolved, summary } });
});

// --- P&ID & GRAPH TOPOLOGY ---
router.get('/projects/:id/pid/elements', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const equipment = store.listEquipment(id);
  const lines = store.listLines(id);
  res.json({ success: true, data: { equipment, lines } });
});

router.patch('/equipment/:id', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const reviewer = req.body.reviewer || 'Process Engineer';
  const reason = req.body.reason || 'Manual equipment modification';
  const updated = store.updateEquipment(id, req.body, reviewer, reason);
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Equipment tag not found' });
  }
  res.json({ success: true, data: updated });
});

router.delete('/equipment/:id', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const reviewer = req.body?.reviewer || 'Process Engineer';
  const reason = req.body?.reason || 'Removed equipment node';
  const deleted = store.deleteEquipment(id, reviewer, reason);
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'Equipment tag not found' });
  }
  res.json({ success: true, message: 'Equipment node deleted successfully' });
});

// --- EQUIPMENT SPECIFICATION ENDPOINTS ---
router.get('/equipment/:id/specifications', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const specs = store.getEquipmentSpecifications(id);
  if (!specs) {
    return res.status(404).json({ success: false, error: 'Equipment not found' });
  }
  res.json({ success: true, data: specs });
});

router.put('/equipment/:id/specifications', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const { property_key, payload, reviewer, change_reason } = req.body;
  if (!property_key || !payload) {
    return res.status(400).json({ success: false, error: 'property_key and payload are required' });
  }
  const result = store.updateEquipmentSpecification(
    id,
    property_key,
    payload,
    reviewer || 'Process Safety Engineer',
    change_reason || 'Manual specification edit'
  );
  if (!result) {
    return res.status(404).json({ success: false, error: 'Equipment not found' });
  }
  res.json({ success: true, data: result });
});

router.post('/equipment/:id/specifications/verify', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const { property_key, reviewer, verification_notes } = req.body;
  if (!property_key) {
    return res.status(400).json({ success: false, error: 'property_key is required' });
  }
  const result = store.verifyEquipmentSpecification(
    id,
    property_key,
    reviewer || 'Senior Process Safety Specialist (PE)',
    verification_notes || 'Authorized verification'
  );
  if (!result) {
    return res.status(404).json({ success: false, error: 'Equipment or specification property not found' });
  }
  res.json({ success: true, data: result });
});

router.post('/equipment/:id/specifications/conflict', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const { property_key, conflict_entry, reviewer } = req.body;
  if (!property_key || !conflict_entry) {
    return res.status(400).json({ success: false, error: 'property_key and conflict_entry are required' });
  }
  const eq = store.recordSpecificationConflict(
    id,
    property_key,
    conflict_entry,
    reviewer || 'Process Safety Engineer'
  );
  if (!eq) {
    return res.status(404).json({ success: false, error: 'Equipment not found' });
  }
  res.json({ success: true, data: eq });
});

router.post('/equipment/:id/specifications/resolve-conflict', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const { property_key, selected_value, selected_unit, reviewer, resolution_notes, mark_verified } = req.body;
  if (!property_key) {
    return res.status(400).json({ success: false, error: 'property_key is required' });
  }
  const result = store.resolveSpecificationConflict(
    id,
    property_key,
    selected_value,
    selected_unit ?? null,
    reviewer || 'Process Safety Engineer',
    resolution_notes || 'Resolved conflicting engineering data',
    mark_verified ?? false
  );
  if (!result) {
    return res.status(404).json({ success: false, error: 'Equipment or specification property not found' });
  }
  res.json({ success: true, data: result });
});

router.post('/projects/:id/equipment', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const { tag, description, equipment_type, assigned_chemical_id, document_id, notes, status, reviewer, reason } = req.body;
  if (!tag) {
    return res.status(400).json({ success: false, error: 'Tag identifier is required' });
  }

  const newTag: EquipmentTag = {
    id: uuidv4(),
    project_id: projectId,
    document_id: document_id || 'manual',
    tag: tag.toUpperCase().trim(),
    description: description || 'User-defined process equipment',
    equipment_type: equipment_type || 'vessel',
    assigned_chemical_id: assigned_chemical_id || null,
    confidence: 1.0,
    status: status || 'confirmed',
    source: {
      document: 'Manual Engineering Entry',
      page: 1,
      snippet: 'User added equipment tag',
    },
    notes: notes || '',
    specifications: createDefaultSpecifications(equipment_type || 'vessel'),
    specifications_revision: 1,
    specifications_updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  store.addEquipment([newTag], reviewer || 'Process Engineer', reason || 'Added equipment item');
  res.status(201).json({ success: true, data: newTag });
});

router.post('/projects/:id/lines', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const {
    line_number,
    from_equipment,
    to_equipment,
    size,
    material,
    stream_label,
    functional_type,
    flow_direction,
    assigned_chemical_id,
    notes,
    reviewer,
    change_reason,
  } = req.body;

  if (!line_number || !from_equipment || !to_equipment) {
    return res.status(400).json({
      success: false,
      error: 'Line identifier, from_equipment, and to_equipment are required',
    });
  }

  const newLine: PipingLine = {
    id: uuidv4(),
    project_id: projectId,
    document_id: 'manual',
    line_number: String(line_number).trim(),
    from_equipment: String(from_equipment).trim().toUpperCase(),
    to_equipment: String(to_equipment).trim().toUpperCase(),
    size: size ? String(size).trim() : '2"',
    material: material ? String(material).trim() : 'CS',
    stream_label: stream_label ? String(stream_label).trim() : '',
    functional_type: functional_type || 'piping_line',
    flow_direction: flow_direction || 'forward',
    assigned_chemical_id: assigned_chemical_id || null,
    confidence: 1.0,
    status: 'confirmed',
    source: {
      document: 'Manual Connection Entry',
      page: 1,
      snippet: `User connected ${from_equipment} to ${to_equipment}`,
    },
    alerts: [],
    notes: notes || '',
    created_at: new Date().toISOString(),
  };

  store.addLines([newLine], reviewer || 'Process Engineer', change_reason || 'Manual piping connection');
  res.status(201).json({ success: true, data: newLine });
});

router.patch('/lines/:id', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const reviewer = req.body.reviewer || 'Process Engineer';
  const reason = req.body.reason || 'Manual line connection modification';
  const updated = store.updateLine(id, req.body, reviewer, reason);
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Piping line not found' });
  }
  res.json({ success: true, data: updated });
});

router.delete('/lines/:id', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const reviewer = req.body?.reviewer || 'Process Engineer';
  const reason = req.body?.reason || 'Removed piping connection';
  const deleted = store.deleteLine(id, reviewer, reason);
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'Piping line not found' });
  }
  res.json({ success: true, message: 'Piping line deleted successfully' });
});

// --- PROCESS STREAMS ---
router.get('/projects/:id/streams', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const streams = store.listStreams(projectId);
  res.json({ success: true, data: streams });
});

router.get('/streams/:id', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const stream = store.getStream(id);
  if (!stream) {
    return res.status(404).json({ success: false, error: 'Process stream not found' });
  }
  res.json({ success: true, data: stream });
});

router.post('/projects/:id/streams', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const { source_equipment_tag, destination_equipment_tag } = req.body;

  if (!source_equipment_tag || !destination_equipment_tag) {
    return res.status(400).json({
      success: false,
      error: 'source_equipment_tag and destination_equipment_tag are required',
    });
  }

  const reviewer = req.body.reviewer || 'Process Engineer';
  const reason = req.body.change_reason || 'Manual process stream creation';

  const newStream = store.createStream(
    {
      ...req.body,
      project_id: projectId,
    },
    reviewer,
    reason
  );

  res.status(201).json({ success: true, data: newStream });
});

router.patch('/streams/:id', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const reviewer = req.body?.reviewer || 'Process Engineer';
  const reason = req.body?.change_reason || req.body?.reason || 'Manual stream modification';
  const updated = store.updateStream(id, req.body, reviewer, reason);
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Process stream not found' });
  }
  res.json({ success: true, data: updated });
});

router.put('/streams/:id', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const reviewer = req.body?.reviewer || 'Process Engineer';
  const reason = req.body?.change_reason || req.body?.reason || 'Manual stream modification';
  const updated = store.updateStream(id, req.body, reviewer, reason);
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Process stream not found' });
  }
  res.json({ success: true, data: updated });
});

router.delete('/streams/:id', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const reviewer = req.body?.reviewer || 'Process Engineer';
  const reason = req.body?.change_reason || req.body?.reason || 'Process stream removed';
  const deleted = store.deleteStream(id, reviewer, reason);
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'Process stream not found' });
  }
  res.json({ success: true, message: 'Process stream deleted successfully' });
});

router.post('/streams/:id/verify', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const reviewer = req.body?.reviewer || 'Lead Process Engineer';
  const notes = req.body?.notes;
  const verified = store.verifyStream(id, reviewer, notes);
  if (!verified) {
    return res.status(404).json({ success: false, error: 'Process stream not found' });
  }
  res.json({ success: true, data: verified });
});

router.get('/projects/:id/graph', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const graph = store.getProcessTopologyGraph(projectId);
  res.json({ success: true, data: graph });
});

// --- GRAPH VALIDATION & APPROVAL GATES ---
router.get('/projects/:id/graph/validation', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const validation = store.getGraphValidation(projectId);
  res.json({ success: true, data: validation });
});

router.post('/projects/:id/graph/acknowledge-warning', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const { warning_code } = req.body;
  if (!warning_code) {
    return res.status(400).json({ success: false, error: 'Warning code is required' });
  }
  store.acknowledgeWarning(projectId, warning_code);
  const validation = store.getGraphValidation(projectId);
  res.json({ success: true, data: validation });
});

router.get('/projects/:id/graph/approval', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const approval = store.getGraphApproval(projectId);
  res.json({ success: true, data: approval });
});

router.post('/projects/:id/graph/approve', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const { reviewer, notes } = req.body;
  const result = store.approveGraph(
    projectId,
    reviewer || 'Lead Process Safety Engineer',
    notes || 'P&ID topology and connectivity verified against design drawing'
  );
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error });
  }
  res.json({ success: true, data: result.approval });
});

router.post('/projects/:id/graph/unapprove', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const { reviewer, reason } = req.body;
  store.unapproveGraph(projectId, reviewer || 'Process Engineer', reason || 'Reverted to draft');
  res.json({ success: true, message: 'Graph approval reverted to review stage' });
});

// --- AUDIT TRAIL ---
router.get('/projects/:id/audit-log', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const logs = store.listAuditLog(projectId);
  res.json({ success: true, data: logs });
});

// --- PHA STUDY NODES & HAZOP READINESS ---
router.get('/projects/:id/pha/nodes', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const nodes = store.listPhaNodes(projectId);
  res.json({ success: true, data: nodes });
});

router.post('/projects/:id/pha/nodes/generate', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const reviewer = req.body?.reviewer || 'Process Engineer';
  const nodes = store.generatePhaNodes(projectId, reviewer);
  res.json({ success: true, data: nodes });
});

router.post('/projects/:id/pha/nodes', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const {
    node_id,
    name,
    design_intent,
    equipment_tags,
    line_numbers,
    inlet_boundaries,
    outlet_boundaries,
    basis_for_grouping,
    operating_limits,
    unresolved_questions,
    reviewer,
  } = req.body;

  if (!node_id || !name) {
    return res.status(400).json({ success: false, error: 'Node ID (e.g. N-001) and Name are required' });
  }

  const newNode = store.createPhaNode(
    {
      project_id: projectId,
      node_id: String(node_id).trim(),
      name: String(name).trim(),
      design_intent: design_intent ? String(design_intent).trim() : '',
      equipment_tags: Array.isArray(equipment_tags) ? equipment_tags : [],
      line_numbers: Array.isArray(line_numbers) ? line_numbers : [],
      inlet_boundaries: Array.isArray(inlet_boundaries) ? inlet_boundaries : [],
      outlet_boundaries: Array.isArray(outlet_boundaries) ? outlet_boundaries : [],
      basis_for_grouping: basis_for_grouping || 'Functional unit boundary',
      operating_limits: operating_limits || {},
      unresolved_questions: Array.isArray(unresolved_questions) ? unresolved_questions : [],
      status: 'candidate_not_authoritative',
    },
    reviewer || 'Process Engineer'
  );

  res.status(201).json({ success: true, data: newNode });
});

router.patch('/pha/nodes/:id', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const reviewer = req.body?.reviewer || 'Process Engineer';
  const reason = req.body?.reason || 'Modified study node boundary or intent';
  const updated = store.updatePhaNode(id, req.body, reviewer, reason);
  if (!updated) {
    return res.status(404).json({ success: false, error: 'PHA study node not found' });
  }
  res.json({ success: true, data: updated });
});

router.post('/pha/nodes/:id/approve', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const reviewer = req.body?.reviewer || 'PHA Team Leader';
  const updated = store.approvePhaNode(id, reviewer);
  if (!updated) {
    return res.status(404).json({ success: false, error: 'PHA study node not found' });
  }
  res.json({ success: true, data: updated });
});

router.post('/pha/nodes/:id/reassess-acknowledge', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const { reviewer, notes } = req.body;
  const updated = store.acknowledgePhaNodeReassessment(
    id,
    reviewer || 'Lead PHA Facilitator',
    notes || 'Acknowledged specification reassessment'
  );
  if (!updated) {
    return res.status(404).json({ success: false, error: 'PHA study node not found' });
  }
  res.json({ success: true, data: updated });
});

router.delete('/pha/nodes/:id', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const reviewer = req.body?.reviewer || 'Process Engineer';
  const deleted = store.deletePhaNode(id, reviewer);
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'PHA study node not found' });
  }
  res.json({ success: true, message: 'PHA study node deleted successfully' });
});

router.get('/projects/:id/pha/readiness', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const readiness = store.getHazopReadiness(projectId);
  res.json({ success: true, data: readiness });
});

// --- DIGITAL P&ID DRAWINGS ---
router.get('/projects/:id/drawings', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  let drawings = store.listDrawings(projectId);
  if (drawings.length === 0) {
    const existingEq = store.listEquipment(projectId);
    const existingLines = store.listLines(projectId);
    const existingStreams = store.listStreams(projectId);
    const docs = store.listDocuments(projectId).filter((d) => d.doc_type === 'pid');

    if (existingEq.length > 0 || docs.length > 0) {
      const doc = docs[0];
      const digitalDrawing = generateDigitalPidFromExtracted(
        projectId,
        doc?.id || null,
        doc?.name || 'Process Drawing',
        existingEq,
        existingLines,
        existingStreams
      );
      store.saveDrawing(digitalDrawing, 'Auto Digital P&ID Generator', 'Generated digital P&ID from project equipment');
      drawings = [digitalDrawing];
    } else {
      const seeded = store.seedSampleDrawing(projectId);
      drawings = [seeded];
    }
  }
  res.json({ success: true, data: drawings });
});

router.get('/drawings/:id', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const drawing = store.getDrawing(id);
  if (!drawing) {
    return res.status(404).json({ success: false, error: 'Digital drawing not found' });
  }
  res.json({ success: true, data: drawing });
});

router.post('/projects/:id/drawings', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const { title, mode, source_document_id } = req.body;

  let elements: any[] = [];
  let connectors: any[] = [];

  if (mode === 'edit_imported' && source_document_id) {
    const doc = store.getDocument(source_document_id);
    if (doc) {
      if (req.body.import_extracted_objects) {
        const extractedEq = store.listEquipment(projectId);
        elements = extractedEq.map((eq, i) => ({
          id: uuidv4(),
          type: (eq.equipment_type || 'vessel') as any,
          tag: eq.tag,
          description: eq.description || `${eq.tag} equipment unit`,
          position: { x: 200 + (i % 4) * 220, y: 200 + Math.floor(i / 4) * 180 },
          size: { width: 90, height: 110 },
          rotation: 0,
          assigned_chemical_id: eq.assigned_chemical_id,
          status: eq.status,
          confidence: eq.confidence,
          source_evidence: eq.source,
          notes: eq.notes,
          ports: [
            { id: 'p_in', name: 'Inlet', type: 'inlet' as const, position: { x: -45, y: 0 } },
            { id: 'p_out', name: 'Outlet', type: 'outlet' as const, position: { x: 45, y: 0 } },
            { id: 'p_sig', name: 'Signal', type: 'signal' as const, position: { x: 0, y: -40 } },
          ],
        }));
      }
    }
  }

  const now = new Date().toISOString();
  const newDrawing = store.saveDrawing({
    id: uuidv4(),
    project_id: projectId,
    source_document_id: source_document_id || null,
    source_document_page: 1,
    title: title || (mode === 'edit_imported' ? 'Imported P&ID Overlay' : 'New Digital P&ID'),
    drawing_number: `DWG-${Math.floor(100 + Math.random() * 900)}`,
    revision: 'REV 0',
    status: 'draft',
    mode: mode === 'edit_imported' ? 'imported_overlay' : 'scratch',
    elements,
    connectors,
    background_visible: true,
    background_opacity: 0.5,
    created_at: now,
    updated_at: now,
  });

  res.status(201).json({ success: true, data: newDrawing });
});

router.put('/drawings/:id', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const existing = store.getDrawing(id);
  if (!existing) {
    return res.status(404).json({ success: false, error: 'Digital drawing not found' });
  }

  let newRevision = existing.revision;
  let newStatus = existing.status;
  if (existing.status === 'approved') {
    const currentRevNum = parseInt(existing.revision.replace(/[^0-9]/g, '') || '0', 10);
    newRevision = `REV ${currentRevNum + 1}`;
    newStatus = 'draft';
  }

  const updated = store.saveDrawing({
    ...existing,
    ...req.body,
    id: existing.id,
    project_id: existing.project_id,
    revision: newRevision,
    status: newStatus,
    updated_at: new Date().toISOString(),
  });

  res.json({ success: true, data: updated });
});

router.post('/drawings/:id/validate', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const result = store.validateDrawing(id);
  if (!result) {
    return res.status(404).json({ success: false, error: 'Digital drawing not found' });
  }
  res.json({ success: true, data: result });
});

router.post('/drawings/:id/acknowledge-warning', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const { warning_code } = req.body;
  if (!warning_code) {
    return res.status(400).json({ success: false, error: 'warning_code is required' });
  }
  const drawing = store.getDrawing(id);
  if (!drawing) {
    return res.status(404).json({ success: false, error: 'Digital drawing not found' });
  }
  store.acknowledgeDrawingWarning(id, warning_code);
  const val = store.validateDrawing(id);
  res.json({ success: true, validation: val });
});

router.post('/drawings/:id/approve', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const approver = req.body?.approver || 'Lead Process Engineer';
  const revision = req.body?.revision;
  const notes = req.body?.notes;
  const result = store.approveDrawing(id, approver, revision, notes);
  if (!result) {
    return res.status(404).json({ success: false, error: 'Digital drawing not found' });
  }
  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: result.error || 'Cannot approve drawing with critical errors or unacknowledged warnings',
      validation: result.validation,
    });
  }
  res.json({ success: true, data: result.drawing, validation: result.validation });
});

router.post('/drawings/:id/sync', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const synced = store.syncDrawingToProject(id);
  if (!synced || !synced.success) {
    return res.status(404).json({ success: false, error: 'Digital drawing not found or sync failed' });
  }
  res.json({
    success: true,
    message: 'Digital drawing synchronized with project process topology and PHA baseline',
    equipment_count: synced.equipment_count,
    lines_count: synced.lines_count,
  });
});

router.delete('/drawings/:id', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const deleted = store.deleteDrawing(id);
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'Digital drawing not found' });
  }
  res.json({ success: true, message: 'Digital drawing deleted successfully' });
});

router.get('/drawings/:id/export/json', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const drawing = store.getDrawing(id);
  if (!drawing) {
    return res.status(404).json({ success: false, error: 'Digital drawing not found' });
  }
  const jsonStr = exportDrawingToJson(drawing);
  const filename = `${drawing.drawing_number}_${drawing.revision.replace(/\s+/g, '_')}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(jsonStr);
});

router.get('/drawings/:id/export/svg', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const drawing = store.getDrawing(id);
  if (!drawing) {
    return res.status(404).json({ success: false, error: 'Digital drawing not found' });
  }
  const project = store.getProject(drawing.project_id);
  const svgStr = exportDrawingToSvg(drawing, project);
  const filename = `${drawing.drawing_number}_${drawing.revision.replace(/\s+/g, '_')}.svg`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(svgStr);
});

router.delete('/drawings/:id', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const deleted = store.deleteDrawing(id);
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'Digital drawing not found' });
  }
  res.json({ success: true, message: 'Digital drawing deleted successfully' });
});

router.get('/drawings/:id/export/json', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const drawing = store.getDrawing(id);
  if (!drawing) {
    return res.status(404).json({ success: false, error: 'Digital drawing not found' });
  }
  const jsonStr = exportDrawingToJson(drawing);
  const filename = `${drawing.drawing_number}_${drawing.revision.replace(/\s+/g, '_')}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(jsonStr);
});

router.get('/drawings/:id/export/svg', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const drawing = store.getDrawing(id);
  if (!drawing) {
    return res.status(404).json({ success: false, error: 'Digital drawing not found' });
  }
  const project = store.getProject(drawing.project_id);
  const svgStr = exportDrawingToSvg(drawing, project);
  const filename = `${drawing.drawing_number}_${drawing.revision.replace(/\s+/g, '_')}.svg`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(svgStr);
});

// --- EXPORT ENGINE ---
router.get('/projects/:id/export/json', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const project = store.getProject(projectId);
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  const docs = store.listDocuments(projectId);
  const chems = store.listChemicals(projectId);
  const conflicts = store.listConflicts(projectId);
  const equipment = store.listEquipment(projectId);
  const lines = store.listLines(projectId);
  const graph = buildProcessTopologyGraph(equipment, lines, chems, conflicts);

  const jsonStr = exportProjectToJson(project, docs, chems, conflicts, graph);

  const filename = `${project.name.replace(/[^a-z0-9]/gi, '_')}_PSI_Export.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(jsonStr);
});

router.get('/projects/:id/export/csv', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const project = store.getProject(projectId);
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  const chems = store.listChemicals(projectId);
  const csvStr = exportProjectToCsv(chems);

  const filename = `${project.name.replace(/[^a-z0-9]/gi, '_')}_PSI_Records.csv`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'text/csv');
  res.send(csvStr);
});

// --- HYBRID P&ID RECOGNITION & PROCESS DESCRIPTION ENGINE ---

router.post('/projects/:id/process-description', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const project = store.getProject(projectId);
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  const { description } = req.body;
  if (!description || typeof description !== 'string') {
    return res.status(400).json({ success: false, error: 'Process description text is required' });
  }

  const existingEquipment = store.listEquipment(projectId);
  const knownTags = existingEquipment.map((e) => e.tag);

  const extraction = parseProcessDescription(projectId, description.trim(), knownTags);
  store.saveProcessDescription(extraction);

  res.status(200).json({ success: true, data: extraction });
});

router.get('/projects/:id/process-description', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const extraction = store.getProcessDescription(projectId);
  if (!extraction) {
    return res.json({ success: true, data: null });
  }
  res.json({ success: true, data: extraction });
});

router.post('/projects/:id/recognize-hybrid', async (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const project = store.getProject(projectId);
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  const { document_id, raw_content } = req.body;
  const docs = store.listDocuments(projectId);
  const doc = document_id ? docs.find((d) => d.id === document_id) : docs.find((d) => d.doc_type === 'pid') || docs[0];

  if (!doc) {
    return res.status(400).json({ success: false, error: 'No P&ID document found in project to recognize' });
  }

  const processDesc = store.getProcessDescription(projectId);
  const absoluteDiskPath = path.resolve(__dirname, `../../${doc.file_path}`);

  const drawingModel = await normalizeDrawing({
    filePath: absoluteDiskPath,
    fileName: doc.name,
    mimeType: doc.mime_type,
    documentId: doc.id,
    rawContent: raw_content,
    processDescription: processDesc,
  });

  store.saveCommonDrawingModel(drawingModel);

  res.json({ success: true, data: drawingModel });
});

router.get('/projects/:id/recognition-results', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const docId = req.query.document_id as string | undefined;

  if (docId) {
    const model = store.getCommonDrawingModel(docId);
    return res.json({ success: true, data: model || null });
  }

  const allModels = store.listCommonDrawingModels();
  res.json({ success: true, data: allModels });
});

router.get('/projects/:id/recognition-debug', async (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const project = store.getProject(projectId);
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  const docs = store.listDocuments(projectId);
  const doc = docs.find((d) => d.doc_type === 'pid') || docs[0];

  if (!doc) {
    return res.json({
      success: true,
      data: {
        has_pid: false,
        message: 'No P&ID drawing uploaded in this project.',
      },
    });
  }

  let drawingModel = store.getCommonDrawingModel(doc.id);
  if (!drawingModel) {
    try {
      const absoluteDiskPath = path.resolve(__dirname, `../../${doc.file_path}`);
      const processDesc = store.getProcessDescription(projectId);
      drawingModel = await normalizeDrawing({
        filePath: absoluteDiskPath,
        fileName: doc.name,
        mimeType: doc.mime_type,
        documentId: doc.id,
        processDescription: processDesc,
      });
      store.saveCommonDrawingModel(drawingModel);
    } catch (err: any) {
      console.error('Failed to compute drawing model for debug:', err.message);
    }
  }

  const equipment = store.listEquipment(projectId);
  const lines = store.listLines(projectId);
  const chems = store.listChemicals(projectId);
  const conflicts = store.listConflicts(projectId);
  const graph = buildProcessTopologyGraph(equipment, lines, chems, conflicts);

  const paths = drawingModel?.pipe_paths || [];
  const pipingPaths = paths.filter((p) => p.functional_type === 'piping_line');
  const signalPaths = paths.filter((p) => p.functional_type === 'signal_line');
  const confirmedPaths = paths.filter((p) => p.start_candidate && p.end_candidate);
  const unresolvedPaths = paths.filter((p) => !p.start_candidate || !p.end_candidate);

  res.json({
    success: true,
    data: {
      has_pid: true,
      document: {
        id: doc.id,
        name: doc.name,
        file_path: doc.file_path,
        mime_type: doc.mime_type,
        pages_count: doc.pages_count,
        is_readable: doc.is_readable,
      },
      stage_counts: {
        objects_count: drawingModel?.objects?.length || 0,
        pipe_paths_count: paths.length,
        process_piping_count: pipingPaths.length,
        signal_lines_count: signalPaths.length,
        junctions_count: drawingModel?.junctions?.length || 0,
        ports_count: drawingModel?.ports?.length || 0,
        connection_candidates_count: drawingModel?.connection_candidates?.length || 0,
        confirmed_paths_count: confirmedPaths.length,
        unresolved_segments_count: unresolvedPaths.length,
        graph_nodes_count: graph.nodes.length,
        graph_edges_count: graph.edges.length,
        isolated_nodes_count: graph.counts.isolated_nodes_count,
      },
      drawing_model: drawingModel,
      reconciliation_summary: drawingModel?.reconciliation_summary || null,
      graph_counts: graph.counts,
    },
  });
});

router.patch('/connections/:id', (req: Request, res: Response) => {
  const candidateId = getParam(req.params.id);
  const updates = req.body;
  const reviewer = req.body.reviewer || 'Process Safety Engineer';

  const updated = store.updateCandidateConnection(candidateId, updates, reviewer);
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Candidate connection not found' });
  }

  res.json({ success: true, data: updated });
});

router.post('/connections/:id/verify', (req: Request, res: Response) => {
  const candidateId = getParam(req.params.id);
  const reviewer = req.body.reviewer || 'Process Safety Engineer';
  const notes = req.body.notes || 'Connection verified against physical P&ID';

  const verified = store.verifyCandidateConnection(candidateId, reviewer, notes);
  if (!verified) {
    return res.status(404).json({ success: false, error: 'Candidate connection not found' });
  }

  res.json({ success: true, data: verified });
});

router.post('/connections/:id/reject', (req: Request, res: Response) => {
  const candidateId = getParam(req.params.id);
  const reviewer = req.body.reviewer || 'Process Safety Engineer';
  const notes = req.body.notes || 'Connection rejected by engineer';

  const rejected = store.rejectCandidateConnection(candidateId, reviewer, notes);
  if (!rejected) {
    return res.status(404).json({ success: false, error: 'Candidate connection not found' });
  }

  res.json({ success: true, data: rejected });
});

router.post('/projects/:id/sync-connections', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const { candidate_ids, reviewer } = req.body;

  if (!Array.isArray(candidate_ids) || candidate_ids.length === 0) {
    return res.status(400).json({ success: false, error: 'candidate_ids array is required' });
  }

  const result = store.syncCandidateConnectionsToTopology(
    projectId,
    candidate_ids,
    reviewer || 'Process Safety Engineer'
  );

  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error });
  }

  const summary = store.getDashboardSummary(projectId);
  res.json({ success: true, data: { ...result, summary } });
});

// ============================================================================
// HYBRID CHEMICAL IDENTIFICATION & PROCESS MAPPING ROUTES
// ============================================================================

// --- Chemical Assignments ---
router.get('/projects/:id/chemical-assignments', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const assignments = store.listChemicalAssignments(projectId);
  res.json({ success: true, data: assignments });
});

router.post('/projects/:id/chemical-assignments', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const {
    chemical_id,
    chemical_name,
    cas_number,
    equipment_id,
    equipment_tag,
    stream_id,
    stream_number,
    connection_endpoint,
    concentration,
    concentration_unit,
    phase,
    source_document,
    source_page_or_location,
    notes,
    author,
    verification_status,
  } = req.body;

  if (!chemical_id || !chemical_name) {
    return res.status(400).json({ success: false, error: 'chemical_id and chemical_name are required' });
  }

  const assignment = store.saveChemicalAssignment(
    {
      project_id: projectId,
      chemical_id,
      chemical_name,
      cas_number,
      equipment_id,
      equipment_tag,
      stream_id,
      stream_number,
      connection_endpoint: connection_endpoint || 'all',
      concentration: concentration !== undefined && concentration !== '' ? Number(concentration) : null,
      concentration_unit: concentration_unit || 'mol%',
      phase: phase || null,
      source_document: source_document || 'Manual Plant Engineering Entry',
      source_page_or_location,
      notes,
      verification_status: verification_status || 'unverified',
    },
    author || 'Process Safety Engineer'
  );

  // Trigger mapping re-evaluation
  const equipment = store.listEquipment(projectId);
  const lines = store.listLines(projectId);
  const streams = store.listStreams(projectId);
  const assignments = store.listChemicalAssignments(projectId);
  const gasReports = store.listGasCompositionReports(projectId);

  const mappings = evaluateProjectChemicalMappings({
    projectId,
    equipment,
    lines,
    streams,
    assignments,
    gasReports,
  });
  for (const m of mappings) {
    store.saveChemicalMapping(m);
  }

  res.status(201).json({ success: true, data: assignment });
});

router.put('/projects/:id/chemical-assignments/:assignmentId', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const assignmentId = getParam(req.params.assignmentId);

  const existing = store.getChemicalAssignment(assignmentId);
  if (!existing || existing.project_id !== projectId) {
    return res.status(404).json({ success: false, error: 'Chemical assignment not found' });
  }

  const updated = store.saveChemicalAssignment(
    {
      ...req.body,
      id: assignmentId,
      project_id: projectId,
      chemical_id: req.body.chemical_id || existing.chemical_id,
      chemical_name: req.body.chemical_name || existing.chemical_name,
      concentration:
        req.body.concentration !== undefined && req.body.concentration !== ''
          ? Number(req.body.concentration)
          : null,
    },
    req.body.author || 'Process Safety Engineer'
  );

  res.json({ success: true, data: updated });
});

router.delete('/projects/:id/chemical-assignments/:assignmentId', (req: Request, res: Response) => {
  const assignmentId = getParam(req.params.assignmentId);
  const author = req.body?.author || 'Process Safety Engineer';
  const deleted = store.deleteChemicalAssignment(assignmentId, author);

  if (!deleted) {
    return res.status(404).json({ success: false, error: 'Chemical assignment not found' });
  }

  res.json({ success: true, message: 'Assignment deleted' });
});

router.post('/projects/:id/chemical-assignments/:assignmentId/verify', (req: Request, res: Response) => {
  const assignmentId = getParam(req.params.assignmentId);
  const reviewer = req.body.reviewer || 'Lead Process Safety Engineer (PE)';
  const status = req.body.status || 'verified';

  try {
    const verified = store.verifyChemicalAssignment(assignmentId, reviewer, status);
    res.json({ success: true, data: verified });
  } catch (err: any) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// --- Chemical Mappings ---
router.get('/projects/:id/chemical-mappings', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  let mappings = store.listChemicalMappings(projectId);

  if (mappings.length === 0) {
    const equipment = store.listEquipment(projectId);
    const lines = store.listLines(projectId);
    const streams = store.listStreams(projectId);
    const assignments = store.listChemicalAssignments(projectId);
    const gasReports = store.listGasCompositionReports(projectId);

    mappings = evaluateProjectChemicalMappings({
      projectId,
      equipment,
      lines,
      streams,
      assignments,
      gasReports,
    });
    for (const m of mappings) {
      store.saveChemicalMapping(m);
    }
  }

  res.json({ success: true, data: mappings });
});

router.post('/projects/:id/chemical-mappings/evaluate', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const equipment = store.listEquipment(projectId);
  const lines = store.listLines(projectId);
  const streams = store.listStreams(projectId);
  const assignments = store.listChemicalAssignments(projectId);
  const gasReports = store.listGasCompositionReports(projectId);

  const mappings = evaluateProjectChemicalMappings({
    projectId,
    equipment,
    lines,
    streams,
    assignments,
    gasReports,
  });

  for (const m of mappings) {
    store.saveChemicalMapping(m);
  }

  res.json({ success: true, data: mappings });
});

// --- Gas Composition Reports ---
router.get('/projects/:id/gas-composition-reports', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const reports = store.listGasCompositionReports(projectId);
  res.json({ success: true, data: reports });
});

router.post('/projects/:id/gas-composition-reports', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const { raw_text, report_title, sample_point, associated_stream_number, components, concentration_unit } = req.body;

  let report: any;
  if (raw_text) {
    report = parseGasCompositionReportText(
      raw_text,
      projectId,
      'doc-gas-analysis-manual',
      report_title || 'Wellhead Gas Composition Analysis'
    );
    if (sample_point) report.sample_point = sample_point;
    if (associated_stream_number) report.associated_stream_number = associated_stream_number;
  } else if (Array.isArray(components)) {
    const total = components.reduce((sum: number, c: any) => sum + (Number(c.concentration) || 0), 0);
    report = {
      id: uuidv4(),
      project_id: projectId,
      document_id: 'doc-gas-analysis-manual',
      report_title: report_title || 'Laboratory Gas Composition Report',
      sample_point: sample_point || 'Inlet Reception Manifold',
      sample_date: new Date().toISOString().split('T')[0],
      analysis_method: 'Gas Chromatography (ASTM D1945)',
      components,
      total_concentration: Number(total.toFixed(2)),
      concentration_unit: concentration_unit || 'mol%',
      associated_stream_number: associated_stream_number || null,
      associated_stream_id: null,
      ambiguity_flag: null,
      extracted_at: new Date().toISOString(),
    };
  } else {
    return res.status(400).json({ success: false, error: 'raw_text or components array is required' });
  }

  const saved = store.saveGasCompositionReport(report);

  // Re-evaluate chemical mappings across project
  const equipment = store.listEquipment(projectId);
  const lines = store.listLines(projectId);
  const streams = store.listStreams(projectId);
  const assignments = store.listChemicalAssignments(projectId);
  const gasReports = store.listGasCompositionReports(projectId);

  const mappings = evaluateProjectChemicalMappings({
    projectId,
    equipment,
    lines,
    streams,
    assignments,
    gasReports,
  });
  for (const m of mappings) {
    store.saveChemicalMapping(m);
  }

  res.status(201).json({ success: true, data: saved, mappings_updated: mappings.length });
});

// --- PSI Completeness Report ---
router.get('/projects/:id/psi-completeness', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const completeness = store.getPsiCompletenessReport(projectId);
  res.json({ success: true, data: completeness });
});

// --- Verification History ---
router.get('/projects/:id/verification-history', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const history = store.getVerificationHistory(projectId);
  res.json({ success: true, data: history });
});

// --- PHA Chemical Context Integration ---
router.get('/projects/:id/pha-chemical-context/:nodeId', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const nodeId = getParam(req.params.nodeId);

  const nodes = store.listPhaNodes(projectId);
  const node = nodes.find((n) => n.id === nodeId || n.node_id === nodeId);
  if (!node) {
    return res.status(404).json({ success: false, error: 'PHA Node not found' });
  }

  const equipment = store.listEquipment(projectId);
  const lines = store.listLines(projectId);
  const mappings = store.listChemicalMappings(projectId);

  // Match mapping for node's primary equipment
  const matchingMapping = mappings.find((m) =>
    node.equipment_tags.some((t) => t.toUpperCase() === m.target_tag.toUpperCase())
  ) || null;

  const matrix = store.listEngineeringMatrix(projectId);
  const rules = store.listPhilosophyRules(projectId);
  const discrepancies = store.listDiscrepancies(projectId);

  const enrichedNode = attachChemicalContextToPhaNode(
    node,
    matchingMapping,
    equipment,
    lines,
    matrix,
    rules,
    discrepancies
  );
  res.json({ success: true, data: enrichedNode });
});

// --- PHA Multi-Document Reassessment ---
router.post('/projects/:id/pha/nodes/reassess', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const entityTag = req.body?.entity_tag || '';
  const property = req.body?.property || 'specification';
  const reviewer = req.body?.reviewer || 'Process Safety Engineer';

  const affected = store.reassessPhaNodesOnSpecChange(projectId, entityTag, property, reviewer);
  res.json({ success: true, count: affected.length, data: affected });
});

// --- HEALTH CHECK ---
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    system: 'PSI Identification & Evidence Management Engine',
    standard: 'OSHA 29 CFR 1910.119(d)(1)',
    uptime_seconds: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

export default router;
