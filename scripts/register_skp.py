"""Compare SKP water outlines with supplied GIS; store evidence, not guessed pins."""
import json
import hashlib
import math
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data/model'
LAT=21.025
LNG=105.835
R=6378137
K=math.cos(math.radians(LAT))

def project(p):
    a=np.array(p,dtype=float)
    return np.column_stack(((np.radians(a[:,0]-LNG))*R*K,(np.radians(a[:,1]-LAT))*R))

def nearest(points, segments):
    a=segments[:,0]; d=segments[:,1]-a
    v=points[:,None,:]-a
    t=np.clip((v*d).sum(axis=2)/np.maximum((d*d).sum(axis=1),1e-12),0,1)
    q=a[None,:,:]+t[:,:,None]*d[None,:,:]
    dist=((points[:,None,:]-q)**2).sum(axis=2)
    idx=dist.argmin(axis=1)
    return q[np.arange(len(points)),idx],np.sqrt(dist[np.arange(len(points)),idx])

def components(edges):
    groups=[]; pending=list(range(len(edges)))
    while pending:
        group=[pending.pop()]; keys={tuple(np.round(p,2)) for p in edges[group[0]]}
        changed=True
        while changed:
            changed=False
            for i in pending[:]:
                if any(tuple(np.round(p,2)) in keys for p in edges[i]):
                    group.append(i);pending.remove(i);keys.update(tuple(np.round(p,2)) for p in edges[i]);changed=True
        groups.append(edges[group])
    return groups

def fit(a,b):
    ac=a.mean(axis=0);bc=b.mean(axis=0)
    u,s,v=np.linalg.svd((a-ac).T@(b-bc))
    rot=u@v
    if np.linalg.det(rot)<0: u[:,-1]*=-1;rot=u@v
    scale=((a-ac)@rot*(b-bc)).sum()/((a-ac)**2).sum()
    return rot*scale,bc-ac@rot*scale

def sample(seg,spacing=3):
    return np.concatenate([np.linspace(a,b,max(2,int(np.linalg.norm(b-a)/spacing))) for a,b in seg])

