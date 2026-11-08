import { v4 as uuidv4 } from 'uuid';
import {
  DocumentCategory,
  EquipmentTag,
  EquipmentType,
  PipingLine,
  ProcessBlock,
  MajorUnitOperation,
  PfdStreamLink,
  PfdExtractionResult,
  ProcessStream,
  StreamPhase,
  UnifiedProvenanceValue,
  createDefaultSpecifications,
  createEmptySpecProperty,
  createEmptyProcessStream,
} from '../types';
import { ExtractedDocumentContent } from './pdfExtractor';

// --- PROVENANCE HELPER ---

function createProvenance<T>(
  originalValue: string | number | null,
  normalizedValue: T | null,
  unit: string | null,
  docId: string,
  docName: string,
  category: DocumentCategory,
  location: string,
  confidence = 0.9,
  notes?: string
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
    verification_status: 'unverified',
    extraction_timestamp: new Date().toISOString(),
    notes,
  };
}

function emptyProvenance<T>(
  docId: string,
  docName: string,
  category: DocumentCategory
): UnifiedProvenanceValue<T> {
  return createProvenance<T>(null, null, null, docId, docName, category, 'Not Provided', 0.0);
}

// Equipment detection patterns for major unit operations on PFDs
const MAJOR_UNIT_PATTERNS: { type: EquipmentType; regex: RegExp; desc: string }[] = [
  { type: 'vessel', regex: /\b(PG-\d{3,4}|V-\d{3,4}|D-\d{3,4}|SEP-\d{3,4})\b/g, desc: 'Separator / Vessel' },
  { type: 'column', regex: /\b(T-\d{3,4}|C-\d{3,4})\b/g, desc: 'Fractionator / Contactor Column' },
  { type: 'compressor', regex: /\b(K-\d{3,4}|CMP-\d{3,4})\b/g, desc: 'Process Gas Compressor' },
  { type: 'pump', regex: /\b(P-\d{3,4}[A-Z]?)\b/g, desc: 'Process Pump' },
  { type: 'heat_exchanger', regex: /\b(E-\d{3,4}[A-Z]?|AC-\d{3,4}|HEX-\d{3,4})\b/g, desc: 'Heat Exchanger / Cooler' },
  { type: 'reactor', regex: /\b(R-\d{3,4}|F-\d{3,4})\b/g, desc: 'Reactor / Process Furnace' },
  { type: 'tank', regex: /\b(TK-\d{3,4})\b/g, desc: 'Storage Tank' },
  { type: 'separator', regex: /\b(SLUG\s+CATCHER|PIG\s+RECEIVER)\b/gi, desc: 'Inlet Slug Catcher' },
];

// Block patterns for BFD extraction
const BLOCK_PATTERNS: { name: string; type: ProcessBlock['block_type']; regex: RegExp }[] = [
  { name: 'Inlet Reception & Slug Catching', type: 'battery_limit', regex: /inlet\s*(?:reception|separation|manifold|slug\s*catcher)/i },
  { name: 'Acid Gas Removal Unit (AGRU)', type: 'process_unit', regex: /(?:acid\s*gas\s*removal|agru|amine\s*(?:unit|contactor|treating))/i },
  { name: 'Gas Dehydration Unit (TEG)', type: 'process_unit', regex: /(?:gas\s*dehydration|teg|glycol\s*(?:unit|dehydration)|molecular\s*sieve)/i },
  { name: 'Mercury Removal Unit (MRU)', type: 'treatment', regex: /(?:mercury\s*removal|mru)/i },
  { name: 'NGL Recovery & Fractionation', type: 'process_unit', regex: /(?:ngl\s*(?:recovery|extraction|fractionation)|turboexpander|lpg)/i },
  { name: 'Sales Gas Compression & Export', type: 'battery_limit', regex: /(?:sales\s*gas\s*(?:compression|export)|export\s*gas\s*compression)/i },
  { name: 'Produced Water Treatment', type: 'treatment', regex: /(?:produced\s*water(?:\s*treatment|\s*handling)?|water\s*skimmer|de-oiling)/i },
  { name: 'Condensate Stabilization', type: 'process_unit', regex: /(?:condensate\s*stabiliz(?:ation|er)|stabilizer\s*column)/i },
  { name: 'Sulfur Recovery Unit (SRU)', type: 'treatment', regex: /(?:sulfur\s*recovery|sru|claus\s*unit)/i },
  { name: 'Flare & Vent Relief System', type: 'emission', regex: /(?:flare\s*(?:and|&)?\s*vent|relief\s*system|sour\s*flare)/i },
  { name: 'Utility & Chemical Injection', type: 'utility', regex: /(?:utility|fuel\s*gas|nitrogen|chemical\s*injection|cooling\s*water)/i },
];

