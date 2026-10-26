# Kiểm toán layer bản đồ — 26/10/2026

## Trạng thái hiện tại

Bản đồ hiện mở với nền OSM, marker di tích, không có layer GIS bổ sung, không có khối nhà OSM 3D và không có mô hình SketchUp. Các nhóm GIS có công tắc riêng; chúng mặc định tắt vì overlay đường, nước và đường sắt có thể lặp lại dữ liệu đã vẽ trong nền. Khi bật SketchUp, nhà OSM 3D tự tắt; khi bật nhà OSM 3D, SketchUp tự tắt. Hai lớp không thể hiển thị đồng thời qua giao diện.

Mỗi lần bật/tắt lớp được áp dụng sau khi style MapLibre sẵn sàng. Trước khi sửa, sự kiện `load` đến quá sớm: lệnh ẩn `building-3d` chưa chạy và các lớp GIS chưa được thêm vào style. Đã áp dụng lại trạng thái khi map vào `idle`, kiểm tra trực tiếp thuộc tính hiển thị và số đối tượng được render trong Chrome.

## Phát hiện chồng lớp

| Nhóm | Phát hiện | Xử lý |
| --- | --- | --- |
| Đường | `TPX_ROADS_HATCH` có 18.680 mặt, phủ vùng khoảng 955,5 × 950,0 m. GIS roads có 1.107 đối tượng, bao gồm lối đi bộ và đường dịch vụ; nguồn có trường `osm_id`. Đây là các hình học đường riêng chồng khu vực; metadata không ghi revision/lineage đủ để kết luận mọi đoạn trùng chính xác với tile nền. | Tắt hatch SketchUp mặc định. GIS roads có công tắc riêng và tắt mặc định để không vẽ kép với nền OSM. |
| Nước | Hatch SketchUp có 232 mặt; đối chiếu đường bao tìm được 6 nhóm khớp rất sát đường nước GIS. 74,8% mẫu nước nằm trong 5 m tính từ đường bao GIS. | Hatch nước SketchUp tắt mặc định; GIS water có công tắc độc lập. |
| Đường sắt | SketchUp và GIS có đường sắt tương ứng: 70,7% mẫu trục nằm trong 5 m, P95 của nhóm khớp là 0,011 m. P95 tính trên toàn bộ mẫu là 596,4 m do các đoạn ngoài vùng hoặc không có đối ứng. | Hatch/tuyến SketchUp tắt mặc định; nhóm GIS railways tắt mặc định để tránh chồng với nền OSM. |
| Nhà 3D | `TPX_BUILDINGS` có 44.864 tam giác, nằm trên khu vực cũng có footprint nhà OSM. Hai nguồn đều dựng công trình 3D trong vùng khảo sát, dù không có bộ snapshot OSM độc lập để so khớp footprint từng nhà. | Công tắc OSM 3D và SketchUp loại trừ lẫn nhau; SketchUp cũng tắt mặc định do vị trí chưa được xác nhận độc lập. |
| Mặt nền trắng | `TPX_TERRAIN_TERRAIN_MESH` có 4.704 tam giác, cao độ nguồn 8,53–18,13 m, extents khoảng 955,5 × 950,0 m. Ảnh lớp riêng cho thấy đây là một mặt trắng lớn đủ che nền OSM. | Tách thành checkbox riêng, tắt mặc định. Không xóa hoặc sửa hình học gốc. |
| Mảng xanh | `TPX_VEGETATION_GREEN_SPACES_HATCH` có 1.694 tam giác. | Checkbox riêng, tắt mặc định để người xem lựa chọn. |

Nền OSM/OpenMapTiles và các shapefile GIS có thuộc tính OSM cùng hiển thị các nhóm đường, nước, nhà và đường sắt. Có nguy cơ lặp đối tượng giữa các nguồn. Tile nền là dịch vụ trực tiếp, còn metadata shapefile không chứa lineage đủ chi tiết, nên chưa thể khẳng định số lượng đối tượng trùng chính xác theo từng feature/revision. Vì vậy overlay GIS không tự bật cùng nền. Dữ liệu GIS hiện không được chứng minh chính xác hơn tile OSM chỉ bằng việc đã chuyển sang GeoJSON.

## Vị trí, tỷ lệ và góc xoay SketchUp

