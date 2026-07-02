import requests

# Change this if your backend is running elsewhere
API_URL = "http://127.0.0.1:8000/weather/ai"

sample_payload = {
    "province": "Lâm Đồng",
    "temperature": 22.5,
    "humidity": 85,
    "precipitation": 10,
    "wind": 5,
    "pm25": 15,
    "visibility_km": 8,
    "uv_index": 6
}

def main():
    print(f"Sending POST to {API_URL} with payload:")
    print(sample_payload)
    resp = requests.post(API_URL, json=sample_payload)
    print("Response status:", resp.status_code)
    try:
        print("Response JSON:", resp.json())
    except Exception as e:
        print("Failed to parse JSON:", e)
        print("Raw response:", resp.text)

if __name__ == "__main__":
    main()
