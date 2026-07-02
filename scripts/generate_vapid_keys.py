"""One-off dev tool: generate a VAPID keypair for Web Push and print both
keys base64url-encoded, ready to paste into .env as VAPID_PUBLIC_KEY /
VAPID_PRIVATE_KEY. Not shipped to production — run once per deployment.

Usage: python scripts/generate_vapid_keys.py
"""
import base64

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def main():
    v = Vapid()
    v.generate_keys()

    # Raw 32-byte private key scalar (what py_vapid's Vapid.from_string expects).
    private_numbers = v.private_key.private_numbers()
    private_raw = private_numbers.private_value.to_bytes(32, "big")

    # Raw 65-byte uncompressed public key point (what the browser's
    # PushManager.subscribe({applicationServerKey}) expects).
    public_raw = v.public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )

    print("VAPID_PUBLIC_KEY=" + _b64url(public_raw))
    print("VAPID_PRIVATE_KEY=" + _b64url(private_raw))
    print()
    print("Paste both lines into your .env file.")


if __name__ == "__main__":
    main()
