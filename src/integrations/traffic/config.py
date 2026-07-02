# src/integrations/traffic/config.py
import os

# ============================================================
# 1) SERPAPI KEY
# ============================================================
# Set via env var SERPAPI_KEYS (comma-separated, for key rotation) or
# SERPAPI_KEY in your .env file — see .env.example. Never hardcode real
# keys here; this file is committed to git.
SERPAPI_KEY = []

# ============================================================
# 2) PATHS
# ============================================================
# PROJECT ROOT = .../src/integrations/traffic/../../..
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, "..", "..", ".."))

# CSV file bạn đã đặt ở data/external/
CSV_FILE_PATH = os.path.join(PROJECT_ROOT, "data", "external", "accidents.csv")

# (CLI cũ mới cần, web/FastAPI thường không dùng)
LOCATION_FILE_PATH = os.path.join(PROJECT_ROOT, "data", "external", "my_location.json")
