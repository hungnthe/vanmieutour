"""Report manually inspected Google Maps listings; never mutate production data.

Input observations were collected from rendered listing UI and the browser's
visible place URL. This script has no network access and does not call Places.
"""
from pathlib import Path
import hashlib
import json
import math
import re
import statistics

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts' / 'google-crosscheck'
sites = json.loads((ROOT / 'data' / 'sites.json').read_text(encoding='utf-8'))
observations = json.loads((OUT / 'observations.json').read_text(encoding='utf-8'))

def distance(a, b):
    p1, p2 = (math.radians(x['lat']) for x in (a, b))
    dlon = math.radians(b['lng'] - a['lng'])
    value = math.sin((p2-p1)/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dlon/2)**2
    return 6371000 * 2 * math.asin(math.sqrt(value))

notes = {
    'van_mieu':'Hai pin cách nhau 69,6 m trong một quần thể lớn. Không suy ra pin Google là cổng chính.',
    'ho_van':'Google dùng tên Hồ Giám, loại Hồ. Đã loại kết quả nhà hàng mang tên Hồ Văn.',
    'ba_nanh':'Tên và vị trí phù hợp; bảng Google ở lần chụp cuối không hiện địa chỉ riêng. Chưa xác nhận số 27 qua Google.',
    'ngoc_ho':'Khớp tên Bà Ngô/Ngọc Hồ và số 128 Nguyễn Khuyến.',
    'y_mieu':'Đã chọn Y Miếu Thăng Long, loại Tòa nhà di sản; loại kết quả phố Y Miếu.',
    'huy_van':'App ghi 13 ngõ Huy Văn; Google ghi 34 Ngõ Văn Chương, Cổng sau. Cần phân biệt các cổng, không tự thay địa chỉ.',
    'pho_giac':'App ghi 80 Ngô Sĩ Liên; Google ghi Ngõ 56 Ngô Sỹ Liên. Cần xác minh lối vào.',
    'trung_tu_dinh':'Chọn Đình làng Trung tự ở ngách 180/29 Kim Hoa, không chọn các di tích khác có chữ Trung.',
    'phung_thanh':'Hai pin cách nhau 47,5 m; cần kiểm tra cổng trước khi dẫn đường.',
    'quang_minh':'Listing có hậu tố Thiện nguyện Trẻ Hà Nội cập nhật, nằm ở khu Y Miếu. Đã loại Quảng Minh và Quang Minh ở Đình Thôn.',
    'luong_su':'Google ghi tên ghép Đình - Đền Lương Sử. Nguồn công báo của app chỉ định danh đền; cần rà lại phạm vi cơ sở.',
    'linh_quang':'App ghi 55 ngõ Văn Chương 2; Google ghi 1 Văn Chương 2. Tên và vị trí phù hợp nhưng số nhà cần xác minh.',
    'lien_hoa':'Google ghi 300 Ngõ Văn Chương; Đống Đa 360 ghi 71 ngõ chùa Liên Hoa. Có thể là cách tiếp cận khác, chưa kết luận cổng.',
    'trung_ta':'App ghi 24 ngõ Trung Tả; Google ghi 264 phố Khâm Thiên; hai pin cách nhau 60,8 m. Ưu tiên kiểm tra thực địa.',
    'tho_quan':'Đã loại một kết quả cùng tên ở Hoài Đức, cách pin app khoảng 12,8 km. Chọn Đình Làng Thổ Quan trong khu Đống Đa.',
    'trung_phung':'Tên và vị trí phù hợp; Google không hiện địa chỉ riêng ở lần kiểm tra, chưa xác nhận cổng.',
    'kham_duc_dinh':'Ứng viên Google tại 74 ngõ Chợ Khâm Thiên khớp địa chỉ tham khảo hiện có. Giữ tọa độ ứng viên riêng.',
    'thanh_mien':'Google có listing trên ngõ Thanh Miến; Đống Đa 360 xác nhận số 20. Chưa khảo sát cổng.',
    'duc_thanh_tran':'Tìm thấy ứng viên tại 100 Lê Duẩn; cần đối chiếu phạm vi cơ sở với nhãn trong PDF trước khi nhập tọa độ chuẩn.',
    'tien_tich':'Số 110 Lê Duẩn khớp nguồn Thư viện Hà Nội. Nhãn phường trên Google khác nguồn thư viện; không tự chốt địa giới hiện hành.',
    'kham_duc_den':'Google có listing Đền Khâm Đức - thờ Chầu Đệ Tứ tại 63 ngõ Chợ Khâm Thiên, khác tên/số nhà với Đình Khâm Đức. Chưa khẳng định hai cơ sở độc lập chỉ từ listing.',
    'trung_kinh':'Chọn đúng Đình Trung Kính trong ngõ Chùa Mỹ Quang; loại Trung Kính Thượng/Hạ ở khu Cầu Giấy.',
    'thai_kieu':'Chọn Đình Thái Kiều tại 84 ngõ 218 ngõ Chợ Khâm Thiên; không chọn các kết quả Kiều Mai hoặc di tích ngoài khu vực.'
}

