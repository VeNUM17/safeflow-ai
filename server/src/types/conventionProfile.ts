import { BoundingBox, Coordinate2D, EquipmentType } from './index';

/**
 * P&ID Convention Profile Specification
 * Allows SafeFlow AI to adapt dynamically to varied engineering standards (ISA 5.1, DIN/ISO, PIP, KKS, Owner-Specific)
 * without hardcoding tags, symbols, or connections.
 */
export interface PidConventionProfile {
  id: string;
  name: string;
  standard: 'ISA_5_1' | 'DIN_EN_ISO_10628' | 'PIP' | 'KKS' | 'CUSTOM';
  description: string;
  version: string;

  // Tag Recognition Regexes & Rules
  tagPatterns: {
    equipment: string[]; // e.g. ["^(TK|PG|V|E|P|R|C|MX|K|T)-([0-9]{3,5}[A-Z]?)$"]
    pipingLine: string[]; // e.g. ["^([0-9\\.\\/]+)\"?-([A-Z0-9]{2,6})-([0-9]{3,5}[A-Z]?)(?:-([A-Z0-9]+))?$"]
    instrument: string[]; // e.g. ["^(FIT|FIC|FT|TIT|LIT|PIT|PT|TT|LT|PIC|LIC|PCV|FCV|TCV|LCV|PSV|PRV)-([0-9]{3,5}[A-Z]?)$"]
    offPageConnector: string[]; // e.g. ["^(OPC|TO|FROM|DWG|CONT)-([A-Z0-9\\-]+)$"]
    valve: string[]; // e.g. ["^(HV|XV|DV|NRV|SDV|BDV|NV|BV|CV|MV)-([0-9]{3,5}[A-Z]?)$"]
  };

  // Symbol Classification Mappings
  symbolClassificationRules: {
    prefixOrClass: string;
    targetType: EquipmentType;
    categoryDescription: string;
    defaultDimensions: { width: number; height: number };
    defaultPorts: {
      name: string;
      type: 'inlet' | 'outlet' | 'bidirectional' | 'signal' | 'vent' | 'drain' | 'flange';
      offsetRatio: Coordinate2D; // Normalized ratio (-0.5 to 0.5 relative to center)
    }[];
  }[];

  // Line Style and Dash Rules
  lineConventions: {
    processLine: {
      minStrokeWidth: number;
      isDashed: boolean;
      functionalType: 'piping_line';
    };
    instrumentSignal: {
      isDashed: boolean;
      dashPattern?: string; // e.g. "dashed", "dotted"
      functionalType: 'signal_line';
    };
    electricalSignal: {
      isDashed: boolean;
      dashPattern?: string;
      functionalType: 'signal_line';
    };
    pneumaticSignal: {
      isDashed: boolean;
      dashPattern?: string;
      functionalType: 'signal_line';
    };
  };

  // Geometric & Topology Tolerances (in drawing units / pixels)
  tolerances: {
    portSnapRadiusPx: number; // Max distance to snap line endpoint to nozzle
    connectionGapPx: number; // Tolerance for collinear or endpoint continuity
    labelGapBridgeMaxPx: number; // Max distance to bridge broken lines passing through labels/symbols
    collinearAngleToleranceDeg: number; // Max angular deviation for collinear segment extension
    teeJunctionPerpendicularThresholdPx: number; // Max perpendicular distance to declare a T-junction
    minimumSegmentLengthPx: number; // Filter out tiny noise specks
  };

  // Multi-Sheet & Cross-Sheet Resolution Rules
  multiSheetRules: {
    requireExplicitMatchingTag: boolean; // Must match connector ID exactly
    requireMatchingLineNumber: boolean; // Must match line number on both sheets
    permitInferredSheetLinks: boolean; // If false, never fabricate links without explicit drawing evidence
  };
}

/**
 * Drawing Zone / Sheet Boundary Definitions (Stage 1)
 */
export interface SheetStructure {
  drawingBoundary: BoundingBox;
  diagramRegion: BoundingBox;
  titleBlock?: {
    bbox: BoundingBox;
    drawingNumber?: string;
    title?: string;
    revision?: string;
    facility?: string;
    date?: string;
  };
  legendRegion?: {
    bbox: BoundingBox;
    symbolsDetected: string[];
    lineTypesDetected: string[];
  };
  revisionTable?: {
    bbox: BoundingBox;
    revisions: { rev: string; description: string; date?: string }[];
  };
  notesRegion?: {
    bbox: BoundingBox;
  };
}

/**
 * Tile Definition for Multi-Scale / STA Tiling (Stage 2)
 */
export interface DrawingTile {
  index: number;
  row: number;
  col: number;
  bbox: BoundingBox; // Coordinate bounding box on the full page
  overlapPx: number;
}
