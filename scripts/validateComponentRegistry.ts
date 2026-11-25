import { getComponentRegistry, validateComponentRegistry } from '../server/src/services/componentRegistryService';

const errors = validateComponentRegistry();
if (errors.length > 0) {
  console.error('Component registry validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const registry = getComponentRegistry();
  console.log(`Component registry ${registry.registry_version} is valid (${registry.components.length} classes).`);
}
