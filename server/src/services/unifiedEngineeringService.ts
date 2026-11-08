import { v4 as uuidv4 } from 'uuid';
import {
  DocumentCategory,
  UnifiedEngineeringMatrixEntry,
  UnifiedProvenanceValue,
  EquipmentTag,
  PipingLine,
  ProcessStream,
  EngineeringPhilosophyRule,
  ExtractedDatasheetRecord,
  ExtractedStreamRecord,
  MajorUnitOperation,
} from '../types';
import { PsiDataStore } from '../storage/store';

/**
 * Builds and synchronizes the Unified Engineering Database Matrix for a project.
 * Creates deterministic cross-document relationships connecting:
 * Equipment <-> Piping Lines <-> Process Streams <-> Chemicals <-> Specifications <-> Safeguards <-> Philosophies <-> Source Documents.
 */
export function buildUnifiedEngineeringMatrix(
  projectId: string,
  store: PsiDataStore
): UnifiedEngineeringMatrixEntry[] {
  const matrixEntries: UnifiedEngineeringMatrixEntry[] = [];

  const equipmentList = store.listEquipment(projectId);
  const linesList = store.listLines(projectId);
  const streamsList = store.listStreams(projectId);
  const chemicalsList = store.listChemicals(projectId);
  const assignmentsList = store.listChemicalAssignments(projectId);
  const pfdExtractions = store.listPfdExtractions(projectId);
  const streamTableExtractions = store.listStreamTableExtractions(projectId);
  const datasheetExtractions = store.listDatasheetExtractions(projectId);
  const philosophyRules = store.listPhilosophyRules(projectId);
  const philosophyExtractions = store.listPhilosophyExtractions(projectId);
  const discrepancies = store.listDiscrepancies(projectId);
  const documents = store.listDocuments(projectId);

  const docMap = new Map<string, { name: string; category: DocumentCategory }>();
  for (const doc of documents) {
    docMap.set(doc.id, {
      name: doc.original_filename || doc.name || 'Document',
      category: doc.category || (doc.doc_type as any) || 'pid',
    });
  }

  // Flatten extracted datasheets across all documents
  const allDatasheets: ExtractedDatasheetRecord[] = [];
  for (const de of datasheetExtractions) {
    for (const ds of de.datasheets) {
      allDatasheets.push(ds);
    }
  }

  // Flatten extracted streams across all stream tables
  const allExtractedStreams: ExtractedStreamRecord[] = [];
  for (const ste of streamTableExtractions) {
    for (const es of ste.streams) {
      allExtractedStreams.push(es);
    }
  }

  // Flatten PFD major units
  const allPfdUnits: { unit: MajorUnitOperation; docId: string; docName: string }[] = [];
  for (const pe of pfdExtractions) {
    for (const u of pe.major_units) {
      allPfdUnits.push({ unit: u, docId: pe.document_id, docName: pe.document_name });
    }
  }

  // --------------------------------------------------------------------------
  // 1. CONSOLIDATE EQUIPMENT ENTITIES
  // --------------------------------------------------------------------------
  for (const eq of equipmentList) {
    const tag = eq.tag;
    const lowerTag = tag.toLowerCase();

    const sourcesFound = new Set<DocumentCategory>();
    const sourceDocIds = new Set<string>();
    const sourceDocNames = new Set<string>();

    // Initial P&ID provenance
    if (eq.document_id) {
      sourceDocIds.add(eq.document_id);
      const docInfo = docMap.get(eq.document_id);
      if (docInfo) {
        sourcesFound.add(docInfo.category);
        sourceDocNames.add(docInfo.name);
      } else {
        sourcesFound.add('pid');
      }
    } else {
      sourcesFound.add('pid');
    }

    // 1.1 Match Connected Lines
    const connectedLines = linesList.filter(
      (l) =>
        (l.from_equipment && l.from_equipment.toLowerCase() === lowerTag) ||
        (l.to_equipment && l.to_equipment.toLowerCase() === lowerTag)
    );
    const connectedLineNumbers = Array.from(new Set(connectedLines.map((l) => l.line_number)));

    // 1.2 Match Connected Equipment via lines
    const connectedEquipSet = new Set<string>();
    for (const l of connectedLines) {
      if (l.from_equipment && l.from_equipment.toLowerCase() !== lowerTag) {
        connectedEquipSet.add(l.from_equipment);
      }
      if (l.to_equipment && l.to_equipment.toLowerCase() !== lowerTag) {
        connectedEquipSet.add(l.to_equipment);
      }
    }

    // 1.3 Match Connected Streams
    const connectedStreams = streamsList.filter(
      (s) =>
        (s.source_equipment_tag && s.source_equipment_tag.toLowerCase() === lowerTag) ||
        (s.destination_equipment_tag && s.destination_equipment_tag.toLowerCase() === lowerTag)
    );
    const connectedStreamNumbers = Array.from(
      new Set(connectedStreams.map((s) => s.stream_number || s.id))
    );
    for (const s of connectedStreams) {
      if (s.source_equipment_tag && s.source_equipment_tag.toLowerCase() !== lowerTag) {
        connectedEquipSet.add(s.source_equipment_tag);
      }
      if (s.destination_equipment_tag && s.destination_equipment_tag.toLowerCase() !== lowerTag) {
        connectedEquipSet.add(s.destination_equipment_tag);
      }
    }

    // 1.4 Match Assigned Chemicals
    const assignedChems = assignmentsList.filter(
      (a) => a.equipment_id === eq.id || a.equipment_tag?.toLowerCase() === lowerTag
    );
    const chemNames = new Set<string>();
    for (const a of assignedChems) {
      const chem = chemicalsList.find((c) => c.id === a.chemical_id);
      if (chem) chemNames.add(chem.chemical_name?.value || chem.id);
    }
    for (const s of connectedStreams) {
      if (s.assigned_chemical_id) {
        const chem = chemicalsList.find((c) => c.id === s.assigned_chemical_id);
        if (chem) chemNames.add(chem.chemical_name?.value || chem.id);
      }
    }

    // 1.5 Match Equipment Datasheets
    const matchedDatasheets = allDatasheets.filter(
      (ds) => ds.equipment_tag && ds.equipment_tag.toLowerCase() === lowerTag
    );
    let datasheetData: Record<string, any> | undefined;
    if (matchedDatasheets.length > 0) {
      sourcesFound.add('equipment_datasheet');
      datasheetData = matchedDatasheets[0];
      sourceDocIds.add(matchedDatasheets[0].document_id);
      const docInfo = docMap.get(matchedDatasheets[0].document_id);
      if (docInfo) sourceDocNames.add(docInfo.name);
    }

    // 1.6 Match PFD / BFD major units
    const matchedPfdUnits = allPfdUnits.filter(
      (pu) => pu.unit.tag && pu.unit.tag.toLowerCase() === lowerTag
    );
    let pfdData: Record<string, any> | undefined;
    if (matchedPfdUnits.length > 0) {
      sourcesFound.add('pfd');
      pfdData = matchedPfdUnits[0].unit;
      sourceDocIds.add(matchedPfdUnits[0].docId);
      sourceDocNames.add(matchedPfdUnits[0].docName);
    }

    // 1.7 Match Engineering Philosophy Rules & Safeguards
    const matchedRules = philosophyRules.filter(
      (r) =>
        (r.equipment_tag && r.equipment_tag.toLowerCase() === lowerTag) ||
        (r.condition && r.condition.toLowerCase().includes(lowerTag)) ||
        (r.action && r.action.toLowerCase().includes(lowerTag))
    );

    const instrumentsSet = new Set<string>();
    const safeguardsSet = new Set<string>();
    for (const r of matchedRules) {
      sourcesFound.add(r.source_category);
      sourceDocIds.add(r.source_document_id);
      sourceDocNames.add(r.source_document_name);

      if (r.loop_tag) {
        if (/^(PSV|BDV|XV|SDV)/i.test(r.loop_tag)) {
          safeguardsSet.add(r.loop_tag);
        } else {
          instrumentsSet.add(r.loop_tag);
        }
      }
      if (r.rule_type === 'esd_action' || r.rule_type === 'relief_basis') {
        safeguardsSet.add(`${r.rule_type.toUpperCase()}: ${r.action}`);
      }
    }

    // 1.8 Match Conflicts / Discrepancies
    const matchingDiscrepancies = discrepancies.filter(
      (d) => d.entity_tag && d.entity_tag.toLowerCase() === lowerTag
    );
    const hasConflicts = matchingDiscrepancies.length > 0;
    const conflictIds = matchingDiscrepancies.map((d) => d.id);

    // 1.9 Consolidate Specifications with Provenance
    const designSpecs: UnifiedEngineeringMatrixEntry['design_specifications'] = {};

    if (matchedDatasheets.length > 0) {
      const ds = matchedDatasheets[0];
      if (ds.design_pressure && ds.design_pressure.normalized_value !== null) {
        designSpecs.design_pressure = ds.design_pressure;
      }
      if (ds.design_temperature && ds.design_temperature.normalized_value !== null) {
        designSpecs.design_temperature = ds.design_temperature;
      }
      if (ds.material_of_construction && ds.material_of_construction.normalized_value !== null) {
        designSpecs.material_of_construction = ds.material_of_construction;
      }
      if (ds.design_code && ds.design_code.normalized_value !== null) {
        designSpecs.design_code = ds.design_code;
      }
      if (ds.corrosion_allowance && ds.corrosion_allowance.normalized_value !== null) {
        designSpecs.corrosion_allowance = ds.corrosion_allowance;
      }
      if (ds.relief_valve_set_pressure && ds.relief_valve_set_pressure.normalized_value !== null) {
        designSpecs.relief_valve_set_pressure = ds.relief_valve_set_pressure;
      }
    }

    // Fallback to equipment specifications from P&ID if datasheet was unstated
    if (!designSpecs.design_pressure && eq.specifications?.design_pressure?.value !== null && eq.specifications?.design_pressure?.value !== undefined) {
      designSpecs.design_pressure = createProvenanceValue(
        eq.specifications.design_pressure.value,
        eq.specifications.design_pressure.value,
        eq.specifications.design_pressure.unit,
        eq.document_id || 'pid-doc',
        eq.source?.document || 'P&ID Drawing',
        'pid',
        eq.source?.page ? `Page ${eq.source.page}` : 'Drawing',
        0.9,
        eq.specifications.design_pressure.status === 'verified' ? 'engineer_verified' : 'unverified'
      );
    }

    if (!designSpecs.design_temperature && eq.specifications?.design_temperature?.value !== null && eq.specifications?.design_temperature?.value !== undefined) {
      designSpecs.design_temperature = createProvenanceValue(
        eq.specifications.design_temperature.value,
        eq.specifications.design_temperature.value,
        eq.specifications.design_temperature.unit,
        eq.document_id || 'pid-doc',
        eq.source?.document || 'P&ID Drawing',
        'pid',
        eq.source?.page ? `Page ${eq.source.page}` : 'Drawing',
        0.9,
        eq.specifications.design_temperature.status === 'verified' ? 'engineer_verified' : 'unverified'
      );
    }

    if (!designSpecs.material_of_construction && eq.specifications?.material_of_construction?.value !== null && eq.specifications?.material_of_construction?.value !== undefined) {
      designSpecs.material_of_construction = createProvenanceValue(
        eq.specifications.material_of_construction.value,
        eq.specifications.material_of_construction.value,
        null,
        eq.document_id || 'pid-doc',
        eq.source?.document || 'P&ID Drawing',
        'pid',
        eq.source?.page ? `Page ${eq.source.page}` : 'Drawing',
        0.9,
        eq.specifications.material_of_construction.status === 'verified' ? 'engineer_verified' : 'unverified'
      );
    }

    // 1.10 Operating conditions
    const opConditions: UnifiedEngineeringMatrixEntry['operating_conditions'] = {};
    if (matchedDatasheets.length > 0) {
      const ds = matchedDatasheets[0];
      if (ds.operating_pressure && ds.operating_pressure.normalized_value !== null) {
        opConditions.pressure = ds.operating_pressure;
      }
      if (ds.operating_temperature && ds.operating_temperature.normalized_value !== null) {
        opConditions.temperature = ds.operating_temperature;
      }
    }
    if (!opConditions.pressure && eq.specifications?.operating_pressure?.value !== null && eq.specifications?.operating_pressure?.value !== undefined) {
      opConditions.pressure = createProvenanceValue(
        eq.specifications.operating_pressure.value,
        eq.specifications.operating_pressure.value,
        eq.specifications.operating_pressure.unit,
        eq.document_id || 'pid-doc',
        eq.source?.document || 'P&ID Drawing',
        'pid',
        'Drawing',
        0.85
      );
    }
    if (!opConditions.temperature && eq.specifications?.operating_temperature?.value !== null && eq.specifications?.operating_temperature?.value !== undefined) {
      opConditions.temperature = createProvenanceValue(
        eq.specifications.operating_temperature.value,
        eq.specifications.operating_temperature.value,
        eq.specifications.operating_temperature.unit,
        eq.document_id || 'pid-doc',
        eq.source?.document || 'P&ID Drawing',
        'pid',
        'Drawing',
        0.85
      );
    }

    matrixEntries.push({
      id: uuidv4(),
      project_id: projectId,
      entity_type: 'equipment',
      entity_tag: tag,
      description: eq.description || `${eq.equipment_type.toUpperCase()} (${tag})`,
      sources_found: Array.from(sourcesFound),
      source_document_ids: Array.from(sourceDocIds),
      source_document_names: Array.from(sourceDocNames),
      connected_lines: connectedLineNumbers,
      connected_streams: connectedStreamNumbers,
      connected_equipment: Array.from(connectedEquipSet),
      assigned_chemicals: Array.from(chemNames),
      instruments: Array.from(instrumentsSet),
      safeguards: Array.from(safeguardsSet),
      rules: matchedRules,
      operating_conditions: Object.keys(opConditions).length > 0 ? opConditions : undefined,
      design_specifications: Object.keys(designSpecs).length > 0 ? designSpecs : undefined,
      p_and_id_data: {
        equipment_type: eq.equipment_type,
        status: eq.status,
        confidence: eq.confidence,
        specifications: eq.specifications,
        nozzle_schedule: eq.nozzle_schedule,
      },
      datasheet_data: datasheetData,
      pfd_data: pfdData,
      philosophy_data: matchedRules.length > 0 ? { total_rules: matchedRules.length } : undefined,
      has_conflicts: hasConflicts,
      conflict_ids: conflictIds,
      last_updated: new Date().toISOString(),
    });
  }

  // --------------------------------------------------------------------------
  // 2. CONSOLIDATE PIPING LINE ENTITIES
  // --------------------------------------------------------------------------
  for (const line of linesList) {
    const lineTag = line.line_number;
    const lowerLineTag = lineTag.toLowerCase();

    const sourcesFound = new Set<DocumentCategory>(['pid']);
    const sourceDocIds = new Set<string>();
    const sourceDocNames = new Set<string>();

    if (line.document_id) {
      sourceDocIds.add(line.document_id);
      const docInfo = docMap.get(line.document_id);
      if (docInfo) sourceDocNames.add(docInfo.name);
    }

    // Match correlated process stream
    const matchedStream = streamsList.find(
      (s) =>
        (s.line_number && s.line_number.toLowerCase() === lowerLineTag) ||
        (s.connected_line_id && s.connected_line_id === line.id)
    );

    const connectedStreamNumbers = matchedStream ? [matchedStream.stream_number || matchedStream.id] : [];
    if (matchedStream) {
      sourcesFound.add('stream_table');
    }

    // Match assigned chemical
    const assignedChems = new Set<string>();
    if (line.assigned_chemical_id) {
      const chem = chemicalsList.find((c) => c.id === line.assigned_chemical_id);
      if (chem) assignedChems.add(chem.chemical_name?.value || chem.id);
    }

    // Match conflicts
    const matchingDiscrepancies = discrepancies.filter(
      (d) => d.entity_tag && d.entity_tag.toLowerCase() === lowerLineTag
    );

    matrixEntries.push({
      id: uuidv4(),
      project_id: projectId,
      entity_type: 'line',
      entity_tag: lineTag,
      description: `${line.size || ''} ${line.material || ''} Line (${line.from_equipment} -> ${line.to_equipment})`.trim(),
      sources_found: Array.from(sourcesFound),
      source_document_ids: Array.from(sourceDocIds),
      source_document_names: Array.from(sourceDocNames),
      connected_lines: [lineTag],
      connected_streams: connectedStreamNumbers,
      connected_equipment: [line.from_equipment, line.to_equipment].filter(Boolean),
      assigned_chemicals: Array.from(assignedChems),
      p_and_id_data: {
        size: line.size,
        material: line.material,
        flow_direction: line.flow_direction,
        functional_type: line.functional_type,
        from_equipment: line.from_equipment,
        to_equipment: line.to_equipment,
      },
      stream_table_data: matchedStream ? { stream_number: matchedStream.stream_number } : undefined,
      has_conflicts: matchingDiscrepancies.length > 0,
      conflict_ids: matchingDiscrepancies.map((d) => d.id),
      last_updated: new Date().toISOString(),
    });
  }

  // --------------------------------------------------------------------------
  // 3. CONSOLIDATE PROCESS STREAM ENTITIES
  // --------------------------------------------------------------------------
  for (const st of streamsList) {
    const streamTag = st.stream_number || st.id;
    const lowerStreamTag = streamTag.toLowerCase();

    const sourcesFound = new Set<DocumentCategory>();
    const sourceDocIds = new Set<string>();
    const sourceDocNames = new Set<string>();

    // Match extracted stream from stream table parser
    const matchedExtracted = allExtractedStreams.find(
      (es) => es.stream_number && es.stream_number.toLowerCase() === lowerStreamTag
    );
    let streamTableData: Record<string, any> | undefined;
    if (matchedExtracted) {
      sourcesFound.add('stream_table');
      streamTableData = matchedExtracted;
      sourceDocIds.add(matchedExtracted.document_id);
      const docInfo = docMap.get(matchedExtracted.document_id);
      if (docInfo) sourceDocNames.add(docInfo.name);
    } else {
      sourcesFound.add('stream_table');
    }

    // Match assigned chemical
    const assignedChems = new Set<string>();
    if (st.assigned_chemical_id) {
      const chem = chemicalsList.find((c) => c.id === st.assigned_chemical_id);
      if (chem) assignedChems.add(chem.chemical_name?.value || chem.id);
    }
    if (matchedExtracted && matchedExtracted.components && matchedExtracted.components.length > 0) {
      for (const comp of matchedExtracted.components) {
        assignedChems.add(comp.component_name);
      }
    }

    // Operating conditions
    const opConditions: UnifiedEngineeringMatrixEntry['operating_conditions'] = {};
    if (matchedExtracted) {
      if (matchedExtracted.operating_pressure?.normalized_value !== null && matchedExtracted.operating_pressure?.normalized_value !== undefined) {
        opConditions.pressure = matchedExtracted.operating_pressure;
      }
      if (matchedExtracted.operating_temperature?.normalized_value !== null && matchedExtracted.operating_temperature?.normalized_value !== undefined) {
        opConditions.temperature = matchedExtracted.operating_temperature;
      }
      if (matchedExtracted.mass_flow_rate?.normalized_value !== null && matchedExtracted.mass_flow_rate?.normalized_value !== undefined) {
        opConditions.flow_rate = matchedExtracted.mass_flow_rate;
      } else if (matchedExtracted.volumetric_flow_rate?.normalized_value !== null && matchedExtracted.volumetric_flow_rate?.normalized_value !== undefined) {
        opConditions.flow_rate = matchedExtracted.volumetric_flow_rate;
      }
      if (matchedExtracted.phase) {
        opConditions.phase = createProvenanceValue(
          matchedExtracted.phase,
          matchedExtracted.phase,
          null,
          matchedExtracted.document_id,
          'Stream Table',
          'stream_table',
          matchedExtracted.source_location || 'Table',
          0.95
        );
      }
    } else {
      if (st.operating_pressure?.value !== undefined && st.operating_pressure.value !== null) {
        opConditions.pressure = createProvenanceValue(
          st.operating_pressure.value,
          st.operating_pressure.value,
          st.operating_pressure.unit,
          'stream-doc',
          'Stream Table',
          'stream_table',
          'Table',
          0.9
        );
      }
      if (st.operating_temperature?.value !== undefined && st.operating_temperature.value !== null) {
        opConditions.temperature = createProvenanceValue(
          st.operating_temperature.value,
          st.operating_temperature.value,
          st.operating_temperature.unit,
          'stream-doc',
          'Stream Table',
          'stream_table',
          'Table',
          0.9
        );
      }
    }

    // Match conflicts
    const matchingDiscrepancies = discrepancies.filter(
      (d) => d.entity_tag && d.entity_tag.toLowerCase() === lowerStreamTag
    );

    matrixEntries.push({
      id: uuidv4(),
      project_id: projectId,
      entity_type: 'stream',
      entity_tag: streamTag,
      description: `Process Stream ${streamTag} (${st.source_equipment_tag} -> ${st.destination_equipment_tag})`,
      sources_found: Array.from(sourcesFound),
      source_document_ids: Array.from(sourceDocIds),
      source_document_names: Array.from(sourceDocNames),
      connected_lines: st.line_number ? [st.line_number] : [],
      connected_streams: [streamTag],
      connected_equipment: [st.source_equipment_tag, st.destination_equipment_tag].filter(Boolean),
      assigned_chemicals: Array.from(assignedChems),
      operating_conditions: Object.keys(opConditions).length > 0 ? opConditions : undefined,
      stream_table_data: streamTableData || {
        stream_number: streamTag,
        flow_rates: st.flow_rates,
        phase: st.phase,
      },
      has_conflicts: matchingDiscrepancies.length > 0,
      conflict_ids: matchingDiscrepancies.map((d) => d.id),
      last_updated: new Date().toISOString(),
    });
  }

  // Persist all matrix entries to store
  store.upsertEngineeringMatrixEntries(matrixEntries);

  return matrixEntries;
}

