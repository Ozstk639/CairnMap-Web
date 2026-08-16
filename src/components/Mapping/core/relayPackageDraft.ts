
export type RelayPictureBindingItem = {
  uid: string;
  originalName: string;
  file?: File;
  relativePath?: string;
  previewUrl?: string;
  deleted?: boolean;
  order: number;
  source?: 'new' | 'imported' | 'pub' | 'dat';
};

export type RelayDeleteMarkItem = {
  ID: string;
  Name: string;
  /** Optional location facts make a new submission independently verifiable. */
  worldId?: string;
  classCode?: string;
};

export type RelayPackageDraftStatus = 'new_draft' | 'exported_draft' | 'imported_package';

export type RelayPackageMeta = {
  operator: string;
  note: string;
  draftStatus: RelayPackageDraftStatus;
  schemaVersion: string;
  updatedAt: string;
  packageVersion?: string | number;
};

export type RelayPackageDraft = {
  meta: RelayPackageMeta;
  deleteMarks: RelayDeleteMarkItem[];
  picturesById: Record<string, RelayPictureBindingItem[]>;
};

export function countActiveRelayPictures(draft: RelayPackageDraft): number {
  return Object.values(draft.picturesById).reduce((sum, list) => sum + list.filter((x) => !x.deleted).length, 0);
}


export function relayDraftStatusLabel(status: RelayPackageDraftStatus): string {
  switch (status) {
    case 'imported_package':
      return '导入包';
    case 'exported_draft':
      return '已导出草稿';
    case 'new_draft':
    default:
      return '新建草稿';
  }
}

export function relayDraftShowsMeta(status: RelayPackageDraftStatus): boolean {
  return status === 'imported_package' || status === 'exported_draft';
}

export function createEmptyRelayPackageDraft(): RelayPackageDraft {
  return {
    meta: {
      operator: '',
      note: '',
      draftStatus: 'new_draft',
      schemaVersion: '1.0.0',
      updatedAt: new Date().toISOString(),
    },
    deleteMarks: [],
    picturesById: {},
  };
}