/**
 * Normalizes pressure value from text snippet
 */
function extractPressure(text: string): { val: number; unit: string } | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(barg|psig|bar|kpa|mpa|psi|atm)\b/i);
  if (m) {
    return { val: parseFloat(m[1]), unit: m[2].toLowerCase() };
  }
  return null;
}

/**
 * Normalizes temperature value from text snippet
 */
function extractTemperature(text: string): { val: number; unit: string } | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:°|deg(?:\s*c)?|deg\s*f)?\s*(c|f|k)\b/i) ||
            text.match(/(\d+(?:\.\d+)?)\s*(?:°C|°F|degC|degF|deg\s*C|deg\s*F)/i);
  if (m) {
    const unit = m[2] ? m[2].toLowerCase() : (m[0].toLowerCase().includes('f') ? 'f' : 'c');
    return { val: parseFloat(m[1]), unit: unit === 'f' ? '°F' : '°C' };
  }
  return null;
}

/**
 * Normalizes flow rate value from text snippet
 */
function extractFlowRate(text: string): { val: number; unit: string; basis: 'mass' | 'volumetric' } | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(mmscfd|sm3\/h|sm3\/d|kg\/h|kg\/s|t\/d|t\/h|lb\/h|gpm|m3\/h)\b/i);
  if (m) {
    const unit = m[2].toLowerCase();
    const basis = ['kg/h', 'kg/s', 't/d', 't/h', 'lb/h'].includes(unit) ? 'mass' : 'volumetric';
    return { val: parseFloat(m[1]), unit: m[2], basis };
  }
  return null;
}

/**
 * Detects phase from text snippet
 */
function extractPhase(text: string): StreamPhase | null {
  const lower = text.toLowerCase();
  if (lower.includes('multiphase') || lower.includes('two-phase') || lower.includes('2-phase') || lower.includes('mixed')) return 'multiphase';
  if (lower.includes('vapor') || lower.includes('vapour')) return 'vapor';
  if (lower.includes('liquid') || lower.includes('condensate') || lower.includes('water') || lower.includes('aqueous') || lower.includes('amine')) return 'liquid';
  if (lower.includes('gas') || lower.includes('methane') || lower.includes('acid gas')) return 'gas';
  return null;
}

/**
 * Master PFD and BFD Document Extraction Processor
 * 
 * Strict Engineering Principles:
 * 1. Independent extraction tailored specifically for PFD & BFD logic.
 * 2. Never fabricate fine instrument loops, control logic, or bypass valves not present on PFD/BFD drawings.
 * 3. Preserve provenance with document citations, page numbers, and extraction confidence.
 * 4. Correlate PFD stream numbers with existing P&ID line numbers where evidence exists.
 */
