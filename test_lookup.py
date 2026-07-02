import sys
sys.path.insert(0, '.')
from src.integrations.weather.main import _lookup_location_encoded
print(f"Ha Noi: {_lookup_location_encoded('Ha Noi')}")
print(f"Exact: {_lookup_location_encoded('Hà Nội')}")
print(f"Lower: {_lookup_location_encoded('hà nội')}")
print(f"Unknown: {_lookup_location_encoded('Unknown')}")
print(f"DONE")