comparison = []
for site in sites:
    candidates = [r for r in observations if r['id'] == site['id'] and r.get('google_pin')]
    assert candidates, f"No observed Google place pin: {site['id']}"
    match = candidates[-1]
    # Do not mistake @camera coordinates for a selected place coordinate.
    point = re.search(r'!3d(-?[0-9.]+)!4d(-?[0-9.]+)', match['url'])
    assert point and '/maps/place/' in match['url']
    assert float(point[1]) == match['google_pin']['lat']
    assert float(point[2]) == match['google_pin']['lng']
    located = site['lat'] is not None and site['lng'] is not None
    delta = round(distance(site, match['google_pin']), 1) if located else None
    comparison.append({
        'id':site['id'], 'name':site['name'],
        'original':{'lat':site['lat'],'lng':site['lng'],'address':site['address'],'coord_status':site['coord_status']},
        'google_observation':match,
        'point_separation_m':delta,
        'assessment':'manual_listing_comparison' if located else 'candidate_only_not_adopted',
        'google_places_api_verified':False,
        'entrance_verified':False,
        'note':notes.get(site['id'],'Tên và vị trí phù hợp ở mức đối chiếu pin; chưa khảo sát cổng.')
    })

located_rows = [r for r in comparison if r['point_separation_m'] is not None]
new_candidates = [r for r in comparison if r['point_separation_m'] is None]
assert len(comparison) == 32 and len(located_rows) == 25 and len(new_candidates) == 7
assert max(r['point_separation_m'] for r in located_rows) < 100
checked_date = '25/10/2026'
summary = {
    'date':checked_date,
    'method':'Manual read of public Google Maps UI, not Google Places API; straight-line Haversine comparison.',
    'source_data_modified':False,
    'listings_found':32, 'original_points_compared':25, 'new_candidates_not_adopted':7,
    'separation_min_m':min(r['point_separation_m'] for r in located_rows),
    'separation_median_m':statistics.median(r['point_separation_m'] for r in located_rows),
    'separation_max_m':max(r['point_separation_m'] for r in located_rows),
    'google_places_api_verified':0, 'entrances_verified':0, 'road_routes_verified':0
}
hashes = {str(p.relative_to(ROOT)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest()
          for p in [ROOT/'data/sites.json',ROOT/'data/routes.json',ROOT/'data.js',ROOT/'references/original-tour-map.pdf']}
(OUT/'comparison.json').write_text(json.dumps({'summary':summary,'source_hashes':hashes,'sites':comparison},ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'candidate-pins.json').write_text(json.dumps({
    'status':'REVIEW_ONLY_DO_NOT_IMPORT_AUTOMATICALLY',
    'note':'Google browser observations, not official gazette coordinates or verified entrances. Production sites.json remains unchanged.',
    'candidates':new_candidates
},ensure_ascii=False,indent=2),encoding='utf-8')

def coord(point):
    return f"{point['lat']:.7f}, {point['lng']:.7f}"

def cell(text):
    return str(text or 'Google không hiện địa chỉ riêng').replace('|','/').replace('\n',' ')

lines = [
    '# Đối chiếu với Google Maps — '+checked_date,
    '',
    '**Đã tìm thấy listing tương ứng cho 32/32 địa điểm.** 25 điểm đang có tọa độ được so với pin của listing Google: khoảng cách giữa hai điểm từ **6,0 đến 69,6 m**, trung vị **17,4 m**. Không phát hiện điểm nào trong bộ 25 lệch trên 100 m so với listing đã chọn đúng khu vực.',
    '',
    '**Bảy điểm trước đây chưa định vị đều có ứng viên Google. Các ứng viên được lưu riêng, chưa đưa vào bản đồ sản phẩm.** Bộ dữ liệu gốc vẫn có 25 pin và bảy tọa độ null.',
    '',
    'Đây là đối chiếu thủ công thông tin hiển thị công khai trên Google Maps. Không gọi Places API, không tuyên bố Google chứng nhận dữ liệu, không xác minh cổng hoặc đường đi. Pin Google cũng có thể là điểm đại diện; khoảng cách hai pin không phải sai số trắc địa hoặc quãng đường đi bộ.',
    '',
    '## Các khác biệt cần kiểm tra',
    '',
    '| Địa điểm | Dữ liệu hiện tại | Google Maps / nguồn đối chiếu | Xử lý |',
    '| --- | --- | --- | --- |',
    '| Văn Miếu | Điểm tâm công báo | Pin Google cách 69,6 m | Giữ nguồn gốc; quần thể rộng, chưa xác nhận cổng. |',
    '| Chùa Huy Văn | 13 ngõ Huy Văn | 34 Ngõ Văn Chương, Cổng sau | Phân biệt cổng trước/cổng sau. |',
    '| Chùa Phổ Giác | 80 Ngô Sĩ Liên | Ngõ 56 Ngô Sỹ Liên | Chưa tự thay địa chỉ. |',
    '| Chùa Linh Quang | 55 ngõ Văn Chương 2 | 1 Văn Chương 2 | Cần xác minh số nhà/lối vào. |',
    '| Chùa Liên Hoa | Chỉ ghi khu Khâm Thiên | Google: 300 Ngõ Văn Chương; Đống Đa 360: 71 ngõ chùa Liên Hoa | Chưa chốt địa chỉ cổng. |',
    '| Đền Trung Tả | 24 ngõ Trung Tả | 264 phố Khâm Thiên; pin cách 60,8 m | Ưu tiên kiểm tra thực địa. |',
    '',
    'Nguồn bổ sung: [Đống Đa 360 — Đình Thanh Miến](https://www.dongda360.vn/chi_tiet_di_tich_danh_lam/dinh-thanh-mien.html) xác nhận số 20 ngõ Thanh Miến; mục địa điểm xung quanh ghi Chùa Linh Quang số 55 ngõ Văn Chương 2 và Đền Trung Tả số 24 ngõ Trung Tả. [Đống Đa 360 — Chùa Liên Hoa](https://www.dongda360.com.vn/chi_tiet_di_tich_danh_lam/chua-lien-hoa.html) ghi số 71 ngõ chùa Liên Hoa. [Thư viện Hà Nội](https://tracuu.ttvanhoavathuvien.hanoi.gov.vn/tai-lieu-chi-tiet/chua-tien-tich-o-phia-nam-kinh-thanh--nguyen-thi-hoa-249198.html) xác nhận Chùa Tiên Tích ở số 110 Lê Duẩn. Không dùng nhãn phường trên Google để tự thay địa giới hiện hành trong dữ liệu chuẩn.',
    '',
    '## Hai trường hợp dễ khớp nhầm',
    '',
    '- **Thổ Quan:** tìm tên ngắn ban đầu trả một listing cùng tên ở Hoài Đức, cách tọa độ app 12,8 km. Đã loại kết quả đó. Listing Đình Làng Thổ Quan trong khu Đống Đa cách điểm tâm app 9,9 m.',
    '- **Trung Kính:** kết quả phổ biến Trung Kính Thượng/Hạ nằm ngoài khu dự án. Đã tìm được listing Đình Trung Kính trong ngõ Chùa Mỹ Quang, phù hợp dấu hiệu vị trí trong tài liệu bàn giao.',
    '- Đồng thời loại kết quả **phố Y Miếu** khi chọn di tích **Y Miếu Thăng Long**, và loại **nhà hàng Hồ Văn** khi chọn hồ **Hồ Giám**.',
    '',
    '## 25 điểm đang có tọa độ',
    '',
    '| Địa điểm | Pin app WGS84 | Pin listing Google | Cách nhau | Nguồn Google |',
    '| --- | --- | --- | ---: | --- |'
]
for row in located_rows:
    g = row['google_observation']
    lines.append(f"| {cell(row['name'])} | {coord(row['original'])} | {coord(g['google_pin'])} | {row['point_separation_m']:.1f} m | [Listing]({g['url']}) |")
lines += ['', '## Bảy ứng viên mới — chưa nhập vào dữ liệu sản phẩm', '',
          '| Địa điểm | Tọa độ ứng viên Google | Địa chỉ hiển thị | Nguồn |',
          '| --- | --- | --- | --- |']
for row in new_candidates:
    g = row['google_observation']
    lines.append(f"| {cell(row['name'])} | {coord(g['google_pin'])} | {cell(g['address']).removeprefix('Địa chỉ: ')} | [Listing]({g['url']}) |")
lines += ['',
    'Đình Khâm Đức (số 74) và Đền Khâm Đức (số 63, thờ Chầu Đệ Tứ) có hai listing và hai pin rất gần nhau. Chưa khẳng định ranh giới cơ sở/cổng độc lập chỉ dựa trên Google. Đình Thanh Miến cần xác nhận cổng số 20; các ứng viên còn lại cần đối chiếu hồ sơ quản lý và thực địa trước khi nâng mức xác minh.',
    '',
    '## Dữ liệu và chứng cứ',
    '',
    '- [comparison.json](comparison.json): 32 dòng, tọa độ gốc, quan sát Google, độ lệch và ghi chú từng điểm.',
    '- [candidate-pins.json](candidate-pins.json): bảy ứng viên tách riêng, cờ REVIEW_ONLY_DO_NOT_IMPORT_AUTOMATICALLY.',
    '- [observations.json](observations.json): nhật ký các lần tìm kiếm, kể cả kết quả không khớp ban đầu. Khi tái tạo báo cáo, chọn lần đối chiếu có pin gần nhất theo thời gian cho từng ID; kết quả sai tên/khu vực được giải thích ở trên, không đưa vào bảng kết quả cuối.',
    '- Ảnh `*-google.jpg`: trang Google đã quan sát. Không thu thập đánh giá, thông tin tài khoản hoặc dữ liệu cá nhân trong JSON báo cáo.',
    '- Tọa độ Google được đọc từ cặp !3d/!4d của URL place đang hiển thị; không lấy @lat,lng là tâm màn hình. Bản ghi có pin phải là URL /maps/place/.',
    '- Không thay sites.json, routes.json, data.js, CSV/GeoJSON gốc hoặc PDF. SHA-256 của các nguồn chính nằm trong comparison.json và được kiểm tra bằng scripts/data_test.cjs.',
    '- Các tuyến vẫn là thứ tự ghé theo PDF. Không có tuyến mặt đường nào được xác minh qua lần đối chiếu này.',
    '',
    'Tái tạo báo cáo từ các quan sát đã lưu: `python scripts/build_google_crosscheck.py`.',
    '',
    '## Ghi chú từng địa điểm', ''
]
for row in comparison:
    lines.append(f"- **{row['name']}**: {row['note']}")
lines += ['', '## Ảnh ví dụ', '',
          '![Google Maps — Ngọc Hồ](ngoc-ho-google.jpg)', '',
          '![Google Maps — Đình Trung Kính đúng khu vực](trung_kinh-google.jpg)', '']
(OUT/'REPORT.md').write_text('\n'.join(lines),encoding='utf-8')
print(json.dumps(summary,ensure_ascii=True))
