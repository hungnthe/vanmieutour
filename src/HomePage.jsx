import React, {useEffect, useState} from 'react';
import {ILLUSTRATED_HOTSPOTS, ILLUSTRATED_SITES, MAP_ART, MAP_ART_ALIGNMENT, alignMapPoint, siteHref} from './illustrated-sites.js';
import {ILLUSTRATED_ROUTES, ILLUSTRATED_ROUTE_POINTS} from './illustrated-routes.js';
import LandmarkPreview from './LandmarkPreview.jsx';

const ROUTE_NAMES = {
  van_mieu:'Văn Miếu', ho_van:'Hồ Văn', ba_nanh:'Chùa Bà Nành',
  ngoc_ho:'Chùa Ngọc Hồ', y_mieu:'Y Miếu', huy_van:'Chùa Huy Văn',
  van_chi:'Đền Văn Chỉ', pho_giac:'Chùa Phổ Giác',
  kham_thien:'Đài tưởng niệm Khâm Thiên', van_huong:'Đình Văn Hương',
  phung_thanh:'Chùa Phụng Thánh', kham_duc_dinh:'Đình Khâm Đức',
  trung_tu_dinh:'Đình Trung Tự', kim_lien:'Đền Kim Liên',
};
const routeSite = Object.fromEntries(ILLUSTRATED_SITES.map(site=>[site.id,site]));
const alignedHotspots = ILLUSTRATED_HOTSPOTS.map(site=>({...site,...alignMapPoint(site)}));
const routeOverlayTransform = `translate(${MAP_ART_ALIGNMENT.offsetX/MAP_ART.width*100}%,${MAP_ART_ALIGNMENT.offsetY/MAP_ART.height*100}%) scale(${MAP_ART_ALIGNMENT.scaleX},${MAP_ART_ALIGNMENT.scaleY})`;
const MAP_IMAGE_SRC = 'assets/ban-do-di-san-ha-noi-day-du.png';

function nearestIllustratedSite(event,stage) {
  const rect=stage.getBoundingClientRect();
  if(!rect.width||!rect.height) return null;
  const x=(event.clientX-rect.left)*MAP_ART.width/rect.width;
  const y=(event.clientY-rect.top)*MAP_ART.height/rect.height;
  let nearest=null;
  alignedHotspots.forEach((site,index)=>{
    const distance=Math.hypot(x-site.x,y-site.y);
    if(!nearest||distance<nearest.distance) nearest={site,index,distance};
  });
  // Include the illustration and its label without stealing hover from distant places.
  const reach=Math.max(48,28*MAP_ART.width/rect.width);
  return nearest.distance<=reach?nearest:null;
}

export function Brand({light = false}) {
  return <a className={`home-brand${light ? ' home-brand-light' : ''}`} href="/" aria-label="Văn Miếu 37 di tích — Trang chủ">
    <img className="home-brand-image" src="assets/brand-vm-stamp.png" alt="" aria-hidden="true" width="408" height="408" />
    <span className="home-brand-copy"><strong>Văn Miếu 37 di tích</strong></span>
  </a>;
}

