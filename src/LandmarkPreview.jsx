import React, {useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import photos from './landmark-photos.json';

export default function LandmarkPreview({site,anchor}) {
  const photo = photos[site.photoKey || site.id];
  const cardRef = useRef(null);
  const [position,setPosition] = useState(null);
  const [imageFailed,setImageFailed] = useState(false);
  useLayoutEffect(()=>{
    const place=()=>{
    const rect = anchor.getBoundingClientRect();
    if(rect.bottom<0||rect.top>window.innerHeight||rect.right<0||rect.left>window.innerWidth) {
      setPosition(null);
      return;
    }
    const card = cardRef.current.getBoundingClientRect();
    const gap = 12;
    const left = Math.max(gap,Math.min(rect.left+rect.width/2-card.width/2,window.innerWidth-card.width-gap));
    const preferredTop = rect.top-card.height-gap;
    const top = Math.max(gap,Math.min(preferredTop>=gap?preferredTop:rect.bottom+gap,window.innerHeight-card.height-gap));
    setPosition({left,top});
    };
    place();
    window.addEventListener('scroll',place,true);
    window.addEventListener('resize',place);
    return ()=>{
      window.removeEventListener('scroll',place,true);
      window.removeEventListener('resize',place);
    };
  },[anchor,site.label,imageFailed]);

  return createPortal(<div id="landmark-preview" role="tooltip" ref={cardRef}
    className={`landmark-preview${photo&&!imageFailed?' has-photo':''}`}
    style={{...position,visibility:position?'visible':'hidden'}}>
    {photo&&!imageFailed&&<img src={photo.src} alt={site.label} width="260" height="180" onError={()=>setImageFailed(true)}/>}
    <strong>{site.label}</strong>
  </div>,document.body);
}
