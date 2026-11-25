import { v4 as uuidv4 } from 'uuid';
import {
  DrawingObject,
  EquipmentPort,
  BoundingBox,
  Coordinate2D,
  EquipmentType,
  createDefaultSpecifications,
} from '../types';
import { PidConventionProfile } from '../types/conventionProfile';
import { getConventionProfile } from './pidConventionService';
import { findComponentForTag } from './componentRegistryService';

export interface DetectedSymbolResult {
  objects: DrawingObject[];
  ports: EquipmentPort[];
}

/**
 * Maps detected tags and bounding boxes to physical P&ID symbols with explicit connection ports (nozzles).
 * Configurable via PidConventionProfile to eliminate hardcoded assumptions.
 */
export function detectDrawingSymbols(
  tags: { tag: string; type: string; bbox: BoundingBox; confidence: number }[],
  documentName: string,
  pageNumber = 1,
  profile?: PidConventionProfile
): DetectedSymbolResult {
  const activeProfile = profile || getConventionProfile();
  const objects: DrawingObject[] = [];
  const ports: EquipmentPort[] = [];

  for (const item of tags) {
    const objId = uuidv4();
    const tagUpper = item.tag.toUpperCase();
    const prefix = tagUpper.split('-')[0];

    const registryComponent = findComponentForTag(tagUpper, item.type);
    const matchedRule = activeProfile.symbolClassificationRules.find(
      (rule) => rule.prefixOrClass.toUpperCase() === prefix || rule.prefixOrClass.toUpperCase() === item.type.toUpperCase()
    );
    const eqType: EquipmentType = matchedRule?.targetType ?? registryComponent?.equipment_type ?? 'other';
    const subType = matchedRule?.categoryDescription ?? registryComponent?.name ?? 'Unclassified symbol';
    const viewBox = registryComponent?.symbol.viewBox.split(/\s+/).map(Number);
    const symWidth = matchedRule?.defaultDimensions.width ?? viewBox?.[2] ?? 50;
    const symHeight = matchedRule?.defaultDimensions.height ?? viewBox?.[3] ?? 50;
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

    const directionVectors: Record<string, Coordinate2D> = {
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
    };
    const registryViewBox = registryComponent?.symbol.viewBox.split(/\s+/).map(Number);
    const useRegistryPorts = registryComponent && (!matchedRule || activeProfile.id === 'profile-isa-5-1');
    const portDefinitions = useRegistryPorts
      ? registryComponent.ports.map((port) => ({
          id: port.id,
          x: registryViewBox?.[2] ? ((port.x - (registryViewBox[0] || 0)) / registryViewBox[2]) * symWidth : symWidth / 2,
          y: registryViewBox?.[3] ? ((port.y - (registryViewBox[1] || 0)) / registryViewBox[3]) * symHeight : symHeight / 2,
          dir: port.dir,
          portType: port.role,
        }))
      : (matchedRule?.defaultPorts || []).map((port) => ({
          id: port.name,
          x: (port.offsetRatio.x + 0.5) * symWidth,
          y: (port.offsetRatio.y + 0.5) * symHeight,
          dir: Math.abs(port.offsetRatio.x) > Math.abs(port.offsetRatio.y)
            ? (port.offsetRatio.x < 0 ? 'left' : 'right')
            : (port.offsetRatio.y < 0 ? 'up' : 'down'),
          portType: port.type === 'flange' ? 'bidirectional' : port.type,
        }));

    const eqPorts: EquipmentPort[] = portDefinitions.map((port) => ({
      id: `port-${objId}-${port.id}`,
      equipment_id: objId,
      equipment_tag: tagUpper,
      port_type: port.portType,
      position: { x: symbolBBox.x + port.x, y: symbolBBox.y + port.y },
      normal_vector: directionVectors[port.dir] || { x: 0, y: 0 },
      connection_candidates: [],
      confidence: item.confidence,
    }));


    let objType: 'equipment' | 'valve' | 'instrument' | 'line_tag' | 'junction' = 'equipment';
    if (registryComponent?.category === 'valve' || ['manual_valve', 'control_valve', 'isolation_valve', 'drain_valve'].includes(eqType)) {
      objType = 'valve';
    } else if (registryComponent?.category === 'instrument' || eqType === 'instrument') {
      objType = 'instrument';
    } else if (registryComponent?.category === 'line') {
      objType = 'line_tag';
    } else if (registryComponent?.category === 'connector') {
      objType = 'junction';
    }
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
      raw_properties: registryComponent
        ? { component_class_id: registryComponent.class_id, inline: registryComponent.inline }
        : {},
      specifications: createDefaultSpecifications(eqType),
    };

    objects.push(drawingObj);
  }

  return { objects, ports };
}
