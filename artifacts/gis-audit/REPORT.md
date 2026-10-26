# GIS import audit

Status: **PASS_WITH_WARNINGS**

Source shapefiles are read-only. The 35 QTG_Diem points are exported to an audit-only layer and are not loaded as public map markers. Canonical site and route JSON files are not modified.

## Layers

| Layer | Shape type | Features | CRS from PRJ | Invalid | Duplicates |
|---|---|---:|---|---:|---:|
| roads | line | 1107 | EPSG:4326 → EPSG:4326 | 0 | 0 |
| water | polygon | 13 | EPSG:4326 → EPSG:4326 | 0 | 0 |
| railways_area | line | 87 | EPSG:4326 → EPSG:4326 | 0 | 0 |
| railways_context | line | 288 | EPSG:4326 → EPSG:4326 | 0 | 0 |
| boundary | polygon | 1 | EPSG:4326 → EPSG:4326 | 0 | 0 |
| boundary_supplementary | line | 1 | EPSG:32648 → EPSG:4326 | 0 | 0 |
| heritage_points_review | point | 35 | EPSG:4326 → EPSG:4326 | 0 | 0 |

## Spatial checks

- Supplementary boundary against QTG_RanhGioi: **close**, Hausdorff distance 1.887 m.
- Road/water/rail/boundary GeoJSON layers: 4 active overlays.
- Candidate heritage points: 35; all require identity/source review before inclusion in the public list.
- The OSM-derived layers include attribution in the map controls. The supplied shapefiles do not include a separate license statement; verify source terms before public redistribution.

## Point crosswalk review

| GIS name | Exact name/alias candidates | Possible name matches | Decision |
|---|---|---|---|
| Đình Làng Thổ Quan | tho_quan | tho_quan (1.000), trung_tu_dinh (0.722) | Human review required |
| Chùa Linh Ứng | linh_ung | linh_ung (1.000), linh_quang (0.929), my_quang (0.692) | Human review required |
| Đền Trung Tả | trung_ta | trung_ta (1.000), trung_phung (0.741), trung_tu_dinh (0.667) | Human review required |
| Chùa Linh Quang | linh_quang | linh_quang (1.000), linh_ung (0.929), my_quang (0.786) | Human review required |
| Chùa Huy Văn | huy_van | huy_van (1.000), my_quang (0.720), phung_thanh (0.714) | Human review required |
| Đài tưởng niệm Khâm Thiên | kham_thien | kham_thien (1.000) | Human review required |
| Chùa Phụng Thánh | phung_thanh | phung_thanh (1.000), huy_van (0.714), quang_minh (0.710) | Human review required |
| Chùa Mỹ Quang | my_quang | my_quang (1.000), linh_quang (0.786), huy_van (0.720) | Human review required |
| Chùa Bà Nành | — | ngoc_ho (0.783), huy_van (0.667), ba_nanh (0.649) | Human review required |
| Y Miếu | y_mieu | y_mieu (1.000) | Human review required |
| Chùa Ngọc Hồ (Bà Ngô) | ngoc_ho | ngoc_ho (1.000), phung_thanh (0.629), lien_hoa (0.625) | Human review required |
| Chùa Phổ Giác | pho_giac | pho_giac (1.000), huy_van (0.640), but_moc (0.640) | Human review required |
| Chùa Quang Minh | quang_minh | quang_minh (1.000), my_quang (0.714), phung_thanh (0.710) | Human review required |
| Chùa Trung Tự | trung_tu_chua | trung_tu_chua (1.000), trung_tu_dinh (0.710), phung_thanh (0.690) | Human review required |
| Giếng Ngọc Đình Trung Tự | — | trung_tu_dinh (0.619), trung_tu_chua (0.595) | Human review required |
| Đền - Đình Kim Liên | — | kim_lien (0.791) | Human review required |
| Văn Miếu - Quốc Tử Giám | van_mieu | van_mieu (1.000) | Human review required |
| Đình Thanh Miến | thanh_mien | thanh_mien (1.000), thai_kieu (0.759), van_huong (0.621) | Human review required |
| Đình Trung Kính | trung_kinh | trung_kinh (1.000), trung_tu_dinh (0.667), trung_ta (0.667) | Human review required |
| Đình Thái Kiều | thai_kieu | thai_kieu (1.000), thanh_mien (0.759), kham_duc_dinh (0.667) | Human review required |
| Chùa Bụt Mọc | but_moc | but_moc (1.000), ngoc_ho (0.696), tien_tich (0.615) | Human review required |
| Đình Văn Hương | van_huong | van_huong (1.000), luong_su (0.710), trung_tu_dinh (0.688) | Human review required |
| Đình - Đền Lương Sử | luong_su | luong_su (1.000), van_huong (0.710) | Human review required |
| Đình làng Trung Tự | trung_tu_dinh | trung_tu_dinh (1.000), tho_quan (0.722), trung_tu_chua (0.710) | Human review required |
| Chùa Liên Hoa | lien_hoa | lien_hoa (1.000), tien_tich (0.741), linh_quang (0.714) | Human review required |
| Chùa Tiên Tích | tien_tich | tien_tich (1.000), lien_hoa (0.741), ba_nanh (0.710) | Human review required |
| Đền Đức Thánh Trần | duc_thanh_tran | duc_thanh_tran (1.000), thanh_mien (0.606) | Human review required |
| Đền Văn Chỉ | van_chi | van_chi (1.000), van_huong (0.640) | Human review required |
| Hồ Giám | — | pho_giac (0.600) | Human review required |
| Gò Kim Châu | — | ho_van (0.759) | Human review required |
| Đền Mẫu Sòng Sơn - Hà Nội | song_son | song_son (1.000) | Human review required |
| Đền Trung Phụng | trung_phung | trung_phung (1.000), trung_ta (0.741), trung_kinh (0.667) | Human review required |
| Đình Khâm Đức | kham_duc_dinh | kham_duc_dinh (1.000), thai_kieu (0.667) | Human review required |
| Đền Khâm Đức - thờ Châu Đệ Tứ | kham_duc_den | kham_duc_den (1.000) | Human review required |
| Chùa Tiên Phúc Tự | ba_nanh | ba_nanh (1.000), tien_tich (0.710), trung_tu_chua (0.667) | Human review required |

## Warnings

- QTG_Diem is a review dataset. Its 35 positions have no independent source/provenance in the supplied sidecars; they are not public markers.
- The current canonical list remains 32 sites with 25 gazette centroids and 7 unlocated sites; no GIS point is used to fill a missing location.
- Road lines have class and one-way attributes but network topology, pedestrian access, motorbike restrictions, and route connectivity have not been validated.
- boundary: source geometry encoding warning(s): Possible issue encountered when converting Shape #0 to GeoJSON: Shapefile format requires that polygons contain at least one exterior ring, but the Shape was entirely made up of interior holes (defined by counter-clockwise orientation in the shapefile format). The rings were still included but were encoded as GeoJSON exterior rings instead of holes.

Generated by `scripts/gis/build_layers.py`.
