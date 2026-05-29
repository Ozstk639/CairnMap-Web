import fs from 'node:fs';
import path from 'node:path';

export const normalizePath = (filePath) => filePath.replaceAll(path.sep, '/');

export function resolveProjectRoot(startDir = process.cwd()) {
  let current = path.resolve(startDir);
  while (current && current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, 'package.json')) && fs.existsSync(path.join(current, 'project-config'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return path.resolve(startDir);
}

export function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    const wrapped = new Error(`Unable to read JSON ${filePath}: ${error.message}`);
    wrapped.cause = error;
    throw wrapped;
  }
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function walkFiles(dir, predicate = () => true) {
  const result = [];
  if (!fs.existsSync(dir)) return result;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && predicate(full)) result.push(full);
    }
  }
  return result.sort();
}

export function readItems(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const json = readJson(filePath);
  return Array.isArray(json.items) ? json.items : [];
}

export function loadProjectConfig(root = resolveProjectRoot()) {
  const projectConfigRoot = path.join(root, 'project-config');
  const presetsRoot = path.join(projectConfigRoot, 'presets');
  const sharedRoot = path.join(presetsRoot, 'core-structures', 'shared');
  const presetFiles = walkFiles(presetsRoot, (file) => path.basename(file) === 'preset.json');
  const classFiles = walkFiles(presetsRoot, (file) => normalizePath(path.relative(root, file)).includes('/classes/') && file.endsWith('.json'));
  const workflowFiles = walkFiles(presetsRoot, (file) => normalizePath(path.relative(root, file)).includes('/workflows/') && file.endsWith('.json'));

  return {
    root,
    projectConfigRoot,
    presetsRoot,
    sharedRoot,
    presetFiles,
    classFiles,
    workflowFiles,
  };
}
