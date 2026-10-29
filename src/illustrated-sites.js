// Positions in PDF page points (768 × 1152), not GIS coordinates.
// Labels are preserved from the supplied PDF. Ba Nanh and Tien Phuc share one destination.
export const MAP_ART = {width:768,height:1152,imageWidth:2048,imageHeight:3072};
// The current illustrated PNG places the original PDF map slightly inset on its canvas.
// Keep hotspots, route stops and route line overlays in one calibrated coordinate system.
export const MAP_ART_ALIGNMENT = {scaleX:0.953653,scaleY:0.955034,offsetX:40.093322,offsetY:39.118728};
export function alignMapPoint({x,y}) {
  return {x:x*MAP_ART_ALIGNMENT.scaleX+MAP_ART_ALIGNMENT.offsetX,y:y*MAP_ART_ALIGNMENT.scaleY+MAP_ART_ALIGNMENT.offsetY};
}
export const ILLUSTRATED_SITES = [
  {id:'van_mieu',name:'Văn Miếu – Quốc Tử Giám',x:403,y:137,size:60},
  {id:'ba_nanh',name:'Chùa Bà Nành (Tiên Phúc tự)',label:'Chùa Bà Nành',x:460,y:105,size:28},
  {id:'thanh_mien',name:'Đình Thanh Miến',x:500,y:96,size:24},
  {id:'ngoc_ho',name:'Chùa Ngọc Hồ (Bà Ngô)',x:539,y:103,size:48},
  {id:'y_mieu',name:'Y Miếu',x:600,y:187,size:34},
  {id:'pho_giac',name:'Chùa Phổ Giác',x:514,y:219,size:42},
  {id:'ho_van',name:'Hồ Văn',x:400,y:220,size:40},
  {id:'song_son',name:'Đền Mẫu Sòng Sơn – Hà Nội',x:353,y:217,size:24},
  {id:'quang_minh',name:'Chùa Quang Minh',x:590,y:216,size:18},
  {id:'duc_thanh_tran',name:'Đền Đức Thánh Trần',x:665,y:225,size:20},
  {id:'tien_tich',name:'Chùa Tiên Tích',x:670,y:246,size:18},
  {id:'luong_su',name:'Đình – Đền Lương Sử',x:444,y:267,size:22},
  {id:'van_chi',name:'Đền Văn Chỉ',x:318,y:346,size:42},
  {id:'van_huong',name:'Đình Văn Hương',x:414,y:342,size:36},
  {id:'huy_van',name:'Chùa Huy Văn',x:297,y:405,size:32},
  {id:'linh_quang',name:'Chùa Linh Quang',x:451,y:399,size:24},
  {id:'but_moc',name:'Chùa Bụt Mọc',x:358,y:470,size:22},
  {id:'lien_hoa',name:'Chùa Liên Hoa',x:476,y:515,size:24},
  {id:'linh_ung',name:'Chùa Linh Ứng',x:326,y:534,size:22},
  {id:'trung_ta',name:'Đền Trung Tả',x:370,y:550,size:24},
  {id:'kham_thien',name:'Đài tưởng niệm Khâm Thiên',x:550,y:550,size:34},
  {id:'phung_thanh',name:'Chùa Phụng Thánh',x:465,y:624,size:48},
  {id:'kham_duc_dinh',name:'Đình Khâm Đức',x:552,y:628,size:32},
  {id:'kham_duc_den',name:'Đền Khâm Đức – thờ Châu Đệ Tứ',x:577,y:612,size:20},
  {id:'my_quang',name:'Chùa Mỹ Quang',x:580,y:640,size:18},
  {id:'trung_kinh',name:'Đình Trung Kính',x:584,y:659,size:18},
  {id:'tho_quan',name:'Đình làng Thổ Quan',x:384,y:681,size:24},
  {id:'thai_kieu',name:'Đình Thái Kiều',x:455,y:708,size:24},
  {id:'trung_phung',name:'Đền Trung Phụng',x:528,y:734,size:26},
  {id:'trung_tu_chua',name:'Chùa Trung Tự',x:446,y:825,size:24},
  {id:'trung_tu_dinh',name:'Đình làng Trung Tự',x:544,y:850,size:46},
  {id:'kim_lien',name:'Đền Kim Liên',x:536,y:935,size:44},
];
export const ILLUSTRATED_HOTSPOTS = [
  ...ILLUSTRATED_SITES.map(site=>({...site,label:site.label || site.name})),
  {...ILLUSTRATED_SITES.find(site=>site.id==='ba_nanh'),label:'Chùa Tiên Phúc Tự',photoKey:'tien_phuc',x:466,y:125,size:14},
];
export function siteHref(id) { return `#/di-tich/${id}`; }
