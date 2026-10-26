# Deploy Docker image trên Linux

Trên máy có Docker Desktop hoặc Docker Engine kèm Buildx, chạy `python scripts/export_docker_image.py` để tạo image `heritage-map:1.2.0` cho Linux `amd64` (máy `x86_64`) và gói chuyển máy `artifacts/docker/heritage-map-docker.zip`. Máy chủ chỉ cần Docker Engine và Docker Compose plugin; không cần đăng nhập registry. Website được phục vụ công khai bằng HTTP trên cổng 80, không có màn hình đăng nhập hay tài khoản ứng dụng. Khách xem chỉ cần mở `http://IP_MAY_CHU/`.

Tạo lại image và gói chuyển máy khi cập nhật website bằng `python scripts/export_docker_image.py`.

Ứng dụng cần Internet để tải tile và nhãn bản đồ từ các nhà cung cấp bên ngoài. Image chứa website, thư viện, dữ liệu GIS đang dùng và GLB đã chuyển đổi; không chứa file SketchUp gốc, dữ liệu GIS chỉ dùng rà soát hay tile nền offline. Mô hình SketchUp tiếp tục tắt mặc định do vị trí địa lý chưa được xác nhận độc lập.

## 1. Chép gói image lên máy Linux

Từ PowerShell trên máy đang có dự án, thay `USER` và `SERVER` bằng thông tin SSH của máy chủ:

```powershell
scp "D:\TourVanMieu\dau-chan-di-san-codex-handoff\heritage-map\artifacts\docker\heritage-map-docker.zip" USER@SERVER:/tmp/
```

## 2. Nạp image và chạy container

Đăng nhập SSH vào máy chủ và chạy:

```bash
sudo mkdir -p /opt/heritage-map
sudo unzip -o /tmp/heritage-map-docker.zip -d /opt/heritage-map
cd /opt/heritage-map
sudo docker load -i heritage-map_1.2.0_linux_amd64.tar
sudo docker compose up -d
sudo docker compose ps
curl -I http://127.0.0.1/
```

Nếu lệnh `unzip` chưa có, cài bằng trình quản lý gói của Linux (ví dụ Ubuntu/Debian: `sudo apt-get update && sudo apt-get install -y unzip`).

Nếu UFW đang bật, mở cổng xem công khai:

```bash
sudo ufw allow 80/tcp
```

Sau đó mở `http://IP_MAY_CHU/` trên trình duyệt. Nếu trang không truy cập được từ bên ngoài, kiểm tra firewall/security group của VPS có cho phép TCP/80 hay không. Khách không cần tạo tài khoản. HTTP không mã hóa; khi có tên miền, có thể đặt reverse proxy TLS phía trước mà vẫn giữ website công khai, không đăng nhập.

## Cập nhật hoặc dừng

Kiểm tra kiến trúc máy chủ bằng `uname -m`: gói này dành cho `x86_64`. Khi nhận image phiên bản mới, giải nén gói mới, nạp tar mới bằng `docker load`, rồi chạy lại `sudo docker compose up -d`.

Để dừng website:

```bash
cd /opt/heritage-map
sudo docker compose down
```
