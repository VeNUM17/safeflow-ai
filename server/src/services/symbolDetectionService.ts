import { v4 as uuidv4 } from 'uuid';
import {
  DrawingObject,
  EquipmentPort,
  BoundingBox,
  Coordinate2D,
  EquipmentType,
  createDefaultSpecifications,
} from '../types';

export interface DetectedSymbolResult {
  objects: DrawingObject[];
  ports: EquipmentPort[];
}

/**
 * Maps detected tags and bounding boxes to physical P&ID symbols with explicit connection ports (nozzles).
 */
export function detectDrawingSymbols(
  tags: { tag: string; type: string; bbox: BoundingBox; confidence: number }[],
  documentName: string,
  pageNumber = 1
): DetectedSymbolResult {
  const objects: DrawingObject[] = [];
  const ports: EquipmentPort[] = [];

  for (const item of tags) {
    const objId = uuidv4();
    const tagUpper = item.tag.toUpperCase();
    const prefix = tagUpper.split('-')[0];

    let eqType: EquipmentType = 'vessel';
    let subType = 'Process Equipment';
    let symWidth = 50;
    let symHeight = 50;

    if (prefix === 'TK') {
      eqType = 'tank';
      subType = 'Storage Tank';
      symWidth = 80;
      symHeight = 80;
    } else if (prefix === 'MX') {
      eqType = 'mixing_tank';
      subType = 'Mixing Tank';
      symWidth = 90;
      symHeight = 90;
    } else if (prefix === 'P' || prefix === 'CP') {
      eqType = 'pump';
      subType = 'Centrifugal Transfer Pump';
      symWidth = 36;
      symHeight = 36;
    } else if (prefix === 'R' || prefix === 'RX') {
      eqType = 'reactor';
      subType = 'Chemical Reactor';
      symWidth = 90;
      symHeight = 90;
    } else if (prefix === 'E' || prefix === 'HX' || prefix === 'HE' || prefix === 'C') {
      eqType = 'heat_exchanger';
      subType = 'Shell & Tube Heat Exchanger';
      symWidth = 72;
      symHeight = 48;
    } else if (prefix === 'HV') {
      eqType = 'manual_valve';
      subType = 'Manual Isolation Valve';
      symWidth = 24;
      symHeight = 24;
    } else if (prefix === 'DV') {
      eqType = 'drain_valve';
      subType = 'Drain Isolation Valve';
      symWidth = 24;
      symHeight = 24;
    } else if (prefix === 'NRV') {
      eqType = 'isolation_valve';
      subType = 'Non-Return Check Valve';
      symWidth = 24;
      symHeight = 24;
    } else if (prefix === 'AG') {
      eqType = 'agitator';
      subType = 'Mechanical Mixer Agitator';
      symWidth = 36;
      symHeight = 36;
    } else if (prefix === 'FCV' || prefix === 'PCV' || prefix === 'TCV' || prefix === 'LCV') {
      eqType = 'control_valve';
      subType = 'Flow / Pressure Control Valve';
      symWidth = 26;
      symHeight = 26;
    } else if (prefix.startsWith('F') || prefix.startsWith('L') || prefix.startsWith('T') || prefix.startsWith('P')) {
      eqType = 'instrument';
      subType = 'Process Instrumentation Transmitter';
      symWidth = 28;
      symHeight = 28;
    }

    const center: Coordinate2D = {
      x: item.bbox.x + item.bbox.w / 2,
      y: item.bbox.y + item.bbox.h / 2,
    };

    const symbolBBox: BoundingBox = {
      x: center.x - symWidth / 2,
      y: center.y - symHeight / 2,
      w: symWidth,
      h: symHeight,
    };

    // Generate Standard Equipment Ports (Nozzles) placed at the perimeter of the physical symbol
    const eqPorts: EquipmentPort[] = [
      {
        id: `port-${objId}-inlet-top`,
        equipment_id: objId,
        equipment_tag: tagUpper,
        port_type: 'inlet',
        position: { x: center.x, y: symbolBBox.y },
        normal_vector: { x: 0, y: -1 },
        connection_candidates: [],
        confidence: item.confidence,
      },
      {
        id: `port-${objId}-outlet-bottom`,
        equipment_id: objId,
        equipment_tag: tagUpper,
        port_type: 'outlet',
        position: { x: center.x, y: symbolBBox.y + symHeight },
        normal_vector: { x: 0, y: 1 },
        connection_candidates: [],
        confidence: item.confidence,
      },
      {
        id: `port-${objId}-side-left`,
        equipment_id: objId,
        equipment_tag: tagUpper,
        port_type: 'bidirectional',
        position: { x: symbolBBox.x, y: center.y },
        normal_vector: { x: -1, y: 0 },
        connection_candidates: [],
        confidence: item.confidence,
      },
      {
        id: `port-${objId}-side-right`,
        equipment_id: objId,
        equipment_tag: tagUpper,
        port_type: 'bidirectional',
        position: { x: symbolBBox.x + symWidth, y: center.y },
        normal_vector: { x: 1, y: 0 },
        connection_candidates: [],
        confidence: item.confidence,
      },
    ];

    ports.push(...eqPorts);

    const isValve = prefix === 'HV' || prefix === 'DV' || prefix === 'NRV' || prefix === 'XV' || prefix.endsWith('V');
    const isInst = prefix.startsWith('F') || prefix.startsWith('L') || prefix.startsWith('T') || prefix.startsWith('P');
    const objType = isValve ? 'valve' : isInst ? 'instrument' : 'equipment';

    const drawingObj: DrawingObject = {
      id: objId,
      type: objType,
      tag: tagUpper,
      sub_type: subType,
      page: pageNumber,
      bounding_box: symbolBBox,
      center_coordinates: center,
      confidence: item.confidence,
      recognition_method: 'symbol_template',
      evidence: {
        source_document: documentName,
        page_number: pageNumber,
        bounding_box: symbolBBox,
        recognition_method: 'symbol_template',
        supporting_text: item.tag,
        confidence: item.confidence,
      },
      ports: eqPorts,
      specifications: createDefaultSpecifications(eqType),
    };

    objects.push(drawingObj);
  }

  return { objects, ports };
}
