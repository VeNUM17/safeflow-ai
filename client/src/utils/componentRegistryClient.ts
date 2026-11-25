export interface ClientRegistryPort {
  id: string;
  x: number;
  y: number;
  dir: 'left' | 'right' | 'up' | 'down';
  kind: 'process' | 'signal' | 'electrical';
  role: 'inlet' | 'outlet' | 'bidirectional' | 'drain' | 'vent' | 'signal';
}

export interface ClientRegistryComponent {
  class_id: string;
  parent?: string;
  name: string;
  category: 'equipment' | 'valve' | 'instrument' | 'line' | 'connector';
  equipment_type: string;
  tag_prefixes: string[];
  aliases: string[];
  symbol: { key: string; viewBox: string; variants: string[] };
  ports: ClientRegistryPort[];
  inline: boolean;
  default_size_mm: { w: number; h: number };
}

export interface ClientComponentRegistry {
  registry_version: string;
  allowed_rule_tags: string[];
  components: ClientRegistryComponent[];
}

let registryRequest: Promise<ClientComponentRegistry | null> | null = null;
let cachedRegistry: ClientComponentRegistry | null = null;

export function getCachedComponentRegistry(): ClientComponentRegistry | null {
  return cachedRegistry;
}

export function loadComponentRegistry(): Promise<ClientComponentRegistry | null> {
  if (cachedRegistry) {
    return Promise.resolve(cachedRegistry);
  }
  if (!registryRequest) {
    registryRequest = fetch('/api/component-registry')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Registry request failed (${response.status})`);
        const payload = await response.json();
        cachedRegistry = payload?.success && payload?.data?.components ? (payload.data as ClientComponentRegistry) : null;
        return cachedRegistry;
      })
      .catch((error) => {
        console.warn('Component registry is unavailable; using local drawing defaults.', error);
        return null;
      });
  }
  return registryRequest;
}

export function findClientRegistryComponent(
  tag: string,
  hint: string | undefined,
  components: ClientRegistryComponent[] | undefined,
  classId?: string
): ClientRegistryComponent | undefined {
  if (!components?.length) return undefined;
  if (classId) {
    const classMatch = components.find((component) => component.class_id.toLowerCase() === classId.toLowerCase());
    if (classMatch) return classMatch;
  }
  const prefix = (tag || '').trim().toUpperCase().split('-')[0];
  const match = components
    .filter((component) => component.tag_prefixes.some((candidate) => candidate.toUpperCase() === prefix))
    .sort((left, right) => Math.max(...right.tag_prefixes.map((item) => item.length), 0) - Math.max(...left.tag_prefixes.map((item) => item.length), 0))[0];
  if (match) return match;
  const normalizedHint = (hint || '').trim().toLowerCase();
  if (!normalizedHint) return undefined;
  return components.find((component) =>
    component.class_id.toLowerCase() === normalizedHint ||
    component.symbol.key.toLowerCase() === normalizedHint ||
    component.name.toLowerCase() === normalizedHint ||
    component.aliases.some((alias) => alias.toLowerCase() === normalizedHint)
  );
}
