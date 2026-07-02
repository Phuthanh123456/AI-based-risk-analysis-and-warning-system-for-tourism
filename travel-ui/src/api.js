export const API_BASE = "";

async function _handleResponse(r) {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.detail || data?.error || JSON.stringify(data);
    throw new Error(msg);
  }
  return data;
}

function _networkError(networkErr) {
  return new Error(
    "Không kết nối được server. Kiểm tra backend đang chạy tại http://127.0.0.1:8000 (lỗi: " + networkErr.message + ")"
  );
}

export async function apiGet(path, token) {
  let r;
  try {
    r = await fetch(`${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch (networkErr) {
    throw _networkError(networkErr);
  }
  return _handleResponse(r);
}

export async function apiPost(path, body, token) {
  let r;
  try {
    r = await fetch(`${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body || {}),
    });
  } catch (networkErr) {
    throw _networkError(networkErr);
  }
  return _handleResponse(r);
}

export async function apiDelete(path, token) {
  let r;
  try {
    r = await fetch(`${path}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch (networkErr) {
    throw _networkError(networkErr);
  }
  return _handleResponse(r);
}
