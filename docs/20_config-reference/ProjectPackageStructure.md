# CairnMap Project Package Structure

A CairnMap project package describes how a specific virtual-world map project is configured, rendered, searched, inspected, and maintained.

At `CM_INIT_1`, this structure is documentation-only. Runtime configuration extraction starts from `CM_CFG_1`.

## Recommended structure

```text
project-config/
  openriamap-ria/
    project.json
    worlds.json
    tileSources.json
    dataSources.json
    featureClasses.json
    workflowSchemas.json
    displayProfiles.json
    displayRules.json
    infocardLayouts.json
    ruleButtons.json
    searchProfiles.json
    navigationProfiles.json
    README.md
```

## Core idea

CairnMap Core should provide reusable runtime infrastructure:

- map shell
- tile/world adapter layer
- feature registry runtime
- display-rule resolver
- label-policy resolver
- card-layout resolver
- workflow-schema resolver
- data-source resolver
- preset/extension registry

A project package should provide project-specific configuration:

- project identity
- world definitions
- tile/data source definitions
- feature class schemas
- display profiles and display rules
- card layouts
- workflow schemas
- rule buttons
- search profiles
- navigation profiles
- enabled presets/extensions

## OpenRIAMap RIA profile

The current OpenRIAMap configuration will be gradually moved into:

```text
project-config/openriamap-ria/
```

This folder does not replace runtime code at `CM_INIT_1`. The existing TypeScript registries remain active until later configuration-extraction stages.

## Data format boundary

CairnMap should keep its internal structured feature data model separate from downstream export formats.

Recommended long-term layers:

1. CairnMap / OpenRIAMap Feature JSON as the primary business data format
2. GeoJSON-like export/import for GIS-style and map-component interoperability
3. Cargo-friendly flat-table export for wiki/database querying
4. Project Package JSON for schema, rendering, card, workflow, and preset configuration
