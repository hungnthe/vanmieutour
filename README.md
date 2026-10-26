# Dấu chân Di sản — bản đồ 2.5D kiểm toán dữ liệu

### Đóng gói Docker

Có thể triển khai bản đồ tĩnh bằng Docker image đã đóng gói, công khai không cần đăng nhập. Xem [hướng dẫn deploy Linux](DOCKER_DEPLOY.md); image `linux/amd64` và gói chuyển máy được tạo tại `artifacts/docker/`.

Trang web tương tác phục vụ rà soát bộ địa điểm du lịch văn hóa quanh Văn Miếu – Khâm Thiên. Dựa trên sơ đồ PDF do người dùng cung cấp, không tự tạo tọa độ hoặc đường phố.

**Dành cho người tiếp tục phát triển bằng Codex:** đọc `AGENTS.md` và `CODEX_HANDOFF.md` trước. Hai tệp này mô tả ảnh lỗi bản đồ hiện tại, ưu tiên sửa chữa, dữ liệu đã kiểm chứng và tiêu chí nghiệm thu.

## Xem bản đồ

Chạy từ thư mục có `index.html` (cần Internet để tải tile và nhãn bản đồ):

```bash
python -m http.server 8765 --bind localhost
```

Sau đó truy cập `http://localhost:8765/`. Trang hoạt động không cần tài khoản hay khóa API. Các thư viện và worker đã nằm trong `vendor/`, không cần npm để chạy trang. Nhấn vào các tuyến W01–W03 (đi bộ) hoặc R01–R03 (xe máy) để làm nổi bật và đánh số điểm ghé; mở mục **Xem điểm ghé** để chọn từng điểm theo PDF. Nhấn pin hoặc danh sách để mở chi tiết; có chuyển 2D / 2.5D. Trên mobile, nút **Tuyến & địa điểm** mở bộ lọc/tìm kiếm, chi tiết mở thành bảng phía dưới có nút đóng.

### Sửa bản đồ trống — 25/10/2026

- Bản cũ gọi `unpkg.com/maplibre-gl@6.15.0/dist/maplibre-gl.js` trả HTTP 404. Gói 6.15.0 chỉ cung cấp ES module `.mjs`; cách gọi `maplibregl.supported()` cũng không còn phù hợp API v6. Đã bundle MapLibre 6.15.0 cùng module worker thành các file `.js` cục bộ, kiểm tra WebGL 2 trước khởi tạo. Worker `.js` tránh MIME `text/plain` cho `.mjs` của Python/Windows.
- Sửa hàng CSS grid cao vượt viewport và `.map-marker {position:relative}` ghi đè vị trí absolute của MapLibre, khiến ghim lệch khỏi phép chiếu địa lý. Các ghim hiện có kích thước cố định và bám đúng tọa độ đầu vào.
- `map-style.json` là style Liberty của OpenFreeMap tùy chỉnh màu và nhãn tiếng Việt ưu tiên; giữ hình học đường/footprint OSM, chỉ một lớp extrusion. Giảm POI nền gây rối. Nút 2D/2.5D đổi góc camera; công tắc lớp điều khiển nhà OSM 3D độc lập.
- `map-engine.js` tách renderer khỏi giao diện. Khi không có WebGL, thiếu MapLibre, lỗi style/tile hoặc tải quá lâu: dùng Leaflet 2D với raster OSM DE, rồi OSM Standard nếu nguồn đầu lỗi. Giữ pin, thứ tự tuyến, zoom/pan, click chi tiết và nút **Tải lại**. Lỗi một sprite/glyph không dựng khung trắng che bản đồ.
- Nếu mọi nguồn tile đều lỗi: hiện thông báo rõ, giữ pin thật và danh sách; không tuyên bố có nền đường phố khi nguồn không tải được. Không có gói tile offline. Dịch vụ cộng đồng không có cam kết uptime; khi triển khai quy mô lớn cần chọn nhà cung cấp/hosting phù hợp.
- Bản một file `heritage-atlas-2_5d.html` được tái tạo, chứa style, thư viện, worker, dữ liệu và UI; đã kiểm tra qua HTTP, vẫn cần mạng cho tile. Không còn bản snapshot dùng URL CDN hỏng.

