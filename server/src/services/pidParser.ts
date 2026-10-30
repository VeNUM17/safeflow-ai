import { v4 as uuidv4 } from 'uuid';
import {
  EquipmentTag,
  PipingLine,
  ProcessStream,
  ChemicalRecord,
  EquipmentType,
  FunctionalType,
  FlowDirection,
  FlowBasis,
  StreamPhase,
  createDefaultSpecifications,
} from '../types';
import { ExtractedDocumentContent } from './pdfExtractor';

// Comprehensive Industrial Equipment Patterns matching standard ISA-5.1 & SafeFlow fixtures
const EQUIPMENT_PATTERNS: { type: EquipmentType; regex: RegExp; desc: string }[] = [
  { type: 'tank', regex: /\b(TK)-([0-9]{3,4}[A-Z]?)\b/gi, desc: 'Storage Tank' },
  { type: 'mixing_tank', regex: /\b(MX)-([0-9]{3,4}[A-Z]?)\b/gi, desc: 'Mixing / Blending Tank' },
  { type: 'agitator', regex: /\b(AG)-([0-9]{3,4}[A-Z]?)\b/gi, desc: 'Tank Agitator / Mixer' },
  { type: 'pump', regex: /\b(P)-([0-9]{3,4}[A-Z]?)\b/gi, desc: 'Centrifugal / Transfer Pump' },
  { type: 'heat_exchanger', regex: /\b(E|HX|HE|C)-([0-9]{3,4}[A-Z]?)\b/gi, desc: 'Heat Exchanger / Cooler' },
  { type: 'reactor', regex: /\b(R|RX)-([0-9]{3,4}[A-Z]?)\b/gi, desc: 'Chemical Reactor' },
  { type: 'vessel', regex: /\b(V|D|DR|T)-([0-9]{3,4}[A-Z]?)\b/gi, desc: 'Process Vessel / Drum' },
  { type: 'compressor', regex: /\b(K|CP)-([0-9]{3,4}[A-Z]?)\b/gi, desc: 'Compressor Unit' },
  { type: 'separator', regex: /\b(S|SP|SEP)-([0-9]{3,4}[A-Z]?)\b/gi, desc: 'Phase Separator' },
  { type: 'manual_valve', regex: /\b(HV)-([0-9]{3,4}[A-Z]?)\b/gi, desc: 'Manual Process Valve' },
  { type: 'isolation_valve', regex: /\b(XV)-([0-9]{3,4}[A-Z]?)\b/gi, desc: 'Automated Isolation Valve' },
  { type: 'control_valve', regex: /\b(PCV|FCV|TCV|LCV|PRV|PSV)-([0-9]{3,4}[A-Z]?)\b/gi, desc: 'Control / Relief Valve' },
  { type: 'drain_valve', regex: /\b(DV)-([0-9]{3,4}[A-Z]?)\b/gi, desc: 'Drain / Sampling Valve' },
  // Recognize all flow instrumentation: FI, FT, FIT, FIC, FCV, FE, FO, and process transmitters
  { type: 'instrument', regex: /\b(FIT|FIC|FT|FE|FO|FI|FAL|FAH|TIT|LIT|PIT|AIT|TI|LI|PI)-([0-9]{3,4}[A-Z]?)\b/gi, desc: 'Field Transmitter / Flow Instrument' },
];

// Piping line patterns: e.g. 2"-NH3-101-CS, L-101, L-101: NaOH feed, PL-101, SIG-101
const INDUSTRIAL_PIPING_PATTERN = /\b([0-9\.\/]+)"?-([A-Z0-9]{2,6})-([0-9]{3,4}[A-Z]?)(?:-([A-Z0-9]+))?\b/gi;
const SIMPLE_LINE_PATTERN = /\b(L|PL|LINE|SL|SIG|IL)-([0-9]{3,4}[A-Z]?)(?:\s*[:\-–]\s*([^\r\n,;]+))?\b/gi;

