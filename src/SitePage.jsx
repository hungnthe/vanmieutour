import React, {useEffect} from 'react';
import {ILLUSTRATED_SITES} from './illustrated-sites.js';

export default function SitePage({id}) {
  const site = ILLUSTRATED_SITES.find(item=>item.id===id);
  useEffect(()=>{
    const previousTitle = document.title;
    document.title = site ? `${site.name} — Dấu chân Di sản` : 'Không tìm thấy di tích';
    return ()=>{document.title=previousTitle;};
  },[site]);
  return <main className="site-page">
    <a className="site-back" href="#gioi-thieu">← Sơ đồ di sản Hà Nội</a>
    <h1>{site?.name || 'Không tìm thấy di tích'}</h1>
  </main>;
}
