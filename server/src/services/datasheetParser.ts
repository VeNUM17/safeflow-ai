import { v4 as uuidv4 } from 'uuid';
import {
  DocumentCategory,
  EquipmentTag,
  EquipmentType,
  DatasheetExtractionResult,
  ExtractedDatasheetRecord,
  NozzleScheduleItem,
  UnifiedProvenanceValue,
  createDefaultSpecifications,
  createEmptySpecProperty,
} from '../types';
import { ExtractedDocumentContent } from './pdfExtractor';

// --- PROVENANCE HELPER ---

function createProvenance<T>(
  originalValue: string | number | null,
  normalizedValue: T | null,
  unit: string | null,
  docId: string,
  docName: string,
  location: string,
  confidence = 0.95,
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
    source_category: 'equipment_datasheet',
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
  location = 'Not Provided'
): UnifiedProvenanceValue<T> {
  return createProvenance<T>(null, null, null, docId, docName, location, 0.0);
}

// Equipment patterns on datasheets
const DATASHEET_TAG_PATTERNS: { type: EquipmentType; regex: RegExp; desc: string }[] = [
  { type: 'vessel', regex: /\b(PG-\d{3,4}|V-\d{3,4}|D-\d{3,4}|SEP-\d{3,4})\b/g, desc: 'Pressure Vessel / Separator' },
  { type: 'column', regex: /\b(T-\d{3,4}|C-\d{3,4})\b/g, desc: 'Fractionator / Contactor Column' },
  { type: 'compressor', regex: /\b(K-\d{3,4}|CMP-\d{3,4})\b/g, desc: 'Process Gas Compressor' },
  { type: 'pump', regex: /\b(P-\d{3,4}[A-Z]?)\b/g, desc: 'Process Pump' },
  { type: 'heat_exchanger', regex: /\b(E-\d{3,4}[A-Z]?|AC-\d{3,4}|HEX-\d{3,4})\b/g, desc: 'Heat Exchanger / Cooler' },
  { type: 'reactor', regex: /\b(R-\d{3,4}|F-\d{3,4})\b/g, desc: 'Reactor / Furnace' },
  { type: 'tank', regex: /\b(TK-\d{3,4})\b/g, desc: 'Storage Tank' },
  { type: 'drain_valve', regex: /\b(PSV-\d{3,4}|PRV-\d{3,4})\b/g, desc: 'Pressure Safety Valve (PSV)' },
];

/**
 * Normalizes pressure value from text
 */
function extractPressure(text: string): { val: number; unit: string; raw: string } | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(barg|psig|bar|kpa|mpa|psi|atm)\b/i);
  if (m) {
    return { val: parseFloat(m[1]), unit: m[2].toLowerCase(), raw: m[0] };
  }
  return null;
}

/**
 * Normalizes temperature value from text
 */
function extractTemperature(text: string): { val: number; unit: string; raw: string } | null {
  const m = text.match(/([-+]?\d+(?:\.\d+)?)\s*(?:°|deg(?:\s*c)?|deg\s*f)?\s*(c|f|k)\b/i) ||
            text.match(/([-+]?\d+(?:\.\d+)?)\s*(?:°C|°F|degC|degF|deg\s*C|deg\s*F)/i);
  if (m) {
    const unit = m[2] ? m[2].toLowerCase() : (m[0].toLowerCase().includes('f') ? 'f' : 'c');
    return { val: parseFloat(m[1]), unit: unit === 'f' ? '°F' : '°C', raw: m[0] };
  }
  return null;
}

/**
 * Normalizes dimension / corrosion allowance
 */
function extractDimension(text: string): { val: number; unit: string; raw: string } | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(mm|in|inch|inches|m|ft)\b/i);
  if (m) {
    return { val: parseFloat(m[1]), unit: m[2].toLowerCase(), raw: m[0] };
  }
  return null;
}

/**
 * Extracts Nozzle Schedule from datasheet text or table rows
 */
