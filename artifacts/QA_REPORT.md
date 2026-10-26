# Bàn giao sửa bản đồ — 25/10/2026

Đã đọc toàn bộ AGENTS.md, CODEX_HANDOFF.md, README.md và xem ảnh lỗi trong references trước khi sửa. Bản đồ hiện tải được đường phố Hà Nội, 25 pin theo tọa độ gốc và nhà 2.5D từ footprint OSM. Không thay đổi bộ địa danh hoặc thứ tự tuyến.

## Nguyên nhân được xác nhận

1. URL `https://unpkg.com/maplibre-gl@6.15.0/dist/maplibre-gl.js` trả HTTP 404. Gói npm 6.15.0 cung cấp `.mjs`, không cung cấp file `.js` mà HTML cũ yêu cầu. `references/maplibre-6-package.json` lưu danh sách file của gói để đối chiếu. API v6 cũng không cung cấp phép kiểm tra `supported()` mà app cũ gọi.
2. Khi đóng gói ES module, Python/Windows phục vụ worker `.mjs` với MIME `text/plain`, khiến module worker bị trình duyệt từ chối. Đã bundle cả thư viện và worker thành `.js`, vẫn chạy worker theo chế độ module, không phụ thuộc CDN.
3. CSS `.map-marker {position:relative}` ghi đè định vị absolute của MapLibre. Ghim bị tính theo luồng bố cục thay vì bám đúng phép chiếu tọa độ. Đã sửa position và cố định kích thước 36×44 px; kiểm tra kéo bản đồ làm ghim dịch chuyển cùng bản đồ.
4. Hàng grid có chiều cao tối thiểu theo nội dung, làm vùng bản đồ cao hơn viewport. Đã dùng hàng `minmax(0,1fr)` và `min-height:0` cho các panel.

## Thay đổi chính

- MapLibre 6.15.0, Leaflet 1.9.4, worker, CSS và license nằm trong `vendor/`; `package-lock.json` cố định dependency. `scripts/vendor.cjs` tái tạo thư viện cục bộ.
- `map-engine.js` quản lý renderer, trạng thái tải, marker, sơ đồ tuyến, camera, retry và vòng đời timeout/event. `app.js` quản lý bộ lọc, tìm kiếm và nội dung chi tiết.
- Style Liberty lưu tại `map-style.json`: đường phố rõ hơn, ưu tiên tên tiếng Việt, bỏ các POI nền gây rối và dùng đúng một lớp nhà extrusion, không tải trùng nguồn vector. Nút 2D ẩn nhà; 2.5D bật nhà và nghiêng 52°.
- Khi thiếu WebGL/MapLibre hoặc lỗi style/vector tile: Leaflet dựng bản đồ raster 2D độc lập từ OSM DE, rồi OSM Standard nếu nguồn đầu lỗi. Các pin, tuyến và chi tiết vẫn hoạt động. Nút Tải lại khôi phục 2.5D khi nguồn chính sẵn sàng.
- Sáu tuyến chia ba đi bộ và ba xe máy; pin đánh số theo thứ tự PDF, danh sách điểm ghé bấm được. R03 có bốn pin và một điểm chưa định vị. Điểm thiếu tọa độ ngắt sơ đồ, không nối tắt qua điểm đó.
- Đổi nhóm xóa tuyến thuộc nhóm kia; tìm kiếm tên/alias không phân biệt dấu. Điểm được chọn vẫn nổi bật kể cả khi nằm ngoài tuyến hiện tại.
- Mobile có menu Tuyến & địa điểm và bảng chi tiết phía dưới. Tablet không bị panel chi tiết che bản đồ ngay khi mở. Trên desktop, camera chừa chỗ cho bảng thứ tự tuyến để các pin vẫn nhìn thấy.
- Đã tái tạo `heritage-atlas-2_5d.html`, gồm thư viện, worker Blob, style, dữ liệu và UI. Bản HTML một file đã tải được vector map qua HTTP.

## Dữ liệu được giữ nguyên

Kiểm tra SHA-256 xác nhận không đổi nội dung:

| Tệp | SHA-256 |
| --- | --- |
| data/sites.json | DAC003DFDB10561E479CE1FB4341F7E7DBF7C1F8DF34BA06B1A76572EAF716E1 |
| data/routes.json | 9DFD225D4F9E43035058D7AF5DCCB3D3842F504EC0BABBAD4331F5E2D1F9CE49 |
| data.js | 9370C39DACC8F63E040F8A3A0713B4C74CCDAAC633B2ACC211E23659731FCE94 |
| references/original-tour-map.pdf | 28AA8290CEA870F2348D060F6DB06A867F5E8C62B8457AE152F0A5958E84DBBC |

Vẫn có 32 địa điểm, 25 tọa độ tâm và 7 điểm chưa định vị. Không thêm pin hoặc di tích để đạt 37. Không sửa hay tái sinh CSV/GeoJSON nghiên cứu. Google Place ID vẫn chưa được xác minh.

