# Bàn giao cho Codex — Bản đồ Di sản Hà Nội 2.5D

> **Kiến trúc hiện tại:** UI đã chuyển sang React tại `src/App.jsx`; `scripts/build.mjs` tạo bundle `app.bundle.js`. `map-engine.js` vẫn quản lý MapLibre/Leaflet và đồng bộ với UI qua `useLayoutEffect`. Chạy `npm ci && npm run start` để xem; Docker build bundle ở stage Node trước khi đóng gói nginx.

> **Cập nhật 26/10/2026:** Kiểm toán lớp đã phát hiện mặt địa hình trắng 955 × 950 m che nền, hatch đường/nước trùng GIS, và nhà OSM 3D mặc định bị bật dù chưa chọn. Đã tách công tắc từng nhóm, áp dụng trạng thái sau khi MapLibre style sẵn sàng, và khóa hai bộ công trình 3D loại trừ nhau. SketchUp vẫn tắt mặc định vì georeference chưa được chứng minh độc lập; căn vị trí suy ra từ GIS, không khảo sát. Đọc `artifacts/LAYER_AUDIT.md` cùng `artifacts/MODEL_INTEGRATION.md` trước khi thay ma trận hoặc bật mặc định. Tọa độ di tích và nguồn SKP không đổi.

> **Cập nhật 25/10/2026 sau sửa:** P0 đã được sửa và kiểm tra trong trình duyệt desktop/tablet/mobile. MapLibre 6.15.0 và worker được bundle cục bộ, có Leaflet 2D dự phòng, sửa CSS ghim và chiều cao map, hoàn thiện tuyến/chi tiết. Dữ liệu nghiên cứu và PDF gốc không đổi. Xem `artifacts/QA_REPORT.md`, `artifacts/browser-results.json` và ảnh kết quả. Các mô tả lỗi/bản chạy cũ dưới đây được giữ làm lịch sử; cách chạy hiện tại ở README. Công việc tiếp theo vẫn là danh mục 37, xác minh cổng và đường đi thực tế, không tự bổ sung tọa độ.

> **Đối chiếu Google Maps cùng ngày:** Đã tìm listing tương ứng cho 32/32 mục trong trình duyệt. 25 điểm hiện có cách pin Google từ 6,0–69,6 m; bảy điểm còn thiếu có ứng viên riêng tại `artifacts/google-crosscheck/candidate-pins.json`. Chưa nhập các ứng viên vào dữ liệu chuẩn, chưa xác minh cổng và chưa gọi Places API. Đọc `artifacts/google-crosscheck/REPORT.md` trước khi chỉnh địa chỉ/tọa độ; đã loại một kết quả Thổ Quan ở Hoài Đức và các Trung Kính ở Cầu Giấy.

## Yêu cầu của người dùng

Tạo bản đồ 2.5D rõ ràng, hiển thị các di tích thực tế, có bộ lọc **hai nhóm tuyến** (`Đi bộ` và `Xe máy`), tổng cộng **sáu tuyến trong PDF**, click từng tuyến để thấy thứ tự ghé và click di tích để mở detail. Mục tiêu dài hạn là 37 di tích sau khi có danh sách chính thức. Ưu tiên tính đúng địa lý và trải nghiệm hơn hiệu ứng đẹp.

## P0 — Lỗi hiện tại do người dùng báo

Ảnh `references/current-blank-map.png` cho thấy khu vực bản đồ nền màu nhạt và một khung trắng viền nét đứt. Đây là giao diện lỗi `.map-failure` được định nghĩa trong `styles.css`, chứ không phải một thiết kế bản đồ. Người dùng **không thấy đường, nhà, địa hình hoặc các ghim**.

Đọc `index.html`, `src/App.jsx`, `map-engine.js` và `styles.css`. Phần mô tả lỗi giao diện cũ bên dưới là lịch sử trước khi sửa; trạng thái kiểm chứng hiện tại ghi ở các cập nhật đầu tài liệu.

### Definition of done cho P0

- Bản đồ có **đường phố Hà Nội thật**, 25 pin có tọa độ, có thể zoom/pan; không che bằng khung lỗi khi mạng bình thường.
- 2D/2.5D chỉ đổi góc camera; nền OSM, các nhóm GIS, nhà OSM 3D, SketchUp và marker có công tắc độc lập. SketchUp mặc định tắt và không xuất hiện cùng nhà OSM 3D.
- Trường hợp WebGL không hỗ trợ hoặc dịch vụ tile chính lỗi: có fallback bản đồ 2D thực dùng được (có pin và tương tác detail), thông báo rõ trạng thái, tránh khoảng trống không giải thích.
- Tải JS/CSS bản đồ ổn định, ưu tiên đóng gói dependency cùng app thay vì phụ thuộc tài nguyên ngẫu nhiên qua CDN.
- Đã chụp màn hình và thử trên desktop khoảng 1440px, tablet, mobile 390px; xác nhận map load, nút tuyến, danh sách, detail, bộ lọc, search hoạt động bằng test trình duyệt.

## Cấu trúc dự án

