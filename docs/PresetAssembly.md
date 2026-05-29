# Preset Assembly

CairnMap now assembles the OpenRIAMap RIA profile from native, low-priority presets plus a project-level package.

Runtime order:

1. Native presets under `project-config/presets/` provide the reusable Class, shared, and workflow definitions.
2. `project-config/packages/openriamap-ria/` provides environment configuration and project-level overrides.
3. Project overrides have priority over native preset definitions.

Current presets:

- `core-structures`: ISP / ISL / ISG and common shared runtime configuration.
- `building`: BUD / FLR.
- `rail`: STA / PLF / RLE / PFB / STB / SBP / STF.
- `road`: ROD.
- `teleport`: TPP.
- `warp`: WRP.
- `trade`: TRP.

Use `npm run audit:package-assembly` to verify preset coverage and assembly load order.
