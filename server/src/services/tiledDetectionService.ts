import { v4 as uuidv4 } from 'uuid';
import { BoundingBox, DrawingObject, EquipmentPort, EquipmentType } from '../types';
import { DrawingTile, PidConventionProfile } from '../types/conventionProfile';
import { getConventionProfile } from './pidConventionService';

export interface RawTileDetection {
  tileIndex: number;
  classLabel: string;
  confidence: number;
  localBbox: BoundingBox; // Coordinates relative to tile
}

export interface MergedDetection {
  id: string;
  classLabel: string;
  confidence: number;
  globalBbox: BoundingBox;
  associatedTag?: string;
  sourceTileIndices: number[];
}

/**
 * Calculates 2D Intersection-over-Union (IoU) between two bounding boxes
 */
export function calculateIoU(boxA: BoundingBox, boxB: BoundingBox): number {
  const xA = Math.max(boxA.x, boxB.x);
  const yA = Math.max(boxA.y, boxB.y);
  const xB = Math.min(boxA.x + boxA.w, boxB.x + boxB.w);
  const yB = Math.min(boxA.y + boxA.h, boxB.y + boxB.h);

  const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  const boxAArea = boxA.w * boxA.h;
  const boxBArea = boxB.w * boxB.h;
  const unionArea = boxAArea + boxBArea - interArea;

  return unionArea > 0 ? interArea / unionArea : 0;
}

/**
 * Stage 2: Generates overlapping tiles for multi-scale STA / RF-DETR detection
 */
export function partitionSheetIntoTiles(
  pageWidth: number,
  pageHeight: number,
  tileSize = 1024,
  overlapRatio = 0.2
): DrawingTile[] {
  const tiles: DrawingTile[] = [];
  const step = Math.round(tileSize * (1 - overlapRatio));
  const overlapPx = Math.round(tileSize * overlapRatio);

  let tileIdx = 0;
  let row = 0;

  for (let y = 0; y < pageHeight; y += step) {
    let col = 0;
    const tileH = Math.min(tileSize, pageHeight - y);

    for (let x = 0; x < pageWidth; x += step) {
      const tileW = Math.min(tileSize, pageWidth - x);

      tiles.push({
        index: tileIdx++,
        row,
        col,
        bbox: { x, y, w: tileW, h: tileH },
        overlapPx,
      });

      col++;
      if (x + tileSize >= pageWidth) break;
    }
    row++;
    if (y + tileSize >= pageHeight) break;
  }

  return tiles;
}

/**
 * Reprojects local tile detections to global drawing coordinates and merges duplicates
 * across tile seams using Non-Maximum Suppression (NMS)
 */
export function mergeTiledDetections(
  rawDetections: RawTileDetection[],
  tiles: DrawingTile[],
  iouThreshold = 0.45
): MergedDetection[] {
  // 1. Project to global coordinates
  const globalCandidates: (RawTileDetection & { globalBbox: BoundingBox })[] = rawDetections.map((d) => {
    const tile = tiles.find((t) => t.index === d.tileIndex) || { bbox: { x: 0, y: 0, w: 0, h: 0 } };
    return {
      ...d,
      globalBbox: {
        x: tile.bbox.x + d.localBbox.x,
        y: tile.bbox.y + d.localBbox.y,
        w: d.localBbox.w,
        h: d.localBbox.h,
      },
    };
  });

  // Sort descending by detection confidence
  globalCandidates.sort((a, b) => b.confidence - a.confidence);

  const merged: MergedDetection[] = [];
  const suppressed = new Set<number>();

  for (let i = 0; i < globalCandidates.length; i++) {
    if (suppressed.has(i)) continue;
    const current = globalCandidates[i];

    const matchingTiles = [current.tileIndex];
    let fusedBbox = { ...current.globalBbox };
    let weightSum = current.confidence;
    let weightedX = current.globalBbox.x * current.confidence;
    let weightedY = current.globalBbox.y * current.confidence;
    let weightedW = current.globalBbox.w * current.confidence;
    let weightedH = current.globalBbox.h * current.confidence;

    for (let j = i + 1; j < globalCandidates.length; j++) {
      if (suppressed.has(j)) continue;
      const other = globalCandidates[j];

      // Same or compatible class label and overlapping IoU
      if (current.classLabel === other.classLabel) {
        const iou = calculateIoU(current.globalBbox, other.globalBbox);
        if (iou >= iouThreshold) {
          suppressed.add(j);
          matchingTiles.push(other.tileIndex);

          // Weighted Box Fusion
          weightSum += other.confidence;
          weightedX += other.globalBbox.x * other.confidence;
          weightedY += other.globalBbox.y * other.confidence;
          weightedW += other.globalBbox.w * other.confidence;
          weightedH += other.globalBbox.h * other.confidence;
        }
      }
    }

    if (weightSum > 0) {
      fusedBbox = {
        x: Math.round(weightedX / weightSum),
        y: Math.round(weightedY / weightSum),
        w: Math.round(weightedW / weightSum),
        h: Math.round(weightedH / weightSum),
      };
    }

    merged.push({
      id: `det-${uuidv4().slice(0, 8)}`,
      classLabel: current.classLabel,
      confidence: Math.min(0.99, current.confidence + (matchingTiles.length > 1 ? 0.03 : 0)),
      globalBbox: fusedBbox,
      sourceTileIndices: Array.from(new Set(matchingTiles)),
    });
  }

  return merged;
}

/**
 * Associates detected symbols with neighboring text tags (STA Tag-Association Stage)
 */
export function associateSymbolsWithTags(
  detections: MergedDetection[],
  recognizedTags: { tag: string; type: string; bbox: BoundingBox; confidence: number }[],
  maxDistancePx = 150
): MergedDetection[] {
  const unassignedTags = [...recognizedTags];

  return detections.map((det) => {
    const detCenter = {
      x: det.globalBbox.x + det.globalBbox.w / 2,
      y: det.globalBbox.y + det.globalBbox.h / 2,
    };

    let closestTagIndex = -1;
    let closestDist = maxDistancePx;

    for (let i = 0; i < unassignedTags.length; i++) {
      const tag = unassignedTags[i];
      const tagCenter = {
        x: tag.bbox.x + tag.bbox.w / 2,
        y: tag.bbox.y + tag.bbox.h / 2,
      };

      const dist = Math.sqrt(Math.pow(detCenter.x - tagCenter.x, 2) + Math.pow(detCenter.y - tagCenter.y, 2));
      if (dist < closestDist) {
        closestDist = dist;
        closestTagIndex = i;
      }
    }

    if (closestTagIndex !== -1) {
      const matched = unassignedTags.splice(closestTagIndex, 1)[0];
      return {
        ...det,
        associatedTag: matched.tag,
      };
    }

    return det;
  });
}