## Kết quả kiểm thử

Các lệnh sau đều đạt:

```text
npm test
  Data: hash nguồn, 25/7 điểm, 3+3 tuyến, không nối qua điểm thiếu tọa độ
  Map: fallback, đổi nguồn, giữ pin, sự kiện/timer cũ, lỗi mọi nguồn nền
  DOM: nhóm tuyến, click chi tiết, tìm không dấu, thứ tự điểm ghé, R03
npm run check
npm audit --omit=dev: 0 vulnerabilities
```

Đã thao tác trên trình duyệt Chromium trong Codex, với viewport desktop 1440×900, tablet 834×1112 và mobile 390×844. Đây là kiểm thử responsive trong trình duyệt, chưa phải kiểm thử trên điện thoại vật lý.

**35 kiểm tra trình duyệt đạt**, ghi tại [browser-results.json](browser-results.json). Bao gồm cả sáu tuyến, số thứ tự pin, mở chi tiết từ pin/list/điểm ghé, tìm không dấu, thay nhóm tuyến, 2D/2.5D, zoom, kéo bản đồ, thiếu WebGL, thiếu MapLibre, HTTP 503 cho style/tile, lỗi mọi nguồn raster, retry không tạo pin trùng và bản HTML một file. Phiên bình thường cuối không có console error hoặc warning.

Server QA `python scripts/qa_server.py` chỉ phục vụ trên loopback cổng 8766. Các URL `/?qa=no-webgl`, `/?qa=no-library`, `/?qa=style-error`, `/?qa=tile-error`, `/?qa=raster-error` tạo lỗi có chủ đích mà không thay file sản phẩm. Trong các ca này, lỗi mạng giả lập xuất hiện là kết quả dự kiến.

Đã xem ảnh thực, không chỉ dựa vào sự kiện tileload: một nguồn CARTO thử nghiệm trả ảnh thông báo API key thay vì nền phố dù HTTP 200; nguồn này đã bị loại khỏi sản phẩm. Nền dự phòng OSM DE đã được xác nhận trực quan có đường phố thật.

Mở trực tiếp `file://` không được công cụ trình duyệt cho phép vì chỉ hỗ trợ HTTP(S); không thử vượt hạn chế này. Bản một file được kiểm tra qua HTTP. Cách chạy khuyến nghị là HTTP localhost.

## Ảnh chứng minh

- [Desktop: đường phố, nhà 2.5D, ba điểm W02 và chi tiết](desktop-final.jpg)
- [Desktop: toàn cảnh 25 pin](desktop-overview.jpg)
- [Desktop: R03 và điểm cuối chưa có tọa độ](desktop-route-r03.jpg)
- [Tablet: toàn cảnh](tablet-overview.jpg)
- [Mobile: toàn cảnh](mobile-overview.jpg)
- [Mobile: chọn di tích và mở chi tiết](mobile-final.jpg)
- [Mobile: chi tiết Đình Khâm Đức chưa định vị](mobile-route-detail.jpg)
- [Mobile: nền 2D khi không có WebGL](mobile-fallback-no-webgl.jpg)
- [Desktop: nền 2D khi style chính trả 503](desktop-fallback-style-error.jpg)

Các ảnh là ảnh chụp trình duyệt, không ghép nền hay vẽ mô phỏng để thay cho kết quả chạy thật.

## Giới hạn còn lại

- Khối nhà dựa trên footprint và chiều cao OSM; nơi thiếu chiều cao dùng 7 m minh họa. Đây không phải mô hình kiến trúc được đo đạc.
- Nét đứt chỉ biểu diễn thứ tự ghé. **Chưa có tuyến đường phố nào được kiểm chứng**, không có ETA/khoảng cách dẫn đường. Chưa kiểm tra cổng vào, đường một chiều hoặc quyền đi xe máy.
- Cần danh mục chính thức 37 di tích, đối soát Places có phép và khảo sát thực địa để bổ sung các dữ liệu còn thiếu.
- Tile/glyph vẫn cần Internet. Khi mọi nguồn mạng đều lỗi, trang báo rõ và giữ pin/list; không có gói nền phố offline. Dịch vụ cộng đồng không bảo đảm uptime.
- Không triển khai công khai hoặc thay đổi quyền truy cập.

## Chạy và tái tạo

Từ thư mục `heritage-map`:

```text
python -m http.server 8765 --bind localhost
# Mở http://localhost:8765/

npm ci
npm run vendor
python scripts/bundle_onefile.py
npm test
npm run check
```

Tài liệu kỹ thuật đã đối chiếu: [OpenFreeMap quick start](https://openfreemap.org/quick_start/), [MapLibre building extrusion](https://maplibre.org/maplibre-gl-js/docs/examples/display-buildings-in-3d/), [OSM DE tiles](https://tile.openstreetmap.de/). Không dùng các tài liệu này để thay đổi dữ liệu di tích đã bàn giao.
