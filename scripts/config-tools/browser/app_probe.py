"""Read the actual React host's existing integration refs; no test host replacement."""
PROBE = r"""(() => {
 const el=document.querySelector('.leaflet-container'); if(!el)return false;
 let root=el[Object.keys(el).find(k=>k.startsWith('__reactFiber'))];
 if(!root)return false;while(root.return)root=root.return;root=root.stateNode?.current??root;
 const stack=[root], seen=new Set();let map,projection,measurement,records=[],config,world,renderer;
 while(stack.length){const f=stack.pop();if(!f||seen.has(f))continue;seen.add(f);
  const p=f.memoizedProps;if(p?.map?.getZoom&&p?.projection&&'activeButtonIds' in p){renderer=f;map=p.map;projection=p.projection;config=p.configRuntime;world=p.worldId;}
  let h=f.memoizedState;const hs=new Set();while(h&&typeof h==='object'&&!hs.has(h)){hs.add(h);
   const v=h.memoizedState?.current;if(v?.getZoom&&v?._container)map=v;
   if(v?.locationToLatLng)projection=v;if(v?.getCommittedFeatures)measurement=v;
   if(f===renderer&&Array.isArray(v)&&v.length>records.length&&v[0]?.uid&&(v[0]?.featureInfo?.Class||v[0]?.meta?.Class))records=v;
   h=h.next;
  }if(f.child)stack.push(f.child);if(f.sibling)stack.push(f.sibling);
 }
 window.appProbe={map,projection,measurement,records,config,world,renderer};
 return map&&projection?{world,records:records.length,contract:config?.contractRevision,packageRevision:config?.revision,measurement:!!measurement}:false;
})()"""

POINT = r"""(x,z)=>{const a=window.appProbe,p=a.map.latLngToContainerPoint(a.projection.locationToLatLng(x,64,z)),r=a.map.getContainer().getBoundingClientRect();return {x:p.x+r.x,y:p.y+r.y};}"""
