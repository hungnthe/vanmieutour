"""Build a traceable heritage-site audit from the user's drawing and gazette.

Usage (from the workspace root):
  PYTHONPATH=heritage-map/.deps python heritage-map/scripts/build_data.py \
    official_gazette_hanoi.pdf

Coordinates in the gazette are VN-2000 EPSG:4756 (not WGS84).
The official publication calls them *relative central coordinates*. Converted
WGS84 values are fit for a review map, not for turn-by-turn navigation.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
from pathlib import Path
from urllib.parse import quote

import fitz
from pyproj import Transformer


ROOT = Path(__file__).resolve().parents[1]
GAZETTE = "https://datafiles.chinhphu.vn/cpp/files/vbpq/2022/10/10-btnmt.pdf"
PUBLICATION = "https://vanban.chinhphu.vn/?classid=1&docid=206693&pageid=27160&typegroupid=6"
WARD_SUFFIX = "quận Đống Đa (địa danh hành chính 2022), Hà Nội"

# The map in the supplied PDF has 33 printed heritage/location labels. Two
# printed labels (Chùa Bà Nành / Tiên Phúc Tự) designate a single temple.
# These are 32 unique *map places*, not an official registry of 37 relics.
SITES = [
    dict(id="van_mieu", name="Văn Miếu – Quốc Tử Giám", kind="di-tích", gazette="Khu di tích Văn Miếu - Quốc Tử Giám", ward="Văn Miếu", address="58 phố Quốc Tử Giám, Hà Nội", address_ref="https://vanmieu.gov.vn/vi", summary="Quần thể văn hóa Nho học, nơi lưu giữ truyền thống giáo dục và khoa bảng Việt Nam.", ref="https://vanmieu.gov.vn/vi/inner-temple", flag="Tọa độ là tâm khu di tích, không phải cổng vào chính."),
    dict(id="ho_van", name="Hồ Văn – Gò Kim Châu", kind="hồ", gazette="Hồ Văn", ward="Quốc Tử Giám", address="Khu Hồ Văn, đối diện Văn Miếu, Hà Nội", summary="Không gian Hồ Văn thuộc tổng thể di tích Văn Miếu – Quốc Tử Giám.", ref="https://vanmieu.gov.vn/vi/inner-temple", flag="Điểm bản đồ đại diện Hồ Văn, không phải cổng vào gò Kim Châu."),
    dict(id="ba_nanh", name="Chùa Bà Nành (Tiên Phúc tự)", kind="chùa", gazette="chùa Bà Nành", ward="Văn Miếu", aliases=["Chùa Tiên Phúc Tự", "Tiên Phúc tự"], address="27 phố Văn Miếu, Hà Nội", address_ref="https://nguoihanoi.vn/chua-ba-nanh-quan-dong-da-74865.html", summary="Tên chữ Tiên Phúc tự; trên sơ đồ gốc tên này xuất hiện thêm như một nhãn riêng.", ref="https://nguoihanoi.vn/chua-ba-nanh-quan-dong-da-74865.html", flag="Đã gộp hai nhãn trùng tên, cần xác nhận tác giả bản đồ có chủ ý riêng không."),
    dict(id="ngoc_ho", name="Chùa Ngọc Hồ (Bà Ngô)", kind="chùa", gazette="chùa Ngọc Hồ", ward="Văn Miếu", aliases=["Chùa Bà Ngô"], address="128 phố Nguyễn Khuyến, Hà Nội", address_ref="https://www.dongda360.vn/di-tich-danh-lam/chua-ngoc-ho.html"),
    dict(id="y_mieu", name="Y Miếu", kind="đền", gazette="Di tích Y Miếu", ward="Văn Miếu"),
    dict(id="huy_van", name="Chùa Huy Văn", kind="chùa", gazette="chùa Huy Văn", ward="Văn Chương", address="13 ngõ Huy Văn, Hà Nội", address_ref="https://dinhvanphuongdoquyen.blogspot.com/2018/01/chua-huy-van-duc-khanh-tu.html", flag="Chùa Huy Văn, Đền Huy Văn và Điện Huy Văn là các tên/đối tượng gần nhau; không được nhập nhầm."),
    dict(id="van_chi", name="Đền Văn Chỉ", kind="đền", gazette="đền Văn Chỉ", ward="Văn Chương", address="Ngách 27, ngõ Văn Chương, Hà Nội", address_ref="https://www.dulichvn.org.vn/index.php/item/le-hoi-den-van-chi-ha-noi-55580"),
    dict(id="pho_giac", name="Chùa Phổ Giác", kind="chùa", gazette="chùa Phổ Giác", ward="Văn Miếu", address="80 phố Ngô Sĩ Liên, Hà Nội", address_ref="https://ngotoc.vn/Van-hoa-Doi-song/chua-dinh-den-nao-tho-ai-470.html", summary="Ngôi chùa có lịch sử gắn với việc huấn luyện voi chiến thời Lê – Trịnh.", ref="https://nguoihanoi.vn/chua-pho-giac-quan-dong-da-76580.html", osm_ref="https://mapcarta.com/W702456248", osm_lat=21.02647, osm_lng=105.83799),
    dict(id="kham_thien", name="Đài tưởng niệm Khâm Thiên", kind="tưởng-niệm", gazette="Khu di tích Khâm Thiên", ward="Khâm Thiên", address="47–51 phố Khâm Thiên, Hà Nội", address_ref="https://hanoi.gov.vn/tin-tuc-su-kien-noi-bat/kham-thien-khac-sau-cam-thu-giac-my-26-12-1972-40002807653.htm", summary="Tưởng niệm những người dân thiệt mạng trong trận ném bom Khâm Thiên đêm 26/12/1972.", ref="https://hanoi.gov.vn/tin-tuc-su-kien-noi-bat/kham-thien-khac-sau-cam-thu-giac-my-26-12-1972-40002807653.htm", flag="Bản đồ nhà nước ghi tọa độ KHU di tích; cần khảo sát đúng vị trí lối vào đài."),
    dict(id="trung_tu_dinh", name="Đình làng Trung Tự", kind="đình", gazette="đình Trung Tự", ward="Phương Liên", flag="Không nhầm với chùa Trung Tự nằm ở vị trí khác."),
    dict(id="kim_lien", name="Đền Kim Liên (Đình Kim Liên)", kind="đền", gazette="đình Kim Liên", ward="Phương Liên", aliases=["Đền Cao Sơn"], address="148 phố Kim Hoa, Hà Nội", summary="Di tích trấn Nam trong hệ thống Thăng Long tứ trấn.", ref="https://nguoihanoi.vn/den-kim-lien-co-kinh-tran-nam-kinh-thanh-thang-long-xua-68751.html", osm_ref="https://mapcarta.com/W947089943", osm_lat=21.01068, osm_lng=105.83817, flag="Tên trong danh mục địa danh là 'đình Kim Liên'; đây là một tên gọi của đền – đình Kim Liên."),
    dict(id="van_huong", name="Đình Văn Hương", kind="đình", gazette="đình Văn Hương", ward="Hàng Bột"),
    dict(id="phung_thanh", name="Chùa Phụng Thánh", kind="chùa", gazette="chùa Phụng Thánh", ward="Trung Phụng"),
    dict(id="kham_duc_dinh", name="Đình Khâm Đức", kind="đình", address="74 ngõ Chợ Khâm Thiên, Hà Nội", address_ref="https://hanoidep.vn/dinh-kham-duc-74-ng-cho-kham-thien-kham-thien-dong-da-ha-noi/", flag="Chưa có tọa độ điểm độc lập; là di tích chưa xếp hạng theo bài báo 2026. Không lấy tọa độ chùa Mỹ Quang để thay thế."),
    dict(id="thanh_mien", name="Đình Thanh Miến", kind="đình", address="20 ngõ Thanh Miến, Hà Nội", address_ref="https://www.dongda360.vn/chi_tiet_di_tich_danh_lam/dinh-thanh-mien.html", flag="Nguồn địa phương có chỗ ghi 13 phố Văn Miếu, chỗ ghi 20 ngõ Thanh Miến; cần khảo sát địa chỉ và cổng."),
    dict(id="song_son", name="Đền Mẫu Sòng Sơn – Hà Nội", kind="đền", gazette="đền Sòng Sơn", ward="Quốc Tử Giám", flag="Tên dài trên bản đồ gốc, tên rút gọn trong danh mục địa danh."),
    dict(id="quang_minh", name="Chùa Quang Minh", kind="chùa", gazette="chùa Quang Minh", ward="Văn Miếu", address="8 phố Y Miếu, Hà Nội", address_ref="https://ngotoc.vn/Van-hoa-Doi-song/chua-dinh-den-nao-tho-ai-470.html"),
    dict(id="duc_thanh_tran", name="Đền Đức Thánh Trần", kind="đền", flag="Chưa tìm thấy đối tượng khớp chắc chắn với nhãn tại khu Văn Miếu; có nhiều đền trùng tên ở Hà Nội."),
    dict(id="tien_tich", name="Chùa Tiên Tích", kind="chùa", address="110 phố Lê Duẩn, phường Cửa Nam, Hà Nội", address_ref="https://tracuu.ttvanhoavathuvien.hanoi.gov.vn/tai-lieu-chi-tiet/chua-tien-tich-o-phia-nam-kinh-thanh--nguyen-thi-hoa-249198.html", ref="https://nguoihanoi.vn/chua-tien-tich-quan-hoan-kiem-76787.html", flag="Cơ sở thuộc khu Cửa Nam, nằm ngoài một phần phạm vi 37 di tích của phường Văn Miếu – Quốc Tử Giám."),
    dict(id="luong_su", name="Đình – Đền Lương Sử", kind="đình–đền", gazette="đền Lương Sử", ward="Văn Chương", flag="Danh mục địa danh chỉ xác nhận vị trí ĐỀN Lương Sử; nhãn ghép đình – đền cần xác minh phạm vi."),
    dict(id="linh_quang", name="Chùa Linh Quang", kind="chùa", gazette="chùa Linh Quang", ward="Văn Chương", address="55 ngõ Văn Chương 2, Hà Nội", address_ref="https://www.dongda360.vn/chi_tiet_di_tich_danh_lam/dinh-thanh-mien.html", flag="Phân biệt với Đình Linh Quang gần đó và nhiều chùa trùng tên."),
    dict(id="but_moc", name="Chùa Bụt Mọc", kind="chùa", gazette="chùa Bụt Mọc", ward="Văn Chương", aliases=["Chùa Bột Mọc"]),
    dict(id="lien_hoa", name="Chùa Liên Hoa", kind="chùa", gazette="chùa Liên Hoa", ward="Khâm Thiên"),
    dict(id="linh_ung", name="Chùa Linh Ứng", kind="chùa", gazette="chùa Linh Ứng", ward="Thổ Quan", flag="Phân biệt với chùa Linh Ứng khác ở Hà Nội."),
    dict(id="trung_ta", name="Đền Trung Tả", kind="đền", gazette="đền Trung Tả", ward="Thổ Quan", address="24 ngõ Trung Tả, Khâm Thiên, Hà Nội", address_ref="https://www.dongda360.vn/chi_tiet_di_tich_danh_lam/dinh-thanh-mien.html"),
    dict(id="kham_duc_den", name="Đền Khâm Đức (thờ Châu Đệ Tứ)", kind="đền", flag="Có thể là một cơ sở riêng với Đình Khâm Đức; chưa có chứng cứ vị trí độc lập."),
    dict(id="my_quang", name="Chùa Mỹ Quang", kind="chùa", gazette="chùa Mỹ Quang", ward="Trung Phụng"),
    dict(id="trung_kinh", name="Đình Trung Kính", kind="đình", address="Ngõ Chùa Mỹ Quang, Hà Nội", flag="Điểm tham khảo OpenStreetMap cạnh chùa Mỹ Quang; chưa xác minh cổng vào.", ref="https://chonthieng.com/dia-diem/chua-my-quang-linh-quang-tu-dong-da-ha-noi-2/", coordinate_source="https://vietnam-pagodas.vercel.app/vi/chua/dinh-trung-kinh", coordinate_lat=21.01686, coordinate_lng=105.83927),
    dict(id="tho_quan", name="Đình làng Thổ Quan", kind="đình", gazette="đình Thổ Quan", ward="Thổ Quan"),
    dict(id="thai_kieu", name="Đình Thái Kiều", kind="đình", flag="Một trong các đình chưa xếp hạng theo bài báo 2026; không đồng nhất với Đình Thái Kiều ở Nam Định."),
    dict(id="trung_phung", name="Đền Trung Phụng", kind="đền", gazette="đền Trung Phụng", ward="Trung Phụng"),
    dict(id="trung_tu_chua", name="Chùa Trung Tự", kind="chùa", gazette="chùa Trung Tự", ward="Phương Liên"),
]

ROUTES = [
    dict(id="W01", mode="walk", title="Hồ Văn – Chùa Bà Nành", color="#00A983", sites=["van_mieu","ho_van","ba_nanh"], details="Không gian Văn Miếu, Hồ Văn, di tích Chùa Bà Nành."),
    dict(id="W02", mode="walk", title="Chùa Ngọc Hồ – Y Miếu", color="#BD8A39", sites=["van_mieu","ngoc_ho","y_mieu"], details="Khám phá hai địa điểm văn hóa ở phía đông bắc Văn Miếu."),
    dict(id="W03", mode="walk", title="Chùa Huy Văn – Đền Văn Chỉ", color="#804324", sites=["van_mieu","huy_van","van_chi"], details="Tuyến đi bộ về phía phố Huy Văn, Văn Chương."),
    dict(id="R01", mode="motorbike", title="Phổ Giác – Y Miếu – Khâm Thiên", color="#F4513A", sites=["van_mieu","pho_giac","y_mieu","kham_thien"], details="Từ Văn Miếu qua di tích tôn giáo và đài tưởng niệm lịch sử."),
    dict(id="R02", mode="motorbike", title="Văn Hương – Phụng Thánh – Khâm Đức", color="#C90091", sites=["van_mieu","van_huong","van_chi","phung_thanh","kham_duc_dinh"], details="Tuyến qua Văn Hương, Phụng Thánh và Đình Khâm Đức."),
    dict(id="R03", mode="motorbike", title="Phổ Giác – Huy Văn – Kim Liên", color="#008FCE", sites=["van_mieu","pho_giac","huy_van","trung_tu_dinh","kim_lien"], details="Điểm kết là Đền Kim Liên, một trong Thăng Long tứ trấn."),
]


def get_dms(s: str) -> float:
    chunks = re.findall(r"\d+", s)
    if len(chunks) != 3:
        raise ValueError(f"Unexpected DMS: {s!r}")
    d, m, sec = map(int, chunks)
    return d + m / 60 + sec / 3600


def gazette_rows(pdf_path: Path) -> dict[tuple[str,str], dict]:
    doc = fitz.open(pdf_path)
    rows = {}
    for page_i in range(30, 40):  # Đống Đa section, PDF pages 31–40
        lines = [x.strip() for x in doc[page_i].get_text().splitlines()]
        for index, group in enumerate(lines):
            if group not in {"KX", "TV"} or index < 1 or index + 4 >= len(lines):
                continue
            ward = lines[index + 1].removeprefix("P. ").strip()
            district = lines[index + 2]
            latitude, longitude = lines[index + 3:index + 5]
            if district != "Q. Đống Đa" or not re.match(r"^21°", latitude) or not re.match(r"^105°", longitude):
                continue
            name = lines[index - 1]
            if name == "Quốc Tử Giám" and lines[index - 2] == "Khu di tích Văn Miếu -":
                name = "Khu di tích Văn Miếu - Quốc Tử Giám"
            rows[(name.casefold(), ward.casefold())] = {
                "name": name, "ward": ward, "dms_lat": latitude,
                "dms_lng": longitude, "pdf_page": page_i + 1,
            }
    return rows


def distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    rad = math.pi / 180
    lat1, lng1 = a
    lat2, lng2 = b
    sinlat = math.sin((lat2-lat1)*rad / 2)
    sinlng = math.sin((lng2-lng1)*rad / 2)
    angle = 2 * math.asin(math.sqrt(sinlat*sinlat + math.cos(lat1*rad)*math.cos(lat2*rad)*sinlng*sinlng))
    return 6371000 * angle


def build(gazette_path: Path) -> dict:
    gazette = gazette_rows(gazette_path)
    reference_points = json.loads((ROOT / "data" / "gis-reference-coordinates.json").read_text(encoding="utf-8"))
    converter = Transformer.from_crs("EPSG:4756", "EPSG:4326", always_xy=True)
    sites = []
    seen = set()
    for source in SITES:
        if source["id"] in seen:
            raise ValueError("Duplicate site ID")
        seen.add(source["id"])
        item = dict(source)
        item.setdefault("aliases", [])
        item.setdefault("address", f"Khu vực {item.get('ward', 'Văn Miếu – Khâm Thiên')}, {WARD_SUFFIX}" if item.get("ward") else "Khu vực trung tâm Hà Nội; đang kiểm tra địa chỉ")
        item.setdefault("summary", "Địa danh ghi trong sơ đồ nguồn. Nội dung thuyết minh lịch sử cần được biên tập và thẩm định.")
        item.setdefault("flag", "Tọa độ là điểm trung tâm địa danh, chưa xác nhận cổng vào và giờ mở cửa.")
        item["lat"] = None
        item["lng"] = None
        item["coord_status"] = "unlocated"
        item["coord_detail"] = "Chưa có tọa độ độc lập được kiểm chứng"
        item["google_status"] = "Chưa đối soát Google Places API (thiếu API key)"
        item["gazette_pdf"] = GAZETTE if item.get("gazette") else None
        item["gazette_page"] = None
        item["coord_system_raw"] = None
        if "gazette" in item:
            key = (item["gazette"].casefold(), item["ward"].casefold())
            rec = gazette.get(key)
            if not rec:
                raise LookupError(f"Gazette reference not found: {key}")
            lat_vn, lng_vn = get_dms(rec["dms_lat"]), get_dms(rec["dms_lng"])
            lng_wgs, lat_wgs = converter.transform(lng_vn, lat_vn)
            item.update({
                "lat": round(lat_wgs, 7), "lng": round(lng_wgs, 7),
                "coord_status": "gazette_centroid",
                "coord_detail": "Tọa độ tâm tương đối từ Thông tư 10/2022, chuyển hệ VN-2000 → WGS84; chưa xác minh cổng tham quan",
                "gazette_page": rec["pdf_page"],
                "coord_system_raw": "EPSG:4756",
                "source_dms": f"{rec['dms_lat']}, {rec['dms_lng']}",
            })
            if item.get("osm_lat") is not None:
                item["osm_crosscheck_m"] = round(distance_m((lat_wgs, lng_wgs), (item["osm_lat"], item["osm_lng"])), 1)
        elif item["id"] in reference_points:
            point = reference_points[item["id"]]
            item.update({"lat": point["lat"], "lng": point["lng"], "coord_status": "gis_reference",
                         "coordinate_source": "data/gis/heritage-points-review.geojson",
                         "coordinate_record": point["record"], "coord_system_raw": "EPSG:4326",
                         "coord_detail": "Điểm tham khảo từ GIS dự án; chưa xác minh cổng tham quan",
                         "flag": "Điểm tham khảo từ GIS dự án; chưa xác minh cổng hoặc lối đi thực tế."})
        elif item.get("coordinate_source"):
            item.update({"lat": item["coordinate_lat"], "lng": item["coordinate_lng"],
                         "coord_status": "osm_reference", "coord_system_raw": "EPSG:4326",
                         "coord_detail": "Điểm tham khảo từ OpenStreetMap; chưa xác minh cổng tham quan"})
        item["maps_search_url"] = "https://www.google.com/maps/search/?api=1&query=" + quote(item["name"] + ", Hà Nội", safe="")
        item["maps_point_url"] = (
            "https://www.google.com/maps/search/?api=1&query=" + quote(f"{item['lat']},{item['lng']}")
            if item["lat"] is not None else None
        )
        sites.append(item)

    routes = []
    for route in ROUTES:
        route = dict(route)
        assert all(sid in seen for sid in route["sites"])
        route["site_names"] = [next(s["name"] for s in sites if s["id"] == sid) for sid in route["sites"]]
        route["fully_located"] = all(next(s for s in sites if s["id"] == sid)["lat"] is not None for sid in route["sites"])
        route["routing_status"] = "point_order_only"  # No Google Routes/road geometry
        origin, *intermediates, destination = route["site_names"]
        # Google Maps URLs cannot set TWO_WHEELER mode; do not silently show
        # a driving route as validated motorcycle navigation.
        options = "&travelmode=walking" if route["mode"] == "walk" else ""
        route["google_directions_url"] = (
            "https://www.google.com/maps/dir/?api=1&origin=" + quote(origin + ", Hà Nội", safe="")
            + "&destination=" + quote(destination + ", Hà Nội", safe="")
            + ("&waypoints=" + quote("|".join(name + ", Hà Nội" for name in intermediates), safe="") if intermediates else "")
            + options
        )
        routes.append(route)
    return {
        "meta": {
            "title": "Dấu chân Di sản Hà Nội — bản đồ kiểm toán dữ liệu",
            "source_map_labels": 33,
            "source_unique_places": len(sites),
            "target_heritage_count": 37,
            "unreconciled_count": 37 - len(sites),
            "gazette_source": PUBLICATION,
            "gazette_pdf": GAZETTE,
            "gazette_year": 2022,
            "coordinate_system": "WGS84 / EPSG:4326 (converted from VN-2000 EPSG:4756)",
            "google_maps_place_api_access": False,
            "street_route_geometry_verified": False,
            "extra_district_scope_warning": "Sơ đồ bao gồm cả một số địa danh ngoài phạm vi phường Văn Miếu – Quốc Tử Giám mới.",
            "note": "Bản mẫu nghiên cứu; chưa được phép dùng như bản đồ dẫn đường ngoài thực địa."
        },
        "sites": sites,
        "routes": routes,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("gazette_pdf", type=Path)
    args = parser.parse_args()
    data = build(args.gazette_pdf)
    root = ROOT / "data"
    root.mkdir(parents=True, exist_ok=True)
    (root / "sites.json").write_text(json.dumps(data["sites"], ensure_ascii=False, indent=2), encoding="utf-8")
    (root / "routes.json").write_text(json.dumps(data["routes"], ensure_ascii=False, indent=2), encoding="utf-8")
    geojson = {
        "type": "FeatureCollection",
        "name": "heritage-reference-locations-review-only",
        "features": [{
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [s["lng"], s["lat"]]},
            "properties": {"id": s["id"], "name": s["name"], "kind": s["kind"], "status": s["coord_status"], "gazette_page": s["gazette_page"], "accuracy_note": "Reference location, not verified visitor entrance"}
        } for s in data["sites"] if s["lat"] is not None],
    }
    (root / "sites.geojson").write_text(json.dumps(geojson, ensure_ascii=False, indent=2), encoding="utf-8")
    (ROOT / "data.js").write_text("window.HERITAGE_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    fields = ["id", "name", "kind", "address", "lat", "lng", "coord_status", "coord_detail", "coordinate_source", "coordinate_record", "google_status", "gazette", "gazette_page", "source_dms", "osm_crosscheck_m", "aliases", "maps_search_url", "maps_point_url", "gazette_pdf", "ref", "flag"]
    with (root / "site-audit.csv").open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for item in data["sites"]:
            row = dict(item)
            row["aliases"] = "; ".join(item["aliases"])
            writer.writerow(row)
    with (root / "route-audit.csv").open("w", newline="", encoding="utf-8-sig") as stream:
        fields = ["id", "mode", "title", "site_names", "fully_located", "routing_status", "google_directions_url"]
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for route in data["routes"]:
            row = dict(route)
            row["site_names"] = " → ".join(route["site_names"])
            writer.writerow(row)
    with (root / "needs-field-verification.csv").open("w", newline="", encoding="utf-8-sig") as stream:
        fields = ["id", "name", "address", "flag", "maps_search_url"]
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for item in data["sites"]:
            if item["lat"] is None:
                writer.writerow(item)
    print(json.dumps({
        "printed_labels": data["meta"]["source_map_labels"],
        "unique_sites": len(data["sites"]),
        "official_centroids": sum(s["coord_status"] == "gazette_centroid" for s in data["sites"]),
        "without_coords": sum(s["lat"] is None for s in data["sites"]),
        "routes": len(data["routes"]),
        "routes_with_all_points_located": sum(r["fully_located"] for r in data["routes"]),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
