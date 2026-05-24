# CairnMap Framework Extraction Roadmap

## Goal

CairnMap aims to become a configurable WebGIS-style structured feature mapping and surveying framework for Minecraft-style, Dynmap-style, and tile-based virtual worlds.

OpenRIAMap RIA is currently used as the seed project profile and verification target.

## Stage 0: Framework Identity Preparation

Purpose:

- establish CairnMap as the framework name
- keep OpenRIAMap RIA as the default project profile
- prepare documentation and project-config folders
- avoid runtime behavior changes

Patch:

- `CM_INIT_1`

## Stage 1: Pure Data Configuration Extraction

Purpose:

- extract low-risk static configuration
- keep existing runtime APIs stable
- avoid label, navigation, card, workflow, and interaction behavior changes

Candidate areas:

- worlds
- tile sources
- data sources
- source link modes
- rule buttons
- feature class catalog
- basic workflow/editor/infocard label mappings
- display profile tokens

Non-targets for Stage 1:

- label placement algorithms
- collision logic
- rail/road/teleport navigation engines
- TRP independent cards
- draggable panel behavior
- complex render-rule execution logic

## Stage 2: Project Package Structure

Purpose:

- make `project-config/openriamap-ria/` a real CairnMap project package
- define project-level JSON files such as `project.json`, `worlds.json`, `featureClasses.json`, `displayRules.json`, and `infocardLayouts.json`

## Stage 3: Config Validation and Generated Registry

Purpose:

- validate project configuration
- generate typed runtime registry files
- keep generated registries compatible with existing TypeScript consumers during migration

Potential scripts:

- `npm run validate:project-config`
- `npm run generate:project-config`

## Stage 4: Runtime Registry API Migration

Purpose:

- replace direct imports from hardcoded registries with project-registry accessors
- keep upper-level UI components stable while the underlying data source changes

Target API direction:

- `projectRegistry.getFeatureClass(classCode)`
- `projectRegistry.getDisplayRules()`
- `projectRegistry.getWorkflowSchema(classCode)`
- `projectRegistry.getCardLayout(classCode)`
- `projectRegistry.getRuleButtons()`

## Stage 5: Preset and Extension System

Purpose:

- separate domain-specific RIA logic from reusable CairnMap Core
- move rail, road, teleport, trade, and other custom behavior toward presets/extensions

Candidate presets:

- `base`
- `dynmap`
- `rail`
- `road`
- `teleport`
- `trade`

## Stage 6: OpenRIAMap Profile Verification

Purpose:

- verify that OpenRIAMap can run equivalently on CairnMap
- add a minimal demo profile for non-RIA projects
- prove that different project packages can be switched without source-code rewrites
