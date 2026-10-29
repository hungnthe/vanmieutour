// Route colours and stop order follow the supplied map. Each transparent highlight asset
// preserves the exact printed line shape so selection can animate that path above the image.
// Coordinates below refer to the circular route markers in that illustration (768 × 1152).
export const ILLUSTRATED_ROUTE_POINTS = {
  van_mieu: {x: 403, y: 137},
  ho_van: {x: 383, y: 223},
  ba_nanh: {x: 446, y: 83},
  ngoc_ho: {x: 539, y: 103},
  y_mieu: {x: 600, y: 187},
  huy_van: {x: 275, y: 378},
  van_chi: {x: 310, y: 317},
  pho_giac: {x: 493, y: 199},
  kham_thien: {x: 569, y: 536},
  van_huong: {x: 389, y: 317},
  phung_thanh: {x: 431, y: 605},
  kham_duc_dinh: {x: 522, y: 611},
  trung_tu_dinh: {x: 530, y: 814},
  kim_lien: {x: 563, y: 907},
};

export const ILLUSTRATED_ROUTES = [
  {id:'W01', mode:'walk', color:'#0a9d67', highlightAsset:'assets/route-highlights/W01.png', stops:['van_mieu','ho_van','ba_nanh']},
  {id:'W02', mode:'walk', color:'#c19041', highlightAsset:'assets/route-highlights/W02.png', stops:['van_mieu','ngoc_ho','y_mieu']},
  {id:'W03', mode:'walk', color:'#7a2f00', highlightAsset:'assets/route-highlights/W03.png', stops:['van_mieu','huy_van','van_chi']},
  {id:'R01', mode:'motorbike', color:'#fa3411', highlightAsset:'assets/route-highlights/R01.png', stops:['van_mieu','pho_giac','y_mieu','kham_thien']},
  {id:'R02', mode:'motorbike', color:'#cc007e', highlightAsset:'assets/route-highlights/R02.png', stops:['van_mieu','van_huong','van_chi','phung_thanh','kham_duc_dinh']},
  {id:'R03', mode:'motorbike', color:'#0081cc', highlightAsset:'assets/route-highlights/R03.png', stops:['van_mieu','pho_giac','huy_van','trung_tu_dinh','kim_lien']},
];
