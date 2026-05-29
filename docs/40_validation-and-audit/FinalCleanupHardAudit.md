# CairnMap Final Cleanup Hard Audit

This document records the final boundary after `CM_FINAL_CLEANUP_HARD_AUDIT_1-9`.

## Runtime source of truth

- Class definitions: `project-config/presets/*/classes/*.json`
- Display config: `project-config/presets/core-structures/shared/display/*` plus Class `display.rules`
- Format/schema config: `project-config/presets/core-structures/shared/format/*` plus Class `fields`, `groups`, `geometry`, and `classification`
- Card config: `project-config/presets/core-structures/shared/card/*` plus Class `card`
- Workflow config: `project-config/presets/*/workflows/*.json` dispatched to registered component executors
- Environment/world codes: `project-config/packages/openriamap-ria/environment/worlds.json`

## Legacy TypeScript role

Legacy TypeScript files are executor/facade only. They may contain algorithms, component dispatch, special formatters, and compatibility API names. They must not reintroduce Class field registries, display rule registries, card layout registries, or workflow page/block assembly definitions.

## Required validation

Run:

```bash
npm run audit:project-config
npm run build
```

If `audit:legacy-definition` fails, remove the reported definition source or stale transition file before continuing.