/**
 * Returns the unified cross-document context for a specific equipment tag.
 */
export function getUnifiedEquipmentContext(
  projectId: string,
  equipmentTag: string,
  store: PsiDataStore
): UnifiedEngineeringMatrixEntry | undefined {
  const existing = store.getEngineeringMatrixEntry(projectId, 'equipment', equipmentTag);
  if (existing) return existing;

  // If not yet built, build matrix and look up
  const matrix = buildUnifiedEngineeringMatrix(projectId, store);
  return matrix.find(
    (m) =>
      m.entity_type === 'equipment' &&
      m.entity_tag.toLowerCase() === equipmentTag.toLowerCase()
  );
}

/**
 * Helper to construct a typed UnifiedProvenanceValue
 */
function createProvenanceValue<T>(
  originalValue: string | number | null,
  normalizedValue: T | null,
  unit: string | null = null,
  docId: string,
  docName: string,
  category: DocumentCategory,
  location: string,
  confidence = 0.9,
  verificationStatus: 'unverified' | 'engineer_verified' = 'unverified'
): UnifiedProvenanceValue<T> {
  return {
    id: uuidv4(),
    original_value: originalValue,
    normalized_value: normalizedValue,
    original_unit: unit,
    normalized_unit: unit,
    source_document_id: docId,
    source_document_name: docName,
    source_category: category,
    page_or_drawing_location: location,
    extraction_confidence: confidence,
    verification_status: verificationStatus,
    extraction_timestamp: new Date().toISOString(),
  };
}
