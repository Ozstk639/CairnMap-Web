# Class 配置编辑指南

Class 配置是 CairnMap 中一个地物类型的主要定义文件。字段、分类、geometry、显示绑定、信息卡绑定和 workflow 绑定，都应优先在 Class JSON 中维护。

常见位置：

```text
project-config/presets/*/classes/*.json
```

## 1. Class 配置控制什么？

| 区块 | 作用 |
|---|---|
| `classCode` / `classKey` | 地物类型身份 |
| `label` / `description` | UI 名称与说明 |
| `data` | 旧数据字段映射、默认 Type/Class |
| `geometry` | Point / LineString / Polygon 等空间类型 |
| `identity` | ID、名称、显示名字段 |
| `classification` | Kind / SKind / SKind2 分类体系 |
| `fields` | 普通字段定义 |
| `groups` | 嵌套数组或成组字段 |
| `tags` / `extensions` | 扩展标签与命名空间 |
| `display` | 地图显示规则绑定 |
| `card` | 信息卡布局绑定 |
| `workflowBindings` | 测绘/编辑 workflow 绑定 |

## 2. 最小结构示例

```json
{
  "schemaVersion": "cairnmap.class.v1",
  "runtimeStatus": "active",
  "classCode": "STA",
  "classKey": "station",
  "label": {
    "zh-CN": "车站",
    "en": "Station"
  },
  "data": {
    "typeField": "Type",
    "classField": "Class",
    "worldField": "World",
    "defaultType": "Points",
    "defaultClass": "STA"
  },
  "geometry": {
    "type": "Point",
    "sourceField": "coordinate",
    "axisOrder": "x,z,y",
    "required": true
  },
  "identity": {
    "idField": "ID",
    "nameField": "Name",
    "displayNameField": "Name"
  },
  "fields": [],
  "groups": [],
  "display": {
    "rules": []
  },
  "card": {
    "layoutId": "standard-feature-card"
  },
  "workflowBindings": []
}
```

## 3. 字段模型

字段通常写在 `fields` 中：

```json
{
  "key": "Name",
  "sourceRuntimeField": "Name",
  "label": {
    "zh-CN": "名称",
    "en": "Name"
  },
  "type": "text",
  "required": true,
  "scenes": {
    "workflow": true,
    "editor": true,
    "infocard": true,
    "search": true
  }
}
```

| 字段 | 含义 |
|---|---|
| `key` | 配置内部字段名，必须唯一 |
| `sourceRuntimeField` | 旧数据或运行时字段名，可选 |
| `label.zh-CN` | 中文 UI 名称 |
| `label.en` | 英文 UI 名称 |
| `type` | 字段类型，例如 `text`、`number`、`boolean`、`featureRef` |
| `required` | 是否必填 |
| `scenes.workflow` | 是否出现在测绘流程中 |
| `scenes.editor` | 是否出现在编辑器中 |
| `scenes.infocard` | 是否出现在信息卡中 |
| `scenes.search` | 是否参与搜索 |

## 4. Geometry 模型

```json
{
  "geometry": {
    "type": "LineString",
    "sourceField": "coordinate",
    "axisOrder": "x,z,y",
    "required": true
  }
}
```

常见类型：

```text
Point
LineString
Polygon
MultiPolygon
```

修改 geometry 时要确认：

- 数据源中是否真的提供对应 geometry。
- workflow 的 `targetGeometry` 是否一致。
- display profile 是否适合该 geometry 类型。

## 5. Classification 模型

```json
{
  "classification": {
    "kindField": "Kind",
    "skindField": "SKind",
    "skind2Field": "SKind2",
    "required": false,
    "options": [
      {
        "kind": "NOM",
        "skind": "HUB",
        "skind2": "NOM",
        "label": {
          "zh-CN": "枢纽车站",
          "en": "Hub Station"
        }
      }
    ]
  }
}
```

分类选项应写在 Class JSON 中，不要写进 workflow TS。

## 6. Display 绑定

Class 中的 `display.rules` 负责把地物绑定到 shared display profile：

```json
{
  "id": "station-default",
  "match": { "classCode": "STA" },
  "profile": "stationPoint",
  "label": {
    "source": "Name",
    "styleKey": "gm-outline"
  }
}
```

检查：

- `profile` 必须存在于 `shared/display/displayProfiles.json`。
- `styleKey` 必须存在于 `shared/display/labelStyles.json`。
- `specialLogic.key` 只引用已声明的特殊逻辑 key。

## 7. Card 绑定

Class 通过 `card.layoutId` 绑定信息卡布局：

```json
{
  "card": {
    "layoutId": "station-default-card"
  }
}
```

布局本身在：

```text
project-config/presets/core-structures/shared/card/cardLayouts.json
```

## 8. Workflow 绑定

```json
{
  "workflowBindings": [
    { "workflowId": "station-basic", "default": true }
  ]
}
```

检查：

- `workflowId` 对应 workflow 文件必须存在。
- workflow 的 `targetClass` 应与当前 Class 一致。
- workflow 的 `componentKey` 必须在 shared workflow 配置中声明。

## 9. 常见操作

### 新增字段

1. 在 `fields` 中添加字段。
2. 设置 `label.zh-CN`。
3. 设置 `type` 与 `scenes`。
4. 运行 validate / audit / build。

### 字段只在信息卡显示

```json
{
  "scenes": {
    "workflow": false,
    "editor": false,
    "infocard": true,
    "search": false
  }
}
```

### 添加 feature link

如果字段需要链接到另一个 Class，优先在 card layout 中配置 `linkTarget`，并确保目标 `classCode` 存在。

## 10. 禁止项

- 不要在 `featureFormats.ts` 新增字段定义。
- 不要让 Class JSON 引用不存在的 display profile、label style、card layout 或 workflowId。
- 不要使用 `runtimeStatus: "shadow"`。
- 不要把复杂函数写进 JSON。