export function parsePfdOrBfdDocument(
  extracted: ExtractedDocumentContent,
  documentId: string,
  documentName: string,
  projectId: string,
  category: 'pfd' | 'bfd',
  existingLines: PipingLine[] = [],
  existingEquipment: EquipmentTag[] = []
): {
  extraction: PfdExtractionResult;
  equipment: EquipmentTag[];
  streams: ProcessStream[];
} {
  const text = extracted.text || '';
  const warnings: string[] = [];

  const blocks: ProcessBlock[] = [];
  const majorUnits: MajorUnitOperation[] = [];
  const streamLinks: PfdStreamLink[] = [];
  const batteryLimits: { name: string; type: 'inlet' | 'outlet' | 'tie_in'; stream_numbers: string[] }[] = [];

  const generatedEquipment: EquipmentTag[] = [];
  const generatedStreams: ProcessStream[] = [];

  const seenUnitTags = new Set<string>();
  const seenStreamNumbers = new Set<string>();
  const seenBlockNames = new Set<string>();

  // =========================================================================
  // 1. EXTRACT PROCESS BLOCKS (BFD Focus, but also identifies PFD battery limits)
  // =========================================================================
  let blockSequence = 1;

  for (const bp of BLOCK_PATTERNS) {
    if (bp.regex.test(text)) {
      if (!seenBlockNames.has(bp.name)) {
        seenBlockNames.add(bp.name);
        const blockId = uuidv4();
        blocks.push({
          id: blockId,
          project_id: projectId,
          document_id: documentId,
          block_name: bp.name,
          block_type: bp.type,
          description: `Extracted facility process block from ${category.toUpperCase()}: ${bp.name}`,
          sequence_order: blockSequence++,
          inlet_streams: [],
          outlet_streams: [],
          battery_limit_type: bp.type === 'battery_limit' ? (bp.name.includes('Inlet') ? 'inlet' : 'outlet') : 'internal',
          operating_summary: null,
          confidence: 0.88,
        });
      }
    }
  }

  // Also search for numbered blocks e.g. "BLOCK 10: Slug Catching", "UNIT 100: Sweetening"
  const numberedBlockRegex = /\b(?:BLOCK|UNIT|AREA|SECTION)\s*([0-9A-Z]+)\s*[:\-–]\s*([A-Za-z0-9\s/&]+)/gi;
  let blockMatch;
  while ((blockMatch = numberedBlockRegex.exec(text)) !== null) {
    const rawName = blockMatch[2].trim().split('\n')[0].trim();
    if (rawName.length > 3 && rawName.length < 50 && !seenBlockNames.has(rawName)) {
      seenBlockNames.add(rawName);
      blocks.push({
        id: uuidv4(),
        project_id: projectId,
        document_id: documentId,
        block_name: `Unit ${blockMatch[1]}: ${rawName}`,
        block_type: 'process_unit',
        description: `Numbered block ${blockMatch[1]} identified in ${category.toUpperCase()}`,
        sequence_order: blockSequence++,
        inlet_streams: [],
        outlet_streams: [],
        battery_limit_type: 'internal',
        operating_summary: null,
        confidence: 0.85,
      });
    }
  }

  // Battery Limits Detection (ISBL / OSBL)
  const isblMatch = text.match(/\b(ISBL|INSIDE\s+BATTERY\s+LIMITS?)\b/i);
  const osblMatch = text.match(/\b(OSBL|OUTSIDE\s+BATTERY\s+LIMITS?)\b/i);
  const tieInMatch = text.match(/\b(TIE[\s\-]IN|BATTERY\s+LIMIT)\b/i);

  if (isblMatch) {
    batteryLimits.push({ name: 'ISBL (Inside Battery Limits)', type: 'inlet', stream_numbers: [] });
  }
  if (osblMatch) {
    batteryLimits.push({ name: 'OSBL (Outside Battery Limits)', type: 'outlet', stream_numbers: [] });
  }
  if (tieInMatch && !isblMatch && !osblMatch) {
    batteryLimits.push({ name: 'Battery Limit Tie-In Point', type: 'tie_in', stream_numbers: [] });
  }

  // =========================================================================
  // 2. EXTRACT MAJOR UNIT OPERATIONS (PFD Focus)
  // =========================================================================
  for (const { type, regex, desc } of MAJOR_UNIT_PATTERNS) {
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
      let tagStr = match[1] ? match[1].toUpperCase() : match[0].toUpperCase();

      // Normalize tag aliases
      if (tagStr.includes('SLUG CATCHER') || tagStr.includes('PIG RECEIVER')) {
        tagStr = 'PG-1001';
      }
      if (tagStr === 'PG-101') tagStr = 'PG-1001';

      if (seenUnitTags.has(tagStr)) continue;
      seenUnitTags.add(tagStr);

      const lineStart = Math.max(0, text.lastIndexOf('\n', match.index));
      const endIdx = Math.min(text.length, match.index + match[0].length + 180);
      const surrounding = text.substring(lineStart, endIdx);

      // Extract operating conditions specifically in the operating line or vicinity before design conditions
      let opPText = surrounding;
      let opTText = surrounding;
      const opCondMatch = surrounding.match(/operating(?:\s*conditions?)?[:\s]+([^\n\r,;]+(?:@[^\n\r,;]+)?)/i);
      if (opCondMatch) {
        opPText = opCondMatch[1];
        opTText = opCondMatch[1];
      }

      const pMatch = extractPressure(opPText);
      const tMatch = extractTemperature(opTText);

      const opP = pMatch
        ? createProvenance<number>(`${pMatch.val} ${pMatch.unit}`, pMatch.val, pMatch.unit, documentId, documentName, category, `Near tag ${tagStr}`, 0.92)
        : emptyProvenance<number>(documentId, documentName, category);

      const opT = tMatch
        ? createProvenance<number>(`${tMatch.val} ${tMatch.unit}`, tMatch.val, tMatch.unit, documentId, documentName, category, `Near tag ${tagStr}`, 0.92)
        : emptyProvenance<number>(documentId, documentName, category);

      // Check for design conditions (e.g. "DESIGN: 95 BARG / 120 C")
      let desP = emptyProvenance<number>(documentId, documentName, category);
      let desT = emptyProvenance<number>(documentId, documentName, category);
      const desMatch = surrounding.match(/design(?:\s*conditions?)?[:\s]+([^\n\r,;]+)/i);
      if (desMatch) {
        const dp = extractPressure(desMatch[1]);
        if (dp) {
          desP = createProvenance<number>(`${dp.val} ${dp.unit}`, dp.val, dp.unit, documentId, documentName, category, `Design condition near ${tagStr}`, 0.95);
        }
        const dt = extractTemperature(desMatch[1]);
        if (dt) {
          desT = createProvenance<number>(`${dt.val} ${dt.unit}`, dt.val, dt.unit, documentId, documentName, category, `Design condition near ${tagStr}`, 0.95);
        }
      }

      // Check capacity/duty
      let capacityDuty: UnifiedProvenanceValue<number | string> | undefined = undefined;
      const dutyMatch = surrounding.match(/(\d+(?:\.\d+)?)\s*(MW|kW|MMscfd|m3\/h|gpm|kg\/h|ID\s*x\s*\d+\s*LG)/i);
      if (dutyMatch) {
        capacityDuty = createProvenance<number | string>(
          dutyMatch[0],
          parseFloat(dutyMatch[1]) || dutyMatch[0],
          dutyMatch[2],
          documentId,
          documentName,
          category,
          `Capacity/Duty callout near ${tagStr}`,
          0.90
        );
      }

      const majorUnit: MajorUnitOperation = {
        id: uuidv4(),
        project_id: projectId,
        document_id: documentId,
        tag: tagStr,
        name: `${desc} (${tagStr})`,
        equipment_type: type,
        operating_pressure: opP,
        operating_temperature: opT,
        design_pressure: desP,
        design_temperature: desT,
        capacity_or_duty: capacityDuty,
        inlet_stream_numbers: [],
        outlet_stream_numbers: [],
        confidence: 0.90,
      };
      majorUnits.push(majorUnit);

      // Create EquipmentTag for SafeFlow AI Unified Equipment Database
      // CRITICAL PRINCIPLE: Missing instrumentation or piping must remain not_provided / null. Never fabricate!
      const specs = createDefaultSpecifications(type);
      if (opP.normalized_value !== null) {
        specs.operating_pressure = {
          ...createEmptySpecProperty<number>(),
          value: opP.normalized_value,
          unit: opP.normalized_unit,
          status: 'extracted',
          source_document_id: documentId,
          source_document_name: documentName,
          original_extracted_text: opP.original_value ? String(opP.original_value) : null,
          extraction_confidence: opP.extraction_confidence,
        };
      }
      if (opT.normalized_value !== null) {
        specs.operating_temperature = {
          ...createEmptySpecProperty<number>(),
          value: opT.normalized_value,
          unit: opT.normalized_unit,
          status: 'extracted',
          source_document_id: documentId,
          source_document_name: documentName,
          original_extracted_text: opT.original_value ? String(opT.original_value) : null,
          extraction_confidence: opT.extraction_confidence,
        };
      }
      if (desP.normalized_value !== null) {
        specs.design_pressure = {
          ...createEmptySpecProperty<number>(),
          value: desP.normalized_value,
          unit: desP.normalized_unit,
          status: 'extracted',
          source_document_id: documentId,
          source_document_name: documentName,
          original_extracted_text: desP.original_value ? String(desP.original_value) : null,
          extraction_confidence: desP.extraction_confidence,
        };
      }
      if (desT.normalized_value !== null) {
        specs.design_temperature = {
          ...createEmptySpecProperty<number>(),
          value: desT.normalized_value,
          unit: desT.normalized_unit,
          status: 'extracted',
          source_document_id: documentId,
          source_document_name: documentName,
          original_extracted_text: desT.original_value ? String(desT.original_value) : null,
          extraction_confidence: desT.extraction_confidence,
        };
      }

      generatedEquipment.push({
        id: uuidv4(),
        project_id: projectId,
        document_id: documentId,
        tag: tagStr,
        description: `${desc} (${category.toUpperCase()})`,
        equipment_type: type,
        assigned_chemical_id: null,
        confidence: 0.90,
        status: 'machine_extracted',
        source: {
          document: documentName,
          page: 1,
          snippet: surrounding.trim().substring(0, 200),
        },
        specifications: specs,
        created_at: new Date().toISOString(),
      });
    }
  }

  // =========================================================================
  // 3. EXTRACT PRIMARY PROCESS STREAMS & STREAM LINKS
  // =========================================================================
  // Stream patterns: "Stream 1", "STR-101", "Stream 101: Feed Gas", "Stream No: 1", stream tables
  const streamRegex = /(?:stream\s*(?:no\.?|number|#)?\s*([A-Za-z0-9\-]+)|STR-([0-9]{2,4}))(?:\s*[:\-–]\s*([^\n\r,;]+))?/gi;
  let streamMatch;

  while ((streamMatch = streamRegex.exec(text)) !== null) {
    const rawNum = (streamMatch[1] || streamMatch[2] || '').trim();
    const streamNum = rawNum.startsWith('STR-') ? rawNum : `STR-${rawNum}`;
    const streamDesc = streamMatch[3] ? streamMatch[3].trim() : undefined;

    if (!rawNum || seenStreamNumbers.has(streamNum)) continue;
    seenStreamNumbers.add(streamNum);

    const lineStart = Math.max(0, text.lastIndexOf('\n', streamMatch.index));
    const nextLineBreak = text.indexOf('\n', streamMatch.index + streamMatch[0].length);
    const endIdx = nextLineBreak > 0 ? Math.min(text.length, nextLineBreak + 1) : Math.min(text.length, streamMatch.index + 200);
    const surrounding = text.substring(lineStart, endIdx);

    const pMatch = extractPressure(surrounding);
    const tMatch = extractTemperature(surrounding);
    const fMatch = extractFlowRate(surrounding);
    const phase = extractPhase(surrounding);

    const opP = pMatch
      ? createProvenance<number>(`${pMatch.val} ${pMatch.unit}`, pMatch.val, pMatch.unit, documentId, documentName, category, `Stream ${streamNum} callout`, 0.90)
      : emptyProvenance<number>(documentId, documentName, category);

    const opT = tMatch
      ? createProvenance<number>(`${tMatch.val} ${tMatch.unit}`, tMatch.val, tMatch.unit, documentId, documentName, category, `Stream ${streamNum} callout`, 0.90)
      : emptyProvenance<number>(documentId, documentName, category);

    const massRate = fMatch && fMatch.basis === 'mass'
      ? createProvenance<number>(`${fMatch.val} ${fMatch.unit}`, fMatch.val, fMatch.unit, documentId, documentName, category, `Stream ${streamNum} flow`, 0.88)
      : undefined;

    const volRate = fMatch && fMatch.basis === 'volumetric'
      ? createProvenance<number>(`${fMatch.val} ${fMatch.unit}`, fMatch.val, fMatch.unit, documentId, documentName, category, `Stream ${streamNum} flow`, 0.88)
      : undefined;

    // Determine Source & Destination equipment endpoints from surrounding text
    let sourceTag: string | null = null;
    let destTag: string | null = null;

    // Check for "from X to Y" patterns
    const fromToMatch = surrounding.match(/from\s+([A-Za-z0-9\-_]+(?:\s+[A-Za-z0-9\-_]+)?)\s+to\s+([A-Za-z0-9\-_]+(?:\s+[A-Za-z0-9\-_]+)?)/i);
    if (fromToMatch) {
      sourceTag = fromToMatch[1].trim();
      destTag = fromToMatch[2].trim();
    } else {
      // Check which major units are mentioned in the vicinity
      const nearbyUnits = majorUnits.filter((u) => surrounding.toUpperCase().includes(u.tag));
      if (nearbyUnits.length === 1) {
        // If stream is before unit mention, it's likely inlet; if after, outlet
        if (surrounding.indexOf(nearbyUnits[0].tag) > surrounding.indexOf(streamNum)) {
          destTag = nearbyUnits[0].tag;
        } else {
          sourceTag = nearbyUnits[0].tag;
        }
      } else if (nearbyUnits.length >= 2) {
        sourceTag = nearbyUnits[0].tag;
        destTag = nearbyUnits[1].tag;
      }
    }

    // Correlate with P&ID line numbers where available
    let correlatedLine: string | null = null;
    let correlationConfidence: number | null = null;

    // Check explicit line mention in text
    const lineMention = surrounding.match(/\b(\d{1,2}"\-[A-Z0-9\-_]+)\b/);
    if (lineMention) {
      correlatedLine = lineMention[1];
      correlationConfidence = 0.95;
    } else if (existingLines.length > 0) {
      // Correlate by endpoints and service code
      const matchingLine = existingLines.find((line) => {
        const fromMatches = sourceTag && line.from_equipment?.toUpperCase().includes(sourceTag.toUpperCase());
        const toMatches = destTag && line.to_equipment?.toUpperCase().includes(destTag.toUpperCase());
        return fromMatches || toMatches;
      });
      if (matchingLine) {
        correlatedLine = matchingLine.line_number;
        correlationConfidence = 0.75;
      }
    }

    const streamLink: PfdStreamLink = {
      id: uuidv4(),
      project_id: projectId,
      document_id: documentId,
      stream_number: streamNum,
      stream_name: streamDesc || `Stream ${streamNum}`,
      source_tag: sourceTag,
      destination_tag: destTag,
      operating_temperature: opT,
      operating_pressure: opP,
      mass_flow_rate: massRate,
      volumetric_flow_rate: volRate,
      phase,
      correlated_pid_line_number: correlatedLine,
      correlation_confidence: correlationConfidence,
      confidence: 0.88,
    };
    streamLinks.push(streamLink);

    // Create ProcessStream object for SafeFlow AI Unified Stream Database
    // NON-FABRICATION RULE: associated_instrument_tags is explicitly empty [] because PFD does not show instrumentation!
    const emptyStream = createEmptyProcessStream(projectId, streamNum, sourceTag || 'UNASSIGNED', destTag || 'UNASSIGNED');
    const procStream: ProcessStream = {
      ...emptyStream,
      id: uuidv4(),
      project_id: projectId,
      stream_number: streamNum,
      source_equipment_tag: sourceTag || 'UNASSIGNED',
      destination_equipment_tag: destTag || 'UNASSIGNED',
      line_number: correlatedLine,
      material_description: streamDesc || `${category.toUpperCase()} Primary Process Stream ${streamNum}`,
      phase: phase || null,
      flow_direction: 'forward',
      associated_instrument_tags: [], // Non-fabrication guarantee
      data_origin: 'document_extracted',
      verification_status: 'unverified',
      source: {
        document: documentName,
        document_id: documentId,
        page: 1,
        snippet: surrounding.trim().substring(0, 200),
      },
    };

    if (opP.normalized_value !== null) {
      procStream.operating_pressure = {
        value: opP.normalized_value,
        unit: opP.normalized_unit || null,
        status: 'extracted',
      };
    }
    if (opT.normalized_value !== null) {
      procStream.operating_temperature = {
        value: opT.normalized_value,
        unit: opT.normalized_unit || null,
        status: 'extracted',
      };
    }
    if (fMatch) {
      procStream.flow_rates = {
        normal: fMatch.val,
        min: null,
        max: null,
        design: fMatch.val,
        actual: null,
        unit: fMatch.unit,
        basis: fMatch.basis,
      };
    }

    generatedStreams.push(procStream);
  }

  // If no numbered streams were extracted with the regex, parse potential stream callout sequences e.g. [1], [2], [3]
  if (streamLinks.length === 0) {
    const flagRegex = /(?:\[|\(|\bstream\s+)(\d{1,2})(?:\]|\)|\b)/gi;
    let flagMatch;
    while ((flagMatch = flagRegex.exec(text)) !== null) {
      const num = flagMatch[1];
      const sNum = `STR-${num.padStart(2, '0')}`;
      if (seenStreamNumbers.has(sNum)) continue;
      seenStreamNumbers.add(sNum);

      streamLinks.push({
        id: uuidv4(),
        project_id: projectId,
        document_id: documentId,
        stream_number: sNum,
        stream_name: `Process Stream ${sNum}`,
        source_tag: null,
        destination_tag: null,
        operating_temperature: emptyProvenance(documentId, documentName, category),
        operating_pressure: emptyProvenance(documentId, documentName, category),
        confidence: 0.70,
      });
    }
  }

  // Update inlet and outlet references in Major Units and Blocks
  for (const s of streamLinks) {
    if (s.source_tag) {
      const unit = majorUnits.find((u) => u.tag === s.source_tag);
      if (unit && !unit.outlet_stream_numbers.includes(s.stream_number)) {
        unit.outlet_stream_numbers.push(s.stream_number);
      }
    }
    if (s.destination_tag) {
      const unit = majorUnits.find((u) => u.tag === s.destination_tag);
      if (unit && !unit.inlet_stream_numbers.includes(s.stream_number)) {
        unit.inlet_stream_numbers.push(s.stream_number);
      }
    }
  }

  if (category === 'pfd' && majorUnits.length === 0) {
    warnings.push('No major unit operation tags were recognized on this PFD diagram text.');
  }
  if (category === 'bfd' && blocks.length === 0) {
    warnings.push('No standard process block boundaries were recognized on this BFD diagram text.');
  }

  const extractionResult: PfdExtractionResult = {
    id: uuidv4(),
    project_id: projectId,
    document_id: documentId,
    document_name: documentName,
    category,
    blocks,
    major_units: majorUnits,
    stream_links: streamLinks,
    battery_limits: batteryLimits,
    extraction_warnings: warnings,
    extracted_at: new Date().toISOString(),
  };

  return {
    extraction: extractionResult,
    equipment: generatedEquipment,
    streams: generatedStreams,
  };
}
