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
import { DocumentRecord, DocumentType, PipingLine, EquipmentTag, createDefaultSpecifications } from '../types';

const router = Router();

const getParam = (val: unknown): string => {
  if (Array.isArray(val)) return String(val[0] || '');
  return String(val || '');
};

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
];

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.pdf', '.png', '.jpg', '.jpeg', '.svg', '.webp'];

    if (ALLOWED_MIME_TYPES.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Only PDF, PNG, JPG, JPEG, SVG, and WebP are allowed.`));
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

    // Explicit doc_type hint from user (e.g. 'sds' or 'pid' or 'auto')
    const docTypeHint = (req.body.doc_type as string) || 'auto';

    const processedDocs: DocumentRecord[] = [];
    const newChemicals: any[] = [];
    const newEquipment: any[] = [];
    const newLines: any[] = [];

    for (const file of files) {
      const docId = uuidv4();
      let determinedType: DocumentType = 'sds';

      if (docTypeHint === 'pid') {
        determinedType = 'pid';
      } else if (docTypeHint === 'sds') {
        determinedType = 'sds';
      } else {
        // Auto-detect based on filename and mime type
        const lowerName = file.originalname.toLowerCase();
        if (
          file.mimetype.startsWith('image/') ||
          lowerName.includes('p&id') ||
          lowerName.includes('pid') ||
          lowerName.includes('diagram') ||
          lowerName.includes('drawing')
        ) {
          determinedType = 'pid';
        } else {
          determinedType = 'sds';
        }
      }

      // Extract document text
      const extracted = await extractTextFromDocument(file.path, file.mimetype);

      const docRecord: DocumentRecord = {
        id: docId,
        project_id: projectId,
        name: file.originalname,
        original_filename: file.originalname,
        file_path: `/uploads/${file.filename}`,
        mime_type: file.mimetype,
        size_bytes: file.size,
        doc_type: determinedType,
        upload_timestamp: new Date().toISOString(),
        pages_count: extracted.pagesCount,
        is_readable: extracted.isReadable,
        unreadable_reason: extracted.unreadableReason,
        is_scanned_ocr_attempted: extracted.isScanned,
        chemical_ids: [],
      };

      store.addDocument(docRecord);
      processedDocs.push(docRecord);

      // If document is readable and is SDS, run OSHA PSI extractor
      if (determinedType === 'sds' && extracted.isReadable) {
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
      if (determinedType === 'pid') {
        const existingChems = store.listChemicals(projectId);
        const { equipment, lines } = parsePidDocument(
          extracted,
          docId,
          file.originalname,
          projectId,
          existingChems
        );
        store.addEquipment(equipment);
        store.addLines(lines);
        newEquipment.push(...equipment);
        newLines.push(...lines);
      }
    }

    const summary = store.getDashboardSummary(projectId);

    res.status(201).json({
      success: true,
      data: {
        documents: processedDocs,
        chemicals_added: newChemicals.length,
        equipment_tags_added: newEquipment.length,
        piping_lines_added: newLines.length,
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

router.get('/projects/:id/graph', (req: Request, res: Response) => {
  const projectId = getParam(req.params.id);
  const equipment = store.listEquipment(projectId);
  const lines = store.listLines(projectId);
  const chems = store.listChemicals(projectId);
  const conflicts = store.listConflicts(projectId);

  const graph = buildProcessTopologyGraph(equipment, lines, chems, conflicts);
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
    const seeded = store.seedSampleDrawing(projectId);
    drawings = [seeded];
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
