# Chỉ dẫn cho Codex — Dấu chân Di sản

Đây là dự án bản đồ di sản Hà Nội 2.5D đang ở mức prototype. Trước khi sửa mã, hãy đọc **`CODEX_HANDOFF.md`** và `README.md`.

## Ưu tiên

1. **Giữ bản đồ nền hoạt động ổn định.** Lỗi khung trắng trong `references/current-blank-map.png` đã được sửa và có kiểm thử fallback; nếu tái xuất hiện, kiểm tra console/network/WebGL trước khi thay đổi.
2. Nếu nguồn tile hoặc WebGL thất bại, vẫn phải hiển thị được nền bản đồ 2D đáng tin và các điểm di tích có tọa độ; không để màn hình trắng im lặng.
3. Giữ nguyên mô hình sáu tuyến, chia hai nhóm đi bộ và xe máy; click tuyến làm nổi bật điểm dừng, click từng điểm hiện detail.

## Ranh giới dữ liệu

- `data/sites.json` và `data/routes.json` là nguồn dữ liệu chuẩn **tạm thời**; `data.js` là bản xuất dùng trong browser.
- Tài liệu gốc có 33 nhãn, sau gộp tên trùng còn 32 vị trí riêng. Đừng tự tạo 5 di tích mới để đạt mục tiêu 37.
- 25 điểm có tọa độ **tâm địa danh** lấy từ công báo 2022, chuyển VN-2000 sang WGS84; 7 điểm chưa có tọa độ đủ tin cậy. Không tự đặt pin đại diện hoặc cổng vào khi chưa có chứng cứ.
- Liên kết Google Maps hiện tại là **search link**, chưa xác minh Google Place ID. Không ghi "Google đã xác minh".
- Các nét đứt nối điểm là **sơ đồ thứ tự ghé**, không phải đường đường phố. Không hiển thị khoảng cách, ETA hoặc chỉ đường như dữ liệu đã xác thực.

## Làm việc an toàn

- Giữ nguồn và mức xác minh cho mỗi tọa độ, tách rõ demo 2.5D với điều hướng thực tế.
- Không nhúng API key bí mật trong JavaScript phía client. Không tự chuyển chế độ riêng tư/công khai khi triển khai.
- Chạy kiểm tra logic, kiểm tra thực trên desktop/mobile và chụp ảnh sau sửa; đặc biệt kiểm thử trường hợp WebGL/CDN/tile thất bại.
- Không thay thế `references/original-tour-map.pdf` hoặc sửa dữ liệu địa danh để khớp hình ảnh mà chưa kiểm chứng.

## Chạy hiện tại

```bash
npm ci
npm run start
```

Mở `http://localhost:8765` từ thư mục dự án. UI nằm trong `src/App.jsx`; esbuild tạo `app.bundle.js` trước khi chạy. `map-engine.js` vẫn quản lý MapLibre/Leaflet và vòng đời lớp bản đồ. Chạy `npm test` và `npm run check` để kiểm tra; Docker build cũng tạo bundle React ở stage Node.