SketchUp C API trả `SUModelIsGeoReferenced=false`; tọa độ nội bộ không được dùng như tọa độ Hà Nội. Đăng ký được suy ra bằng fit affine đường bao nước tới `data/gis/water.geojson`, sau đó kiểm tra riêng đường sắt. Không căn vị trí bằng mắt và không thay tọa độ chuẩn của các di tích.

- Gốc suy ra (kinh độ, vĩ độ): `105.83208321113491, 21.023925754975096`.
- Ma trận affine: `[[0.9998756875, -0.0052625460], [0.0052332212, 1.0057329709]]`.
- Góc quay polar: khoảng `0,29984°`; hai tỷ lệ chính khoảng `0,999889` và `1,005747` (xấp xỉ −0,011% và +0,575%). Đây là fit affine không đồng nhất, không phải một scale duy nhất.
- Offset trong mặt phẳng cục bộ: `[-303,0785 m, -119,5844 m]` theo phép chiếu trong báo cáo đăng ký.
- 6 đường bao nước có P95 sai số dưới 1 mm; 74,8% toàn bộ mẫu nước nằm trong 5 m. Độ khớp nhỏ như vậy cho thấy hình học chung nguồn hoặc cùng phép biến đổi, không chứng minh georeference hoặc độ chính xác khảo sát.
- Đường sắt: 70,7% mẫu dưới 5 m; P95 nhóm khớp 0,011 m; P95 toàn bộ 596,4 m. Các mẫu xa/không khớp vẫn được giữ trong `data/model/registration.json`.

Do chưa có mốc tọa độ khảo sát hoặc hồ sơ georeference độc lập, không đủ chứng cứ xác nhận vị trí toàn mô hình. Lớp SketchUp được giữ tắt mặc định. Khi cần xem thử, có thể bật bằng checkbox, nhưng không coi đó là vị trí chính xác đã xác thực.

## Ảnh kiểm chứng

Ảnh được chụp tại Chrome 1440 × 960 với trạng thái lớp được kiểm tra qua MapLibre; `results.json` lưu số layer/feature render tương ứng. Mỗi ảnh gồm UI hiện hành và map ở trạng thái cô lập.

- [Nền OSM](layer-audit/01-osm-base.png)
- [Đường GIS](layer-audit/02-gis-roads.png)
- [Nước GIS](layer-audit/03-gis-water.png)
- [Đường sắt GIS](layer-audit/04-gis-railways.png)
- [Ranh giới GIS](layer-audit/05-gis-boundaries.png)
- [Nhà 3D OSM](layer-audit/06-osm-3d-buildings.png)
- [Marker di tích](layer-audit/07-heritage-markers.png)
- [SketchUp với các lớp mặc định](layer-audit/08-sketchup-model-default-sublayers.png)
- [Nhà SketchUp](layer-audit/09-sketchup-buildings.png)
- [Nội thất SketchUp](layer-audit/10-sketchup-interiors.png)
- [Khối nhà SketchUp](layer-audit/11-sketchup-building-blocks.png)
- [Nhãn/hướng dẫn SketchUp](layer-audit/12-sketchup-labels-and-guides.png)
- [Hatch đường SketchUp](layer-audit/13-sketchup-road-hatch.png)
- [Hatch nước SketchUp](layer-audit/14-sketchup-water-hatch.png)
- [Mặt nền trắng/địa hình SketchUp](layer-audit/15-sketchup-terrain-white-base.png)
- [Mảng xanh SketchUp](layer-audit/16-sketchup-green-spaces.png)
- [Ảnh ghép các lớp GIS và marker](layer-audit/17-composite-gis-overlays-and-markers.png)
- [Ảnh chồng nền OSM và toàn bộ overlay GIS để rà trùng](layer-audit/18-osm-and-gis-overlap-check.png)
- [Ảnh ghép cuối: OSM và marker, không trùng overlay/3D](layer-audit/19-final-safe-osm-composite.png)
- [Giao diện công tắc layer trên mobile 390 px](layer-audit/20-mobile-layer-controls.png)

`layer_browser_test.cjs` kiểm tra 20 trạng thái bằng browser và xác minh không lúc nào khối nhà OSM 3D cùng hiển thị với SketchUp. Ảnh nền OSM và ảnh ghép cuối giữ SketchUp tắt.
