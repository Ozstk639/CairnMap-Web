// CairnMap FINAL CLEANUP: card enhancement executor/facade only. Card layout definitions live in preset Class/shared card JSON.
// CairnMap LEGACY CLEANUP: card executor/compatibility only.
// New card layout definitions belong in preset Class JSON and shared/card.
import type { CardFeatureLinkTarget } from './cardInteractions';
import { resolveCardRuntimeCardLayout } from '../../../core/project/cardRuntimeResolver';

export const REGISTRY_DEFAULT_GROUP = '__registryDefault' as const;

export type CardValueTransform = 'plain' | 'externalLink' | 'featureLink' | 'featureLinkList' | 'json';

export type CardEnhancementKey =
  | 'railColorChip'
  | 'platformLineChips'
  | 'stationLineChips'
  | 'stationBuildingLineChips'
  | 'tradePointCard'
  | 'floorViewRelation'
  | 'genericRelationLinks';

export type CardLayoutItem =
  | {
      kind: 'classification';
      label?: string;
      hidden?: boolean;
    }
  | {
      kind: 'registryField';
      key?: string;
      path?: string;
      /** 可选：只用于覆盖 registry 的 infocard label。 */
      label?: string;
      hidden?: boolean;
      transform?: CardValueTransform;
      linkTarget?: CardFeatureLinkTarget;
    }
  | {
      kind: 'registryDefaultGroup';
    }
  | {
      kind: 'rawField';
      path: string;
      label: string;
      transform?: CardValueTransform;
      linkTarget?: CardFeatureLinkTarget;
      usedPaths?: string[];
      hidden?: boolean;
    }
  | {
      kind: 'enhancement';
      key: CardEnhancementKey;
    };

export type CardRegistryLayout = {
  schemaKey?: string;
  match?: {
    classCode?: string;
    kind?: string;
    skind?: string;
    skind2?: string;
    schemaKey?: string;
  };
  items: CardLayoutItem[];
};

export const CARD_REGISTRY_LAYOUTS: CardRegistryLayout[] = [
  {
    schemaKey: 'flr_unit',
    items: [
      { kind: 'classification' },
      {
        kind: 'registryField',
        path: 'BuildingID',
        transform: 'featureLink',
        linkTarget: { classCode: 'BUD', matchField: 'ID', displayField: 'Name', fallbackDisplay: 'raw' },
      },
      {
        kind: 'registryField',
        path: 'tags.Land',
        transform: 'featureLink',
        linkTarget: { classCode: 'ISG', kind: 'NGF', matchField: 'ID', displayField: 'Name', fallbackDisplay: 'raw' },
      },
      {
        kind: 'registryField',
        path: 'tags.Adm',
        transform: 'featureLink',
        linkTarget: { classCode: 'ISG', kind: 'ADM', matchField: 'ID', displayField: 'Name', fallbackDisplay: 'raw' },
      },
      { kind: 'registryDefaultGroup' },
    ],
  },
  {
    schemaKey: 'tpp_teleport',
    items: [
      { kind: 'classification' },
      {
        kind: 'registryField',
        path: 'TGTWarp',
        transform: 'featureLink',
        linkTarget: { classCode: 'WRP', matchField: 'WRPointI2D', displayField: 'Name', fallbackDisplay: 'raw' },
      },
      { kind: 'registryDefaultGroup' },
    ],
  },
  {
    schemaKey: 'rail_platform',
    items: [
      { kind: 'classification' },
      { kind: 'enhancement', key: 'platformLineChips' },
      { kind: 'registryDefaultGroup' },
    ],
  },
  {
    schemaKey: 'rail_station',
    items: [
      { kind: 'classification' },
      {
        kind: 'registryField',
        path: 'STBuilding',
        transform: 'featureLink',
        linkTarget: { classCode: 'STB', matchField: 'ID', displayField: 'Name', fallbackDisplay: 'raw' },
      },
      { kind: 'enhancement', key: 'stationLineChips' },
      { kind: 'registryDefaultGroup' },
    ],
  },
  {
    schemaKey: 'rail_station_building',
    items: [
      { kind: 'classification' },
      { kind: 'enhancement', key: 'stationBuildingLineChips' },
      { kind: 'registryDefaultGroup' },
    ],
  },
  {
    schemaKey: 'rail_line',
    items: [
      { kind: 'classification' },
      { kind: 'enhancement', key: 'railColorChip' },
      { kind: 'registryDefaultGroup' },
    ],
  },
];

const normalize = (value: unknown): string => String(value ?? '').trim();

export const resolveCardRegistryLayout = (args: {
  schemaKey?: string;
  classCode?: string;
  kind?: string;
  skind?: string;
  skind2?: string;
}): CardRegistryLayout | null => {
  const schemaKey = normalize(args.schemaKey);
  const classCode = normalize(args.classCode);
  const kind = normalize(args.kind);
  const skind = normalize(args.skind);
  const skind2 = normalize(args.skind2);

  const runtimeLayout = resolveCardRuntimeCardLayout({ classCode });
  if (runtimeLayout && runtimeLayout.items.length > 0) {
    return runtimeLayout as CardRegistryLayout;
  }

  for (const layout of CARD_REGISTRY_LAYOUTS) {
    if (layout.schemaKey && normalize(layout.schemaKey) === schemaKey) return layout;
  }

  for (const layout of CARD_REGISTRY_LAYOUTS) {
    const m = layout.match;
    if (!m) continue;
    if (m.schemaKey && normalize(m.schemaKey) !== schemaKey) continue;
    if (m.classCode && normalize(m.classCode) !== classCode) continue;
    if (m.kind && normalize(m.kind) !== kind) continue;
    if (m.skind && normalize(m.skind) !== skind) continue;
    if (m.skind2 && normalize(m.skind2) !== skind2) continue;
    return layout;
  }

  return null;
};
