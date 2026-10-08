import generated from './native-contract-schema.generated.json';
type Schema = { ref?: string; type?: string; const?: unknown; anyOf?: Schema[]; tuple?: Schema[]; items?: Schema; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: Schema };
export type NativeStructureIssue = { path: string; message: string };
/** Strict executable shape generated from the same TypeScript contract used
 * by editors. Legacy/source metadata and explicitly unknown values retain
 * their declared open shape; typed settings reject unknown keys. */
export function validateNativeStructure(value: unknown): NativeStructureIssue[] {
  const definitions = generated.definitions as Record<string, Schema>;
  const inspect = (value: unknown, input: Schema, path: string, depth: number): NativeStructureIssue[] => {
    if (depth > 64) return [{ path, message: '配置嵌套超过 64 层。' }];
    const schema = input.ref ? definitions[input.ref] : input;
    if (schema.anyOf) {
      const choices = schema.anyOf.map(branch => inspect(value, branch, path, depth + 1));
      if (choices.some(issues => !issues.length)) return [];
      return choices.sort((a,b) => a.length - b.length)[0] ?? [{ path, message: '配置值类型无效。' }];
    }
    if ('const' in schema) return value === schema.const ? [] : [{ path, message: `配置值必须为 ${JSON.stringify(schema.const)}。` }];
    if (!schema.type) return [];
    if (schema.type === 'null') return value === null ? [] : [{ path, message: '配置值必须为空。' }];
    if (schema.type === 'array') {
      if (!Array.isArray(value)) return [{ path, message: '配置值必须为数组。' }];
      if (schema.tuple && schema.tuple.length !== value.length) return [{ path, message: `数组必须包含 ${schema.tuple.length} 项。` }];
      return value.flatMap((item,index) => inspect(item, schema.tuple?.[index] ?? schema.items ?? {}, `${path}/${index}`, depth + 1)).slice(0,100);
    }
    if (schema.type === 'object') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return [{ path, message: '配置值必须为对象。' }];
      const record = value as Record<string, unknown>;
      const issues: NativeStructureIssue[] = (schema.required ?? []).filter(key => record[key] === undefined).map(key => ({ path: `${path}/${key}`, message: '缺少必需的配置属性。' }));
      for (const [key,item] of Object.entries(record)) {
        if (item === undefined) continue;
        const shape = schema.properties?.[key] ?? schema.additionalProperties;
        if (!shape || ['__proto__','constructor','prototype'].includes(key)) issues.push({ path: `${path}/${key}`, message: `未知或不安全的配置属性 ${key}。` });
        else issues.push(...inspect(item, shape, `${path}/${key}`, depth + 1));
        if (issues.length >= 100) break;
      }
      return issues.slice(0,100);
    }
    return typeof value === schema.type && (schema.type !== 'number' || Number.isFinite(value)) ? [] : [{ path, message: `配置值必须为有效的 ${schema.type}。` }];
  };
  return inspect(value, generated.root, 'config', 0);
}
