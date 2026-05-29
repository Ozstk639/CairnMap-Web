# Legacy Compatibility

After the preset migration, legacy TypeScript files are retained only as runtime executors or compatibility exports.

## Executor-only files

- `src/components/Rules/rendering/featureRenderRules.ts`: display algorithm executor / compatibility export.
- `src/components/Common/featureFormats.ts`: format compatibility export / special formatter executor.
- workflow components under `src/components/Mapping/Workflow/`: workflow UI executors selected by config.
- card rule files: card enhancement executors selected by config.

## Definition sources

Business definitions must live in preset/project config:

- Class definitions: `project-config/presets/*/classes/*.json`
- Display definitions: `project-config/presets/core-structures/shared/display/`
- Format definitions: `project-config/presets/core-structures/shared/format/`
- Card definitions: `project-config/presets/core-structures/shared/card/`
- Workflow executor registrations and block templates: `project-config/presets/core-structures/shared/workflow/`

Do not add new Class, display, format, card, or workflow definitions directly into legacy TS files.