### Mô hình SketchUp — 26/10/2026

- Chế độ **2.5D** tải `data/model/model_2.glb`, chuyển trực tiếp từ `D:\TourVanMieu\model_2.skp` bằng SketchUp C API 23.0.371 đã cài cùng Unity. File nguồn được đọc tại máy, không gửi lên dịch vụ chuyển đổi. GLB có **226.194 tam giác / 115.255 mặt nguồn**, khoảng **12,7 MiB**, giữ hình học hiển thị, biến đổi nhóm/component lồng nhau và màu vật liệu. Bitmap texture, cạnh rời và các đối tượng/lớp đã ẩn trong file không được xuất.
- File SKP **không georeference**. Vị trí suy ra bằng fit affine các đường bao nước GIS và kiểm tra độc lập đường sắt; phép tính không dùng căn chỉnh bằng mắt. Ma trận và độ khớp rất cao cho thấy cùng hình học nguồn, nhưng **không chứng minh tọa độ khảo sát**. Vì vậy lớp SketchUp mặc định tắt. Chi tiết và giới hạn nằm trong `data/model/registration.json` và `artifacts/LAYER_AUDIT.md`.
- Chú giải **Kiểm soát lớp** có công tắc riêng cho nền OSM, đường/nước/đường sắt/ranh GIS, khối nhà OSM 3D, toàn bộ SketchUp, marker và từng nhóm hình học SketchUp. Các lớp GIS trùng đối tượng bản đồ nền tắt mặc định; nhà OSM 3D và SketchUp loại trừ lẫn nhau. Lớp `TPX_TERRAIN_TERRAIN_MESH` có 4.704 mặt tam giác, phủ gần 956 × 950 m như một mặt trắng và được tắt mặc định cùng hatch đường/nước.
- Nút **2D / 2.5D** chỉ đổi góc camera. Các lớp nhà bật/tắt bằng công tắc riêng; bật SketchUp tự tắt nhà OSM 3D và ngược lại.
- Nếu tải mô hình lỗi, lớp SketchUp tự tắt, các lớp nền và marker còn hoạt động, kèm thông báo và **Tải lại**. Khi thiếu WebGL, ứng dụng dùng nền 2D như trước.
- Bản `heritage-atlas-2_5d.html` nhúng cả GLB, cấu hình và Three.js nên tăng lên khoảng **20 MiB**. Bản nhiều tệp tải GLB riêng; tile đường phố vẫn cần mạng.

Tái tạo mô hình (Windows, Python + NumPy và SketchUp C API đã cài; có thể đặt `SKETCHUP_API_DLL` trỏ đến DLL tương thích):

```bash
python scripts/export_skp.py
python scripts/register_skp.py
npm run vendor
python scripts/bundle_onefile.py
npm test
npm run check
```

Xem [báo cáo tích hợp](artifacts/MODEL_INTEGRATION.md), [kiểm toán lớp và ảnh theo lớp](artifacts/LAYER_AUDIT.md), [ảnh chi tiết SketchUp](artifacts/model-closeup.png). Kiểm tra trình duyệt: chạy `npm run qa`, rồi `node scripts/layer_browser_test.cjs` với Playwright và Chrome cài sẵn (có thể đặt `NODE_PATH` đến gói Playwright).

### Kiểm thử và ảnh kết quả

```bash
npm ci
npm test
npm run check
npm audit --omit=dev
```

`npm test` kiểm tra hash dữ liệu/PDF gốc, thứ tự tuyến, không nối qua điểm thiếu tọa độ, logic UI, fallback, đổi nguồn raster, sự kiện/timer cũ và giữ pin khi mất mọi nguồn nền.

`npm run qa` chạy server kiểm thử riêng trên `http://localhost:8766/`. Các URL `/?qa=no-webgl`, `/?qa=no-library`, `/?qa=style-error`, `/?qa=tile-error`, `/?qa=raster-error` chủ động tạo lỗi; không sửa file sản phẩm. Server chỉ lắng nghe loopback. Đã kiểm tra trình duyệt thực ở 1440×900, 834×1112 và 390×844. Xem **[báo cáo QA](artifacts/QA_REPORT.md)** và ảnh trong `artifacts/`.

