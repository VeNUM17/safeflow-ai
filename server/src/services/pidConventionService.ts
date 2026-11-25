import { PidConventionProfile } from '../types/conventionProfile';
import { getComponentRegistry } from './componentRegistryService';

const registry = getComponentRegistry();

function tagPatternForCategory(category: 'equipment' | 'valve' | 'instrument' | 'line' | 'connector'): string[] {
  const prefixes = registry.components
    .filter((component) => component.category === category)
    .flatMap((component) => component.tag_prefixes)
    .filter((prefix, index, all) => all.indexOf(prefix) === index)
    .sort((left, right) => right.length - left.length);
  if (prefixes.length === 0) return [];
  return [`\\b(${prefixes.join('|')})-([0-9]{3,5}[A-Z]?)\\b`];
}

function registryClassificationRules(): PidConventionProfile['symbolClassificationRules'] {
  return registry.components
    .filter((component) => component.category === 'equipment' || component.category === 'valve' || component.category === 'instrument')
    .flatMap((component) => {
      const [originX, originY, viewWidth, viewHeight] = component.symbol.viewBox.split(/\s+/).map(Number);
      const diagramScale = Math.min(1, 140 / Math.max(viewWidth, viewHeight));
      return component.tag_prefixes.map((prefix) => ({
        prefixOrClass: prefix,
        targetType: component.equipment_type,
        categoryDescription: component.name,
        defaultDimensions: { width: viewWidth * diagramScale, height: viewHeight * diagramScale },
        defaultPorts: component.ports.map((port) => ({
          name: port.id,
          type: port.role,
          offsetRatio: {
            x: viewWidth ? (port.x - originX) / viewWidth - 0.5 : 0,
            y: viewHeight ? (port.y - originY) / viewHeight - 0.5 : 0,
          },
        })),
      }));
    });
}

/**
 * Standard ISA-5.1 Instrumentation & Piping Convention Profile
 * Baseline industry standard for global process industries.
 */
export const ISA_5_1_STANDARD_PROFILE: PidConventionProfile = {
  id: 'profile-isa-5-1',
  name: 'ISA-5.1 Process Industry Standard',
  standard: 'ISA_5_1',
  description: 'ANSI/ISA-5.1-2009 Standard for Instrumentation Symbols and Identification and ASME Piping conventions.',
  version: '2009.1',

  tagPatterns: {
    equipment: tagPatternForCategory('equipment'),
    pipingLine: [
      '\\b([0-9\\.\\/]+)"?-([A-Z0-9]{2,6})-([0-9]{3,5}[A-Z]?)(?:-([A-Z0-9]+))?\\b',
      '\\b([0-9]{3,5}[A-Z]?)-([A-Z0-9]{2,6})-([0-9\\.\\/]+)"?\\b',
      ...tagPatternForCategory('line'),
    ],
    instrument: tagPatternForCategory('instrument'),
    offPageConnector: [
      ...tagPatternForCategory('connector'),
      '\\bCONTINUED\\s+ON\\s+([A-Z0-9\\-_]+)\\b',
      '\\bCONTINUES\\s+FROM\\s+([A-Z0-9\\-_]+)\\b',
    ],
    valve: tagPatternForCategory('valve'),
  },

  symbolClassificationRules: registryClassificationRules(),
  lineConventions: {
    processLine: {
      minStrokeWidth: 1.5,
      isDashed: false,
      functionalType: 'piping_line',
    },
    instrumentSignal: {
      isDashed: true,
      dashPattern: 'dashed',
      functionalType: 'signal_line',
    },
    electricalSignal: {
      isDashed: true,
      dashPattern: 'dotted',
      functionalType: 'signal_line',
    },
    pneumaticSignal: {
      isDashed: true,
      dashPattern: 'dash_dot',
      functionalType: 'signal_line',
    },
  },

  tolerances: {
    portSnapRadiusPx: 60,
    connectionGapPx: 25,
    labelGapBridgeMaxPx: 120, // bridges line breaks passing through tags or inline valves
    collinearAngleToleranceDeg: 12, // angular deviation allowed for collinear extensions
    teeJunctionPerpendicularThresholdPx: 15,
    minimumSegmentLengthPx: 4,
  },

  multiSheetRules: {
    requireExplicitMatchingTag: true,
    requireMatchingLineNumber: true,
    permitInferredSheetLinks: false, // Strict: no fake links across sheets
  },
};

