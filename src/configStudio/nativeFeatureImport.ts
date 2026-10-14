import type {ConfigPackageV3} from './types';
import {recordClassification} from './workflowEditing';
import {normalizeV3WorldId,validateV3WorkflowRecords} from './V3WorkflowRunner';
import {assembleAnnotations} from './workflowAnnotations';
import {hasCategoryNode,hasDescendants,resolveGeometryProfile} from './runtime';
import {geometryTypeFromFeatureType,readMultipartGeometry,validateMultipartGeometry,withCanonicalMultipartGeometry} from '../core/geometry/multipartGeometry';
/** Native record input does not pass through a legacy form serializer. */
export function prepareNativeFeatureImport(config:ConfigPackageV3,item:Record<string,unknown>,world:string) {
 const type=geometryTypeFromFeatureType(item.Type),classification=recordClassification(item);
 if(!type||!hasCategoryNode(config,classification)||hasDescendants(config,classification)||!resolveGeometryProfile(config,classification,type)?.enabled)throw Error('导入记录的类型、最终分类或几何设置无效。');
 if(!String(item.World??'').trim()||normalizeV3WorldId(String(item.World))!==normalizeV3WorldId(world))throw Error('导入记录与当前世界不一致。');
 const read=readMultipartGeometry(item,type),geometryError=read.error??validateMultipartGeometry(read.geometry);if(geometryError||!read.geometry)throw Error(geometryError??'缺少几何。');
 assembleAnnotations({advanced:{...(item.tags!==undefined?{tags:item.tags}:{}),...(item.extensions!==undefined?{extensions:item.extensions}:{})}});
 const record=withCanonicalMultipartGeometry(structuredClone(item),read.geometry),output={id:'native-import',classification,geometry:{selected:type},assignments:[]};
 const issues=validateV3WorkflowRecords(config,{id:'native-import',label:{zh:'导入',en:''},mode:'composed',steps:[],outputs:[output]},[{outputId:output.id,classification,geometry:type,record}]);if(issues.length)throw Error(issues.map(i=>i.message).join('；'));
 const coords=read.geometry.type==='Point'?read.geometry.parts:read.geometry.type==='LineString'?read.geometry.parts[0]:read.geometry.parts[0][0];
 return {record,geometry:read.geometry,coords,mode:type==='Point'?'point' as const:type==='LineString'?'polyline' as const:'polygon' as const};
}
