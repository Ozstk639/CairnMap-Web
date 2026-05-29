# CairnMap Schema / Format Audit

`audit:schema-format` checks the class-centered schema and format migration layer.

Run:

```powershell
npm run audit:schema-format
```

## Scope in CM_SCHEMA_FORMAT_1

The audit checks:

- `classes/{Class}.json` schema shape
- geometry source fields
- identity fields
- field and group uniqueness
- tags/extensions structure
- `shared/format/schemaRuntimeContracts.json` coverage

It does not change runtime behavior and does not replace `featureFormats.ts`.

## Temporary and removable pieces

The audit script and this document are development tools. They are not imported by runtime code. They can be removed later together with the `audit:schema-format` package script if they are no longer needed.


## CM_SCHEMA_FORMAT_2

This stage adds a legacy comparison bridge. `featureFormats.ts` still owns build, hydrate, coordinates and validation, but runtime code can now query Class schema metadata through `getRuntimeFormatSchemaMetadata()`.

The audit also performs light textual checks against `featureFormats.ts` so schema drift can be found before config becomes the primary source.


## CM_SCHEMA_FORMAT_3

This stage introduces a generic format adapter in diagnostic mode. It can build, hydrate, read coordinates and validate simple Class schemas from config, but it does not replace the legacy `featureFormats.ts` output yet.

Diagnostic Class set:

- ISP / ISL / ISG
- BUD / FLR
- ROD
- TPP / WRP


## CM_SCHEMA_FORMAT_4

This stage enables config-primary wrappers for low-risk generic Classes:

- ISP / ISL / ISG
- BUD / FLR
- ROD
- TPP / WRP

The public `FORMAT_REGISTRY` API remains unchanged. Legacy build/hydrate/coords/validate functions are still preserved as explicit fallback paths.


## CM_SCHEMA_FORMAT_5

This stage adds explicit format runtime contracts for all 16 core Classes.

Modes:

- `genericConfigPrimary`: generic Class config adapter is the primary format path with legacy fallback.
- `specialFormatter`: a registered formatter key describes why the Class still uses a dedicated formatter path.
- `legacyAlgorithmFallback`: schema is config-visible, but legacy format logic remains the execution path.

`featureFormats.ts` remains the public compatibility layer in this stage.