if __name__=='__main__':
    data=json.loads((OUT/'source-lines.json').read_text())
    water=np.array(data['TPX_WATERWAYS_OUTLINE_lines'])[:,:,:2]
    groups=components(water)
    gis=json.loads((ROOT/'data/gis/water.geojson').read_text(encoding='utf-8'))
    targets=[]
    for feature in gis['features']:
        p=project(feature['geometry']['coordinates'][0]); targets.append((feature['properties'],np.stack([p[:-1],p[1:]],axis=1)))
    results=[]
    for index,edges in enumerate(groups):
        a=sample(edges)
        if len(a)<10: continue
        for props,segments in targets:
            b=sample(segments)
            if not .5 < np.linalg.norm(np.ptp(a,axis=0))/np.linalg.norm(np.ptp(b,axis=0)) < 2: continue
            for angle in np.arange(0,360,30):
                ang=math.radians(angle); mat=np.array([[math.cos(ang),math.sin(ang)],[-math.sin(ang),math.cos(ang)]])
                offset=b.mean(axis=0)-a.mean(axis=0)@mat
                for _ in range(45):
                    matched,d=nearest(a@mat+offset,segments)
                    mat,offset=fit(a,matched)
                _,dist=nearest(a@mat+offset,segments)
                _,back=nearest(b,edges@mat+offset)
                score=float(np.sqrt((np.mean(dist**2)+np.mean(back**2))/2))
                results.append({'group':index,'name':props.get('name'),'osm_id':props['osm_id'],'rms_m':score,'scale':float(np.linalg.norm(mat[0])),'matrix':mat.tolist(),'offset':offset.tolist()})
    all_points=sample(water)
    all_targets=np.concatenate([s for _,s in targets])
    for candidate in results:
        if candidate['rms_m'] > 3 or not .9 < candidate['scale'] < 1.1:
            candidate['global_rms_m']=1e6
            continue
        _,residual=nearest(all_points@np.array(candidate['matrix'])+candidate['offset'],all_targets)
        candidate['global_rms_m']=float(np.sqrt(np.mean(residual**2)))
        candidate['inlier_fraction_5m']=float(np.mean(residual<5))
        candidate['global_median_m']=float(np.median(residual))
    results.sort(key=lambda v:(-v.get('inlier_fraction_5m',0),v.get('global_median_m',1e6)))
    best=results[0];mat=np.array(best['matrix']);offset=np.array(best['offset'])
    # Refine an affine placement using only near shoreline correspondences; unmatched
    # ponds outside the supplied GIS extent must not pull the model into a wrong area.
    for _ in range(40):
        matched,d=nearest(all_points@mat+offset,all_targets)
        keep=d<5
        coefficients=np.linalg.lstsq(np.column_stack([all_points[keep],np.ones(keep.sum())]),matched[keep],rcond=None)[0]
        mat=coefficients[:2];offset=coefficients[2]
    _,dist=nearest(all_points@mat+offset,all_targets)
    checks=[]
    for i,edge in enumerate(groups):
        _,d=nearest(sample(edge)@mat+offset,all_targets)
        checks.append({'source_group':i,'median_m':float(np.median(d)),'p95_m':float(np.percentile(d,95))})
    railway=np.array(data['TPX_RAILWAYS_AXES_lines'])[:,:,:2]
    rail_gis=json.loads((ROOT/'data/gis/railways-area.geojson').read_text(encoding='utf-8'))
    rail_gis['features']+=json.loads((ROOT/'data/gis/railways-context.geojson').read_text(encoding='utf-8'))['features']
    rail_segments=[]
    for f in rail_gis['features']:
        coords=f['geometry']['coordinates']
        for line in ([coords] if f['geometry']['type']=='LineString' else coords):
            p=project(line);rail_segments.append(np.stack([p[:-1],p[1:]],axis=1))
    _,rail_dist=nearest(sample(railway)@mat+offset,np.concatenate(rail_segments))
    origin=[LNG+math.degrees(offset[0]/(R*K)),LAT+math.degrees(offset[1]/R)]
    placement={'matrix':mat.tolist(),'offset':offset.tolist(),'origin':origin,
               'shoreline_checks':checks,'matched_water_fraction_5m':float(np.mean(dist<5)),
               'matched_water_median_m':float(np.median(dist[dist<5])),
               'railway_median_m':float(np.median(rail_dist)),'railway_p95_m':float(np.percentile(rail_dist,95)),
               'railway_matched_fraction_5m':float(np.mean(rail_dist<5)),
               'railway_matched_p95_m':float(np.percentile(rail_dist[rail_dist<5],95))}
    (OUT/'placement.json').write_text(json.dumps(placement,indent=2),encoding='utf-8')
    conversion=json.loads((OUT/'conversion.json').read_text())
    source_bounds=np.array(conversion['bounds_skp_m'])
    corners=np.array([[source_bounds[x,0],source_bounds[y,1]] for x in [0,1] for y in [0,1]])@mat+offset
    geo=np.column_stack([LNG+np.degrees(corners[:,0]/(R*K)),LAT+np.degrees(corners[:,1]/R)])
    manifest={'source':'model_2.skp','source_sha256':conversion['source_sha256'],'url':'data/model/model_2.glb',
              'glb_sha256':hashlib.sha256((OUT/'model_2.glb').read_bytes()).hexdigest(),
              'origin':origin,'matrix':mat.tolist(),'vertical_offset_m':-source_bounds[0,2],
              'bounds':[geo.min(axis=0).tolist(),geo.max(axis=0).tolist()],
              'placement_status':'inferred_from_supplied_gis_geometry_not_surveyed',
              'sketchup_layer_defaults':{'TPX_BUILDINGS':True,'noithat':True,'timngo':True,'nha_khoi':True,
                                         'TPX_TERRAIN_TERRAIN_MESH':False,'TPX_ROADS_HATCH':False,
                                         'TPX_WATERWAYS_HATCH':False,'TPX_VEGETATION_GREEN_SPACES_HATCH':False},
              'source_layer_summary':{name:{'faces':value['faces'],'triangles':value['triangles'],'bounds_m':value['bounds_m']}
                                      for name,value in conversion['stats']['layers'].items()},
              'placement_evidence':{'water_contours_matched':sum(c['p95_m']<1 for c in checks),
                                    'matched_water_median_m':placement['matched_water_median_m'],
                                    'railway_median_m':placement['railway_median_m'],
                                    'railway_p95_m':placement['railway_p95_m'],
                                    'railway_matched_fraction_5m':placement['railway_matched_fraction_5m'],
                                    'railway_matched_p95_m':placement['railway_matched_p95_m']},
              'geometry':conversion['stats'],'glb_bytes':conversion['glb_bytes'],
              'notes':conversion['notes']}
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    # Independent residuals: all remaining water outlines against all GIS shorelines.
    _,dist=nearest(sample(water)@mat+offset,np.concatenate([s for _,s in targets]))
    evidence={'method':'Candidate similarity fit, ranked by shoreline inlier coverage; robust affine refinement against nearby GIS water shorelines. Railway checked independently. Out-of-coverage or changed features retained as unmatched residuals.',
              'projection':{'longitude':LNG,'latitude':LAT,'radius':R,'cos_latitude':K},'best':best,'top_candidates':results[:15],
              'all_water_median_m':float(np.median(dist)),'all_water_p95_m':float(np.percentile(dist,95)),
              'placement':placement,'source_components':[{'edges':len(e),'min':e.min(axis=(0,1)).tolist(),'max':e.max(axis=(0,1)).tolist()} for e in groups]}
    (OUT/'registration.json').write_text(json.dumps(evidence,indent=2,ensure_ascii=False),encoding='utf-8')
    print(json.dumps(evidence,indent=2,ensure_ascii=False))
