import { z } from 'zod';
import registryData from '../data/componentRegistry.json';
import type { EquipmentType } from '../types';

const portSchema = z.object({
  id: z.string().min(1),
  x: z.number(),
  y: z.number(),
  dir: z.enum(['left', 'right', 'up', 'down']),
  kind: z.enum(['process', 'signal', 'electrical']),
  role: z.enum(['inlet', 'outlet', 'bidirectional', 'drain', 'vent', 'signal']),
});

const componentSchema = z.object({
  class_id: z.string().min(1),
  parent: z.string().min(1).optional(),
  name: z.string().min(1),
  category: z.enum(['equipment', 'valve', 'instrument', 'line', 'connector']),
  equipment_type: z.string().min(1),
  standard_refs: z.array(z.string().min(1)),
  tag_prefixes: z.array(z.string().min(1)),
  aliases: z.array(z.string().min(1)),
  symbol: z.object({
    key: z.string().min(1),
    viewBox: z.string().regex(/^\s*-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s*$/),
    variants: z.array(z.string()),
  }),
  ports: z.array(portSchema).min(1),
  inline: z.boolean(),
  default_size_mm: z.object({ w: z.number().positive(), h: z.number().positive() }),
  attributes: z.array(z.string().min(1)),
  typical_failure_modes: z.array(z.string().min(1)),
  typical_safeguards: z.array(z.string().min(1)),
  rule_tags: z.array(z.string().min(1)),
  registry_version_added: z.string().min(1),
});

const registrySchema = z.object({
  registry_version: z.string().min(1),
  allowed_rule_tags: z.array(z.string().min(1)).min(1),
  components: z.array(componentSchema).min(1),
});

export type ComponentRegistryPort = z.infer<typeof portSchema>;
export type ComponentRegistryEntry = z.infer<typeof componentSchema> & {
  equipment_type: EquipmentType;
};
export type ComponentRegistry = Omit<z.infer<typeof registrySchema>, 'components'> & {
  components: ComponentRegistryEntry[];
};

function collectRegistryErrors(data: unknown): { registry?: ComponentRegistry; errors: string[] } {
  const parsed = registrySchema.safeParse(data);
  if (!parsed.success) {
    return { errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) };
  }

  const registry = parsed.data;
  const errors: string[] = [];
  const classIds = new Set<string>();
  const validEquipmentTypes = new Set<EquipmentType>([
    'vessel', 'tank', 'column', 'mixing_tank', 'pump', 'compressor', 'heat_exchanger', 'reactor',
    'agitator', 'separator', 'manual_valve', 'isolation_valve', 'control_valve', 'drain_valve', 'instrument', 'other',
  ]);

  for (const component of registry.components) {
    if (classIds.has(component.class_id)) errors.push(`Duplicate class_id '${component.class_id}'.`);
    classIds.add(component.class_id);
    if (!validEquipmentTypes.has(component.equipment_type as EquipmentType)) {
      errors.push(`${component.class_id}: unsupported equipment_type '${component.equipment_type}'.`);
    }
    for (const tagPrefix of component.tag_prefixes) {
      if (!/^[A-Z0-9]+$/i.test(tagPrefix)) errors.push(`${component.class_id}: invalid tag prefix '${tagPrefix}'.`);
    }
    for (const ruleTag of component.rule_tags) {
      if (!registry.allowed_rule_tags.includes(ruleTag)) errors.push(`${component.class_id}: unknown rule_tag '${ruleTag}'.`);
    }

    const [minX, minY, width, height] = component.symbol.viewBox.trim().split(/\s+/).map(Number);
    if (width <= 0 || height <= 0) errors.push(`${component.class_id}: symbol viewBox dimensions must be positive.`);
    const portIds = new Set<string>();
    for (const port of component.ports) {
      if (portIds.has(port.id)) errors.push(`${component.class_id}: duplicate port id '${port.id}'.`);
      portIds.add(port.id);
      if (port.x < minX || port.y < minY || port.x > minX + width || port.y > minY + height) {
        errors.push(`${component.class_id}.${port.id}: port is outside the symbol viewBox.`);
      }
    }
  }

  for (const component of registry.components) {
    if (component.parent && !classIds.has(component.parent)) {
      errors.push(`${component.class_id}: parent '${component.parent}' does not exist.`);
    }
    for (const variant of component.symbol.variants) {
      if (!classIds.has(variant)) errors.push(`${component.class_id}: symbol variant '${variant}' does not exist.`);
    }

    const ancestry = new Set<string>([component.class_id]);
    let parentId = component.parent;
    while (parentId) {
      if (ancestry.has(parentId)) {
        errors.push(`${component.class_id}: parent links contain a cycle at '${parentId}'.`);
        break;
      }
      ancestry.add(parentId);
      parentId = registry.components.find((candidate) => candidate.class_id === parentId)?.parent;
    }
  }

  if (errors.length > 0) return { errors };
  return {
    registry: {
      ...registry,
      components: registry.components.map((component) => ({
        ...component,
        equipment_type: component.equipment_type as EquipmentType,
      })),
    },
    errors,
  };
}

const validatedRegistry = collectRegistryErrors(registryData);
if (!validatedRegistry.registry) {
  throw new Error(`Invalid component registry:\n${validatedRegistry.errors.join('\n')}`);
}

export const COMPONENT_REGISTRY = validatedRegistry.registry;

export function validateComponentRegistry(data: unknown = registryData): string[] {
  return collectRegistryErrors(data).errors;
}

export function getComponentRegistry(): ComponentRegistry {
  return COMPONENT_REGISTRY;
}

export function findComponentByClassId(classId: string): ComponentRegistryEntry | undefined {
  const normalizedId = classId.trim().toLowerCase();
  return COMPONENT_REGISTRY.components.find((component) => component.class_id.toLowerCase() === normalizedId);
}

export function findComponentForTag(tag: string, hint = ''): ComponentRegistryEntry | undefined {
  const normalizedTag = tag.trim().toUpperCase();
  const prefix = normalizedTag.split('-')[0];
  const prefixMatch = COMPONENT_REGISTRY.components
    .filter((component) => component.tag_prefixes.some((candidate) => candidate.toUpperCase() === prefix))
    .sort((left, right) => Math.max(...right.tag_prefixes.map((item) => item.length), 0) - Math.max(...left.tag_prefixes.map((item) => item.length), 0))[0];
  if (prefixMatch) return prefixMatch;

  const normalizedHint = hint.trim().toLowerCase();
  if (!normalizedHint) return undefined;
  return COMPONENT_REGISTRY.components.find((component) =>
    component.class_id.toLowerCase() === normalizedHint ||
    component.symbol.key.toLowerCase() === normalizedHint ||
    component.name.toLowerCase() === normalizedHint ||
    component.aliases.some((alias) => alias.toLowerCase() === normalizedHint)
  );
}
