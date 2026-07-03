# Backend: FastAPI + Uvicorn
FROM python:3.11-slim

WORKDIR /app

# System deps for scientific Python wheels (xgboost, scikit-learn) build faster
# with these present even when prebuilt wheels are used.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Bind to $PORT when the host provides one (Railway, Render), else default to
# 8000 (docker-compose, local). Shell form so the env var expands.
CMD uvicorn src.api.app:app --host 0.0.0.0 --port ${PORT:-8000}