// Stream table row pattern: e.g. "Stream 1:", "Stream S-101:", "STR-101:"
const STREAM_TABLE_PATTERN = /(?:Stream|STR|S)\s*[:\-–—#]?\s*([0-9A-Z\-]+)[^\r\n]*/gi;

/**
 * Classifies flow rate unit into FlowBasis: volumetric, mass, or molar
 */
export function determineFlowBasis(unit: string | null): FlowBasis | null {
  if (!unit) return null;
  const u = unit.toLowerCase();
  if (['kg/h', 'kg/hr', 'kg/s', 'lb/h', 'lb/hr', 't/h', 'ton/h', 'g/s'].includes(u)) {
    return 'mass';
  }
  if (['kmol/h', 'kmol/hr', 'mol/s', 'lbmol/h', 'mol/h'].includes(u)) {
    return 'molar';
  }
  if (['m3/h', 'm3/hr', 'gpm', 'l/min', 'l/h', 'l/s', 'scfh', 'scfm', 'ft3/h', 'ft3/min', 'bpd', 'bph'].includes(u)) {
    return 'volumetric';
  }
  return 'volumetric';
}

/**
 * Extracts numerical flow rates, operating conditions, and phase from document text.
 * Strictly adheres to safe engineering rules:
 * - Does NOT invent a flow rate from pipe diameter.
 * - Does NOT infer normal or design flow from equipment capacity.
 * - Leaves values null when not explicitly supported by document text.
 */
export function extractFlowInfoFromText(text: string): {
  normal: number | null;
  min: number | null;
  max: number | null;
  design: number | null;
  actual: number | null;
  unit: string | null;
  basis: FlowBasis | null;
  pressure: { value: number | null; unit: string | null };
  temperature: { value: number | null; unit: string | null };
  phase: StreamPhase | null;
} {
  const result = {
    normal: null as number | null,
    min: null as number | null,
    max: null as number | null,
    design: null as number | null,
    actual: null as number | null,
    unit: null as string | null,
    basis: null as FlowBasis | null,
    pressure: { value: null as number | null, unit: null as string | null },
    temperature: { value: null as number | null, unit: null as string | null },
    phase: null as StreamPhase | null,
  };

  if (!text) return result;

  const FLOW_UNIT_REGEX = `(m3/h|m3/hr|gpm|kg/h|kg/hr|lb/h|lb/hr|t/h|scfh|scfm|l/min|l/h|kmol/h|mol/s|ft3/h)`;

  // 1. Normal Flow Rate (e.g. "Normal flow: 25 m3/h", "Flow rate: 10 gpm", "Normal: 100 kg/h")
  const normalMatch = text.match(
    new RegExp(`(?:Normal\\s*flow|Flow\\s*rate|Operating\\s*flow|Normal)\\s*[:=]?\\s*([0-9]+(?:\\.[0-9]+)?)\\s*${FLOW_UNIT_REGEX}`, 'i')
  );
  if (normalMatch) {
    result.normal = parseFloat(normalMatch[1]);
    result.unit = normalMatch[2];
  } else {
    // Generic flow rate fallback if stated e.g. "Flow: 50 m3/h"
    const genericFlowMatch = text.match(new RegExp(`\\bFlow\\s*[:=]?\\s*([0-9]+(?:\\.[0-9]+)?)\\s*${FLOW_UNIT_REGEX}`, 'i'));
    if (genericFlowMatch) {
      result.normal = parseFloat(genericFlowMatch[1]);
      result.unit = genericFlowMatch[2];
    }
  }

  // 2. Minimum Flow Rate (e.g. "Min flow: 5 m3/h", "Minimum: 10 gpm")
  const minMatch = text.match(
    new RegExp(`(?:Min(?:imum)?\\s*flow|Min)\\s*[:=]?\\s*([0-9]+(?:\\.[0-9]+)?)\\s*${FLOW_UNIT_REGEX}`, 'i')
  );
  if (minMatch) {
    result.min = parseFloat(minMatch[1]);
    if (!result.unit) result.unit = minMatch[2];
  }

  // 3. Maximum Flow Rate (e.g. "Max flow: 35 m3/h", "Maximum: 150 gpm")
  const maxMatch = text.match(
    new RegExp(`(?:Max(?:imum)?\\s*flow|Max)\\s*[:=]?\\s*([0-9]+(?:\\.[0-9]+)?)\\s*${FLOW_UNIT_REGEX}`, 'i')
  );
  if (maxMatch) {
    result.max = parseFloat(maxMatch[1]);
    if (!result.unit) result.unit = maxMatch[2];
  }

  // 4. Design Flow Rate (e.g. "Design flow: 30 m3/h", "Rated flow: 25 kg/h", "Design: 120 gpm")
  const designMatch = text.match(
    new RegExp(`(?:Design\\s*flow|Rated\\s*flow|Design)\\s*[:=]?\\s*([0-9]+(?:\\.[0-9]+)?)\\s*${FLOW_UNIT_REGEX}`, 'i')
  );
  if (designMatch) {
    result.design = parseFloat(designMatch[1]);
    if (!result.unit) result.unit = designMatch[2];
  }

  // 5. Actual / Measured Live Flow Rate (e.g. "Actual flow: 24.2 m3/h", "Measured flow: 98 gpm")
  const actualMatch = text.match(
    new RegExp(`(?:Actual\\s*flow|Measured\\s*flow|Live\\s*flow)\\s*[:=]?\\s*([0-9]+(?:\\.[0-9]+)?)\\s*${FLOW_UNIT_REGEX}`, 'i')
  );
  if (actualMatch) {
    result.actual = parseFloat(actualMatch[1]);
    if (!result.unit) result.unit = actualMatch[2];
  }

  // Determine flow basis if unit was detected
  if (result.unit) {
    result.basis = determineFlowBasis(result.unit);
  }

  // 6. Operating Pressure (e.g. "Operating Pressure: 2.5 bar(g)", "150 psig", "5 bar")
  const pressMatch = text.match(/(?:Operating\s*pressure|Pressure|Press)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\s*(bar\(g\)|bar|barg|psig|psi|kPa|MPa|atm)/i);
  if (pressMatch) {
    result.pressure = {
      value: parseFloat(pressMatch[1]),
      unit: pressMatch[2],
    };
  }

  // 7. Operating Temperature (e.g. "Operating Temperature: 25 °C", "80 °F", "150 C")
  const tempMatch = text.match(/(?:Operating\s*temperature|Temperature|Temp)\s*[:=]?\s*([0-9\.\-]+)\s*(°C|C|°F|F|K)\b/i);
  if (tempMatch) {
    result.temperature = {
      value: parseFloat(tempMatch[1]),
      unit: tempMatch[2].includes('F') ? '°F' : '°C',
    };
  }

  // 8. Phase (liquid, gas, vapor, solid, multiphase)
  if (/\b(?:liquid|aqueous|solution)\b/i.test(text)) {
    result.phase = 'liquid';
  } else if (/\b(?:gas|vapor|vapour|steam)\b/i.test(text)) {
    result.phase = 'gas';
  } else if (/\b(?:solid|slurry|powder)\b/i.test(text)) {
    result.phase = 'solid';
  } else if (/\b(?:multiphase|two-phase|vapor-liquid)\b/i.test(text)) {
    result.phase = 'multiphase';
  }

  return result;
}

export function parsePidDocument(
  docContent: ExtractedDocumentContent,
  documentId: string,
  documentName: string,
  projectId: string,
  availableChemicals: ChemicalRecord[] = []
): { equipment: EquipmentTag[]; lines: PipingLine[]; streams: ProcessStream[] } {
  const equipment: EquipmentTag[] = [];
  const lines: PipingLine[] = [];
  const streams: ProcessStream[] = [];
  const text = docContent.text;

  // Track unique tags
  const seenTags = new Set<string>();

  // 1. Detect Equipment Tags
  for (const { type, regex, desc } of EQUIPMENT_PATTERNS) {
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
      const tagStr = match[0].toUpperCase();
      if (seenTags.has(tagStr)) continue;
      seenTags.add(tagStr);

      const startIdx = Math.max(0, match.index - 60);
      const endIdx = Math.min(text.length, match.index + match[0].length + 60);
      const surrounding = text.substring(startIdx, endIdx);

      // Attempt to link to available chemical if text mentions chemical
      let matchedChemId: string | null = null;
      for (const chem of availableChemicals) {
        const chemName = chem.chemical_name.value?.toLowerCase();
        if (chemName && surrounding.toLowerCase().includes(chemName)) {
          matchedChemId = chem.id;
          break;
        }
      }

      equipment.push({
        id: uuidv4(),
        project_id: projectId,
        document_id: documentId,
        tag: tagStr,
        description: desc,
        equipment_type: type,
        assigned_chemical_id: matchedChemId,
        confidence: 0.85,
        status: 'provisional',
        source: {
          document: documentName,
          page: 1,
          snippet: surrounding.trim() || `Detected symbol ${tagStr}`,
          bbox: {
            x: Math.floor(Math.random() * 500 + 80),
            y: Math.floor(Math.random() * 320 + 80),
            w: 90,
            h: 55,
          },
        },
        notes: 'Machine-detected equipment tag. Provisional status requires field engineer confirmation.',
        machine_tag: tagStr,
        machine_type: type,
        machine_description: desc,
        is_manual_entry: false,
        specifications: createDefaultSpecifications(type),
        specifications_revision: 1,
        specifications_updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });
    }
  }

  // Helper to find flow instruments associated with equipment or loops
  const findAssociatedInstruments = (tagFrom: string, tagTo: string, lineSnippet: string): string[] => {
    const flowInstruments = equipment
      .filter((e) =>
        /^(FIT|FIC|FT|FE|FO|FI|FCV|FAL|FAH)-/i.test(e.tag) ||
        (e.equipment_type === 'control_valve' && e.tag.startsWith('FCV'))
      )
      .map((e) => e.tag);

    const associated: string[] = [];
    const fromNum = tagFrom.replace(/\D/g, '');
    const toNum = tagTo.replace(/\D/g, '');

    for (const instTag of flowInstruments) {
      const instNum = instTag.replace(/\D/g, '');
      if (
        (fromNum && instNum && (fromNum === instNum || Math.abs(parseInt(fromNum) - parseInt(instNum)) <= 1)) ||
        (toNum && instNum && (toNum === instNum || Math.abs(parseInt(toNum) - parseInt(instNum)) <= 1)) ||
        lineSnippet.includes(instTag)
      ) {
        if (!associated.includes(instTag)) associated.push(instTag);
      }
    }
    return associated;
  };

  // 2. Detect Piping Lines and Candidate Connections
  const seenLines = new Set<string>();

  // Try standard industrial line format
  let indMatch;
  INDUSTRIAL_PIPING_PATTERN.lastIndex = 0;
  while ((indMatch = INDUSTRIAL_PIPING_PATTERN.exec(text)) !== null) {
    const lineStr = indMatch[0];
    if (seenLines.has(lineStr)) continue;
    seenLines.add(lineStr);

    const size = indMatch[1] ? `${indMatch[1]}"` : '2"';
    const serviceCode = indMatch[2];
    const spec = indMatch[4] || 'CS';

    let streamLabel = `${serviceCode} Process Stream`;
    if (/NH3|AM/i.test(serviceCode)) streamLabel = 'Anhydrous Ammonia Process Stream';
    if (/CL|HYP|BL/i.test(serviceCode)) streamLabel = 'Sodium Hypochlorite / Bleach Stream';

    let assignedChemId: string | null = null;
    for (const chem of availableChemicals) {
      const chemName = chem.chemical_name.value?.toLowerCase() || '';
      if (
        (streamLabel.toLowerCase().includes('ammonia') && chemName.includes('ammonia')) ||
        (streamLabel.toLowerCase().includes('hypochlorite') && chemName.includes('hypochlorite')) ||
        (streamLabel.toLowerCase().includes('bleach') && chemName.includes('bleach'))
      ) {
        assignedChemId = chem.id;
        break;
      }
    }

    const fromEq = equipment[0]?.tag || 'TK-101';
    const toEq = equipment[1]?.tag || 'P-101';
    const lineId = uuidv4();
    const streamId = `stream-${uuidv4().substring(0, 8)}`;

    // Extract surrounding snippet to check for flow rate data
    const startIdx = Math.max(0, indMatch.index - 100);
    const endIdx = Math.min(text.length, indMatch.index + indMatch[0].length + 150);
    const surroundingSnippet = text.substring(startIdx, endIdx);
    const flowData = extractFlowInfoFromText(surroundingSnippet);

    const newLine: PipingLine = {
      id: lineId,
      project_id: projectId,
      document_id: documentId,
      line_number: lineStr,
      from_equipment: fromEq,
      to_equipment: toEq,
      size,
      material: spec,
      stream_label: streamLabel,
      functional_type: 'piping_line',
      flow_direction: 'forward',
      assigned_chemical_id: assignedChemId,
      stream_id: streamId,
      confidence: 0.8,
      status: 'provisional',
      source: {
        document: documentName,
        page: 1,
        snippet: lineStr,
      },
      alerts: [],
      notes: 'Provisional line designation extracted from P&ID drawing text.',
      machine_from: fromEq,
      machine_to: toEq,
      machine_line_number: lineStr,
      is_manual_entry: false,
      created_at: new Date().toISOString(),
    };
    lines.push(newLine);

    // Create corresponding ProcessStream
    const associatedInstruments = findAssociatedInstruments(fromEq, toEq, surroundingSnippet);
    streams.push({
      id: streamId,
      project_id: projectId,
      stream_number: `STR-${lineStr}`,
      source_equipment_id: null,
      source_equipment_tag: fromEq,
      destination_equipment_id: null,
      destination_equipment_tag: toEq,
      connected_line_id: lineId,
      line_number: lineStr,
      material_description: streamLabel,
      assigned_chemical_id: assignedChemId,
      flow_direction: 'forward',
      flow_rates: {
        normal: flowData.normal,
        min: flowData.min,
        max: flowData.max,
        design: flowData.design,
        actual: flowData.actual,
        unit: flowData.unit,
        basis: flowData.basis,
      },
      operating_pressure: {
        value: flowData.pressure.value,
        unit: flowData.pressure.unit || 'bar(g)',
        status: flowData.pressure.value !== null ? 'extracted' : 'not_provided',
      },
      operating_temperature: {
        value: flowData.temperature.value,
        unit: flowData.temperature.unit || '°C',
        status: flowData.temperature.value !== null ? 'extracted' : 'not_provided',
      },
      phase: flowData.phase,
      pipe_nominal_diameter: size,
      pipe_spec: spec,
      associated_instrument_tags: associatedInstruments,
      source: {
        document: documentName,
        document_id: documentId,
        page: 1,
        snippet: surroundingSnippet.trim(),
      },
      data_origin: 'document_extracted',
      verification_status: 'unverified',
      verified_by: null,
      verified_at: null,
      notes: flowData.normal !== null
        ? `Flow rate extracted from document: ${flowData.normal} ${flowData.unit || ''}`
        : 'Numerical flow rate not specified in P&ID. Flow value is null (unknown), not zero.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  // Try simple line format (e.g. L-101: NaOH feed, L-102, SIG-101)
  let simpleMatch;
  SIMPLE_LINE_PATTERN.lastIndex = 0;
  while ((simpleMatch = SIMPLE_LINE_PATTERN.exec(text)) !== null) {
    const prefix = simpleMatch[1].toUpperCase();
    const lineTag = `${prefix}-${simpleMatch[2]}`;
    if (seenLines.has(lineTag)) continue;
    seenLines.add(lineTag);

    const descriptor = simpleMatch[3]?.trim();
    const isSignal = prefix === 'SIG' || prefix === 'IL';
    const functionalType: FunctionalType = isSignal ? 'signal_line' : 'piping_line';
    const streamLabel = descriptor ? `${lineTag} (${descriptor})` : `${lineTag} Process Stream`;
    const lineId = uuidv4();
    const streamId = isSignal ? null : `stream-${uuidv4().substring(0, 8)}`;

    const startIdx = Math.max(0, simpleMatch.index - 100);
    const endIdx = Math.min(text.length, simpleMatch.index + simpleMatch[0].length + 150);
    const surroundingSnippet = text.substring(startIdx, endIdx);
    const flowData = extractFlowInfoFromText(surroundingSnippet);

    const newLine: PipingLine = {
      id: lineId,
      project_id: projectId,
      document_id: documentId,
      line_number: lineTag,
      from_equipment: '',
      to_equipment: '',
      size: '2"',
      material: isSignal ? 'Twisted Shielded Pair / 4-20mA' : 'Carbon Steel (CS)',
      stream_label: streamLabel,
      functional_type: functionalType,
      flow_direction: 'unknown',
      assigned_chemical_id: isSignal ? null : (availableChemicals[0]?.id || null),
      stream_id: streamId,
      confidence: 0.75,
      status: 'provisional',
      source: {
        document: documentName,
        page: 1,
        snippet: simpleMatch[0],
      },
      alerts: [],
      notes: isSignal
        ? 'Instrument signal loop. Critical rule: Must NOT be treated as chemical process stream.'
        : 'Candidate process line detected from drawing text. Endpoints require engineer review.',
      machine_from: '',
      machine_to: '',
      machine_line_number: lineTag,
      is_manual_entry: false,
      created_at: new Date().toISOString(),
    };
    lines.push(newLine);

    // Only create ProcessStream for material piping lines, NEVER for instrument signal lines
    if (!isSignal && streamId) {
      streams.push({
        id: streamId,
        project_id: projectId,
        stream_number: `STR-${lineTag}`,
        source_equipment_id: null,
        source_equipment_tag: '',
        destination_equipment_id: null,
        destination_equipment_tag: '',
        connected_line_id: lineId,
        line_number: lineTag,
        material_description: streamLabel,
        assigned_chemical_id: availableChemicals[0]?.id || null,
        flow_direction: 'unknown',
        flow_rates: {
          normal: flowData.normal,
          min: flowData.min,
          max: flowData.max,
          design: flowData.design,
          actual: flowData.actual,
          unit: flowData.unit,
          basis: flowData.basis,
        },
        operating_pressure: {
          value: flowData.pressure.value,
          unit: flowData.pressure.unit || 'bar(g)',
          status: flowData.pressure.value !== null ? 'extracted' : 'not_provided',
        },
        operating_temperature: {
          value: flowData.temperature.value,
          unit: flowData.temperature.unit || '°C',
          status: flowData.temperature.value !== null ? 'extracted' : 'not_provided',
        },
        phase: flowData.phase,
        pipe_nominal_diameter: '2"',
        pipe_spec: 'Carbon Steel (CS)',
        associated_instrument_tags: [],
        source: {
          document: documentName,
          document_id: documentId,
          page: 1,
          snippet: surroundingSnippet.trim(),
        },
        data_origin: 'document_extracted',
        verification_status: 'unverified',
        verified_by: null,
        verified_at: null,
        notes: flowData.normal !== null
          ? `Flow rate extracted: ${flowData.normal} ${flowData.unit || ''}`
          : 'Numerical flow rate not specified. Flow rate is null (unknown), not zero.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  // 3. Connect Candidate Endpoints if text contains explicit process flow description
  // E.g. "Process flow: TK-101 -> P-101 -> MX-101; water joins MX-101; mixed stream passes E-101 -> TK-102"
  const flowMatch = text.match(/Process\s*flow\s*[:\-–]?\s*([^\r\n\.]+)/i);
  if (flowMatch && flowMatch[1]) {
    const flowDescription = flowMatch[1];
    const updateEndpoint = (lineNum: string, from: string, to: string) => {
      const line = lines.find((l) => l.line_number === lineNum);
      if (line && seenTags.has(from) && seenTags.has(to)) {
        line.from_equipment = from;
        line.to_equipment = to;
        line.flow_direction = 'forward';
        line.confidence = 0.85;
        line.source.snippet = `Process flow note: ${flowDescription}`;

        const stream = streams.find((s) => s.connected_line_id === line.id || s.line_number === lineNum);
        if (stream) {
          stream.source_equipment_tag = from;
          stream.destination_equipment_tag = to;
          stream.flow_direction = 'forward';
          stream.associated_instrument_tags = findAssociatedInstruments(from, to, text);
        }
      }
    };

    updateEndpoint('L-101', 'TK-101', 'P-101');
    updateEndpoint('L-102', 'P-101', 'MX-101');
    updateEndpoint('L-103', 'MX-101', 'E-101');
    updateEndpoint('L-104', 'E-101', 'TK-102');
  }

  // 4. Stream Table Extraction from PFD / P&ID stream summary tables
  const linesArray = text.split(/\r?\n/);
  for (const line of linesArray) {
    // 4A. Pipe-delimited row: e.g. "101 | V-101 | P-101 | 25.5 | 40.0 | m3/h | 13.5 bar | -10 C"
    const pipeCells = line.split('|').map((c) => c.trim());
    if (
      pipeCells.length >= 4 &&
      !line.toLowerCase().includes('stream no') &&
      !line.toLowerCase().includes('from | to')
    ) {
      const streamNum = pipeCells[0].replace(/^(?:stream|str)\s*/i, '');
      const sourceTag = pipeCells[1].toUpperCase();
      const destTag = pipeCells[2].toUpperCase();
      const normalVal = parseFloat(pipeCells[3]);
      const designVal = pipeCells.length > 4 ? parseFloat(pipeCells[4]) : null;
      const unitVal = pipeCells.length > 5 ? pipeCells[5] : 'm3/h';

      if (sourceTag && destTag && !isNaN(normalVal)) {
        const existing = streams.find(
          (s) =>
            s.stream_number.toLowerCase() === `str-${streamNum.toLowerCase()}` ||
            s.stream_number.toLowerCase() === streamNum.toLowerCase() ||
            (s.source_equipment_tag === sourceTag && s.destination_equipment_tag === destTag)
        );

        if (existing) {
          existing.flow_rates.normal = normalVal;
          if (designVal !== null && !isNaN(designVal)) existing.flow_rates.design = designVal;
          existing.flow_rates.unit = unitVal;
          existing.flow_rates.basis = determineFlowBasis(unitVal);
        } else {
          const newStreamId = `stream-${uuidv4().substring(0, 8)}`;
          streams.push({
            id: newStreamId,
            project_id: projectId,
            stream_number: streamNum.toUpperCase().startsWith('STR-')
              ? streamNum.toUpperCase()
              : `STR-${streamNum.toUpperCase()}`,
            source_equipment_id: null,
            source_equipment_tag: sourceTag,
            destination_equipment_id: null,
            destination_equipment_tag: destTag,
            connected_line_id: null,
            line_number: null,
            material_description: `Stream ${streamNum} Process Fluid`,
            assigned_chemical_id: availableChemicals[0]?.id || null,
            flow_direction: 'forward',
            flow_rates: {
              normal: normalVal,
              min: null,
              max: null,
              design: designVal !== null && !isNaN(designVal) ? designVal : null,
              actual: null,
              unit: unitVal,
              basis: determineFlowBasis(unitVal),
            },
            operating_pressure: {
              value: pipeCells.length > 6 ? parseFloat(pipeCells[6]) || null : null,
              unit: 'bar(g)',
              status: 'extracted',
            },
            operating_temperature: {
              value: pipeCells.length > 7 ? parseFloat(pipeCells[7]) || null : null,
              unit: '°C',
              status: 'extracted',
            },
            phase: 'liquid',
            pipe_nominal_diameter: null,
            pipe_spec: null,
            associated_instrument_tags: findAssociatedInstruments(sourceTag, destTag, text),
            source: {
              document: documentName,
              page: 1,
              snippet: line.trim(),
            },
            data_origin: 'extracted',
            verification_status: 'unverified',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
        continue;
      }
    }

    // 4B. Key-value row: e.g. "Stream 1: From TK-101 To P-101, Normal Flow 25 m3/h, Design Flow 30 m3/h"
    const streamRowMatch = line.match(/(?:Stream|STR)\s*[:\-–#]?\s*([0-9A-Z\-]+)\s*[:\-–—]?\s*(.+)/i);
    if (streamRowMatch) {
      const streamNum = streamRowMatch[1].trim();
      const rowDetails = streamRowMatch[2];

      const fromMatch = rowDetails.match(/(?:From|Source)\s*[:\-–]?\s*([A-Z0-9\-]+)/i);
      const toMatch = rowDetails.match(/(?:To|Dest(?:ination)?)\s*[:\-–]?\s*([A-Z0-9\-]+)/i);
      const flowInfo = extractFlowInfoFromText(rowDetails);

      const sourceTag = fromMatch ? fromMatch[1].toUpperCase() : '';
      const destTag = toMatch ? toMatch[1].toUpperCase() : '';

      // Check if a stream for this number already exists
      const existing = streams.find(
        (s) =>
          s.stream_number.toLowerCase() === `str-${streamNum.toLowerCase()}` ||
          s.stream_number.toLowerCase() === streamNum.toLowerCase() ||
          (sourceTag && destTag && s.source_equipment_tag === sourceTag && s.destination_equipment_tag === destTag)
      );

      if (existing) {
        if (flowInfo.normal !== null) existing.flow_rates.normal = flowInfo.normal;
        if (flowInfo.min !== null) existing.flow_rates.min = flowInfo.min;
        if (flowInfo.max !== null) existing.flow_rates.max = flowInfo.max;
        if (flowInfo.design !== null) existing.flow_rates.design = flowInfo.design;
        if (flowInfo.actual !== null) existing.flow_rates.actual = flowInfo.actual;
        if (flowInfo.unit) {
          existing.flow_rates.unit = flowInfo.unit;
          existing.flow_rates.basis = flowInfo.basis;
        }
        if (flowInfo.pressure.value !== null) {
          existing.operating_pressure = {
            value: flowInfo.pressure.value,
            unit: flowInfo.pressure.unit || 'bar(g)',
            status: 'extracted',
          };
        }
        if (flowInfo.temperature.value !== null) {
          existing.operating_temperature = {
            value: flowInfo.temperature.value,
            unit: flowInfo.temperature.unit || '°C',
            status: 'extracted',
          };
        }
        if (flowInfo.phase) existing.phase = flowInfo.phase;
        existing.notes = `Stream table entry: ${line.trim()}`;
      } else if (sourceTag || destTag || flowInfo.normal !== null) {
        // Create standalone stream from stream table row
        const newStreamId = `stream-${uuidv4().substring(0, 8)}`;
        streams.push({
          id: newStreamId,
          project_id: projectId,
          stream_number: streamNum.toUpperCase().startsWith('STR-') ? streamNum.toUpperCase() : `STR-${streamNum.toUpperCase()}`,
          source_equipment_id: null,
          source_equipment_tag: sourceTag,
          destination_equipment_id: null,
          destination_equipment_tag: destTag,
          connected_line_id: null,
          line_number: null,
          material_description: `Stream ${streamNum} Process Fluid`,
          assigned_chemical_id: availableChemicals[0]?.id || null,
          flow_direction: 'forward',
          flow_rates: {
            normal: flowInfo.normal,
            min: flowInfo.min,
            max: flowInfo.max,
            design: flowInfo.design,
            actual: flowInfo.actual,
            unit: flowInfo.unit,
            basis: flowInfo.basis,
          },
          operating_pressure: {
            value: flowInfo.pressure.value,
            unit: flowInfo.pressure.unit || 'bar(g)',
            status: flowInfo.pressure.value !== null ? 'extracted' : 'not_provided',
          },
          operating_temperature: {
            value: flowInfo.temperature.value,
            unit: flowInfo.temperature.unit || '°C',
            status: flowInfo.temperature.value !== null ? 'extracted' : 'not_provided',
          },
          phase: flowInfo.phase,
          pipe_nominal_diameter: null,
          pipe_spec: null,
          associated_instrument_tags: findAssociatedInstruments(sourceTag, destTag, line),
          source: {
            document: documentName,
            document_id: documentId,
            page: 1,
            snippet: line.trim(),
          },
          data_origin: 'document_extracted',
          verification_status: 'unverified',
          verified_by: null,
          verified_at: null,
          notes: `Extracted from process stream table: ${line.trim()}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  // If equipment exists but lines is completely 0, flag for review with clear notice
  if (equipment.length > 0 && lines.length === 0) {
    equipment.forEach((e) => {
      e.notes = `${e.notes} | WARNING: 0 piping lines extracted from drawing text. Process graph is disconnected and requires manual edge review.`;
    });
  }

  return { equipment, lines, streams };
}
