# OpenRIAMap RIA shared configuration

CM_CONFIG_STRUCTURE_1 introduces categorized shared configuration folders. Runtime readers now prefer these categorized paths. Root-level shared JSON files are retained as compatibility copies and can be removed after downstream patches no longer reference them.

## Folders

- `common/`: registries shared by multiple systems, such as icons and final render/format contracts.
- `display/`: display profiles, label styles, display algorithms, display runtime contracts, and special display logic keys.
- `format/`: schema runtime contracts and format/special formatter contracts.
- `relation/`: cross-Class relation binding definitions.
- `workflow/`: workflow templates and field controls.

Environment configuration remains outside this shared folder under `environment/`.
