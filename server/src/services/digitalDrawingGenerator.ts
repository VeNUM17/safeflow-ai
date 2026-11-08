import { v4 as uuidv4 } from 'uuid';
import {
  DigitalPidDrawing,
  DrawingElement,
  DrawingConnector,
  DrawingPort,
  DrawingElementType,
  EquipmentTag,
  PipingLine,
  ProcessStream,
  EquipmentType,
  createDefaultSpecifications,
} from '../types';

/**
 * Maps EquipmentType to DrawingElementType
 */
function mapToDrawingElementType(eqType: EquipmentType, tag: string): DrawingElementType {
  const upperTag = tag.toUpperCase();
  if (upperTag.startsWith('PSV') || upperTag.startsWith('PRV')) return 'relief_valve';
  if (upperTag.startsWith('CV') || upperTag.startsWith('NRV')) return 'check_valve';
  if (upperTag.startsWith('PCV') || upperTag.startsWith('FCV') || upperTag.startsWith('LCV') || upperTag.startsWith('TCV') || upperTag.startsWith('SDV') || upperTag.startsWith('BDV')) return 'control_valve';
  if (upperTag.startsWith('HV') || upperTag.startsWith('NV') || upperTag.startsWith('BV') || upperTag.startsWith('MV')) return 'manual_valve';
  if (upperTag.startsWith('XV')) return 'isolation_valve';
  if (upperTag.startsWith('DV')) return 'drain_valve';
  if (upperTag.startsWith('PG') || upperTag.startsWith('V') || upperTag.startsWith('D') || upperTag.startsWith('DR')) return 'vessel';
  if (upperTag.startsWith('TK')) return 'tank';
  if (upperTag.startsWith('MX')) return 'mixing_tank';
  if (upperTag.startsWith('P')) return 'pump';
  if (upperTag.startsWith('E') || upperTag.startsWith('HX') || upperTag.startsWith('HE') || upperTag.startsWith('C')) return 'heat_exchanger';
  if (upperTag.startsWith('R') || upperTag.startsWith('RX')) return 'reactor';
  if (upperTag.startsWith('K') || upperTag.startsWith('CP')) return 'compressor';
  if (upperTag.startsWith('S') || upperTag.startsWith('SEP')) return 'separator';
  if (/^(FIT|FIC|FT|FE|FO|FI|TIT|LIT|PIT|AIT|TI|LI|PI|PT|TT|LT|LG|PIC|LIC|SIS|LS|HS|SV)-/i.test(upperTag)) return 'instrument';

  switch (eqType) {
    case 'tank': return 'tank';
    case 'mixing_tank': return 'mixing_tank';
    case 'reactor': return 'reactor';
    case 'pump': return 'pump';
    case 'compressor': return 'compressor';
    case 'heat_exchanger': return 'heat_exchanger';
    case 'manual_valve': return 'manual_valve';
    case 'isolation_valve': return 'isolation_valve';
    case 'control_valve': return 'control_valve';
    case 'drain_valve': return 'drain_valve';
    case 'instrument': return 'instrument';
    case 'separator': return 'separator';
    case 'vessel':
    default:
      return 'vessel';
  }
}

/**
 * Standard default ports for an element
 */
function createStandardPorts(width: number, height: number): DrawingPort[] {
  const hw = Math.round(width / 2);
  const hh = Math.round(height / 2);
  return [
    { id: 'p_in', name: 'Inlet', type: 'inlet', position: { x: -hw, y: 0 } },
    { id: 'p_out', name: 'Outlet', type: 'outlet', position: { x: hw, y: 0 } },
    { id: 'p_top', name: 'Top Port / Vent / Relief', type: 'outlet', position: { x: 0, y: -hh } },
    { id: 'p_bot', name: 'Bottom Port / Drain', type: 'outlet', position: { x: 0, y: hh } },
    { id: 'p_sig', name: 'Instrument Signal', type: 'signal', position: { x: 0, y: -hh } },
  ];
}

