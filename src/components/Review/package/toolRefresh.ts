import { REVIEW_PACKAGE_LAYOUT, type ReviewPackageExtraFile } from './contracts';

/**
 * Optional maintenance files shipped inside a standard Relay package. Their
 * paths derive from the fixed upstream wire layout, never from an application
 * profile.
 */
export function buildReviewPackageToolRefreshFiles(): ReviewPackageExtraFile[] {
  const { featureRoot, pictureRoot, indexPath, deletePath, toolRefreshRoot } = REVIEW_PACKAGE_LAYOUT;
  const py = [
    'from __future__ import annotations',
    'from pathlib import Path',
    'import json',
    'from datetime import datetime, timezone, timedelta',
    '',
    'TZ = timezone(timedelta(hours=8))',
    '',
    'def now_iso():',
    '    return datetime.now(TZ).replace(microsecond=0).isoformat()',
    '',
    'def count_json_features(root: Path) -> int:',
    `    data_root = root / "${featureRoot}"`,
    '    if not data_root.exists():',
    '        return 0',
    '    return sum(1 for p in data_root.rglob("*.json") if p.name.lower() != "index.json")',
    '',
    'def count_pictures(root: Path) -> int:',
    `    pic_root = root / "${pictureRoot}"`,
    '    if not pic_root.exists():',
    '        return 0',
    '    return sum(1 for p in pic_root.rglob("*") if p.is_file())',
    '',
    'def count_deletes(root: Path) -> int:',
    `    p = root / "${deletePath}"`,
    '    if not p.exists():',
    '        return 0',
    '    try:',
    '        obj = json.loads(p.read_text(encoding="utf-8"))',
    '    except Exception:',
    '        return 0',
    '    items = obj.get("items") if isinstance(obj, dict) else []',
    '    return len(items) if isinstance(items, list) else 0',
    '',
    'def main():',
    '    root = Path(__file__).resolve().parent.parent',
    `    index_path = root / "${indexPath}"`,
    '    try:',
    '        index_obj = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else {}',
    '    except Exception:',
    '        index_obj = {}',
    '    if not isinstance(index_obj, dict):',
    '        index_obj = {}',
    '    index_obj["featureCount"] = count_json_features(root)',
    '    index_obj["pictureCount"] = count_pictures(root)',
    '    index_obj["deleteCount"] = count_deletes(root)',
    '    if "exportedAt" in index_obj:',
    '        index_obj["exportedAt"] = now_iso()',
    '    else:',
    '        index_obj["updatedAt"] = now_iso()',
    '    index_path.write_text(json.dumps(index_obj, ensure_ascii=False, indent=2), encoding="utf-8")',
    '    print("Relay package metadata refreshed")',
    '',
    'if __name__ == "__main__":',
    '    main()',
  ].join('\n');

  return [
    {
      path: `${toolRefreshRoot}/README.txt`,
      text: [
        'Relay package maintenance helper.',
        `It refreshes the root ${indexPath} feature, picture and delete counts.`,
        'Run refresh_package_meta.py with Python, or double-click refresh_package_meta.bat on Windows.',
      ].join('\n'),
    },
    {
      path: `${toolRefreshRoot}/refresh_package_meta.py`,
      text: py,
    },
    {
      path: `${toolRefreshRoot}/refresh_package_meta.bat`,
      text: [
        '@echo off',
        'setlocal',
        'cd /d %~dp0',
        'python refresh_package_meta.py',
        'pause',
      ].join('\r\n'),
    },
  ];
}

