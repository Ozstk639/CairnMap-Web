const GEOMETRY_DEFAULTS = {
  Point: { defaultType: 'Points', sourceField: 'coordinate', displayProfile: 'poiPoint', cardLayout: 'generic-point-card' },
  MultiPoint: { defaultType: 'Points', sourceField: 'coordinates', displayProfile: 'poiPoint', cardLayout: 'generic-point-card' },
  LineString: { defaultType: 'Lines', sourceField: 'coordinates', displayProfile: 'networkLine', cardLayout: 'generic-line-card' },
  MultiLineString: { defaultType: 'Lines', sourceField: 'coordinates', displayProfile: 'networkLine', cardLayout: 'generic-line-card' },
  Polygon: { defaultType: 'Polygons', sourceField: 'coordinates', displayProfile: 'largeGeoSurface', cardLayout: 'generic-polygon-card' },
  MultiPolygon: { defaultType: 'Polygons', sourceField: 'coordinates', displayProfile: 'largeGeoSurface', cardLayout: 'generic-polygon-card' },
};

export const allowedGeometryTypes = Object.freeze(Object.keys(GEOMETRY_DEFAULTS));

export function defaultTypeForGeometry(geometryType) {
  return GEOMETRY_DEFAULTS[geometryType]?.defaultType || 'Features';
}

export function defaultDisplayProfileForGeometry(geometryType) {
  return GEOMETRY_DEFAULTS[geometryType]?.displayProfile || 'geometryOnlyFallback';
}

export function defaultCardLayoutForGeometry(geometryType) {
  return GEOMETRY_DEFAULTS[geometryType]?.cardLayout || 'standard-feature-card';
}

export function createClassConfig(options) {
  const geometry = GEOMETRY_DEFAULTS[options.geometry];
  if (!geometry) throw new Error(`Unsupported geometry type: ${options.geometry}`);
  const classCode = String(options.classCode).toUpperCase();
  const classKey = options.classKey;
  const idField = options.idField || 'ID';
  const nameField = options.nameField || 'Name';
  const displayProfile = options.displayProfile || geometry.displayProfile;
  const labelStyle = options.labelStyle || 'gm-outline';
  const cardLayout = options.cardLayout || geometry.cardLayout;
  const ruleId = options.displayRuleId || `${classKey}-default`;

  return {
    schemaVersion: 'cairnmap.class.v1',
    runtimeStatus: 'active',
    classCode,
    classKey,
    label: {
      'zh-CN': options.labelZh,
      en: options.labelEn || options.labelZh,
    },
    description: options.description || `${options.labelEn || classKey} feature class.`,
    data: {
      typeField: 'Type',
      classField: 'Class',
      worldField: 'World',
      defaultType: options.defaultType || geometry.defaultType,
      defaultClass: classCode,
    },
    geometry: {
      type: options.geometry,
      sourceField: options.sourceField || geometry.sourceField,
      axisOrder: 'x,z,y',
      required: true,
    },
    identity: {
      idField,
      nameField,
      displayNameField: nameField,
    },
    classification: {
      kindField: 'Kind',
      skindField: 'SKind',
      skind2Field: 'SKind2',
      required: false,
      options: [],
    },
    fields: [
      {
        key: idField,
        label: { 'zh-CN': idField, en: idField },
        type: 'text',
        required: true,
        scenes: { workflow: true, editor: true, infocard: true, search: true },
      },
      {
        key: nameField,
        label: { 'zh-CN': '名称', en: 'Name' },
        type: 'text',
        required: false,
        scenes: { workflow: true, editor: true, infocard: true, search: true },
      },
    ],
    groups: [],
    tags: {
      enabled: true,
      allowOther: true,
      items: [],
    },
    extensions: {
      enabled: true,
      allowOtherNamespaces: true,
      namespaces: [],
    },
    display: {
      rules: [
        {
          id: ruleId,
          match: { classCode },
          profile: displayProfile,
          label: {
            source: nameField,
            styleKey: labelStyle,
          },
        },
      ],
    },
    card: {
      layoutId: cardLayout,
    },
    workflowBindings: [],
  };
}
