# CairnMap Class Config Audit

`CM_CLASS_AUDIT_1` introduces a development-side audit command for the Class-centered configuration files under:

```text
project-config/packages/openriamap-ria/classes/
```

The audit checks whether the shadow Class JSON files are structurally consistent with the current legacy format source, especially `featureFormats.ts`.

## Command

```bash
npm run audit:class-config
```

## What it checks

The audit currently checks:

- required Class JSON files exist
- `schemaVersion` is `cairnmap.class.v1`
- `runtimeStatus` is still `shadow`
- `classCode` matches the file name
- `classCode`, `classKey`, and `sourceFeatureKey` uniqueness
- geometry type/source field/default type against the current expected mapping
- identity fields exist
- fields and groups have basic structure and no duplicate keys
- classification options have basic structure
- tags and extensions have valid structure
- display/card sections are still marked as shadow
- Class JSON tokens have a lightweight text correspondence in `featureFormats.ts`

## What it does not do

The audit does not:

- change runtime behavior
- validate every TypeScript-specific hydrate/build function
- execute `featureFormats.ts`
- replace `npm run build`
- block development on warnings
- generate reports on disk

## Result levels

```text
PASS
  No errors or warnings.

PASS_WITH_WARNINGS
  No structural errors, but there are items worth reviewing.

FAIL
  One or more structural errors were found. The command exits with code 1.
```

Warnings are expected during early Class migration stages because the Class JSON files are still shadow configuration. Errors usually mean the basic configuration structure is invalid or inconsistent with the current expected Class mapping.