Khi cập nhật dependency: `npm run vendor`, sau đó `python scripts/bundle_onefile.py` và chạy lại kiểm thử. Không cần chạy `scripts/build_data.py` để sửa giao diện; giữ nguyên bộ dữ liệu chuẩn đã bàn giao.

### Đối chiếu Google Maps — 25/10/2026

Đã đối chiếu thủ công listing công khai cho **32/32** địa điểm bằng trình duyệt, phân biệt các kết quả trùng tên. Với **25** điểm đã có tọa độ, khoảng cách đến pin listing tương ứng từ **6,0–69,6 m**, trung vị **17,4 m**. Khoảng cách này không xác minh cổng vào và không phải sai số đo đạc. **7** điểm chưa định vị đều có ứng viên Google, được lưu riêng để rà soát, chưa đưa vào `data/sites.json` hoặc bản đồ sản phẩm.

Xem [báo cáo Google Maps](artifacts/google-crosscheck/REPORT.md), [bảng đối chiếu JSON](artifacts/google-crosscheck/comparison.json) và [bảy pin ứng viên](artifacts/google-crosscheck/candidate-pins.json). Một số địa chỉ khác nhau theo cổng/ngõ tiếp cận; đặc biệt cần kiểm tra Huy Văn, Phổ Giác, Linh Quang, Liên Hoa và Trung Tả. Dữ liệu nguồn vẫn giữ nguyên. Đây **không phải** đối soát qua Places API; số điểm được xác minh qua API vẫn là 0 và chưa có tuyến mặt đường được kiểm chứng.

## Kết quả đối soát ở phiên bản này

| Hạng mục | Kết quả | Ý nghĩa |
|---|---:|---|
| Chỉ tiêu dự án | 37 | Số lượng mong muốn, chưa có danh mục tên đầy đủ |
| Nhãn địa danh đọc từ PDF | 33 | Một nhãn có thể là tên thứ hai của một di tích |
| Địa điểm riêng sau khi chuẩn hóa | **32** | Chùa Bà Nành = Tiên Phúc tự |
| Địa điểm có tọa độ tâm từ Thông tư 10/2022 | **25** | Đã chuyển VN-2000 sang WGS84, *chưa xác minh cổng vào* |
| Địa điểm còn thiếu tọa độ đáng tin | **7** | Chỉ hiện trong danh sách, không cắm pin giả |
| Tuyến được nhập theo PDF | **6** | 3 đi bộ và 3 xe máy, giữ thứ tự điểm |
| Tuyến đủ tất cả tọa độ tâm | **5/6** | Tuyến R03 còn thiếu Đình Khâm Đức |
| Tuyến thực tế trên mặt đường được kiểm chứng | **0/6** | Nét nối trên màn hình chỉ là sơ đồ, không dùng dẫn đường |
| Điểm được Google Places API xác minh | **0** | Chưa có API key/billing để lấy Place ID hoặc dữ liệu có phép |

### Cảnh báo về con số 37

Theo thông tin lãnh đạo địa phương công bố năm 2026, phường Văn Miếu – Quốc Tử Giám có **37 di tích, gồm 32 di tích đã xếp hạng và 5 di tích chưa xếp hạng**. Tuy nhiên bản đồ PDF cung cấp thể hiện 33 nhãn (gồm một cặp tên trùng), **không có bằng chứng rằng tập hợp đó tương ứng với danh mục 37 của phường**. Chẳng hạn PDF bao gồm Chùa Tiên Tích, một di tích ở khu Cửa Nam. Bộ 32 vị trí hiện còn chênh 5 vị trí so với mục tiêu 37, nhưng không tự thêm 5 điểm suy đoán để lấp số lượng.

