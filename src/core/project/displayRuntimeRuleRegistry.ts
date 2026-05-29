import { DISPLAY_RUNTIME_CORE_CLASS_CODES } from './displayRuntimeTypes';
import { resolveDisplayRuntimeContractForClass } from './displayRuleRuntimeAdapter';

export type CairnMapDisplayRuntimeRuleRegistryItem = {
  classCode: string;
  mode: string;
  profile?: string;
  algorithmKeys: string[];
};

function readAlgorithmKeys(rule: unknown): string[] {
  const algorithms = (rule as Record<string, unknown> | null)?.algorithms;
  if (!Array.isArray(algorithms)) return [];
  return algorithms
    .map((item) => String((item as Record<string, unknown> | null)?.key ?? '').trim())
    .filter(Boolean);
}

export function listDisplayRuntimeRuleRegistryItems(): CairnMapDisplayRuntimeRuleRegistryItem[] {
  return DISPLAY_RUNTIME_CORE_CLASS_CODES.map((classCode) => {
    const contract = resolveDisplayRuntimeContractForClass(classCode);
    return {
      classCode,
      mode: contract.mode,
      profile: contract.rule?.profile,
      algorithmKeys: readAlgorithmKeys(contract.rule),
    };
  });
}

export function getDisplayRuntimeRuleRegistryItem(classCode: string): CairnMapDisplayRuntimeRuleRegistryItem | undefined {
  return listDisplayRuntimeRuleRegistryItems().find((item) => item.classCode === String(classCode ?? '').trim().toUpperCase());
}
