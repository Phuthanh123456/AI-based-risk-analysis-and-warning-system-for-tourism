# src/api/notifications.py
"""
Self-hosted Web Push (VAPID) — no external push provider account needed.
Frontend polls /check-now while a tab is open (or via a manual button);
no Celery/Redis/background scheduler. See scripts/push_weather_check.py
for an optional cron-driven variant that checks ALL subscriptions.
"""
import json
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
from pywebpush import webpush, WebPushException

from src.api.config import VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CONTACT_EMAIL
from src.api.auth import get_current_user
from src.api.db import (
    save_push_subscription, delete_push_subscription, list_push_subscriptions_for_user,
)
from src.api.weather_ai import assess_weather_risk

SEVERE_RISK_THRESHOLD = 7  # risk_score >= this triggers a push

notification_router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class SubscriptionKeys(BaseModel):
    p256dh: str
    auth: str


class SubscribePayload(BaseModel):
    endpoint: str
    keys: SubscriptionKeys
    destination: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None


class UnsubscribePayload(BaseModel):
    endpoint: str


@notification_router.get("/vapid-public-key")
def get_vapid_public_key():
    return {"publicKey": VAPID_PUBLIC_KEY}


@notification_router.post("/subscribe")
def subscribe(payload: SubscribePayload = Body(...), current_user: dict = Depends(get_current_user)):
    if not VAPID_PUBLIC_KEY or not VAPID_PRIVATE_KEY:
        raise HTTPException(status_code=503, detail="Push notifications not configured on this server")
    save_push_subscription(
        current_user["id"], payload.endpoint, payload.keys.p256dh, payload.keys.auth,
        watched_destination=payload.destination, watched_lat=payload.lat, watched_lon=payload.lon,
    )
    return {"subscribed": True}


@notification_router.post("/unsubscribe")
def unsubscribe(payload: UnsubscribePayload = Body(...), current_user: dict = Depends(get_current_user)):
    delete_push_subscription(payload.endpoint)
    return {"unsubscribed": True}


def _send_push(sub: dict, title: str, body: str) -> bool:
    try:
        webpush(
            subscription_info={
                "endpoint": sub["endpoint"],
                "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
            },
            data=json.dumps({"title": title, "body": body}, ensure_ascii=False),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={"sub": VAPID_CONTACT_EMAIL},
        )
        return True
    except WebPushException as e:
        print(f"[push] Failed to send to {sub['endpoint'][:60]}...: {e}")
        return False


@notification_router.post("/check-now")
def check_now(current_user: dict = Depends(get_current_user)):
    """Re-assess weather risk for this user's watched destinations and push
    an alert for any that are currently severe. Called by the frontend
    (button or periodic poll while the tab is open) — no server-side cron."""
    if not VAPID_PUBLIC_KEY or not VAPID_PRIVATE_KEY:
        raise HTTPException(status_code=503, detail="Push notifications not configured on this server")

    subs = list_push_subscriptions_for_user(current_user["id"])
    checked, alerted = 0, 0
    for sub in subs:
        if sub["watched_lat"] is None or sub["watched_lon"] is None:
            continue
        checked += 1
        risk = assess_weather_risk(sub["watched_lat"], sub["watched_lon"], purpose="standard")
        if risk and risk["risk_score"] >= SEVERE_RISK_THRESHOLD:
            title = f"⚠️ Cảnh báo thời tiết: {sub['watched_destination'] or 'điểm đến của bạn'}"
            body = risk["message"]
            if _send_push(sub, title, body):
                alerted += 1

    return {"checked": checked, "alerted": alerted}