| Tệp | Vai trò |
| --- | --- |
| `index.html` | Bố cục 3 cột, bộ lọc 2 nhóm, vùng MapLibre, detail |
| `styles.css` | Thiết kế responsive và `.map-failure` |
| `src/App.jsx` | UI React, sáu tuyến, tìm kiếm, detail, điều khiển lớp |
| `scripts/build.mjs` | Bundle React cho trình duyệt bằng esbuild |
| `map-engine.js` | MapLibre/Leaflet, marker, lớp GIS và SketchUp |
| `data.js` | `window.HERITAGE_DATA` cho browser |
| `data/sites.json` | 32 địa điểm, 25 tọa độ tâm từ văn bản nhà nước |
| `data/routes.json` | Sáu tuyến theo PDF, 3 đi bộ + 3 xe máy |
| `data/site-audit.csv` | Tên, địa chỉ, WGS84, nguồn, trạng thái Google, link Maps |
| `data/needs-field-verification.csv` | Bảy địa điểm cần xác minh thêm |
| `data/sites.geojson` | 25 điểm WGS84 chuẩn để vẽ bản đồ |
| `scripts/build_data.py` | Chuyển hệ tọa độ và sinh dữ liệu |
| `README.md` | Nguồn, ngoại lệ, chi tiết đối soát và bảng tuyến |
| `references/original-tour-map.pdf` | PDF do người dùng cung cấp, dùng để xác định tuyến |
| `references/current-blank-map.png` | Ảnh lỗi người dùng vừa báo |

Phiên bản này không có backend hoặc API key; `npm ci && npm run start` tạo bundle React rồi phục vụ bản đồ tại `http://localhost:8765` (cần Internet để tải tile). `npm test` kiểm tra dữ liệu, GIS, map engine và hành vi DOM React. `heritage-atlas-2_5d.html` là bản một file để xem thử, nhưng vẫn yêu cầu Internet.

## Dữ liệu thực và giới hạn kiểm chứng

- PDF có **33 nhãn**, sau gộp `Chùa Bà Nành` = `Tiên Phúc tự` còn **32 địa điểm**.
- Theo công bố địa phương, phường có **37 di tích, gồm 32 đã xếp hạng và 5 chưa xếp hạng**; không suy ra rằng 32 điểm của PDF là bộ 32 xếp hạng.
- **25/32** địa điểm có tọa độ **tâm** từ Thông tư 10/2022/TT-BTNMT (DMS VN-2000 EPSG:4756 được chuyển sang WGS84 EPSG:4326). Chưa khảo sát cổng vào; sai số điểm tâm có thể ảnh hưởng trải nghiệm điều hướng.
- **7/32** địa điểm chưa có tọa độ đáng tin, không cắm pin giả. Đặc biệt Đình Trung Kính dễ trùng tên với địa điểm ở Cầu Giấy.
- **0/32** địa điểm có Google Place ID được xác minh trực tiếp qua Google Places API. Google Maps URLs là URL tìm kiếm, không xác minh được danh tính.
- **6/6** tuyến được nhập thứ tự điểm theo PDF, nhưng chỉ **5/6** tuyến đủ tọa độ cho mọi điểm dừng; không tuyến nào có polyline theo đường phố được kiểm chứng.
- Nguồn địa danh: https://vanban.chinhphu.vn/?classid=1&docid=206693&pageid=27160&typegroupid=6

## Kế hoạch nâng cấp sau P0

1. UI và map rendering đã tách: React quản lý tương tác, `map-engine.js` quản lý renderer. Giữ mọi dữ liệu và cờ provenance nếu tiếp tục tái cấu trúc.
2. Tạo trạng thái 3 mức cho các điểm: đã kiểm chứng Google + địa phương; có tâm từ công báo nhưng chưa xác minh cổng; chưa đủ dữ liệu để định vị.
3. Hoàn thiện route UX: đổi nhóm đi bộ/xe máy, hiển thị thứ tự, pin có số, phân biệt đoạn sơ đồ với chỉ đường phố thực tế, cảnh báo điểm thiếu tọa độ.
4. Khi được cấp danh sách 37 chuẩn và quyền API, tích hợp Places để đối soát; dùng Routes API hoặc engine phù hợp để dựng tuyến **trên đường phố**, có kiểm tra phương tiện và đường một chiều. Không đưa key bí mật vào client; tuân thủ điều khoản sử dụng và lưu dữ liệu Google.
5. Cải thiện mobile: danh sách tuyến, sheet detail, tooltip địa điểm, trạng thái tải và fallback cho người có kết nối yếu.

## Chất lượng và bàn giao mong muốn

- Giữ nguyên dữ liệu nghiên cứu khi có thể; thay đổi có chứng cứ và nêu rõ nguồn.
- Viết test cho filter, click tuyến, click di tích, map load, fallback, số điểm, trạng thái tọa độ.
- Bàn giao ảnh chụp desktop/mobile, báo cáo ngắn gồm: cái gì đã sửa, các kiểm thử đã chạy, phần còn giả lập, phần cần Google API hoặc khảo sát thực địa.
- Không tự công khai Site của người dùng hoặc thay đổi quyền truy cập trước khi hỏi.

## Prompt ngắn để dán vào Codex

> Hãy đọc AGENTS.md, CODEX_HANDOFF.md và README.md trong dự án trước. Tái hiện và sửa lỗi bản đồ nền trống trong references/current-blank-map.png. Ưu tiên một bản đồ Hà Nội hiện đường phố và 25 pin thực sự, có góc nhìn 2.5D, có fallback 2D khi WebGL/tile lỗi. Giữ nguyên 6 tuyến chia hai nhóm đi bộ/xe máy, click tuyến + click di tích để hiện detail. Không bịa tọa độ cho 7 điểm thiếu và không tuyên bố Google đã xác minh. Được phép refactor sang kiến trúc có kiểm thử, nhưng phải kiểm tra bằng trình duyệt desktop/mobile và cho tôi ảnh chứng minh đã sửa xong trước khi bàn giao.
