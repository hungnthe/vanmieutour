# Tích hợp model_2.skp — 26/10/2026

## Kết quả chuyển đổi

`model_2.skp` được đọc tại máy bằng SketchUp C API 23.0.371, xuất GLB và vẽ bởi Three.js custom layer chia sẻ camera MapLibre. Không ghi lại file SketchUp nguồn. Bản xuất có 115.255 mặt, 226.194 tam giác và khoảng 12,7 MiB; giữ màu vật liệu cùng biến đổi nhóm/component. Bitmap texture, cạnh rời và lớp đã ẩn trong SKP không được xuất.

Hình học được chia thành các node có tên nguồn để tắt/bật độc lập. Lớp nền `TPX_TERRAIN_TERRAIN_MESH` gồm 4.704 tam giác; `TPX_ROADS_HATCH` gồm 18.680; `TPX_WATERWAYS_HATCH` gồm 232. Nền, hatch đường, hatch nước và mảng xanh đều tắt mặc định. Chi tiết về lớp và ảnh chụp ở [LAYER_AUDIT.md](LAYER_AUDIT.md).

## Vị trí và giới hạn

`SUModelIsGeoReferenced` trả false. Tọa độ SketchUp mặc định ở Boulder, Colorado không được dùng để đặt lên Hà Nội. Đăng ký hình học trong `scripts/register_skp.py` fit affine các đường bao nước với `data/gis/water.geojson`, rồi kiểm tra độc lập đường sắt. Không căn theo cảm quan và không sửa tọa độ chuẩn di tích.

Gốc suy ra là `105.83208321113491, 21.023925754975096` (kinh độ, vĩ độ), với ma trận:

```text
[[0.9998756875, -0.0052625460],
 [0.0052332212,  1.0057329709]]
```

Phân rã ma trận cho góc quay polar khoảng 0,29984° và hai tỷ lệ chính 0,999889 cùng 1,005747. Fit affine không đồng nhất; không thể rút gọn thành một scale duy nhất.

Sáu đường bao nước có P95 sai số dưới 1 mm; 74,8% mẫu nước nằm trong 5 m. Đường sắt có 70,7% mẫu trong 5 m; P95 nhóm khớp 0,011 m, nhưng P95 tất cả mẫu là 596,4 m. Độ khớp nhỏ cho thấy geometry có thể cùng nguồn hoặc cùng phép biến đổi, không chứng minh vị trí địa lý chính xác hay survey. Không có mốc tọa độ khảo sát độc lập, nên SketchUp được **tắt mặc định** và không được dùng làm lớp bản đồ đã xác minh. Chi tiết residual ở `data/model/registration.json`.

## Điều khiển lớp

- Nền OSM, từng nhóm roads/water/railways/boundaries GIS, nhà OSM 3D, SketchUp và marker có checkbox riêng.
- GIS overlays tắt mặc định để tránh vẽ lặp với nền OSM. Nhà OSM 3D và SketchUp loại trừ lẫn nhau.
- Nút 2D/2.5D chỉ đổi pitch/bearing. Không còn dùng góc camera để tự bật hoặc tắt nhà.
- MapLibre có thể báo load trước khi style sẵn sàng. Ứng dụng kiểm tra lại gắn GIS và visibility khi map vào idle; test browser xác nhận layer được thêm và visibility thực tế.
- Mặt địa hình trắng rộng gần 956 × 950 m đã tách thành node riêng và tắt mặc định. Không xóa hình học gốc.
- Khi tải mô hình lỗi, SketchUp được tắt và thông báo lỗi; OSM base cùng marker tiếp tục hoạt động. Thiếu WebGL sẽ dùng bản đồ 2D.

## Tạo lại và kiểm thử

```bash
python scripts/export_skp.py
python scripts/register_skp.py
npm run vendor
python scripts/bundle_onefile.py
npm test
npm run check
```

`npm test` kiểm tra hash nguồn/GLB, đơn vị mét, số tam giác, layers riêng, defaults an toàn và các phép đo GIS. `npm run check` kiểm tra cú pháp. Browser QA và 20 ảnh layer-by-layer, kiểm tra overlay OSM/GIS và mobile, được ghi tại `artifacts/layer-audit/`; xem [results.json](layer-audit/results.json) và [kiểm toán layer](LAYER_AUDIT.md).

Tham khảo API: [SketchUp C API](https://extensions.sketchup.com/developers/sketchup_c_api/sketchup/index.html), [SUMeshHelper](https://extensions.sketchup.com/developers/sketchup_c_api/sketchup/struct_s_u_mesh_helper_ref.html). Không tải file SKP nguồn lên dịch vụ chuyển đổi trực tuyến.
