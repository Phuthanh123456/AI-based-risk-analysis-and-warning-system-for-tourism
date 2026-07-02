"""Test bulletproof Vietnamese location matching."""
import sys
sys.path.insert(0, '.')

from src.api.weather_ai import _lookup_location_encoded as lookup_ai
from src.integrations.weather.main import _lookup_location_encoded as lookup_main

def test(label, fn, input_str, expected):
    result = fn(input_str)
    status = "✅" if result == expected else "❌"
    print(f"  {status} {label}: '{input_str}' → {result} (expected {expected})")
    return result == expected

pass_count = 0
fail_count = 0

for name, fn in [("weather_ai", lookup_ai), ("main.py", lookup_main)]:
    print(f"\n===== Testing {name} =====")
    tests = [
        # Exact canonical names
        ("Exact accented", "Hà Nội", 23),
        ("Exact accented", "Lâm Đồng", 34),
        ("Exact accented", "TP. Hồ Chí Minh", 57),
        ("Exact accented", "Bà Rịa - Vũng Tàu", 1),
        ("Exact accented", "Thừa Thiên Huế", 55),

        # Case-insensitive
        ("Case insensitive", "hà nội", 23),
        ("Case insensitive", "lâm đồng", 34),

        # Non-accented (stripped diacritics)
        ("No accent", "Ha Noi", 23),
        ("No accent", "Lam Dong", 34),
        ("No accent", "Da Nang", 14),
        ("No accent", "Khanh Hoa", 30),
        ("No accent", "Binh Dinh", 7),

        # Special aliases - HCM
        ("Alias HCM", "TPHCM", 57),
        ("Alias HCM", "tphcm", 57),
        ("Alias HCM", "Sài Gòn", 57),
        ("Alias HCM", "saigon", 57),
        ("Alias HCM", "Ho Chi Minh", 57),
        ("Alias HCM", "Thành phố Hồ Chí Minh", 57),

        # Special aliases - Vũng Tàu
        ("Alias VT", "Vũng Tàu", 1),
        ("Alias VT", "vung tau", 1),
        ("Alias VT", "Ba Ria Vung Tau", 1),

        # Special aliases - Huế
        ("Alias Hue", "Huế", 55),
        ("Alias Hue", "hue", 55),
        ("Alias Hue", "Thua Thien Hue", 55),

        # Special aliases - cities → province
        ("Alias city", "Đà Lạt", 34),
        ("Alias city", "da lat", 34),
        ("Alias city", "dalat", 34),
        ("Alias city", "Nha Trang", 30),
        ("Alias city", "nha trang", 30),
        ("Alias city", "Hội An", 45),
        ("Alias city", "hoi an", 45),
        ("Alias city", "Quy Nhơn", 7),
        ("Alias city", "quy nhon", 7),
        ("Alias city", "SaPa", 36),
        ("Alias city", "Phú Quốc", 31),
        ("Alias city", "phu quoc", 31),

        # Long address strings with commas
        ("Long addr", "Tp. Đà Lạt, Đà Lạt, Lâm Đồng, Việt Nam", 34),
        ("Long addr", "Nha Trang, Khánh Hòa, Việt Nam", 30),
        ("Long addr", "Quận 1, TP. Hồ Chí Minh, Việt Nam", 57),
        ("Long addr", "Thành phố Huế, Thừa Thiên Huế, Việt Nam", 55),
        ("Long addr", "Hội An, Quảng Nam, Việt Nam", 45),

        # With Vietnamese prefixes
        ("Prefix strip", "Tỉnh Lâm Đồng", 34),
        ("Prefix strip", "Thành phố Đà Nẵng", 14),
        ("Prefix strip", "TP. Cần Thơ", 12),
        ("Prefix strip", "Tp Hải Phòng", 26),

        # NFC normalization edge cases (composed vs decomposed)
        ("NFC", "Đà Lạt", 34),  # pre-composed
        
        # Longest match priority: "Hòa Bình" vs partial matches
        ("Longest", "Hòa Bình", 28),
        ("Longest", "Ninh Bình", 40),

        # Unknown / garbage → safety net (returns 0)
        ("Safety net", "Unknown", 0),
        ("Safety net", "", 0),
        ("Safety net", "Planet Mars", 0),
        ("Safety net", "New York City", 0),
    ]

    for label, inp, expected in tests:
        if test(label, fn, inp, expected):
            pass_count += 1
        else:
            fail_count += 1

print(f"\n{'='*50}")
print(f"Results: {pass_count} passed, {fail_count} failed out of {pass_count + fail_count}")
if fail_count == 0:
    print("🎉 ALL TESTS PASSED!")
else:
    print(f"⚠️  {fail_count} test(s) failed!")
