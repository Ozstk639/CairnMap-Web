import { getClassSchema, getClassSchemaByFeatureKey } from './schemaMetadata';
import { getFormatRuntimeContractByClassCode } from './formatRuntimeContracts';
import type { CairnMapResolvedClassSchema } from './schemaTypes';
import {
  buildGenericFeatureInfoFromSchema,
  coordsFromGenericFeatureInfo,
  hydrateGenericFeatureInfoFromSchema,
  validateGenericFeatureInfoFromSchema,
  type CairnMapGenericFormatBuildArgs,
} from './formatGenericAdapter';

export const GENERIC_FORMAT_DIAGNOSTIC_CLASS_CODES = [
  'ISP',
  'ISL',
  'ISG',
  'BUD',
  'FLR',
  'ROD',
  'TPP',
  'WRP',
] as const;

const normalizeClassCode = (value: unknown): string => String(value ?? '').trim().toUpperCase();

export function isGenericFormatDiagnosticClass(classCode: string): boolean {
  const normalized = normalizeClassCode(classCode);
  return (GENERIC_FORMAT_DIAGNOSTIC_CLASS_CODES as readonly string[]).includes(normalized);
}

export function getFormatSchemaForFeatureKeyOrClassCode(value: string): CairnMapResolvedClassSchema | undefined {
  return getClassSchemaByFeatureKey(value) ?? getClassSchema(value);
}

export function buildGenericFormatDiagnostic(
  featureKeyOrClassCode: string,
  args: CairnMapGenericFormatBuildArgs
): Record<string, unknown> | null {
  const schema = getFormatSchemaForFeatureKeyOrClassCode(featureKeyOrClassCode);
  if (!schema || !isGenericFormatDiagnosticClass(schema.classCode)) return null;
  return buildGenericFeatureInfoFromSchema(schema, args);
}

export function hydrateGenericFormatDiagnostic(featureKeyOrClassCode: string, featureInfo: unknown) {
  const schema = getFormatSchemaForFeatureKeyOrClassCode(featureKeyOrClassCode);
  if (!schema || !isGenericFormatDiagnosticClass(schema.classCode)) return null;
  return hydrateGenericFeatureInfoFromSchema(schema, featureInfo);
}

export function coordsFromGenericFormatDiagnostic(featureKeyOrClassCode: string, featureInfo: unknown) {
  const schema = getFormatSchemaForFeatureKeyOrClassCode(featureKeyOrClassCode);
  if (!schema || !isGenericFormatDiagnosticClass(schema.classCode)) return null;
  return coordsFromGenericFeatureInfo(schema, featureInfo);
}

export function validateGenericFormatDiagnostic(featureKeyOrClassCode: string, featureInfo: unknown): string | undefined | null {
  const schema = getFormatSchemaForFeatureKeyOrClassCode(featureKeyOrClassCode);
  if (!schema || !isGenericFormatDiagnosticClass(schema.classCode)) return null;
  return validateGenericFeatureInfoFromSchema(schema, featureInfo);
}


export const GENERIC_CONFIG_PRIMARY_CLASS_CODES = [
  'ISP',
  'ISL',
  'ISG',
  'BUD',
  'FLR',
  'ROD',
  'TPP',
  'WRP',
] as const;

const reportedFormatIssues = new Set<string>();

function reportFormatIssueOnce(level: 'error' | 'warn', key: string, message: string, details?: unknown) {
  if (reportedFormatIssues.has(key)) return;
  reportedFormatIssues.add(key);
  const prefix = '[CairnMap Format Runtime]';
  if (level === 'error') console.error(`${prefix} ${message}`, details ?? '');
  else console.warn(`${prefix} ${message}`, details ?? '');
}

export function isGenericConfigPrimaryClass(classCode: string): boolean {
  const normalized = normalizeClassCode(classCode);
  const contract = getFormatRuntimeContractByClassCode(normalized);
  if (contract) return contract.formatMode === 'genericConfigPrimary';
  return (GENERIC_CONFIG_PRIMARY_CLASS_CODES as readonly string[]).includes(normalized);
}

