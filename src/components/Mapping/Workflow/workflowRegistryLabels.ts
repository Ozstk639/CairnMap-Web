import {
  getClassFieldLabelByWorkflowKey,
  getClassGroupFieldLabelByWorkflowKey,
  getClassGroupLabelByWorkflowKey,
} from '../../../core/project/classMetadata';
import {
  projectRegistryScene,
  resolveWorkflowEditorSchema,
  type ProjectedRegistryScene,
} from '@/components/Common/workflowEditorRegistry';

const viewCache = new Map<string, ProjectedRegistryScene | null>();

const getWorkflowView = (workflowKey: string): ProjectedRegistryScene | null => {
  const key = String(workflowKey ?? '').trim();
  if (!key) return null;
  if (viewCache.has(key)) return viewCache.get(key) ?? null;
  const schema = resolveWorkflowEditorSchema({ workflowKey: key });
  const view = schema ? projectRegistryScene(schema, 'workflow') : null;
  viewCache.set(key, view);
  return view;
};

const normalize = (value: unknown): string => String(value ?? '').trim();

const findField = (view: ProjectedRegistryScene | null, keyOrPath: string) => {
  const needle = normalize(keyOrPath);
  if (!view || !needle) return null;
  if (view.idField.key === needle || view.idField.path === needle) return view.idField;
  return view.fields.find((field) => field.key === needle || field.path === needle) ?? null;
};

export const getWorkflowClassificationLabel = (workflowKey: string): string => {
  const view = getWorkflowView(workflowKey);
  return view?.classification?.label ?? '类型';
};

export const getWorkflowFieldLabel = (workflowKey: string, keyOrPath: string): string => {
  const field = findField(getWorkflowView(workflowKey), keyOrPath);
  return field?.label ?? getClassFieldLabelByWorkflowKey(workflowKey, keyOrPath) ?? keyOrPath;
};

export const getWorkflowFieldPlaceholder = (workflowKey: string, keyOrPath: string): string | undefined => {
  const field = findField(getWorkflowView(workflowKey), keyOrPath);
  return field?.placeholder;
};

export const getWorkflowAuxLabel = (workflowKey: string, auxKey: string): string => {
  const view = getWorkflowView(workflowKey);
  const key = normalize(auxKey);
  return view?.auxInputs.find((item) => item.key === key)?.label ?? auxKey;
};

export const getWorkflowAuxPlaceholder = (workflowKey: string, auxKey: string): string | undefined => {
  const view = getWorkflowView(workflowKey);
  const key = normalize(auxKey);
  return view?.auxInputs.find((item) => item.key === key)?.placeholder;
};

export const getWorkflowGroupLabel = (workflowKey: string, groupKeyOrPath: string): string => {
  const view = getWorkflowView(workflowKey);
  const key = normalize(groupKeyOrPath);
  return (
    view?.groups.find((group) => group.key === key || group.path === key)?.label
    ?? getClassGroupLabelByWorkflowKey(workflowKey, groupKeyOrPath)
    ?? groupKeyOrPath
  );
};

export const getWorkflowGroupFieldLabel = (workflowKey: string, groupKeyOrPath: string, fieldKey: string): string => {
  const view = getWorkflowView(workflowKey);
  const groupKey = normalize(groupKeyOrPath);
  const key = normalize(fieldKey);
  const group = view?.groups.find((item) => item.key === groupKey || item.path === groupKey);
  const field = group?.fields.find((item) => item.key === key || item.path === key);
  return (
    field?.labels.workflow
    ?? field?.labels.default
    ?? getClassGroupFieldLabelByWorkflowKey(workflowKey, groupKeyOrPath, fieldKey)
    ?? fieldKey
  );
};

export const getWorkflowGroupFieldPlaceholder = (workflowKey: string, groupKeyOrPath: string, fieldKey: string): string | undefined => {
  const view = getWorkflowView(workflowKey);
  const groupKey = normalize(groupKeyOrPath);
  const key = normalize(fieldKey);
  const group = view?.groups.find((item) => item.key === groupKey || item.path === groupKey);
  const field = group?.fields.find((item) => item.key === key || item.path === key);
  return field?.placeholder;
};
