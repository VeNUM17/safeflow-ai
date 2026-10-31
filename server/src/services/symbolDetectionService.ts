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

    if (prefix === 'TK') {
      eqType = 'tank';
      subType = 'Storage Tank';
    } else if (prefix === 'MX') {
      eqType = 'mixing_tank';
      subType = 'Mixing Tank';
    } else if (prefix === 'P') {
      eqType = 'pump';
      subType = 'Centrifugal Transfer Pump';
    } else if (prefix === 'R' || prefix === 'RX') {
      eqType = 'reactor';
      subType = 'Chemical Reactor';
    } else if (prefix === 'E' || prefix === 'HX' || prefix === 'HE' || prefix === 'C') {
      eqType = 'heat_exchanger';
      subType = 'Shell & Tube Heat Exchanger';
    } else if (prefix === 'HV') {
      eqType = 'manual_valve';
      subType = 'Manual Isolation Valve';
    } else if (prefix === 'FCV' || prefix === 'PCV' || prefix === 'TCV') {
      eqType = 'control_valve';
      subType = 'Flow / Pressure Control Valve';
    }

    const center: Coordinate2D = {
      x: item.bbox.x + item.bbox.w / 2,
      y: item.bbox.y + item.bbox.h / 2,
    };

    // Generate Standard Equipment Ports (Nozzles)
    const eqPorts: EquipmentPort[] = [
      {
        id: `port-${objId}-inlet-top`,
        equipment_id: objId,
        equipment_tag: tagUpper,
        port_type: 'inlet',
        position: { x: center.x, y: item.bbox.y },
        normal_vector: { x: 0, y: -1 },
        connection_candidates: [],
        confidence: item.confidence,
      },
      {
        id: `port-${objId}-outlet-bottom`,
        equipment_id: objId,
        equipment_tag: tagUpper,
        port_type: 'outlet',
        position: { x: center.x, y: item.bbox.y + item.bbox.h },
        normal_vector: { x: 0, y: 1 },
        connection_candidates: [],
        confidence: item.confidence,
      },
      {
        id: `port-${objId}-side-left`,
        equipment_id: objId,
        equipment_tag: tagUpper,
        port_type: 'bidirectional',
        position: { x: item.bbox.x, y: center.y },
        normal_vector: { x: -1, y: 0 },
        connection_candidates: [],
        confidence: item.confidence,
      },
      {
        id: `port-${objId}-side-right`,
        equipment_id: objId,
        equipment_tag: tagUpper,
        port_type: 'bidirectional',
        position: { x: item.bbox.x + item.bbox.w, y: center.y },
        normal_vector: { x: 1, y: 0 },
        connection_candidates: [],
        confidence: item.confidence,
      },
    ];

    ports.push(...eqPorts);

    const drawingObj: DrawingObject = {
      id: objId,
      type: prefix.startsWith('F') || prefix.startsWith('P') || prefix.startsWith('T') && prefix.endsWith('V') ? 'valve' : 'equipment',
      tag: tagUpper,
      sub_type: subType,
      page: pageNumber,
      bounding_box: item.bbox,
      center_coordinates: center,
      confidence: item.confidence,
      recognition_method: 'symbol_template',
      evidence: {
        source_document: documentName,
        page_number: pageNumber,
        bounding_box: item.bbox,
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
