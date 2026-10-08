import ts from 'typescript';
import fs from 'node:fs';
const file = 'src/configStudio/types.ts';
const program = ts.createProgram([file], { strict: true, target: ts.ScriptTarget.ES2020 });
const checker = program.getTypeChecker();
const source = program.getSourceFile(file)!;
const root = source.statements.find(statement => ts.isTypeAliasDeclaration(statement) && statement.name.text === 'ConfigPackageV3') as ts.TypeAliasDeclaration;
const definitions: Record<string, unknown> = {};
const known = new Map<ts.Type, string>();
function schema(type: ts.Type): unknown {
  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return {};
  if (type.flags & ts.TypeFlags.Undefined) return { type: 'undefined' };
  if (type.flags & ts.TypeFlags.Null) return { type: 'null' };
  if (type.isStringLiteral() || type.isNumberLiteral()) return { const: type.value };
  if (type.flags & ts.TypeFlags.BooleanLiteral) return { const: checker.typeToString(type) === 'true' };
  if (type.flags & ts.TypeFlags.String) return { type: 'string' };
  if (type.flags & ts.TypeFlags.Number) return { type: 'number' };
  if (type.flags & ts.TypeFlags.Boolean) return { type: 'boolean' };
  if (type.isUnion()) return { anyOf: type.types.filter(value => !(value.flags & ts.TypeFlags.Undefined)).map(schema) };
  if (checker.isTupleType(type)) return { type: 'array', tuple: checker.getTypeArguments(type as ts.TypeReference).map(schema) };
  if (checker.isArrayType(type)) return { type: 'array', items: schema(checker.getTypeArguments(type as ts.TypeReference)[0]) };
  const previous = known.get(type); if (previous) return { ref: previous };
  const id = `t${known.size}`; known.set(type, id);
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const property of checker.getPropertiesOfType(type)) {
    const declaration = property.valueDeclaration ?? property.declarations?.[0] ?? source;
    properties[property.name] = schema(checker.getTypeOfSymbolAtLocation(property, declaration));
    if (!(property.flags & ts.SymbolFlags.Optional)) required.push(property.name);
  }
  const index = type.getStringIndexType();
  definitions[id] = { type: 'object', properties, required, ...(index ? { additionalProperties: schema(index) } : {}) };
  return { ref: id };
}
const generated = JSON.stringify({ root: schema(checker.getTypeFromTypeNode(root.type)), definitions }, null, 2) + '\n';
const target = 'src/configStudio/native-contract-schema.generated.json';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== generated) throw new Error('Native schema is stale: run generate-native-contract-schema.ts');
} else fs.writeFileSync(target, generated);
console.log(`native-contract-schema: ${known.size} typed structures ${process.argv.includes('--check') ? 'verified' : 'generated'}`);