Nguồn: [Cổng thông tin phường Văn Miếu – Quốc Tử Giám](https://vanmieuquoctugiam.hanoi.gov.vn/van-hoa-xa-hoi/so-van-hoa-va-the-thao-ha-noi-lam-viec-voi-phuong-van-mieu-quoc-tu-giam-ve-phat-trien-cong-nghiep-van-hoa-2813260601111335909.htm) và [bài báo về 5 đình chưa xếp hạng](https://tienphong.vn/phuong-van-mieu-quoc-tu-giam-bao-ton-ton-tao-va-phat-huy-gia-tri-cac-di-san-van-hoa-post1852835.tpo).

## Kiểm tra tọa độ

Nguồn ưu tiên là [Thông tư 10/2022/TT-BTNMT](https://vanban.chinhphu.vn/?classid=1&docid=206693&pageid=27160&typegroupid=6), phụ lục địa danh địa hình Hà Nội, trang PDF 31–40 (quận Đống Đa cũ). Văn bản dùng **hệ tọa độ địa lý VN-2000 (EPSG:4756)** và thông báo rõ **tọa độ vị trí tương đối / tâm** của địa danh, không phải vị trí vào cổng. Web và Google Maps dùng WGS84 (EPSG:4326).

Chuyển đổi chính xác bằng `pyproj.Transformer.from_crs('EPSG:4756','EPSG:4326',always_xy=True)`; không phép cộng/trừ thủ công vĩ độ/kinh độ. Một tọa độ DMS được làm tròn đến 1 giây, nên vẫn phải kiểm tra cổng và lối đi.

| Ví dụ | VN-2000 DMS từ công báo | Sau chuyển WGS84 | OSM (Mapcarta) | Chênh điểm tâm |
|---|---|---|---|---:|
| Chùa Phổ Giác | 21°01′39″, 105°50′10″ | 21.0265142, 105.8379938 | 21.02647, 105.83799 | ~4,9 m |
| Đền/Đình Kim Liên | 21°00′42″, 105°50′11″ | 21.0106808, 105.8382714 | 21.01068, 105.83817 | ~10,5 m |

Điều quan trọng: nếu đưa *trực tiếp* số VN-2000 vào Google Maps như WGS84 sẽ xuất hiện sai lệch vài trăm mét. Hai so khớp OSM chỉ là **kiểm tra mẫu**, chưa chứng nhận toàn bộ 25 địa điểm, càng chưa xác nhận cổng vào.

Tham khảo so khớp: [Chùa Phổ Giác](https://mapcarta.com/W702456248), [Đền Kim Liên](https://mapcarta.com/W947089943). Việc chuyển đổi sử dụng hệ [EPSG:4756](https://epsg.io/4756).

### 7 địa điểm chưa cắm pin

1. Đình Khâm Đức — có địa chỉ tham khảo tại 74 ngõ Chợ Khâm Thiên, nhưng chưa có tọa độ xác minh.
2. Đình Thanh Miến — nguồn báo cáo địa chỉ không thống nhất (13 phố Văn Miếu / 20 ngõ Thanh Miến).
3. Đền Đức Thánh Trần — nguy cơ khớp nhầm các di tích cùng tên.
4. Chùa Tiên Tích — xác nhận địa chỉ 110 Lê Duẩn qua nguồn Hà Nội nhưng chưa có tọa độ riêng.
5. Đền Khâm Đức (thờ Châu Đệ Tứ) — có thể là cơ sở riêng với Đình Khâm Đức; cần kiểm tra.
6. Đình Trung Kính — theo tài liệu nằm gần chùa Mỹ Quang, **không** phải đình cùng tên tại Cầu Giấy.
7. Đình Thái Kiều — chưa có tọa độ, không nhầm ngôi đình đồng danh ở tỉnh khác.

Điểm như Đình Khâm Đức và Đình Trung Kính được ghi nhận trong [danh sách 5 đình chưa xếp hạng năm 2026](https://tienphong.vn/phuong-van-mieu-quoc-tu-giam-bao-ton-ton-tao-va-phat-huy-gia-tri-cac-di-san-van-hoa-post1852835.tpo), nhưng vẫn cần xác minh vị trí thực tế.

## Sáu tuyến từ chú giải PDF

| Mã | Phương tiện | Thứ tự điểm | Tình trạng tọa độ điểm |
|---|---|---|---|
| W01 | Đi bộ | Văn Miếu → Hồ Văn → Chùa Bà Nành | Đủ 3/3 |
| W02 | Đi bộ | Văn Miếu → Chùa Ngọc Hồ → Y Miếu | Đủ 3/3 |
| W03 | Đi bộ | Văn Miếu → Chùa Huy Văn → Đền Văn Chỉ | Đủ 3/3 |
| R01 | Xe máy | Văn Miếu → Chùa Phổ Giác → Y Miếu → Đài tưởng niệm Khâm Thiên | Đủ 4/4* |
| R02 | Xe máy | Văn Miếu → Chùa Phổ Giác → Chùa Huy Văn → Đình Trung Tự → Đền Kim Liên | Đủ 5/5 |
| R03 | Xe máy | Văn Miếu → Đình Văn Hương → Đền Văn Chỉ → Chùa Phụng Thánh → Đình Khâm Đức | **4/5** |

`*` Tọa độ của **Khu di tích Khâm Thiên** được dùng làm vị trí đại diện cho Đài tưởng niệm; chưa kiểm chứng cổng đi vào. Đình Trung Tự và Đền Kim Liên sử dụng các tên tương đương trong công báo là Đình Trung Tự và Đình Kim Liên.

Các đoạn đường dạng nét đứt trong bản đồ là đường nối **thẳng giữa các điểm dừng** để quan sát thứ tự; **không phải tuyến phố, khoảng cách di chuyển hay chỉ đường an toàn**. Liên kết Google Maps trong bảng là *liên kết tìm kiếm*, không được coi là xác minh Place ID.

## Tệp dữ liệu

- `data/sites.json`: chi tiết 32 địa điểm, trạng thái từng điểm, tọa độ và đường dẫn nguồn.
- `data/site-audit.csv`: bảng đối soát Excel có tên, địa chỉ, WGS84, nguồn và link Google Maps.
- `data/routes.json`: 6 tuyến theo thứ tự, màu, phương tiện và nhãn kiểm định.
- `data/route-audit.csv`: bảng các tuyến có thể lọc và mở trên Google Maps để tự kiểm tra.
- `data/sites.geojson`: 25 điểm tâm chuyển sang WGS84 để nhập GIS, chỉ dùng kiểm tra nội bộ.
- `data/needs-field-verification.csv`: danh sách 7 địa điểm cần tra cứu / đi thực địa.
- `scripts/build_data.py`: tái tạo dữ liệu từ PDF Thông tư địa danh và chuyển hệ bằng `pyproj`.
- `index.html`, `styles.css`, `app.js`, `map-engine.js`, `map-style.json`, `data.js`, `vendor/`: website tĩnh chạy qua HTTP, không cần npm build để xem.

## Điều kiện trước khi xuất bản cho người dùng thật

1. Xin chính quyền/ban quản lý bản **danh sách chuẩn 37 di tích** có mã di tích và đánh dấu 5 di tích chưa xếp hạng, rồi chốt danh sách chính xác theo phạm vi dự án.
2. Tạo dự án Google Maps Platform có **Places API** để đối chiếu tên, Place ID, địa chỉ hiện hành; không chỉ dùng Google Maps search URL.
3. Xác minh tại thực địa **cổng vào**, giờ mở cửa, vị trí gửi xe, rào chắn và đường một chiều; riêng lối xe máy phải được kiểm tra kỹ.
4. Tính đường đi thực tế bằng **Routes API** (đi bộ WALK, xe máy TWO_WHEELER nếu phù hợp khu vực) hoặc một engine khác có dữ liệu đi bộ/xe máy, và kiểm tra các đoạn beta chưa đầy đủ.
5. Chỉ sau khi có đường đi kiểm chứng mới cho phép dẫn đường và tính khoảng cách/thời gian. Thiết lập lại quy định lưu dữ liệu và ghi nguồn theo điều khoản Google Maps Platform khi tích hợp Google.

Nền bản đồ sử dụng MapLibre GL JS và OpenFreeMap/OpenStreetMap. Lớp 2.5D chính là mô hình chuyển từ `model_2.skp`; nhà OSM với chiều cao mặc định 7 m chỉ là dự phòng khi mô hình không tải được. Vị trí mô hình suy ra từ GIS và chưa kiểm chứng khảo sát thực địa.
