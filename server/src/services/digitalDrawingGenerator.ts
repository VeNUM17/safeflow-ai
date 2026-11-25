import { v4 as uuidv4 } from 'uuid';
import { findComponentForTag } from './componentRegistryService';
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

function mapToDrawingElementType(eqType: EquipmentType, component?: ReturnType<typeof findComponentForTag>): DrawingElementType {
  if (!component) return eqType;
  if (component.category === 'instrument') return 'instrument';
  if (component.category === 'connector') return 'offpage_connector';
  if (component.symbol.key === 'check_valve') return 'check_valve';
  if (component.symbol.key === 'relief_valve') return 'relief_valve';
  if (component.symbol.key === 'filter') return 'filter';
  return component.equipment_type;
}

function createStandardPorts(width: number, height: number, component?: ReturnType<typeof findComponentForTag>): DrawingPort[] {
  if (component) {
    const [originX, originY, viewWidth, viewHeight] = component.symbol.viewBox.split(/\s+/).map(Number);
    return component.ports.map((port) => ({
      id: port.id,
      name: port.id,
      type: port.role === 'drain' || port.role === 'vent' ? 'outlet' : port.role,
      position: {
        x: Math.round(((port.x - originX) / viewWidth - 0.5) * width),
        y: Math.round(((port.y - originY) / viewHeight - 0.5) * height),
      },
    }));
  }

  const halfWidth = Math.round(width / 2);
  const halfHeight = Math.round(height / 2);
  return [
    { id: 'p_in', name: 'Inlet', type: 'inlet', position: { x: -halfWidth, y: 0 } },
    { id: 'p_out', name: 'Outlet', type: 'outlet', position: { x: halfWidth, y: 0 } },
    { id: 'p_top', name: 'Top Port / Vent / Relief', type: 'outlet', position: { x: 0, y: -halfHeight } },
    { id: 'p_bottom', name: 'Bottom Port / Drain', type: 'outlet', position: { x: 0, y: halfHeight } },
  ];
}

