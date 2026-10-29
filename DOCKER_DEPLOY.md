# Deploy sau mỗi lần sửa website

Quy trình này áp dụng cho bản đang chạy tại `https://tourvanmieu.duckdns.org/`. Chạy **tất cả lệnh bên dưới trong PowerShell trên máy Windows**; lệnh `ssh` sẽ tự thực thi phần Linux trên VPS `root@14.225.168.98`. Cấu hình hiện tại trên VPS nằm ở `/opt/heritage-map`: Docker Compose chạy dịch vụ `map` tại `127.0.0.1:8765`, còn reverse proxy phục vụ tên miền HTTPS.

## Cần mở những gì?

1. **Docker Desktop** trên máy Windows, chờ trạng thái Engine running. Docker Engine và Buildx cần cho bước tạo image `linux/amd64`.
2. **PowerShell** tại thư mục dự án. Máy cần có Python, Node/npm, `ssh` và `scp` (OpenSSH Client của Windows).
3. **Trình duyệt** để kiểm tra `https://tourvanmieu.duckdns.org/` sau deploy.

Không cần mở terminal riêng trên VPS, trang DuckDNS hay Docker Hub cho mỗi lần cập nhật. `ssh`/`scp` sẽ hỏi mật khẩu của `root` khi kết nối; không ghi mật khẩu vào lệnh hoặc file.

## Mẫu lệnh dùng lại

Trước mỗi lần deploy, đổi giá trị `?v=` của **các tệp JS/CSS vừa sửa** trong `index.html` sang một mã mới, ví dụ `20261029-sua-ban-do-2`. Luôn đổi mã của `app.bundle.js` để có dấu hiệu nhận biết bản deploy. Sau đó dán lần lượt khối sau vào PowerShell:

```powershell
Set-Location 'D:\TourVanMieu\dau-chan-di-san-codex-handoff\heritage-map'

# 1. Kiểm tra mã trước khi đóng gói.
npm test
if ($LASTEXITCODE -ne 0) { throw 'npm test thất bại' }
npm run check
if ($LASTEXITCODE -ne 0) { throw 'npm run check thất bại' }

# 2. Đọc mã phiên bản mới từ index.html và tạo image + ZIP trên máy Windows.
$indexHtml = Get-Content .\index.html -Raw
if ($indexHtml -notmatch 'app\.bundle\.js\?v=([A-Za-z0-9_-]+)') {
    throw 'Thiếu mã phiên bản app.bundle.js trong index.html'
}
$deployVersion = $Matches[1]
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Hãy mở Docker Desktop và chờ Engine running' }
python scripts/export_docker_image.py
if ($LASTEXITCODE -ne 0) { throw 'Build thất bại; không chuyển ZIP cũ' }

# 3. Chép ZIP lên VPS (nhập mật khẩu root khi được hỏi).
scp .\artifacts\docker\heritage-map-docker.zip root@14.225.168.98:/tmp/
if ($LASTEXITCODE -ne 0) { throw 'Chuyển ZIP thất bại' }

# 4. Nạp image và khởi động lại container trên VPS.
$remoteCommand = "cd /opt/heritage-map && grep -qx HTTP_PORT=127.0.0.1:8765 .env && unzip -o /tmp/heritage-map-docker.zip heritage-map_1.2.0_linux_amd64.tar -d /opt/heritage-map && docker load -i heritage-map_1.2.0_linux_amd64.tar && docker compose up -d --force-recreate map && docker compose ps && curl -fsS http://127.0.0.1:8765/ | grep -F '$deployVersion'"
ssh root@14.225.168.98 $remoteCommand
if ($LASTEXITCODE -ne 0) { throw 'Cập nhật container hoặc kiểm tra bản trên VPS thất bại' }

# 5. Kiểm tra tên miền công khai đang trả về bản mới.
$liveHtml = curl.exe -fsS https://tourvanmieu.duckdns.org/
if ($LASTEXITCODE -ne 0) { throw 'Không tải được tên miền công khai' }
if (($liveHtml -join "`n") -notmatch [regex]::Escape($deployVersion)) {
    throw "Tên miền chưa hiển thị bản $deployVersion"
}
"Deploy thành công: https://tourvanmieu.duckdns.org/ (bản $deployVersion)"
```

`npm ci` chỉ cần chạy khi mới lấy dự án hoặc `package-lock.json` thay đổi. `npm run start` chỉ dùng để xem bản local; không cần chạy khi đóng gói vì Docker build tự chạy `npm run build` trong image.

## Cách nhận biết đã xong

- `scp` đạt **100%** và PowerShell hiện lại dấu nhắc.
- `docker compose ps` cho thấy `heritage-map-map-1` đang `Up`; trạng thái `health: starting` ngay sau khi tạo container có thể xuất hiện trong vài giây.
- Lệnh kiểm tra VPS in ra dòng `<script src="app.bundle.js?v=...">` với mã vừa đổi.
- Dòng cuối của PowerShell báo `Deploy thành công` sau khi kiểm tra tên miền HTTPS. Mở trang và tải lại bằng `Ctrl+F5` để xem giao diện mới.

Nếu không thấy mã mới ở tên miền, dừng tại bước báo lỗi và kiểm tra container/reverse proxy; đừng kết luận deploy thành công chỉ vì Docker build xong hoặc `scp` đã chuyển đủ file.