function shouldUseGenericConfigPrimary(featureKeyOrClassCode: string): boolean {
  const schema = getFormatSchemaForFeatureKeyOrClassCode(featureKeyOrClassCode);
  return Boolean(schema && isGenericConfigPrimaryClass(schema.classCode));
}

export function buildFeatureInfoWithConfigFallback(args: {
  featureKey: string;
  legacyBuild: (buildArgs: any) => any;
  buildArgs: any;
}): any {
  const legacy = args.legacyBuild(args.buildArgs);
  if (!shouldUseGenericConfigPrimary(args.featureKey)) return legacy;
  try {
    const generic = buildGenericFormatDiagnostic(args.featureKey, {
      coords: args.buildArgs?.coords ?? [],
      values: args.buildArgs?.values ?? {},
      groups: args.buildArgs?.groups ?? {},
      previousFeatureInfo: args.buildArgs?.prevFeatureInfo,
    });
    if (!generic) {
      reportFormatIssueOnce('error', `${args.featureKey}:build-missing-generic`, `Config-primary build unavailable for ${args.featureKey}. Falling back to legacy build.`);
      return legacy;
    }
    // Legacy currently owns system fields and a few compatibility transforms. Keep them until FORMAT cleanup.
    return { ...generic, ...legacy };
  } catch (error) {
    reportFormatIssueOnce('error', `${args.featureKey}:build-error`, `Config-primary build failed for ${args.featureKey}. Falling back to legacy build.`, error);
    return legacy;
  }
}

export function hydrateWithConfigFallback(args: {
  featureKey: string;
  legacyHydrate: (featureInfo: any) => any;
  featureInfo: any;
}): any {
  const legacy = args.legacyHydrate(args.featureInfo);
  if (!shouldUseGenericConfigPrimary(args.featureKey)) return legacy;
  try {
    const generic = hydrateGenericFormatDiagnostic(args.featureKey, args.featureInfo);
    if (!generic) {
      reportFormatIssueOnce('error', `${args.featureKey}:hydrate-missing-generic`, `Config-primary hydrate unavailable for ${args.featureKey}. Falling back to legacy hydrate.`);
      return legacy;
    }
    return {
      values: { ...generic.values, ...(legacy?.values ?? {}) },
      groups: { ...generic.groups, ...(legacy?.groups ?? {}) },
    };
  } catch (error) {
    reportFormatIssueOnce('error', `${args.featureKey}:hydrate-error`, `Config-primary hydrate failed for ${args.featureKey}. Falling back to legacy hydrate.`, error);
    return legacy;
  }
}

export function coordsFromFeatureInfoWithConfigFallback(args: {
  featureKey: string;
  legacyCoords: (featureInfo: any) => any[];
  featureInfo: any;
}): any[] {
  if (!shouldUseGenericConfigPrimary(args.featureKey)) return args.legacyCoords(args.featureInfo);
  try {
    const generic = coordsFromGenericFormatDiagnostic(args.featureKey, args.featureInfo);
    if (Array.isArray(generic) && generic.length > 0) return generic;
    reportFormatIssueOnce('warn', `${args.featureKey}:coords-empty-generic`, `Config-primary coordinates empty for ${args.featureKey}. Falling back to legacy coordinates.`);
    return args.legacyCoords(args.featureInfo);
  } catch (error) {
    reportFormatIssueOnce('error', `${args.featureKey}:coords-error`, `Config-primary coordinates failed for ${args.featureKey}. Falling back to legacy coordinates.`, error);
    return args.legacyCoords(args.featureInfo);
  }
}

export function validateImportItemWithConfigFallback(args: {
  featureKey: string;
  legacyValidate?: (item: any) => string | undefined;
  item: any;
}): string | undefined {
  const legacyError = args.legacyValidate?.(args.item);
  if (legacyError) return legacyError;
  if (!shouldUseGenericConfigPrimary(args.featureKey)) return undefined;
  try {
    const genericError = validateGenericFormatDiagnostic(args.featureKey, args.item);
    return genericError ?? undefined;
  } catch (error) {
    reportFormatIssueOnce('error', `${args.featureKey}:validate-error`, `Config-primary validation failed for ${args.featureKey}. Keeping legacy validation result.`, error);
    return undefined;
  }
}
