"""Inspect candidate heritage records in Vietnam's 10/2022/TT-BTNMT gazette.

The publication provides *relative central coordinates* rounded to arcseconds.
This script is a research aide, not a geocoding or front-entrance verifier.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import fitz


NAMES = [
    "chùa Bà Nành",
    "đình Thanh Miến",
    "chùa Ngọc Hồ",
    "Văn Miếu - Quốc Tử Giám",
    "chùa Tiên Phúc",
    "chùa Phổ Giác",
    "Y Miếu",
    "đền Mẫu Sòng Sơn",
    "Hồ Văn",
    "chùa Quang Minh",
    "đền Đức Thánh Trần",
    "chùa Tiên Tích",
    "Lương Sử",
    "đền Văn Chỉ",
    "đình Văn Hương",
    "chùa Huy Văn",
    "chùa Linh Quang",
    "chùa Bụt Mọc",
    "chùa Liên Hoa",
    "chùa Linh Ứng",
    "đền Trung Tả",
    "Khâm Thiên",
    "đền Khâm Đức",
    "chùa Phụng Thánh",
    "đình Khâm Đức",
    "chùa Mỹ Quang",
    "đình Trung Kính",
    "đình Thổ Quan",
    "đình Thái Kiều",
    "đền Trung Phụng",
    "chùa Trung Tự",
    "đình Trung Tự",
    "đền Kim Liên",
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    args = parser.parse_args()
    doc = fitz.open(args.pdf)
    pages = [(index, page.get_text()) for index, page in enumerate(doc)]
    for name in NAMES:
        hits = []
        for index, text in pages:
            loc = text.casefold().find(name.casefold())
            if loc >= 0:
                nearby = " ".join(text[loc:loc + 200].split())
                hits.append((index + 1, nearby))
        print(f"\n{name} — {len(hits)} match(es)")
        for page, snippet in hits[:5]:
            print(f"  PDF p.{page}: {snippet}")


if __name__ == "__main__":
    main()
