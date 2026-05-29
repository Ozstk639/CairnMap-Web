# Environment 配置编辑指南

Environment 配置负责让地图能打开、能加载瓦片、能加载数据，并提供项目级 UI 行为。

常见位置：

```text
project-config/packages/openriamap-ria/environment/
```

## 1. 文件速查

| 文件 | 作用 |
|---|---|
| `worlds.json` | 世界列表、默认世界、中心点、projection、tile/data source 绑定 |
| `tileSources.json` | 瓦片源配置 |
| `dataSources.json` | 地物数据源与图片路径 |
| `sourceLinkModes.json` | CDN / GitHub Raw 等来源模式 |
| `ruleButtons.json` | 图层按钮、筛选条件、联动行为 |
| `searchProfiles.json` | 搜索字段、优先级、黑名单、分类名称 |
| `mediaRules.json` | 图片/媒体显示规则 |
| `navigationProfiles.json` | 导航 engine key 与参与 Class |

## 2. worlds.json

控制世界基础信息：

```json
{
  "id": "zth",
  "numericCode": 0,
  "label": "主世界",
  "enabled": true,
  "default": true,
  "center": { "x": -643, "y": 64, "z": -1562 },
  "projectionId": "dynmap-flat-zth",
  "tileSourceId": "zth-dynmap",
  "dataSourceId": "zth-rules"
}
```

检查：

- `id` 唯一。
- 只能有一个默认世界。
- `tileSourceId` 和 `dataSourceId` 必须存在。

## 3. dataSources.json

控制数据文件来源：

```json
{
  "id": "zth-rules",
  "worldId": "zth",
  "type": "githubRawCompatible",
  "owner": "OpenRIAMap",
  "repo": "OpenRIAMap-Data",
  "branch": "main",
  "basePath": "Data_Merge/zth",
  "pictureBasePath": "Picture/zth",
  "loadMode": "fileList",
  "files": ["ALL_20260228_HH.json"]
}
```

检查：

- `worldId` 必须存在。
- `basePath` 与数据仓库结构一致。
- 图片路径应与 Picture 目录规则一致。

## 4. ruleButtons.json

控制 UI 图层按钮和筛选规则。

```json
{
  "id": "railway_new",
  "label": "铁路-新",
  "criteria": {
    "classCode": ["RLE", "STA", "STB"]
  },
  "behavior": {
    "exclusiveGroup": "transport-main"
  }
}
```

检查：

- `id` 唯一。
- `criteria.classCode` 中的 Class 必须存在。
- `iconKey` 如存在，必须在 icon registry 中声明。

## 5. searchProfiles.json

控制搜索字段与结果分类。

重点检查：

- `searchFields` 是否与 Class 字段一致。
- blacklist / priority 中的 Class 是否存在。
- categoryOverrides 是否与 UI 预期一致。

## 6. navigationProfiles.json

只声明导航 engine key 与相关 Class，不在 JSON 中重写算法。

```json
{
  "id": "rail-new",
  "engineKey": "railNetworkNew",
  "enabled": true,
  "featureClasses": {
    "line": "RLE",
    "station": "STA"
  }
}
```

## 7. 禁止项

- 不要把世界、瓦片源、数据源写进 Class JSON。
- 不要在 environment JSON 中写导航算法。
- 不要在 preset 中默认放项目专属 environment。
- 不要让 environment 引用不存在的 Class、world、tileSource 或 dataSource。
