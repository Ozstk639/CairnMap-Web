import type {
  ParsedReviewPackage,
  ParsedReviewPackageFeature,
  ParsedReviewPackagePicture,
  ReviewPackageDeleteMark,
  ReviewPackageProfile,
  ReviewPackageValidationIssue,
} from './contracts';

function warning(code: ReviewPackageValidationIssue['code'], message: string, path?: string): ReviewPackageValidationIssue {
  return { code, severity: 'warning', message, ...(path ? { path } : {}) };
}

function ignored(path: string): boolean {
  const lower = path.toLowerCase();
  return !path || lower === '.ds_store' || lower.endsWith('/.ds_store') || lower.startsWith('__macosx/');
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function marker(path: string, profile: ReviewPackageProfile): boolean {
  return path === profile.indexPath || path === profile.reviewPath || path === profile.deletePath
    || path.startsWith(`${profile.featureRoot}/`) || path.startsWith(`${profile.pictureRoot}/`)
    || (!!profile.toolRefreshRoot && path.startsWith(`${profile.toolRefreshRoot}/`));
}

function determineRootPrefix(paths: string[], profile: ReviewPackageProfile): string {
  if (paths.some((path) => marker(stripTrailingSlash(path), profile))) return '';
  const roots = [...new Set(paths.map((path) => path.split('/')[0]).filter(Boolean))];
  return roots.length === 1 ? `${roots[0]}/` : '';
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function parseDeleteMarks(value: Record<string, unknown> | null): ReviewPackageDeleteMark[] {
  const items = value?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    if (typeof item === 'string') return [{ ID: item }];
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const object = item as Record<string, unknown>;
    const ID = String(object.ID ?? object.id ?? '').trim();
    if (!ID) return [];
    const Name = String(object.Name ?? object.name ?? '').trim();
    const worldId = String(object.worldId ?? object.World ?? '').trim();
    const classCode = String(object.classCode ?? object.Class ?? '').trim();
    return [{ ID, ...(Name ? { Name } : {}), ...(worldId ? { worldId } : {}), ...(classCode ? { classCode } : {}) }];
  });
}

function parseFeaturePath(path: string, profile: ReviewPackageProfile): Omit<ParsedReviewPackageFeature, 'path' | 'record'> | null {
  const parts = path.split('/');
  const filename = parts[parts.length - 1];
  if (parts.length < 4 || parts[0] !== profile.featureRoot || !filename?.endsWith('.json')) return null;
  const featureId = filename.slice(0, -'.json'.length);
  return { worldId: parts[1], classCode: parts[2], kindPath: parts.slice(3, -1), featureId };
}

function parsePicturePath(path: string, profile: ReviewPackageProfile): Omit<ParsedReviewPackagePicture, 'path' | 'content'> | null {
  const parts = path.split('/');
  if (parts.length < 5 || parts[0] !== profile.pictureRoot) return null;
  return { worldId: parts[1], classCode: parts[2], kindPath: parts.slice(3, -2), featureId: parts[parts.length - 2] ?? '', filename: parts[parts.length - 1] ?? '' };
}

export async function parseReviewPackageBlob(blob: Blob, profile: ReviewPackageProfile): Promise<ParsedReviewPackage> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const entries = Object.values(zip.files).filter((entry: any) => !entry.dir && !ignored(String(entry.name ?? '')));
  const names = entries.map((entry: any) => String(entry.name ?? '').replace(/\\/g, '/').replace(/^\/+/, ''));
  const rootPrefix = determineRootPrefix(names, profile);
  const result: ParsedReviewPackage = {
    rootPrefix,
    isPackageLike: names.some((name) => marker(rootPrefix && name.startsWith(rootPrefix) ? name.slice(rootPrefix.length) : name, profile)),
    paths: [],
    manifest: null,
    reviewMarker: null,
    deletes: [],
    features: [],
    pictures: [],
    extraPaths: [],
    parseWarnings: [],
  };
  const seen = new Set<string>();
  for (const entry of entries as any[]) {
    const original = String(entry.name ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
    const path = rootPrefix && original.startsWith(rootPrefix) ? original.slice(rootPrefix.length) : original;
    if (!path || path.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
      result.parseWarnings.push(warning('PACKAGE_PATH_INVALID', 'Package contains an unsafe path.', original));
      continue;
    }
    if (seen.has(path)) {
      result.parseWarnings.push(warning('PACKAGE_PATH_INVALID', 'Package contains a duplicate path.', path));
      continue;
    }
    seen.add(path);
    result.paths.push(path);
    if (path === profile.indexPath || path === profile.reviewPath || path === profile.deletePath || path.startsWith(`${profile.featureRoot}/`)) {
      const text = await entry.async('string');
      if (path === profile.indexPath) {
        result.manifest = parseJson(text);
        if (!result.manifest) result.parseWarnings.push(warning('PACKAGE_CONTENT_INVALID', 'Index JSON is invalid.', path));
      } else if (path === profile.reviewPath) {
        result.reviewMarker = parseJson(text);
        if (!result.reviewMarker) result.parseWarnings.push(warning('PACKAGE_CONTENT_INVALID', 'Review marker JSON is invalid.', path));
      } else if (path === profile.deletePath) {
        const deletion = parseJson(text);
        if (!deletion) result.parseWarnings.push(warning('PACKAGE_CONTENT_INVALID', 'Delete JSON is invalid.', path));
        else result.deletes = parseDeleteMarks(deletion);
      } else {
        const info = parseFeaturePath(path, profile);
        const record = parseJson(text);
        if (!info || !record) result.parseWarnings.push(warning('PACKAGE_FEATURE_INVALID', 'Feature path or JSON is invalid.', path));
        else result.features.push({ path, ...info, record });
      }
      continue;
    }
    if (path.startsWith(`${profile.pictureRoot}/`)) {
      const info = parsePicturePath(path, profile);
      if (!info) result.parseWarnings.push(warning('PACKAGE_PATH_INVALID', 'Picture path is invalid.', path));
      else result.pictures.push({ path, ...info, content: await entry.async('blob') });
      continue;
    }
    result.extraPaths.push(path);
  }
  return result;
}