/**
 * Generates a full DigitalPidDrawing from extracted P&ID equipment, lines, and streams.
 */
export function generateDigitalPidFromExtracted(
  projectId: string,
  documentId: string | null,
  documentName: string,
  equipment: EquipmentTag[],
  lines: PipingLine[],
  streams: ProcessStream[] = []
): DigitalPidDrawing {
  const elements: DrawingElement[] = [];
  const connectors: DrawingConnector[] = [];
  const elementByTag = new Map<string, DrawingElement>();

  // Layout positioning lookup for canonical P&ID structures
  const KNOWN_POSITIONS: Record<string, { x: number; y: number; width?: number; height?: number }> = {
    // Gas Plant GPF-001 / Slug Catcher
    'MV-1001': { x: 200, y: 560, width: 36, height: 36 },
    'XV-1001': { x: 400, y: 560, width: 36, height: 36 },
    'PG-1001': { x: 740, y: 510, width: 220, height: 120 },
    'CV-1001': { x: 1080, y: 560, width: 32, height: 32 },
    'XV-1002': { x: 1260, y: 560, width: 36, height: 36 },
    'PCV-1001': { x: 1460, y: 560, width: 36, height: 36 },
    'LCV-1001': { x: 1080, y: 840, width: 36, height: 36 },
    'BDV-1001': { x: 1460, y: 840, width: 36, height: 36 },
    'PSV-1001': { x: 920, y: 220, width: 36, height: 36 },
    'NV-1001': { x: 920, y: 340, width: 28, height: 28 },
    'NV-1002': { x: 920, y: 150, width: 28, height: 28 },
    'BV-1001': { x: 740, y: 880, width: 28, height: 28 },
    'BV-1002': { x: 640, y: 220, width: 28, height: 28 },
    'PT-1001': { x: 480, y: 380, width: 44, height: 44 },
    'PIC-1001': { x: 480, y: 470, width: 44, height: 44 },
    'PT-1002': { x: 600, y: 380, width: 44, height: 44 },
    'TT-1001': { x: 1180, y: 380, width: 44, height: 44 },
    'LT-1001': { x: 860, y: 720, width: 44, height: 44 },
    'LIC-1001': { x: 960, y: 720, width: 44, height: 44 },
    'LT-1002': { x: 1180, y: 720, width: 44, height: 44 },
    'LG-1001': { x: 790, y: 740, width: 40, height: 50 },
    'PI-1001': { x: 880, y: 380, width: 44, height: 44 },
    'SIS-1001': { x: 1040, y: 360, width: 50, height: 44 },
    'LS-1001': { x: 1040, y: 360, width: 50, height: 44 },
    'SDV-1001': { x: 160, y: 180, width: 32, height: 32 },
    'SDV-1002': { x: 160, y: 260, width: 32, height: 32 },
    'SDV-1003': { x: 160, y: 340, width: 32, height: 32 },
    'SDV-1004': { x: 160, y: 420, width: 32, height: 32 },

    // Ammonia Refrigeration Skid
    'TK-101': { x: 220, y: 450, width: 110, height: 160 },
    'HV-101': { x: 380, y: 550, width: 32, height: 32 },
    'P-101': { x: 480, y: 550, width: 50, height: 50 },
    'NRV-101': { x: 580, y: 550, width: 32, height: 32 },
    'MX-101': { x: 780, y: 520, width: 120, height: 140 },
    'AG-101': { x: 780, y: 420, width: 40, height: 40 },
    'DV-101': { x: 780, y: 720, width: 32, height: 32 },
    'HV-102': { x: 780, y: 280, width: 32, height: 32 },
    'FIT-101': { x: 680, y: 280, width: 44, height: 44 },
    'FIC-101': { x: 680, y: 200, width: 44, height: 44 },
    'E-101': { x: 1100, y: 530, width: 120, height: 80 },
    'HV-103': { x: 1280, y: 550, width: 32, height: 32 },
    'TK-102': { x: 1480, y: 450, width: 110, height: 160 },
    'HV-104': { x: 1680, y: 550, width: 32, height: 32 },
    'LIT-101': { x: 1480, y: 280, width: 44, height: 44 },
    'TIT-101': { x: 1480, y: 700, width: 44, height: 44 },
  };

  let autoX = 220;
  let autoY = 220;

  // 1. Create DrawingElements for all detected equipment
  for (const eq of equipment) {
    const tagUpper = eq.tag.trim().toUpperCase();
    const elemType = mapToDrawingElementType(eq.equipment_type, tagUpper);

    let pos = KNOWN_POSITIONS[tagUpper];
    let size = { width: 80, height: 80 };

    if (pos) {
      size = { width: pos.width || 80, height: pos.height || 80 };
    } else {
      // Dynamic positioning in 4-column flow layout
      if (elemType === 'instrument') {
        size = { width: 44, height: 44 };
      } else if (elemType.includes('valve')) {
        size = { width: 34, height: 34 };
      } else if (elemType === 'vessel' || elemType === 'tank' || elemType === 'reactor') {
        size = { width: 120, height: 140 };
      } else if (elemType === 'pump' || elemType === 'compressor') {
        size = { width: 50, height: 50 };
      }

      pos = { x: autoX, y: autoY };
      autoX += 240;
      if (autoX > 1800) {
        autoX = 220;
        autoY += 240;
      }
    }

    const ports = createStandardPorts(size.width, size.height);

    const elem: DrawingElement = {
      id: `elem-${eq.id || uuidv4()}`,
      tag: tagUpper,
      type: elemType,
      description: eq.description || `${tagUpper} unit`,
      position: { x: pos.x, y: pos.y },
      size,
      rotation: 0,
      assigned_chemical_id: eq.assigned_chemical_id,
      status: eq.status === 'confirmed' ? 'confirmed' : 'provisional',
      confidence: eq.confidence ?? 0.9,
      source_evidence: eq.source,
      notes: eq.notes,
      ports,
      specifications: eq.specifications || createDefaultSpecifications(eq.equipment_type),
    };

    elements.push(elem);
    elementByTag.set(tagUpper, elem);
  }

  // 2. Identify off-page target names mentioned in lines that are not yet elements
  const offpageTags = new Set<string>();
  const addOffpageIfNeeded = (rawTag: string, defaultPos: { x: number; y: number }, title: string) => {
    const clean = rawTag.trim().toUpperCase();
    if (!clean || clean === 'UNKNOWN' || elementByTag.has(clean)) return;

    const elem: DrawingElement = {
      id: `elem-offpage-${clean.replace(/[^A-Z0-9]/gi, '_')}`,
      tag: clean,
      type: 'offpage_connector',
      description: title,
      position: defaultPos,
      size: { width: 120, height: 40 },
      rotation: 0,
      assigned_chemical_id: null,
      status: 'confirmed',
      confidence: 1.0,
      notes: `Boundary interface connection: ${title}`,
      ports: [
        { id: 'p_in', name: 'Inlet', type: 'inlet', position: { x: -60, y: 0 } },
        { id: 'p_out', name: 'Outlet', type: 'outlet', position: { x: 60, y: 0 } },
      ],
    };
    elements.push(elem);
    elementByTag.set(clean, elem);
    offpageTags.add(clean);
  };

  // Pre-seed known off-page / destination headers
  addOffpageIfNeeded('HP-SEPARATOR', { x: 1720, y: 560 }, 'HP Separator Inlet Header');
  addOffpageIfNeeded('CONDENSATE-SYSTEM', { x: 1460, y: 960 }, 'Condensate / Oil System');
  addOffpageIfNeeded('FLARE-HEADER', { x: 1200, y: 100 }, 'To Sour Flare Header');
  addOffpageIfNeeded('CLOSED-DRAIN-DRUM', { x: 740, y: 1050 }, 'Closed Drain Drum System');
  addOffpageIfNeeded('INLET-HEADER', { x: 40, y: 560 }, 'Production Manifold MV-1001');

  // Check lines for any other off-page endpoints
  for (const line of lines) {
    if (line.from_equipment && !elementByTag.has(line.from_equipment.toUpperCase())) {
      addOffpageIfNeeded(line.from_equipment, { x: 60, y: autoY }, `External Line Source: ${line.from_equipment}`);
    }
    if (line.to_equipment && !elementByTag.has(line.to_equipment.toUpperCase())) {
      addOffpageIfNeeded(line.to_equipment, { x: 1780, y: autoY }, `External Line Destination: ${line.to_equipment}`);
    }
  }

  // 3. Create Connectors for all piping lines and signal loops
  for (const line of lines) {
    const fromTag = (line.from_equipment || '').trim().toUpperCase();
    const toTag = (line.to_equipment || '').trim().toUpperCase();

    const fromElem = elementByTag.get(fromTag);
    const toElem = elementByTag.get(toTag);

    if (!fromElem || !toElem) {
      continue;
    }

    const isSignal = line.functional_type === 'signal_line';
    let fromPortId = 'p_out';
    let toPortId = 'p_in';

    if (isSignal) {
      fromPortId = 'p_sig';
      toPortId = 'p_sig';
    } else {
      // Connect to top/bottom nozzles for drain/vent lines
      if (line.line_number.includes('-DR-') || line.line_number.includes('DR-') || toTag.includes('DRAIN')) {
        fromPortId = 'p_bot';
      } else if (line.line_number.includes('-VT-') || line.line_number.includes('VT-') || line.line_number.includes('-FL-') || toTag.includes('FLARE') || toTag.includes('PSV')) {
        fromPortId = 'p_top';
      }
    }

    // Ensure ports exist on source and target elements
    if (!fromElem.ports.some((p) => p.id === fromPortId)) fromPortId = fromElem.ports[0]?.id || 'p_out';
    if (!toElem.ports.some((p) => p.id === toPortId)) toPortId = toElem.ports[0]?.id || 'p_in';

    connectors.push({
      id: `conn-${line.id || uuidv4()}`,
      line_number: line.line_number,
      from_element_id: fromElem.id,
      from_port_id: fromPortId,
      to_element_id: toElem.id,
      to_port_id: toPortId,
      functional_type: line.functional_type || 'piping_line',
      flow_direction: line.flow_direction || 'forward',
      size: line.size || '2"',
      material: line.material || 'Carbon Steel (CS)',
      stream_label: line.stream_label,
      assigned_chemical_id: line.assigned_chemical_id,
      status: line.status === 'confirmed' ? 'confirmed' : 'provisional',
      confidence: line.confidence ?? 0.9,
      source_evidence: line.source,
    });
  }

  const now = new Date().toISOString();
  const dwgNumber = documentName.includes('GPF-001')
    ? 'P&ID-GPF-001-02'
    : `DWG-${documentName.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 16).toUpperCase()}`;

  const dwgTitle = documentName.includes('GPF-001')
    ? 'P&ID: Pig Receiver & Inlet Control — Onshore Gas Processing Facility'
    : `Digital P&ID Schematic — ${documentName}`;

  return {
    id: `draw-${projectId}-${uuidv4().substring(0, 8)}`,
    project_id: projectId,
    source_document_id: documentId,
    source_document_page: 1,
    title: dwgTitle,
    drawing_number: dwgNumber,
    revision: 'REV A',
    mode: 'imported_overlay',
    status: 'draft',
    elements,
    connectors,
    background_visible: true,
    background_opacity: 0.4,
    created_at: now,
    updated_at: now,
  };
}
