# CairnMap Project Config Package

`openriamap-ria` is now a lightweight project package. It contains environment configuration, project metadata, and assembly declarations. Core Class, display, format, card, workflow, and relation definitions are provided by enabled native presets.

## Current definition sources

- Preset classes: `project-config/presets/*/classes/*.json`
- Preset shared config: `project-config/presets/*/shared/`
- Preset workflows: `project-config/presets/*/workflows/*.json`
- Project environment: `project-config/packages/openriamap-ria/environment/`
- Project assembly: `project-config/packages/openriamap-ria/project.json` and `project-config/assemblies/openriamap-ria.json`

If a future project needs to override a preset class/shared/workflow definition, add an explicit override file and register it in `project.json`. Do not recreate full duplicate preset directories in the project package.
