import { listRenderFormatFinalContracts } from './renderFormatFinalMetadata';
import { listDisplayRuntimeContractsForClasses } from './displayRuleRuntimeAdapter';
import { listFormatRuntimeContracts } from './formatRuntimeContracts';

export type CairnMapLegacyCompatibilityRole = 'displayAlgorithmRuntime' | 'formatRuntime' | 'compatibilityExport';

export type CairnMapLegacyCompatibilityManifestItem = {
  file: string;
  roles: CairnMapLegacyCompatibilityRole[];
  configOwnedClassCount: number;
  notes: string;
};

export function getRenderFormatLegacyCompatibilityManifest(): CairnMapLegacyCompatibilityManifestItem[] {
  const classCodes = listRenderFormatFinalContracts().map((item) => item.classCode);
  const displayContracts = listDisplayRuntimeContractsForClasses(classCodes);
  const formatContracts = listFormatRuntimeContracts();
  return [
    {
      file: 'src/components/Rules/rendering/featureRenderRules.ts',
      roles: ['displayAlgorithmRuntime', 'compatibilityExport'],
      configOwnedClassCount: displayContracts.filter((item) => item.mode === 'configPrimary').length,
      notes: 'Display declarations are config-owned; this file remains the legacy-compatible rule export and algorithm executor.',
    },
    {
      file: 'src/components/Common/featureFormats.ts',
      roles: ['formatRuntime', 'compatibilityExport'],
      configOwnedClassCount: formatContracts.filter((item) => item.formatMode === 'genericConfigPrimary' || item.formatMode === 'specialFormatterConfigPrimary').length,
      notes: 'Schema/format contracts are config-owned; this file remains the legacy-compatible API export and fallback surface.',
    },
  ];
}

export function isRenderFormatLegacyCompatibilityReady(): boolean {
  return getRenderFormatLegacyCompatibilityManifest().every((item) => item.configOwnedClassCount >= 16);
}
