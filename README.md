# CairnMap-Web

CairnMap is a WebGIS-style structured feature mapping and surveying framework for Minecraft-style, Dynmap-style, and tile-based virtual worlds.

This repository is currently an experimental framework extraction branch seeded from OpenRIAMap `RB_EDO_7_F2`.

The current default project profile is **OpenRIAMap RIA**. At this initialization stage, runtime behavior is intentionally unchanged: the existing OpenRIAMap TypeScript registries, render rules, cards, workflows, labels, and navigation modules remain the active implementation.

## Current status

`CM_INIT_1` establishes the CairnMap repository identity and prepares the project-package documentation layer. It does not extract runtime configuration yet.

Initialized in this stage:

- CairnMap framework identity
- OpenRIAMap RIA as the default verification profile
- documentation for the framework-extraction roadmap
- documentation for the future project-package structure
- placeholder project-config folder for `openriamap-ria`
- stable framework/project/profile identity constants

## Development roadmap

See:

- [`docs/FrameworkExtractionRoadmap.md`](docs/FrameworkExtractionRoadmap.md)
- [`docs/ProjectPackageStructure.md`](docs/ProjectPackageStructure.md)

## Boundary note

CairnMap Core should eventually provide reusable map, feature, display, card, workflow, data-source, and preset infrastructure. OpenRIAMap RIA should become one project package/profile running on top of CairnMap rather than the framework identity itself.
