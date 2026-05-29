# Render / Format Runtime Finalization

This document records the post-CM_RENDER_FORMAT_FINAL runtime boundary.

## Config-owned definition sources

- `project-config/packages/openriamap-ria/classes/{Class}.json`
  - fields, groups, geometry, identity, tags, extensions
  - display rules and Class-level declaration
- `project-config/packages/openriamap-ria/shared/display/displayRuntimeContracts.json`
  - display runtime mode per Class
- `project-config/packages/openriamap-ria/shared/display/displayAlgorithms.json`
  - advanced display algorithm keys
- `project-config/packages/openriamap-ria/shared/format/formatRuntimeContracts.json`
  - format runtime mode per Class
- `project-config/packages/openriamap-ria/shared/format/formatSpecialFormatters.json`
  - special formatter keys for complex Classes
- `project-config/packages/openriamap-ria/shared/common/renderFormatFinalContracts.json`
  - final render/format ownership summary

## TypeScript runtime role

TypeScript remains responsible for executing algorithms and preserving legacy-compatible API exports. It should not be the first place to define new business Class fields, display profiles, or format contracts.

## Compatibility files

- `src/components/Rules/rendering/featureRenderRules.ts`
  - compatibility export and algorithm runtime surface
- `src/components/Common/featureFormats.ts`
  - compatibility export and format runtime surface

## Audit commands

Run these after render/format changes:

```powershell
npm run audit:class-config
npm run audit:display-config
npm run audit:schema-format
npm run audit:render-format-final
```