/**
 * High-Density Sour Gas & Heavy Processing Facility Convention Profile
 * Configured specifically for multi-stage separation, flare networks, and dense valve manifolds.
 */
export const SOUR_GAS_FACILITY_PROFILE: PidConventionProfile = {
  ...ISA_5_1_STANDARD_PROFILE,
  id: 'profile-sour-gas-facility',
  name: 'Sour Gas & Multi-Stage Processing Facility',
  description: 'Optimized for sour hydrocarbon processing, sour flare headers, HP/LP separators, and dense valve stations.',
  version: '2026.3',

  tolerances: {
    portSnapRadiusPx: 55,
    connectionGapPx: 20,
    labelGapBridgeMaxPx: 140, // dense valve arrays need higher bridging distance across tags
    collinearAngleToleranceDeg: 10,
    teeJunctionPerpendicularThresholdPx: 12,
    minimumSegmentLengthPx: 5,
  },
};

/**
 * European DIN EN ISO 10628 Standard Profile
 */
export const DIN_EN_ISO_10628_PROFILE: PidConventionProfile = {
  id: 'profile-din-iso-10628',
  name: 'DIN EN ISO 10628 / KKS Convention',
  standard: 'DIN_EN_ISO_10628',
  description: 'European standard for diagrams for the chemical and petrochemical industry.',
  version: '2015.1',

  tagPatterns: {
    equipment: [
      '\\b[0-9]{2}[A-Z]{3}[0-9]{2,3}\\b', // KKS format e.g. 10LAB01
      '\\b(B|P|K|W|H|R|T|C|Y|Q)[0-9]{3,5}[A-Z]?\\b',
    ],
    pipingLine: [
      '\\bDN[0-9]{2,4}-([A-Z0-9]+)-([0-9]{3,5})\\b',
      '\\b([0-9]{3,5})-DN([0-9]{2,4})-([A-Z0-9]+)\\b',
    ],
    instrument: [
      '\\b([0-9]{2})?[A-Z]{2,4}[0-9]{2,4}\\b',
    ],
    offPageConnector: [
      '\\b(BL|SHEET|BLATT)-([A-Z0-9\\-]+)\\b',
    ],
    valve: [
      '\\b(V|AA|AN|KA)[0-9]{3,5}\\b',
    ],
  },

  symbolClassificationRules: ISA_5_1_STANDARD_PROFILE.symbolClassificationRules,
  lineConventions: ISA_5_1_STANDARD_PROFILE.lineConventions,
  tolerances: {
    portSnapRadiusPx: 50,
    connectionGapPx: 20,
    labelGapBridgeMaxPx: 110,
    collinearAngleToleranceDeg: 10,
    teeJunctionPerpendicularThresholdPx: 14,
    minimumSegmentLengthPx: 5,
  },
  multiSheetRules: {
    requireExplicitMatchingTag: true,
    requireMatchingLineNumber: true,
    permitInferredSheetLinks: false,
  },
};

// In-Memory Profile Registry
const profileRegistry: Map<string, PidConventionProfile> = new Map([
  [ISA_5_1_STANDARD_PROFILE.id, ISA_5_1_STANDARD_PROFILE],
  [SOUR_GAS_FACILITY_PROFILE.id, SOUR_GAS_FACILITY_PROFILE],
  [DIN_EN_ISO_10628_PROFILE.id, DIN_EN_ISO_10628_PROFILE],
]);

/**
 * Retrieve a registered convention profile by ID, defaulting to ISA 5.1
 */
export function getConventionProfile(profileId?: string): PidConventionProfile {
  if (profileId && profileRegistry.has(profileId)) {
    return profileRegistry.get(profileId)!;
  }
  return ISA_5_1_STANDARD_PROFILE;
}

/**
 * List all available convention profiles
 */
export function listConventionProfiles(): PidConventionProfile[] {
  return Array.from(profileRegistry.values());
}

/**
 * Register or update a custom convention profile
 */
export function registerConventionProfile(profile: PidConventionProfile): void {
  profileRegistry.set(profile.id, profile);
}