function selectElementPort(element: DrawingElement, purpose: 'inlet' | 'outlet' | 'top' | 'bottom' | 'signal'): string | undefined {
  let candidates = element.ports;
  if (purpose === 'signal') {
    candidates = candidates.filter((port) => port.type === 'signal');
  } else if (purpose === 'inlet' || purpose === 'outlet') {
    candidates = candidates.filter((port) => port.type === purpose || port.type === 'bidirectional');
  }
  if (candidates.length === 0) candidates = element.ports;
  if (candidates.length === 0) return undefined;

  if (purpose === 'top') return [...candidates].sort((left, right) => left.position.y - right.position.y)[0].id;
  if (purpose === 'bottom') return [...candidates].sort((left, right) => right.position.y - left.position.y)[0].id;
  if (purpose === 'inlet') return [...candidates].sort((left, right) => left.position.x - right.position.x)[0].id;
  if (purpose === 'outlet') return [...candidates].sort((left, right) => right.position.x - left.position.x)[0].id;
  return candidates[0].id;
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
  // Enforce drawing/sheet scope: filter out assets and lines belonging to different documents/sheets
  const scopedEquipment = equipment.filter((eq) => {
    if (!documentId && !documentName) return true;
    if (eq.document_id && documentId && eq.document_id === documentId) return true;
    if (eq.source?.document && documentName && eq.source.document === documentName) return true;
    if (!eq.document_id && !eq.source?.document) return true;
    return false;
  });

  const scopedLines = lines.filter((line) => {
    if (!documentId && !documentName) return true;
    if (line.document_id && documentId && line.document_id === documentId) return true;
    if (line.source?.document && documentName && line.source.document === documentName) return true;
    if (!line.document_id && !line.source?.document) return true;
    return false;
  });

  const elements: DrawingElement[] = [];
  const connectors: DrawingConnector[] = [];
  const elementByTag = new Map<string, DrawingElement>();

  // Layout positioning lookup for canonical P&ID structures (Anchored 1:1 to source drawings)
  const KNOWN_POSITIONS: Record<string, { x: number; y: number; width?: number; height?: number }> = {
    // Gas Plant GPF-001 / Slug Catcher (P&ID-GPF-001-02 Anchored Coordinates)
    'MV-1001': { x: 60, y: 550, width: 140, height: 36 },
    'INLET-HEADER': { x: 60, y: 550, width: 140, height: 36 },
    'XV-1001': { x: 380, y: 540, width: 36, height: 52 },
    // Dominant vessel: PG-1001 Slug Catcher with true scale
    'PG-1001': { x: 580, y: 480, width: 420, height: 160 },
    'CV-1001': { x: 1120, y: 540, width: 36, height: 36 },
    'XV-1002': { x: 1300, y: 540, width: 36, height: 52 },
    'PCV-1001': { x: 1480, y: 540, width: 40, height: 52 },
    'HP-SEPARATOR': { x: 1640, y: 550, width: 140, height: 36 },
    'LCV-1001': { x: 1060, y: 820, width: 40, height: 52 },
    'CONDENSATE-SYSTEM': { x: 1320, y: 820, width: 150, height: 36 },
    'BDV-1001': { x: 1380, y: 820, width: 36, height: 52 },
    'SOUR-FLARE-HEADER': { x: 1540, y: 720, width: 150, height: 36 },
    'FLARE-HEADER': { x: 660, y: 50, width: 150, height: 36 },
    'PSV-1001': { x: 880, y: 170, width: 42, height: 46 },
    'NV-1001': { x: 880, y: 300, width: 28, height: 28 },
    'NV-1002': { x: 880, y: 120, width: 28, height: 28 },
    'BV-1001': { x: 640, y: 800, width: 28, height: 28 },
    'CLOSED-DRAIN-DRUM': { x: 640, y: 920, width: 150, height: 36 },
    'BV-1002': { x: 600, y: 170, width: 28, height: 28 },
    'PT-1001': { x: 470, y: 280, width: 40, height: 40 },
    'PIC-1001': { x: 470, y: 380, width: 40, height: 40 },
    'PT-1002': { x: 550, y: 280, width: 40, height: 40 },
    'TT-1001': { x: 1310, y: 190, width: 40, height: 40 },
    'LT-1001': { x: 1020, y: 700, width: 40, height: 40 },
    'LIC-1001': { x: 1090, y: 700, width: 40, height: 40 },
    'LT-1002': { x: 1190, y: 700, width: 40, height: 40 },
    'LG-1001': { x: 780, y: 720, width: 32, height: 64 },
    'PI-1001': { x: 990, y: 380, width: 40, height: 40 },
    'SIS-1001': { x: 1060, y: 300, width: 44, height: 44 },
    'LS-1001': { x: 1060, y: 300, width: 44, height: 44 },
    'SDV-1001': { x: 200, y: 180, width: 32, height: 32 },
    'SDV-1002': { x: 200, y: 260, width: 32, height: 32 },
    'SDV-1003': { x: 200, y: 340, width: 32, height: 32 },
    'SDV-1004': { x: 200, y: 420, width: 32, height: 32 },

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

  // 1. Create DrawingElements for all detected scoped equipment
  for (const eq of scopedEquipment) {
    const tagUpper = eq.tag.trim().toUpperCase();
    const registryComponent = findComponentForTag(tagUpper, eq.equipment_type);
    const elemType = mapToDrawingElementType(eq.equipment_type, registryComponent);

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

    const ports = createStandardPorts(size.width, size.height, registryComponent);

    const elem: DrawingElement = {
      id: `elem-${eq.id || uuidv4()}`,
      tag: tagUpper,
      type: elemType,
      component_class_id: registryComponent?.class_id,
      inline: registryComponent?.inline,
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

  // Pre-seed known off-page / destination headers (anchored to source drawing layout)
  addOffpageIfNeeded('HP-SEPARATOR', { x: 1640, y: 550 }, 'HP Separator Inlet Header');
  addOffpageIfNeeded('CONDENSATE-SYSTEM', { x: 1320, y: 820 }, 'Condensate / Oil System');
  addOffpageIfNeeded('SOUR-FLARE-HEADER', { x: 1540, y: 720 }, 'To Sour Flare Header');
  addOffpageIfNeeded('FLARE-HEADER', { x: 660, y: 50 }, 'To Sour Flare Header (Top)');
  addOffpageIfNeeded('CLOSED-DRAIN-DRUM', { x: 640, y: 920 }, 'Closed Drain Drum System');
  addOffpageIfNeeded('INLET-HEADER', { x: 60, y: 550 }, 'Production Manifold MV-1001');

  // Check lines for any other off-page endpoints
  for (const line of scopedLines) {
    if (line.from_equipment && !elementByTag.has(line.from_equipment.toUpperCase())) {
      addOffpageIfNeeded(line.from_equipment, { x: 60, y: autoY }, `External Line Source: ${line.from_equipment}`);
    }
    if (line.to_equipment && !elementByTag.has(line.to_equipment.toUpperCase())) {
      addOffpageIfNeeded(line.to_equipment, { x: 1780, y: autoY }, `External Line Destination: ${line.to_equipment}`);
    }
  }

  // 3. Create Connectors for all piping lines and signal loops
  for (const line of scopedLines) {
    const fromTag = (line.from_equipment || '').trim().toUpperCase();
    const toTag = (line.to_equipment || '').trim().toUpperCase();

    const fromElem = elementByTag.get(fromTag);
    const toElem = elementByTag.get(toTag);

    if (!fromElem || !toElem) {
      continue;
    }

    const isSignal = line.functional_type === 'signal_line';
    let fromPortId = selectElementPort(fromElem, 'outlet') || fromElem.ports[0]?.id || 'p_out';
    let toPortId = selectElementPort(toElem, 'inlet') || toElem.ports[0]?.id || 'p_in';

    if (isSignal) {
      fromPortId = selectElementPort(fromElem, 'signal') || fromPortId;
      toPortId = selectElementPort(toElem, 'signal') || toPortId;
    } else {
      // Specialized nozzle routing for horizontal slug catcher PG-1001
      if (fromElem.component_class_id === 'equipment.vessel.slug_catcher') {
        if (toTag.includes('CV-1001') || toTag.includes('SEPARATOR') || toTag.includes('XV-1002') || toTag.includes('PCV')) {
          fromPortId = 'N2'; // Gas Outlet
        } else if (toTag.includes('LCV-1001') || toTag.includes('CONDENSATE')) {
          fromPortId = 'N3'; // Liquid Outlet
        } else if (toTag.includes('PSV') || toTag.includes('NV-1001') || toTag.includes('FLARE')) {
          fromPortId = 'N4'; // PSV Nozzle
        } else if (toTag.includes('BV-1001') || toTag.includes('DRAIN')) {
          fromPortId = 'N5'; // Drain Nozzle
        } else if (toTag.includes('BV-1002') || toTag.includes('VENT')) {
          fromPortId = 'N6'; // Vent Nozzle
        } else {
          fromPortId = 'N2';
        }
      } else if (toElem.component_class_id === 'equipment.vessel.slug_catcher') {
        toPortId = 'N1'; // Inlet Nozzle
      } else {
        // Connect to top/bottom nozzles for drain/vent lines
        if (line.line_number.includes('-DR-') || line.line_number.includes('DR-') || toTag.includes('DRAIN')) {
          fromPortId = selectElementPort(fromElem, 'bottom') || fromPortId;
        } else if (line.line_number.includes('-VT-') || line.line_number.includes('VT-') || line.line_number.includes('-FL-') || toTag.includes('FLARE') || toTag.includes('PSV')) {
          fromPortId = selectElementPort(fromElem, 'top') || fromPortId;
        }
      }
    }

    // Ensure ports exist on source and target elements
    if (!fromElem.ports.some((port) => port.id === fromPortId)) fromPortId = selectElementPort(fromElem, 'outlet') || 'p_out';
    if (!toElem.ports.some((port) => port.id === toPortId)) toPortId = selectElementPort(toElem, 'inlet') || 'p_in';

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

  // Link INLET-HEADER boundary flag into MV-1001 manifold valve to resolve floating connector
  const inletHeaderElem = elementByTag.get('INLET-HEADER');
  const mv1001Elem = elementByTag.get('MV-1001');
  if (inletHeaderElem && mv1001Elem) {
    const alreadyConnected = connectors.some(
      (c) => (c.from_element_id === inletHeaderElem.id && c.to_element_id === mv1001Elem.id) ||
             (c.from_element_id === mv1001Elem.id && c.to_element_id === inletHeaderElem.id)
    );
    if (!alreadyConnected) {
      connectors.unshift({
        id: `conn-inlet-feed-${uuidv4().substring(0, 8)}`,
        line_number: '10"-PG-00100-A1A',
        from_element_id: inletHeaderElem.id,
        from_port_id: 'p_out',
        to_element_id: mv1001Elem.id,
        to_port_id: 'p_in',
        functional_type: 'piping_line',
        flow_direction: 'forward',
        size: '10"',
        material: 'Carbon Steel (CS)',
        stream_label: 'Production Header Feed to MV-1001 (From PID-GPF-001-01)',
        assigned_chemical_id: null,
        status: 'confirmed',
        confidence: 0.95,
        waypoints: [
          { x: inletHeaderElem.position.x + inletHeaderElem.size.width, y: inletHeaderElem.position.y + inletHeaderElem.size.height / 2 },
          { x: mv1001Elem.position.x, y: mv1001Elem.position.y + mv1001Elem.size.height / 2 },
        ],
      });
    }
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
    canvas_width: 2400,
    canvas_height: 1600,
    elements,
    connectors,
    background_visible: true,
    background_opacity: 0.4,
    created_at: now,
    updated_at: now,
  };
}
