import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getComponentRegistry } from '../server/src/services/componentRegistryService';
import { generateSyntheticPidSamples } from '../server/src/services/syntheticPidDatasetService';

function numberArgument(name: string, fallback: number): number {
  const arg = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (!arg) return fallback;
  const parsed = Number(arg.slice(name.length + 3));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringArgument(name: string, fallback: string): string {
  const arg = process.argv.find((value) => value.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : fallback;
}

async function main(): Promise<void> {
  const count = Math.max(1, Math.min(500, Math.floor(numberArgument('samples', 10))));
  const seed = Math.floor(numberArgument('seed', 20261124));
  const outputDirectory = path.resolve(process.cwd(), stringArgument('output', 'generated/component-training-data'));
  const registry = getComponentRegistry();
  const classes = registry.components
    .filter((component) => component.tag_prefixes.length > 0)
    .sort((left, right) => left.class_id.localeCompare(right.class_id));
  const classIndex = new Map(classes.map((component, index) => [component.class_id, index]));
  const samples = generateSyntheticPidSamples(count, seed);

  await mkdir(outputDirectory, { recursive: true });
  for (const sample of samples) {
    await writeFile(path.join(outputDirectory, sample.file_name), sample.svg, 'utf8');
  }

  const manifest = {
    dataset_version: '0.1.0',
    registry_version: registry.registry_version,
    seed,
    image_width: 1200,
    image_height: 800,
    classes: classes.map((component, index) => ({ index, class_id: component.class_id, name: component.name })),
    images: samples.map((sample) => ({
      file_name: sample.file_name,
      annotations: sample.annotations.map((annotation) => ({
        ...annotation,
        class_index: classIndex.get(annotation.class_id),
      })),
    })),
    safety_note: 'Synthetic labels are for detector development only and are not evidence of installed equipment or site conditions.',
  };
  await writeFile(path.join(outputDirectory, 'annotations.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Generated ${samples.length} labeled SVG sheets in ${outputDirectory}`);
}

main().catch((error) => {
  console.error('Synthetic P&ID dataset generation failed:', error);
  process.exitCode = 1;
});