function HeritageExplorer() {
  const [preview,setPreview] = useState(null);
  const [activeRouteId,setActiveRouteId] = useState(null);
  const activeRoute=ILLUSTRATED_ROUTES.find(route=>route.id===activeRouteId);
  const selectRoute=id=>{
    setPreview(null);
    setActiveRouteId(current=>current===id?null:id);
  };
  const onMapClickCapture=event=>{
    if(!event.detail||!event.target.closest?.('.home-map-hotspot')) return;
    const stage=event.currentTarget.querySelector('.home-map-stage');
    const nearest=nearestIllustratedSite(event,stage);
    if(nearest&&siteHref(nearest.site.id)!==event.target.closest('.home-map-hotspot').getAttribute('href')){
      event.preventDefault();
      event.stopPropagation();
      setPreview(null);
      window.location.hash=siteHref(nearest.site.id);
    }
  };
  const onMapMouseMove=event=>{
    if(event.target.closest?.('.home-route-stop')) return;
    const stage=event.currentTarget;
    const nearest=nearestIllustratedSite(event,stage);
    if(!nearest){
      if(!stage.contains(document.activeElement)||!document.activeElement.matches(':focus-visible')) setPreview(null);
      return;
    }
    const anchor=stage.querySelectorAll('.home-map-hotspot')[nearest.index];
    setPreview(current=>current?.anchor===anchor?current:{site:nearest.site,anchor});
  };
  const onMapClick=event=>{
    if(event.target.closest?.('.home-map-hotspot,.home-route-stop')) return;
    const nearest=nearestIllustratedSite(event,event.currentTarget);
    if(nearest){
      setPreview(null);
      window.location.hash=siteHref(nearest.site.id);
    }
  };
  useEffect(()=>{
    const dismiss=()=>setPreview(null);
    const onKeyDown=event=>{if(event.key==='Escape') dismiss();};
    window.addEventListener('keydown',onKeyDown);
    return ()=>{
      window.removeEventListener('keydown',onKeyDown);
    };
  },[]);
  return <section className="home-explorer" aria-label="37 di tích phường Văn Miếu">
    <div className="home-explorer-map">
      <div className="home-map-viewport" onClickCapture={onMapClickCapture}>
        <div className="home-map-stage"
          onMouseMove={onMapMouseMove} onMouseLeave={()=>setPreview(null)} onClick={onMapClick}>
          <img draggable="false" src={MAP_IMAGE_SRC} width={MAP_ART.imageWidth} height={MAP_ART.imageHeight} alt="Sơ đồ di sản Hà Nội đầy đủ tên địa danh, số thứ tự điểm ghé, sáu tuyến tham quan và bảng chú giải từ PDF gốc" />
          <img className="home-map-title-art" draggable="false" src="assets/map-title-37-di-tich.png" width="1536" height="1024" alt="" aria-hidden="true" />
          {activeRoute&&<svg className="home-route-focus" viewBox={`0 0 ${MAP_ART.width} ${MAP_ART.height}`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <radialGradient id="home-route-focus-fade">
                <stop offset="80%" stopColor="black" />
                <stop offset="100%" stopColor="white" />
              </radialGradient>
              <mask id="home-route-focus-mask" maskUnits="userSpaceOnUse" x="0" y="0" width={MAP_ART.width} height={MAP_ART.height}>
                <rect width={MAP_ART.width} height={MAP_ART.height} fill="white" />
                {activeRoute.stops.map(id=>{
                  const site=routeSite[id];
                  const point=alignMapPoint(site);
                  return <circle key={id} cx={point.x} cy={point.y} r={site.size/2+14} fill="url(#home-route-focus-fade)" />;
                })}
              </mask>
            </defs>
            <rect width={MAP_ART.width} height={MAP_ART.height} fill="white" opacity=".38" mask="url(#home-route-focus-mask)" />
          </svg>}
          {activeRoute&&<>
            {activeRoute.mode==='motorbike'&&<>
              <img className="home-route-highlight home-route-highlight-edge-alt" src={activeRoute.highlightAsset}
                draggable="false" width={MAP_ART.imageWidth} height={MAP_ART.imageHeight} alt="" aria-hidden="true"
                style={{transform:routeOverlayTransform}} />
              <img className="home-route-highlight home-route-highlight-edge" src={activeRoute.highlightAsset}
                draggable="false" width={MAP_ART.imageWidth} height={MAP_ART.imageHeight} alt="" aria-hidden="true"
                style={{transform:routeOverlayTransform}} />
            </>}
            <img className="home-route-highlight" src={activeRoute.highlightAsset}
              draggable="false" width={MAP_ART.imageWidth} height={MAP_ART.imageHeight} alt="" aria-hidden="true"
              style={{transform:routeOverlayTransform}} />
          </>}
          {alignedHotspots.map(site=><a
            key={`${site.id}-${site.label}`} className="home-map-hotspot"
            href={siteHref(site.id)} aria-label={site.label}
            aria-describedby={preview?.site.label===site.label?'landmark-preview':undefined}
            onMouseEnter={event=>setPreview({site,anchor:event.currentTarget})}
            onFocus={event=>setPreview({site,anchor:event.currentTarget})}
            onMouseLeave={event=>{if(!event.currentTarget.matches(':focus-visible')) setPreview(null);}}
            onBlur={()=>setPreview(null)}
            onClick={()=>setPreview(null)}
            style={{left:`${site.x/MAP_ART.width*100}%`,top:`${site.y/MAP_ART.height*100}%`,width:`${site.size/MAP_ART.width*100}%`,height:`${site.size/MAP_ART.height*100}%`}}
          />)}
          {activeRoute?.stops.map((id,index)=>{
            const point=alignMapPoint(ILLUSTRATED_ROUTE_POINTS[id]);
            // Keep the starting badge clear of the Văn Miếu illustration.
            const badgeY=point.y+(id==='van_mieu'?-40:0);
            const site=routeSite[id];
            return <a key={`${activeRoute.id}-${id}`} className="home-route-stop" href={siteHref(id)}
              style={{left:`${point.x/MAP_ART.width*100}%`,top:`${badgeY/MAP_ART.height*100}%`,'--route-color':activeRoute.color}}
              aria-label={`${index+1}. ${ROUTE_NAMES[id]}`}
              onMouseEnter={event=>setPreview({site:{...site,label:ROUTE_NAMES[id]},anchor:event.currentTarget})}
              onFocus={event=>setPreview({site:{...site,label:ROUTE_NAMES[id]},anchor:event.currentTarget})}
              onMouseLeave={event=>{if(!event.currentTarget.matches(':focus-visible')) setPreview(null);}}
              onBlur={()=>setPreview(null)} onClick={()=>setPreview(null)}
            ><span>{index+1}</span></a>;
          })}
        </div>
      </div>
      <div className="home-route-picker" aria-labelledby="home-route-title">
        <h3 className="home-route-title" id="home-route-title">Trải nghiệm tour thiết kế</h3>
        {[['walk','Tuyến đi bộ'],['motorbike','Tuyến xe máy']].map(([mode,label])=><div className="home-route-group" key={mode}>
          <h4>{label}</h4>
          <div className="home-route-list">
            {ILLUSTRATED_ROUTES.filter(route=>route.mode===mode).map(route=><button
              key={route.id} type="button" className={`home-route-option${activeRouteId===route.id?' is-active':''}`}
              style={{'--route-color':route.color}} aria-pressed={activeRouteId===route.id}
              onClick={()=>selectRoute(route.id)}
            >
              <span className="home-route-key"><strong>{route.id}</strong><i className={mode==='walk'?'is-dotted':'is-solid'} aria-hidden="true"/></span>
              <span className="home-route-names">{route.stops.map(id=>ROUTE_NAMES[id]).join(' → ')}</span>
            </button>)}
          </div>
        </div>)}
      </div>
      {activeRoute&&<p className="home-route-selected" role="status" style={{'--route-color':activeRoute.color}}>
        <strong>{activeRoute.id}</strong> · {activeRoute.stops.length} điểm ghé theo thứ tự trên sơ đồ. Chạm vào chấm đánh số để mở di tích.
      </p>}
    </div>
    {preview&&<LandmarkPreview key={preview.site.label} site={preview.site} anchor={preview.anchor}/>}
  </section>;
}

export default function HomePage() {
  useEffect(()=>{
    if(window.location.hash==='#gioi-thieu') document.getElementById('gioi-thieu')?.scrollIntoView?.({behavior:'instant'});
  },[]);
  return <div className="home-page">
    <header className="home-nav">
      <Brand />
      <nav className="home-nav-links" aria-label="Điều hướng chính">
        <a className="current" href="/" aria-current="page">Trang chủ</a>
        <a href="#gioi-thieu">Giới thiệu</a>
      </nav>
      <a className="home-nav-cta" href="#/map">Cá nhân hóa trải nghiệm tham quan<span aria-hidden="true">↗</span></a>
    </header>

    <main>
      <section className="home-hero" aria-labelledby="home-title">
        <img className="home-hero-image" src="assets/van-mieu-home-hero.webp" alt="Minh họa Văn Miếu – Quốc Tử Giám giữa sắc hoa và nắng vàng" fetchPriority="high" />
        <div className="home-hero-shade" />
        <a className="home-ticket-hint" href="https://vanmieu.gov.vn/en" target="_blank" rel="noopener noreferrer">
          Ấn vào biểu tượng để khám phá Văn Miếu
        </a>
        <a className="home-ticket-link" href="https://vanmieu.gov.vn/en" target="_blank" rel="noopener noreferrer" aria-label="Mở trang Văn Miếu – Quốc Tử Giám để mua vé" title="Mua vé tham quan Văn Miếu – Quốc Tử Giám">
          <img src="assets/van-mieu-ticket-logo-vertical.png" alt="" />
        </a>
        <div className="home-hero-content">
          <div className="home-eyebrow"><span /> DI SẢN VĂN HÓA · HÀ NỘI</div>
          <h1 id="home-title"><span>Chạm vào ký ức</span><em>ngàn năm <span className="home-title-place">Thăng Long.</span></em></h1>
        </div>
        <a className="home-scroll-cue" href="#gioi-thieu" aria-label="Cuộn đến phần giới thiệu"><span /> CUỘN ĐỂ KHÁM PHÁ</a>
      </section>

      <section className="home-intro" id="gioi-thieu">
        <div className="home-intro-heading">
          <span className="home-intro-kicker">Khám phá di sản</span>
          <h2>Mỗi di sản mở ra<br/><em>một câu chuyện Hà Nội.</em></h2>
        </div>
        <HeritageExplorer />
      </section>

    </main>

    <footer className="home-footer"><Brand light/><span>Gìn giữ dấu xưa, tiếp nối hành trình.</span></footer>
  </div>;
}