function extractNozzleSchedule(text: string): NozzleScheduleItem[] {
  const nozzles: NozzleScheduleItem[] = [];
  const seenNozzles = new Set<string>();

  // Patterns like:
  // N1: 10" Inlet (600# RF)
  // N1 | 10" | Inlet | 600# RF
  // N2 - Gas Outlet, 10 inch, 600#
  const nozzleRegex = /\b(N[0-9]{1,2}|M[0-9]{1,2})\b\s*[:|\-–]\s*([^\n\r;]+)/gi;
  let match;

  while ((match = nozzleRegex.exec(text)) !== null) {
    const tag = match[1].toUpperCase();
    if (seenNozzles.has(tag)) continue;
    seenNozzles.add(tag);

    const descStr = match[2].trim();
    const sizeMatch = descStr.match(/(\d+(?:\.\d+)?(?:\/\d+)?)\s*(?:"|in\b|inch\b|mm\b)/i);
    const ratingMatch = descStr.match(/([0-9]{3,4}\s*#\s*(?:RF|RTJ|FF)?)/i);

    // Filter service text
    let service = descStr
      .replace(sizeMatch ? sizeMatch[0] : '', '')
      .replace(ratingMatch ? ratingMatch[0] : '', '')
      .replace(/[,|()]/g, ' ')
      .trim();

    if (!service) service = 'Process Nozzle';

    nozzles.push({
      nozzle_tag: tag,
      service,
      nominal_size: sizeMatch ? (sizeMatch[0].includes('"') ? sizeMatch[0] : `${sizeMatch[1]}"`) : 'Unspecified',
      flange_rating: ratingMatch ? ratingMatch[1].trim() : null,
      flange_facing: ratingMatch && ratingMatch[1].includes('RTJ') ? 'RTJ' : (ratingMatch && ratingMatch[1].includes('FF') ? 'FF' : 'RF'),
    });
  }

  // Also check tabular lines with "N1", "N2", "N3"
  if (nozzles.length === 0) {
    const lineTableRegex = /\b(N[1-9]|N[1-9][0-9])\s+([0-9]+(?:\.[0-9]+)?")\s+([A-Za-z0-9\s/]+?)(?:\s+([0-9]+#(?:\s*[A-Z]+)?))?(?:\r?\n|$)/gi;
    let tm;
    while ((tm = lineTableRegex.exec(text)) !== null) {
      const tag = tm[1].toUpperCase();
      if (seenNozzles.has(tag)) continue;
      seenNozzles.add(tag);

      nozzles.push({
        nozzle_tag: tag,
        nominal_size: tm[2].trim(),
        service: tm[3].trim(),
        flange_rating: tm[4] ? tm[4].trim() : null,
        flange_facing: tm[4] && tm[4].includes('RTJ') ? 'RTJ' : 'RF',
      });
    }
  }

  return nozzles;
}

/**
 * Master Equipment Datasheet Extraction Processor
 */
export function parseDatasheetDocument(
  content: ExtractedDocumentContent,
  documentId: string,
  documentName: string,
  projectId: string,
  existingEquipment: EquipmentTag[] = []
): {
  extraction: DatasheetExtractionResult;
  equipment: EquipmentTag[];
} {
  const text = content.text || '';
  const warnings: string[] = [];
  const extractedDatasheets: ExtractedDatasheetRecord[] = [];
  const updatedEquipmentList: EquipmentTag[] = [];

  const seenTags = new Set<string>();

  // 1. Identify Equipment Tag(s) in the Datasheet
  for (const { type, regex, desc } of DATASHEET_TAG_PATTERNS) {
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
      let tagStr = match[1] ? match[1].toUpperCase() : match[0].toUpperCase();
      if (tagStr === 'PG-101') tagStr = 'PG-1001';

      if (seenTags.has(tagStr)) continue;

      // Check if document has an explicit primary TAG / TAG NUMBER header
      const explicitTagMatch = text.match(/(?:TAG\s*(?:NO\.?|NUMBER)?|EQUIPMENT\s*TAG)[:\s]+([A-Za-z0-9\-]+)/i);
      if (explicitTagMatch) {
        const primaryTag = explicitTagMatch[1].toUpperCase();
        // If this tag is NOT the primary tag and only appears in service/protection description, skip it
        const isAncillary = new RegExp(`(?:service|protection|inlet|outlet|connected|upstream|downstream)[^\\n\\r]*\\b${tagStr}\\b`, 'i').test(text) &&
                            !new RegExp(`(?:tag|equipment|item|unit)\\s*(?:no\\.?|number)?[:\\s]+\\b${tagStr}\\b`, 'i').test(text);
        if (primaryTag !== tagStr && isAncillary) {
          continue;
        }
      }

      seenTags.add(tagStr);

      const lineStart = Math.max(0, text.lastIndexOf('\n', match.index));
      const endIdx = Math.min(text.length, match.index + 2000);
      const scopeText = text.substring(lineStart, endIdx);

      // --- Material of Construction (MOC) ---
      let mocVal: string | null = null;
      let mocRaw: string | null = null;
      const mocMatch = scopeText.match(/(?:material\s*(?:of\s*construction)?|moc|shell\s*material|body\s*material)[:\s]+([^\n\r,;]+)/i) ||
                       scopeText.match(/\b(SA-516\s*(?:Gr\.?\s*70)?|Carbon\s*Steel(?:\s*NACE(?:\s*MR0175)?)?|316L?\s*SS|Stainless\s*Steel|Inconel\s*625|Hastelloy|Duplex\s*SS|API\s*5L\s*Gr\.?\s*B|A106-?B)\b/i);
      if (mocMatch) {
        mocVal = mocMatch[1] ? mocMatch[1].trim() : mocMatch[0].trim();
        mocRaw = mocMatch[0].trim();
      }

      // --- Design Pressure ---
      let desP: { val: number; unit: string; raw: string } | null = null;
      const desPMatch = scopeText.match(/design\s*press(?:ure)?[:\s]+([^\n\r,;]+)/i);
      if (desPMatch) {
        desP = extractPressure(desPMatch[1]);
      } else {
        desP = extractPressure(scopeText);
      }

      // --- Design Temperature ---
      let desT: { val: number; unit: string; raw: string } | null = null;
      const desTMatch = scopeText.match(/design\s*temp(?:erature)?[:\s]+([^\n\r,;]+)/i);
      if (desTMatch) {
        desT = extractTemperature(desTMatch[1]);
      } else {
        desT = extractTemperature(scopeText);
      }

      // --- Operating Pressure ---
      let opP: { val: number; unit: string; raw: string } | null = null;
      const opPMatch = scopeText.match(/oper(?:ating)?\s*press(?:ure)?[:\s]+([^\n\r,;]+)/i);
      if (opPMatch) {
        opP = extractPressure(opPMatch[1]);
      }

      // --- Operating Temperature ---
      let opT: { val: number; unit: string; raw: string } | null = null;
      const opTMatch = scopeText.match(/oper(?:ating)?\s*temp(?:erature)?[:\s]+([^\n\r,;]+)/i);
      if (opTMatch) {
        opT = extractTemperature(opTMatch[1]);
      }

      // --- MAWP ---
      let mawp: { val: number; unit: string; raw: string } | null = null;
      const mawpMatch = scopeText.match(/(?:mawp|max(?:imum)?\s*allowable\s*working\s*press(?:ure)?)[:\s]+([^\n\r,;]+)/i);
      if (mawpMatch) {
        mawp = extractPressure(mawpMatch[1]);
      }

      // --- Test Pressure (Hydrotest) ---
      let testP: { val: number; unit: string; raw: string } | null = null;
      const testPMatch = scopeText.match(/(?:hydro(?:static)?\s*test\s*press(?:ure)?|test\s*press(?:ure)?)[:\s]+([^\n\r,;]+)/i);
      if (testPMatch) {
        testP = extractPressure(testPMatch[1]);
      }

      // --- Minimum Design Metal Temperature (MDMT) ---
      let mdmt: { val: number; unit: string; raw: string } | null = null;
      const mdmtMatch = scopeText.match(/(?:mdmt|min(?:imum)?\s*design\s*metal\s*temp(?:erature)?)[:\s]+([^\n\r,;]+)/i);
      if (mdmtMatch) {
        mdmt = extractTemperature(mdmtMatch[1]);
      }

      // --- Corrosion Allowance ---
      let caVal: { val: number; unit: string; raw: string } | null = null;
      const caMatch = scopeText.match(/(?:corrosion\s*allowance|c\.?a\.?)[:\s]+([^\n\r,;]+)/i);
      if (caMatch) {
        caVal = extractDimension(caMatch[1]);
      }

      // --- Design Code ---
      let codeVal: string | null = null;
      const codeMatch = scopeText.match(/\b(ASME\s*Section\s*VIII\s*(?:Div(?:ision)?\.?\s*[12])?|API\s*650|API\s*610|API\s*617|API\s*520|API\s*526|API\s*521|TEMA\s*(?:Class\s*)?[RCB]|BS\s*EN\s*13445)\b/i);
      if (codeMatch) {
        codeVal = codeMatch[0].trim();
      }

      // --- Relief Valve Set Pressure (for vessels or PSVs) ---
      let psvSetP: { val: number; unit: string; raw: string } | null = null;
      const psvMatch = scopeText.match(/(?:psv|prv|relief\s*valve|set\s*press(?:ure)?)[:\s]+([^\n\r,;]+)/i);
      if (psvMatch) {
        psvSetP = extractPressure(psvMatch[1]);
      }

      // --- Capacity / Dimensions ---
      let capacityVal: number | null = null;
      let capacityUnit = 'm3';
      const capMatch = scopeText.match(/(\d+(?:\.\d+)?)\s*(m3|l|liters|usg|gal|m3\/h|bbl)\b/i);
      if (capMatch) {
        capacityVal = parseFloat(capMatch[1]);
        capacityUnit = capMatch[2].toLowerCase();
      }

      // --- Nozzle Schedule ---
      const nozzles = extractNozzleSchedule(scopeText);

      const loc = `Datasheet Section for ${tagStr}`;

      const datasheetRecord: ExtractedDatasheetRecord = {
        id: uuidv4(),
        project_id: projectId,
        document_id: documentId,
        equipment_tag: tagStr,
        equipment_name: `${desc} (${tagStr})`,
        equipment_type: type,
        material_of_construction: mocVal
          ? createProvenance<string>(mocRaw || mocVal, mocVal, null, documentId, documentName, loc, 0.95)
          : emptyProvenance<string>(documentId, documentName, loc),
        design_pressure: desP
          ? createProvenance<number>(desP.raw, desP.val, desP.unit, documentId, documentName, loc, 0.95)
          : emptyProvenance<number>(documentId, documentName, loc),
        design_temperature: desT
          ? createProvenance<number>(desT.raw, desT.val, desT.unit, documentId, documentName, loc, 0.95)
          : emptyProvenance<number>(documentId, documentName, loc),
        min_design_metal_temp: mdmt
          ? createProvenance<number>(mdmt.raw, mdmt.val, mdmt.unit, documentId, documentName, loc, 0.92)
          : undefined,
        operating_pressure: opP
          ? createProvenance<number>(opP.raw, opP.val, opP.unit, documentId, documentName, loc, 0.92)
          : emptyProvenance<number>(documentId, documentName, loc),
        operating_temperature: opT
          ? createProvenance<number>(opT.raw, opT.val, opT.unit, documentId, documentName, loc, 0.92)
          : emptyProvenance<number>(documentId, documentName, loc),
        mawp: mawp
          ? createProvenance<number>(mawp.raw, mawp.val, mawp.unit, documentId, documentName, loc, 0.95)
          : undefined,
        test_pressure: testP
          ? createProvenance<number>(testP.raw, testP.val, testP.unit, documentId, documentName, loc, 0.95)
          : undefined,
        design_code: codeVal
          ? createProvenance<string>(codeVal, codeVal, null, documentId, documentName, loc, 0.95)
          : undefined,
        corrosion_allowance: caVal
          ? createProvenance<number>(caVal.raw, caVal.val, caVal.unit, documentId, documentName, loc, 0.95)
          : undefined,
        capacity_or_volume: capacityVal !== null
          ? createProvenance<number>(`${capacityVal} ${capacityUnit}`, capacityVal, capacityUnit, documentId, documentName, loc, 0.90)
          : undefined,
        relief_valve_set_pressure: psvSetP
          ? createProvenance<number>(psvSetP.raw, psvSetP.val, psvSetP.unit, documentId, documentName, loc, 0.95)
          : undefined,
        nozzles,
        confidence: 0.95,
        extracted_at: new Date().toISOString(),
      };

      extractedDatasheets.push(datasheetRecord);

      // Deep-merge or create authoritative EquipmentTag in SafeFlow AI Unified Equipment Database
      const existing = existingEquipment.find((e) => e.tag.toUpperCase() === tagStr.toUpperCase());
      const specs = existing ? { ...existing.specifications } : createDefaultSpecifications(type);

      if (mocVal) {
        specs.material_of_construction = {
          ...createEmptySpecProperty<string>(),
          value: mocVal,
          status: 'extracted',
          source_document_id: documentId,
          source_document_name: documentName,
          original_extracted_text: mocRaw || mocVal,
          extraction_confidence: 0.95,
        };
      }
      if (desP) {
        specs.design_pressure = {
          ...createEmptySpecProperty<number>(),
          value: desP.val,
          unit: desP.unit,
          status: 'extracted',
          source_document_id: documentId,
          source_document_name: documentName,
          original_extracted_text: desP.raw,
          extraction_confidence: 0.95,
        };
      }
      if (desT) {
        specs.design_temperature = {
          ...createEmptySpecProperty<number>(),
          value: desT.val,
          unit: desT.unit,
          status: 'extracted',
          source_document_id: documentId,
          source_document_name: documentName,
          original_extracted_text: desT.raw,
          extraction_confidence: 0.95,
        };
      }
      if (opP) {
        specs.operating_pressure = {
          ...createEmptySpecProperty<number>(),
          value: opP.val,
          unit: opP.unit,
          status: 'extracted',
          source_document_id: documentId,
          source_document_name: documentName,
          original_extracted_text: opP.raw,
          extraction_confidence: 0.92,
        };
      }
      if (opT) {
        specs.operating_temperature = {
          ...createEmptySpecProperty<number>(),
          value: opT.val,
          unit: opT.unit,
          status: 'extracted',
          source_document_id: documentId,
          source_document_name: documentName,
          original_extracted_text: opT.raw,
          extraction_confidence: 0.92,
        };
      }
      if (caVal) {
        specs.corrosion_allowance = {
          ...createEmptySpecProperty<number>(),
          value: caVal.val,
          unit: caVal.unit,
          status: 'extracted',
          source_document_id: documentId,
          source_document_name: documentName,
          original_extracted_text: caVal.raw,
          extraction_confidence: 0.95,
        };
      }
      if (codeVal) {
        specs.design_code = {
          ...createEmptySpecProperty<string>(),
          value: codeVal,
          status: 'extracted',
          source_document_id: documentId,
          source_document_name: documentName,
          original_extracted_text: codeVal,
          extraction_confidence: 0.95,
        };
      }
      if (psvSetP) {
        specs.relief_device_set_pressure = {
          ...createEmptySpecProperty<number>(),
          value: psvSetP.val,
          unit: psvSetP.unit,
          status: 'extracted',
          source_document_id: documentId,
          source_document_name: documentName,
          original_extracted_text: psvSetP.raw,
          extraction_confidence: 0.95,
        };
      }
      if (mawp) {
        specs.mawp = {
          ...createEmptySpecProperty<number>(),
          value: mawp.val,
          unit: mawp.unit,
          status: 'extracted',
          source_document_id: documentId,
          source_document_name: documentName,
          original_extracted_text: mawp.raw,
          extraction_confidence: 0.95,
        };
      }
      if (testP) {
        specs.test_pressure = {
          ...createEmptySpecProperty<number>(),
          value: testP.val,
          unit: testP.unit,
          status: 'extracted',
          source_document_id: documentId,
          source_document_name: documentName,
          original_extracted_text: testP.raw,
          extraction_confidence: 0.95,
        };
      }
      const eqRecord: EquipmentTag = existing
        ? {
            ...existing,
            specifications: specs,
            nozzle_schedule: nozzles.length > 0 ? nozzles : existing.nozzle_schedule,
            specifications_updated_at: new Date().toISOString(),
          }
        : {
            id: uuidv4(),
            project_id: projectId,
            document_id: documentId,
            tag: tagStr,
            description: `${desc} (Datasheet)`,
            equipment_type: type,
            assigned_chemical_id: null,
            confidence: 0.95,
            status: 'machine_extracted',
            source: {
              document: documentName,
              page: 1,
              snippet: scopeText.trim().substring(0, 250),
            },
            specifications: specs,
            nozzle_schedule: nozzles.length > 0 ? nozzles : undefined,
            created_at: new Date().toISOString(),
          };

      updatedEquipmentList.push(eqRecord);
    }
  }

  if (extractedDatasheets.length === 0) {
    warnings.push('No recognized equipment tags or mechanical specifications were identified in this datasheet text.');
  }

  const result: DatasheetExtractionResult = {
    id: uuidv4(),
    project_id: projectId,
    document_id: documentId,
    document_name: documentName,
    datasheets: extractedDatasheets,
    total_equipment_found: extractedDatasheets.length,
    extraction_warnings: warnings,
    extracted_at: new Date().toISOString(),
  };

  return {
    extraction: result,
    equipment: updatedEquipmentList,
  };
}
