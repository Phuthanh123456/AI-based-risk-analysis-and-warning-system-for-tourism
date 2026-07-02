"""Vietnamese province/city name -> location_encoded lookup, migrated from
the old print-based test_lookup_v2.py into real pytest assertions."""
import pytest

from src.api.weather_ai import _lookup_location_encoded as lookup_ai
from src.integrations.weather.main import _lookup_location_encoded as lookup_main

CASES = [
    # Exact canonical names
    ("Hà Nội", 23),
    ("Lâm Đồng", 34),
    ("TP. Hồ Chí Minh", 57),
    ("Bà Rịa - Vũng Tàu", 1),
    ("Thừa Thiên Huế", 55),
    # Case-insensitive
    ("hà nội", 23),
    ("lâm đồng", 34),
    # Non-accented (stripped diacritics)
    ("Ha Noi", 23),
    ("Lam Dong", 34),
    ("Da Nang", 14),
    ("Khanh Hoa", 30),
    ("Binh Dinh", 7),
    # Special aliases - HCM
    ("TPHCM", 57),
    ("tphcm", 57),
    ("Sài Gòn", 57),
    ("saigon", 57),
    ("Ho Chi Minh", 57),
    ("Thành phố Hồ Chí Minh", 57),
    # Special aliases - Vũng Tàu
    ("Vũng Tàu", 1),
    ("vung tau", 1),
    ("Ba Ria Vung Tau", 1),
    # Special aliases - Huế
    ("Huế", 55),
    ("hue", 55),
    ("Thua Thien Hue", 55),
    # Special aliases - cities -> province
    ("Đà Lạt", 34),
    ("da lat", 34),
    ("dalat", 34),
    ("Nha Trang", 30),
    ("nha trang", 30),
    ("Hội An", 45),
    ("hoi an", 45),
    ("Quy Nhơn", 7),
    ("quy nhon", 7),
    ("SaPa", 36),
    ("Phú Quốc", 31),
    ("phu quoc", 31),
    # Long address strings with commas
    ("Tp. Đà Lạt, Đà Lạt, Lâm Đồng, Việt Nam", 34),
    ("Nha Trang, Khánh Hòa, Việt Nam", 30),
    ("Quận 1, TP. Hồ Chí Minh, Việt Nam", 57),
    ("Thành phố Huế, Thừa Thiên Huế, Việt Nam", 55),
    ("Hội An, Quảng Nam, Việt Nam", 45),
    # With Vietnamese prefixes
    ("Tỉnh Lâm Đồng", 34),
    ("Thành phố Đà Nẵng", 14),
    ("TP. Cần Thơ", 12),
    ("Tp Hải Phòng", 26),
    # Longest match priority
    ("Hòa Bình", 28),
    ("Ninh Bình", 40),
    # Unknown / garbage -> safety net (returns 0)
    ("Unknown", 0),
    ("", 0),
    ("Planet Mars", 0),
    ("New York City", 0),
]


@pytest.mark.parametrize("input_str,expected", CASES)
def test_lookup_location_encoded_weather_ai(input_str, expected):
    assert lookup_ai(input_str) == expected


@pytest.mark.parametrize("input_str,expected", CASES)
def test_lookup_location_encoded_main(input_str, expected):
    assert lookup_main(input_str) == expected
