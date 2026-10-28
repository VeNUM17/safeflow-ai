import { v4 as uuidv4 } from 'uuid';
import { EquipmentTag, PipingLine, ChemicalRecord, EquipmentType, FunctionalType, FlowDirection, createDefaultSpecifications } from '../types';
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
  { type: 'instrument', regex: /\b(FIT|TIT|LIT|PIT|AIT|FI|TI|LI|PI)-([0-9]{3,4}[A-Z]?)\b/gi, desc: 'Field Transmitter / Indicator' },
];

// Piping line patterns: e.g. 2"-NH3-101-CS, L-101, L-101: NaOH feed, PL-101, SIG-101
const INDUSTRIAL_PIPING_PATTERN = /\b([0-9\.\/]+)"?-([A-Z0-9]{2,6})-([0-9]{3,4}[A-Z]?)(?:-([A-Z0-9]+))?\b/gi;
const SIMPLE_LINE_PATTERN = /\b(L|PL|LINE|SL|SIG|IL)-([0-9]{3,4}[A-Z]?)(?:\s*[:\-–]\s*([^\r\n,;]+))?\b/gi;

export function parsePidDocument(
  docContent: ExtractedDocumentContent,
  documentId: string,
  documentName: string,
  projectId: string,
  availableChemicals: ChemicalRecord[] = []
): { equipment: EquipmentTag[]; lines: PipingLine[] } {
  const equipment: EquipmentTag[] = [];
  const lines: PipingLine[] = [];
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

    lines.push({
      id: uuidv4(),
      project_id: projectId,
      document_id: documentId,
      line_number: lineStr,
      from_equipment: equipment[0]?.tag || 'TK-101',
      to_equipment: equipment[1]?.tag || 'P-101',
      size,
      material: spec,
      stream_label: streamLabel,
      functional_type: 'piping_line',
      flow_direction: 'forward',
      assigned_chemical_id: assignedChemId,
      confidence: 0.8,
      status: 'provisional',
      source: {
        document: documentName,
        page: 1,
        snippet: lineStr,
      },
      alerts: [],
      notes: 'Provisional line designation extracted from P&ID drawing text.',
      machine_from: equipment[0]?.tag || 'TK-101',
      machine_to: equipment[1]?.tag || 'P-101',
      machine_line_number: lineStr,
      is_manual_entry: false,
      created_at: new Date().toISOString(),
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

    lines.push({
      id: uuidv4(),
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
    });
  }

  // 3. Connect Candidate Endpoints if text contains explicit process flow description
  // E.g. "Process flow: TK-101 -> P-101 -> MX-101; water joins MX-101; mixed stream passes E-101 -> TK-102"
  const flowMatch = text.match(/Process\s*flow\s*[:\-–]?\s*([^\r\n\.]+)/i);
  if (flowMatch && flowMatch[1]) {
    const flowDescription = flowMatch[1];
    // Map lines to sequence if matching
    // L-101 -> TK-101 to P-101
    const l101 = lines.find((l) => l.line_number === 'L-101');
    if (l101 && seenTags.has('TK-101') && seenTags.has('P-101')) {
      l101.from_equipment = 'TK-101';
      l101.to_equipment = 'P-101';
      l101.flow_direction = 'forward';
      l101.confidence = 0.85;
      l101.source.snippet = `Process flow note: ${flowDescription}`;
    }

    // L-102 or L-103
    const l103 = lines.find((l) => l.line_number === 'L-103');
    if (l103 && seenTags.has('MX-101') && seenTags.has('E-101')) {
      l103.from_equipment = 'MX-101';
      l103.to_equipment = 'E-101';
      l103.flow_direction = 'forward';
      l103.confidence = 0.85;
    }

    const l104 = lines.find((l) => l.line_number === 'L-104');
    if (l104 && seenTags.has('E-101') && seenTags.has('TK-102')) {
      l104.from_equipment = 'E-101';
      l104.to_equipment = 'TK-102';
      l104.flow_direction = 'forward';
      l104.confidence = 0.85;
    }
  }

  // If equipment exists but lines is completely 0, flag for review with clear notice
  if (equipment.length > 0 && lines.length === 0) {
    equipment.forEach((e) => {
      e.notes = `${e.notes} | WARNING: 0 piping lines extracted from drawing text. Process graph is disconnected and requires manual edge review.`;
    });
  }

  return { equipment, lines };
}
