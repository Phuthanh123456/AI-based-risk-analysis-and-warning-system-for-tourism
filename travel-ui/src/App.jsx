import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import polyline from "@mapbox/polyline";
import { motion } from "framer-motion";
import "./App.css";
import { subscribeToPush, isPushSupported } from "./push";
import { LandingPage } from "./screens/LandingPage";
import { RegisterScreen } from "./screens/RegisterScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { TripPurposeModal, TRIP_PURPOSES } from "./components/TripPurposeModal";


const API_BASE = "";
const VN_CENTER = [16.2, 107.8];

// ===== Fix default Leaflet marker asset issue in Vite =====
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ===== Custom markers (đậm & chuyên nghiệp hơn) =====
const dotSvg = (fill, stroke = "rgba(255,255,255,0.9)", glow = false) => `
<svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
  ${
    glow
      ? `<circle cx="15" cy="15" r="13" fill="${fill}" opacity="0.18"/>`
      : ""
  }
  <circle cx="15" cy="15" r="10" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
  <circle cx="15" cy="15" r="3.4" fill="rgba(0,0,0,0.20)"/>
</svg>`;

function makeDivIcon(fill, opts = {}) {
  const { glow = false, pulseClass = "" } = opts;
  return L.divIcon({
    className: pulseClass,
    html: dotSvg(fill, "rgba(255,255,255,0.92)", glow),
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -12],
  });
}

// Base icons
const ICONS = {
  province: makeDivIcon("#3B82F6"),        // xanh
  provinceActive: makeDivIcon("#2563EB"),  // xanh đậm
  user: makeDivIcon("#EF4444", { glow: true, pulseClass: "pulse-marker-red" }),  // đỏ + pulse
  dest: makeDivIcon("#2563EB", { glow: true, pulseClass: "pulse-marker-blue" }), // xanh + pulse
};

// ===== helpers =====
function fmt(n, d = 6) {
  if (n === null || n === undefined) return "";
  const x = Number(n);
  if (Number.isNaN(x)) return String(n);
  return x.toFixed(d);
}

function calculateSuitabilityStars(riskScore, adjustedScore) {
  const score = Number(adjustedScore != null ? adjustedScore : riskScore);
  if (isNaN(score) || score === null || score === undefined) return "—";
  if (score <= 2.0) return "⭐⭐⭐⭐⭐";
  if (score <= 4.0) return "⭐⭐⭐⭐";
  if (score <= 6.0) return "⭐⭐⭐";
  if (score <= 8.0) return "⭐⭐";
  return "⭐";
}

function _starCount(riskScore, adjustedScore) {
  const s = Number(adjustedScore != null ? adjustedScore : riskScore);
  if (isNaN(s)) return 0;
  if (s <= 2) return 5;
  if (s <= 4) return 4;
  if (s <= 6) return 3;
  if (s <= 8) return 2;
  return 1;
}

const _WEEKLY_MSGS_EXCELLENT = [
  "Ồ! Thời tiết tuyệt đẹp, chuyến đi 7 ngày tới của bạn sẽ cực kỳ suôn sẻ đó! ✨",
  "Trời ơi tin được không? Cả tuần tới đều là nắng đẹp, xách vali lên và đi ngay thôi! ✈️",
  "Thời tiết không thể lý tưởng hơn, chuẩn bị tinh thần cho những bức ảnh check-in để đời nhé! 📸",
  "Dự báo cho thấy một tuần ngập tràn ánh nắng và sự thuận lợi đang chờ đón bạn. ☀️",
];
const _WEEKLY_MSGS_GOOD = [
  "Thời tiết khá ổn, có vài ngày không lý tưởng nhưng nhìn chung vẫn đi chơi được nhé. 👍",
  "Tổng quan thì tuần tới khá ổn, bạn chỉ cần lưu ý tránh các hoạt động ngoài trời vào những ngày ít sao thôi. 🌤️",
  "Chuyến đi sẽ có chút biến động về thời tiết, nhưng đừng lo, đa số các ngày vẫn rất tuyệt! 🚐",
  "Không quá hoàn hảo nhưng vẫn là thời gian tốt để bắt đầu hành trình của bạn. 🎒",
];
const _WEEKLY_MSGS_POOR = [
  "Cân nhắc nhé, thời tiết tuần tới có vẻ không ủng hộ chuyến đi của bạn lắm đâu. 🌧️",
  "Dự báo có nhiều ngày rủi ro cao, bạn nên chuẩn bị sẵn phương án dự phòng trong nhà nhé. ☔",
  "Tuần tới có vẻ hơi \"khó chiều\", nếu được hãy cân nhắc dời lịch sang tuần sau để có trải nghiệm tốt nhất. ⚠️",
  "Thời tiết khá xấu cho các hoạt động di chuyển đường dài, hãy chú trọng an toàn hàng đầu nhé! 🛑",
];

function getWeeklySummary(forecastArr) {
  if (!forecastArr || !forecastArr.length) return "";
  const highDays = forecastArr.filter((d) => _starCount(d.risk_score, d.adjusted_risk_score) >= 4).length;
  let pool;
  if (highDays >= 6) pool = _WEEKLY_MSGS_EXCELLENT;
  else if (highDays >= 3) pool = _WEEKLY_MSGS_GOOD;
  else pool = _WEEKLY_MSGS_POOR;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function apiGet(path, token) {
  let r;
  try {
    r = await fetch(`${API_BASE}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch (networkErr) {
    // Network error = server chưa chạy, CORS block, hoặc mất mạng
    throw new Error(
      "Không kết nối được server. Kiểm tra backend đang chạy tại " +
        API_BASE +
        " (lỗi: " +
        networkErr.message +
        ")"
    );
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.detail || data?.error || JSON.stringify(data);
    throw new Error(msg);
  }
  return data;
}

async function apiDelete(path, token) {
  let r;
  try {
    r = await fetch(`${API_BASE}${path}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch (networkErr) {
    throw new Error(
      "Không kết nối được server. Kiểm tra backend đang chạy tại " +
        API_BASE +
        " (lỗi: " +
        networkErr.message +
        ")"
    );
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.detail || data?.error || JSON.stringify(data);
    throw new Error(msg);
  }
  return data;
}

function FixLeafletResize() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds || bounds.length < 2) return;
    map.fitBounds(bounds, { padding: [30, 30] });
  }, [map, bounds]);
  return null;
}

// ===== map controller (fly/fit) =====
function MapController({ action }) {
  const map = useMap();
  useEffect(() => {
    if (!action) return;

    if (action.type === "flyTo" && action.center) {
      const zoom = Number(action.zoom ?? map.getZoom() ?? 8);
      map.flyTo(action.center, zoom, { duration: 0.8 });
    }

    if (action.type === "fitBounds" && action.bounds?.length >= 2) {
      map.fitBounds(action.bounds, { padding: [30, 30] });
    }

    if (action.type === "resetVN") {
      map.flyTo(VN_CENTER, 6, { duration: 0.8 });
    }
  }, [action, map]);
  return null;
}

// ===== Map cursor pulse/trail effect =====
function MapCursorEffect() {
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Listen on the parent (the map wrapper div) so we don't block map interactions
    const parent = el.parentElement;
    if (!parent) return;

    function handleMove(e) {
      const rect = parent.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Create a trail dot inside our pointer-events:none overlay
      const dot = document.createElement("div");
      dot.className = "map-cursor-trail";
      dot.style.left = x + "px";
      dot.style.top = y + "px";
      el.appendChild(dot);

      // Remove after animation completes
      setTimeout(() => {
        if (dot.parentNode) dot.parentNode.removeChild(dot);
      }, 600);
    }

    parent.addEventListener("mousemove", handleMove);
    return () => {
      parent.removeEventListener("mousemove", handleMove);
    };
  }, []);

  return (
    <>
      <style>{`
        .map-cursor-zone { position: absolute; inset: 0; pointer-events: none; z-index: 410; overflow: hidden; border-radius: 14px; }
        .map-cursor-trail {
          position: absolute;
          width: 12px; height: 12px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(59,130,246,0.45) 0%, rgba(59,130,246,0) 70%);
          transform: translate(-50%, -50%) scale(1);
          pointer-events: none;
          animation: cursor-pulse-fade 0.6s ease-out forwards;
        }
        @keyframes cursor-pulse-fade {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 0.7; }
          100% { transform: translate(-50%, -50%) scale(3); opacity: 0; }
        }
        @keyframes loading-dot {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }
      `}</style>
      <div ref={containerRef} className="map-cursor-zone" />
    </>
  );
}

function riskLabel(score) {
  const s = Number(score || 0);
  if (s >= 7) return { text: "Rủi ro rất cao", color: "#EF4444" };
  if (s >= 4) return { text: "Rủi ro cao", color: "#F97316" };
  if (s >= 2) return { text: "Rủi ro trung bình", color: "#F59E0B" };
  return { text: "Rủi ro thấp", color: "#22C55E" };
}

function trafficColor(status = "") {
  if (status.includes("heavy") || status.includes("🔴")) return "#EF4444";
  if (status.includes("moderate") || status.includes("🟠")) return "#F97316";
  return "#22C55E";
}

// ===== Nearest province by haversine =====
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function nearestProvince(userPos, provinces) {
  if (!userPos || !provinces?.length) return null;
  let best = null;
  let bestD = Infinity;
  for (const p of provinces) {
    const d = haversineKm(userPos.lat, userPos.lon, p.lat, p.lon);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best ? { ...best, distance_km: bestD } : null;
}

// ===== polyline decode helper =====
function decodeRoutePolyline(enc, type) {
  // type: "polyline" or "polyline6" (from backend)
  // @mapbox/polyline supports precision param as 2nd argument.
  if (!enc || typeof enc !== "string" || enc.length < 10) return [];
  try {
    if (String(type || "").toLowerCase() === "polyline6") {
      return polyline.decode(enc, 6); // precision=6
    }
    return polyline.decode(enc); // default precision=5
  } catch {
    return [];
  }
}



export default function App() {
  // ===== LOGIN (new) =====
  const [session, setSession] = useState(() => {
    try {
      // Check if this is first page load (not a reload within same session)
      const isLoggedInSession = sessionStorage.getItem("va_logged_in_session");
      
      // If no session flag in sessionStorage, clear localStorage session (first load)
      if (!isLoggedInSession) {
        localStorage.removeItem("va_session");
        return null;
      }
      
      // Otherwise, restore from localStorage
      const s = localStorage.getItem("va_session");
      if (!s) return null;
      const parsed = JSON.parse(s);
      // Session expiration: 24 hours
      const expirationMs = 24 * 60 * 60 * 1000;
      if (parsed.ts && Date.now() - parsed.ts > expirationMs) {
        // Session expired, remove it
        localStorage.removeItem("va_session");
        sessionStorage.removeItem("va_logged_in_session");
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  });

  // Control whether we show the landing page or the login screen
  // const [showLanding, setShowLanding] = useState(true);

  // ===== Control Navigation (SỬA Ở ĐÂY) =====
  // Trạng thái màn hình: 'landing' | 'login' | 'register'
  const [currentScreen, setCurrentScreen] = useState('landing');

  // ===== Trip history (requires login) =====
  const [tripHistory, setTripHistory] = useState([]);
  const [tripHistoryLoading, setTripHistoryLoading] = useState(false);
  const [showTripHistory, setShowTripHistory] = useState(false);

  async function loadTripHistory() {
    if (!session?.token) return;
    setTripHistoryLoading(true);
    try {
      const data = await apiGet("/api/trip-history", session.token);
      setTripHistory(data.results || []);
    } catch {
      // silently ignore — trip history is a nice-to-have, not core flow
    } finally {
      setTripHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (session?.token) loadTripHistory();
  }, [session?.token]);

  async function deleteTripHistoryEntry(id) {
    if (!session?.token) return;
    try {
      await apiDelete(`/api/trip-history/${id}`, session.token);
      setTripHistory((prev) => prev.filter((t) => t.id !== id));
    } catch {}
  }

  // ===== Web Push: severe weather alerts for the current trip destination =====
  const [pushStatus, setPushStatus] = useState(""); // "", "loading", "enabled", "denied", "error"

  async function enableWeatherAlerts() {
    if (!session?.token || !tripRes?.to) return;
    setPushStatus("loading");
    try {
      const ok = await subscribeToPush(session.token, {
        destination: tripRes.to.name,
        lat: tripRes.to.lat,
        lon: tripRes.to.lon,
      });
      setPushStatus(ok ? "enabled" : "denied");
    } catch {
      setPushStatus("error");
    }
  }

  // Nếu chưa login -> show màn hình tương ứng
  if (!session) {
    if (currentScreen === 'landing') {
      return (
        <LandingPage 
          onGoToLogin={() => setCurrentScreen('login')} 
          onGoToRegister={() => setCurrentScreen('register')} 
        />
      );
    }
    if (currentScreen === 'register') {
      return (
        <RegisterScreen 
          onRegister={login} // Tự động đăng nhập sau khi đăng ký xong
          onBack={() => setCurrentScreen('landing')} 
          onGoToLogin={() => setCurrentScreen('login')}
        />
      );
    }
    // Mặc định là login
    return (
      <LoginScreen 
        onLogin={login} 
        onBack={() => setCurrentScreen('landing')} 
        onGoToRegister={() => setCurrentScreen('register')}
      />
    );
  }

  function login(user) {
    const s = { user, ts: Date.now() };
    setSession(s);
    try {
      localStorage.setItem("va_session", JSON.stringify(s));
      // Mark this as a logged-in session in sessionStorage (persists across reload)
      sessionStorage.setItem("va_logged_in_session", "true");
    } catch {}
    // Restore dashboard theme from localStorage or set default to light
    try {
      const savedTheme = localStorage.getItem("va_theme") || "light";
      setTheme(savedTheme);
      // Apply theme to DOM immediately
      if (savedTheme === "light") {
        document.documentElement.removeAttribute("data-theme");
      } else {
        document.documentElement.setAttribute("data-theme", savedTheme);
      }
    } catch {}
    // Auto reload after 100ms to ensure session is saved and theme is applied
    setTimeout(() => {
      window.location.reload();
    }, 100);
  }

  function logout() {
    // Reset theme immediately on DOM
    try {
      document.documentElement.removeAttribute("data-theme");
      localStorage.removeItem("va_theme");
    } catch {}
    // Clear all session data
    try {
      localStorage.removeItem("va_session");
      sessionStorage.removeItem("va_logged_in_session");
    } catch {}
    // Reset state
    setSession(null);
    setCurrentScreen('landing');
    setTheme('light');
    // Auto reload after 50ms to ensure clean state
    setTimeout(() => {
      window.location.reload();
    }, 50);
  }

  // ===== data =====
  const [provinces, setProvinces] = useState([]); // {province, lat, lon}
  const [selectedProv, setSelectedProv] = useState(null);
  const [selectedRisk, setSelectedRisk] = useState(null);

  // ===== user gps =====
  const [gpsLoading, setGpsLoading] = useState(false);
  const [userPos, setUserPos] = useState(null); // {lat, lon}
  const [userNearestProv, setUserNearestProv] = useState(null); // {province, lat, lon, distance_km}
  const [userRisk, setUserRisk] = useState(null);


  // ===== trip =====
  const [destination, setDestination] = useState("Đà Lạt");
  const [tripLoading, setTripLoading] = useState(false);
  const [tripRes, setTripRes] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]); // [[lat,lon],...]

  // ===== trip purpose =====
  const [tripPurpose, setTripPurpose] = useState(null); // "dating" | "family" | "adventure" | "solo" | null
  const [showPurposeModal, setShowPurposeModal] = useState(false);
  const [pendingPurpose, setPendingPurpose] = useState(null); // selection inside modal before confirm

  // ===== 7-day forecast =====
  const [forecastData, setForecastData] = useState([]); // array of daily forecast items from /weather/ai/forecast
  const [forecastLoading, setForecastLoading] = useState(false);
  const [selectedDateIndex, setSelectedDateIndex] = useState(0); // which day is selected (0 = today)
  const [weeklySummaryMsg, setWeeklySummaryMsg] = useState(""); // randomized weekly summary sentence

  // ===== ui =====
  const [err, setErr] = useState("");
  const mapRef = useRef(null);

  // ===== NEW: map action controller =====
  const [mapAction, setMapAction] = useState(null);

  // ===== NEW: search province =====
  const [provQuery, setProvQuery] = useState("");

  // ===== NEW: cache risk to reduce API calls =====
  const riskCacheRef = useRef(new Map()); // key: province -> risk json

  // ===== NEW: toggle province panel slide =====
  const [showProvincePanel, setShowProvincePanel] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showDirectionsWarning, setShowDirectionsWarning] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);

  // ===== theme (dark / light) - default is LIGHT =====
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    try {
      if (theme === "light") {
        document.documentElement.removeAttribute("data-theme");
      } else {
        document.documentElement.setAttribute("data-theme", theme);
      }
      localStorage.setItem("va_theme", theme);
    } catch {}
  }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }


  // Load provinces points from backend
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErr("");
        const data = await apiGet("/map/points");
        if (!alive) return;
        setProvinces(data?.points || []);
      } catch (e) {
        if (!alive) return;
        setErr(`Load provinces lỗi: ${String(e.message || e)}`);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const markersCount = provinces.length;

  async function getRiskCached(prov) {
    const key = String(prov || "").trim();
    if (!key) return null;

    if (riskCacheRef.current.has(key)) return riskCacheRef.current.get(key);

    const r = await apiGet(`/risk?place=${encodeURIComponent(key)}`);
    riskCacheRef.current.set(key, r);
    return r;
  }

  // When select province -> fetch risk (cached)
  async function onPickProvince(p, opts = {}) {
    try {
      setErr("");
      setSelectedProv(p);
      setSelectedRisk(null);

      const r = await getRiskCached(p.province);
      setSelectedRisk(r);

      // NEW: fly to province
      if (opts.fly) {
        setMapAction({
          type: "flyTo",
          center: [p.lat, p.lon],
          zoom: 8,
          ts: Date.now(),
        });
      }
    } catch (e) {
      setErr(`Load risk lỗi: ${String(e.message || e)}`);
    }
  }

  async function loadUserRiskByNearest(pos) {
    const near = nearestProvince(pos, provinces);
    setUserNearestProv(near);

    if (!near?.province) {
      setUserRisk(null);
      return;
    }

    try {
      const r = await getRiskCached(near.province);
      setUserRisk(r);
    } catch (e) {
      setErr(`Load user risk lỗi: ${String(e.message || e)}`);
      setUserRisk(null);
    }
  }

  async function getGPS() {
    setErr("");
    setGpsLoading(true);

    if (!navigator.geolocation) {
      setErr("Trình duyệt không hỗ trợ GPS.");
      setGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const lat = p.coords.latitude;
        const lon = p.coords.longitude;
        const pos = { lat, lon };

        setUserPos(pos);
        setGpsLoading(false);

        // focus to user
        setMapAction({
          type: "flyTo",
          center: [lat, lon],
          zoom: 10,
          ts: Date.now(),
        });

        // ✅ nearest province + user risk
        if (provinces?.length) {
          await loadUserRiskByNearest(pos);
        } else {
          setUserNearestProv(null);
          setUserRisk(null);
        }
      },
      (e) => {
        setErr("GPS Error: " + e.message);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  // Nếu user đã có GPS nhưng provinces load sau -> tự load userRisk
  useEffect(() => {
    if (userPos && provinces?.length) {
      loadUserRiskByNearest(userPos);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provinces]);

  const canTrip = useMemo(() => {
    return destination.trim().length > 0 && userPos?.lat && userPos?.lon;
  }, [destination, userPos]);

  // Called when user clicks "Check Trip" button — open purpose modal first
  function handleCheckTripClick() {
    if (!userPos) {
      setErr("Chưa có GPS. Bấm 'Lấy GPS' trước.");
      return;
    }
    setPendingPurpose(tripPurpose);
    setShowPurposeModal(true);
  }

  // Called from purpose modal confirm, or "Bỏ qua"
  function handlePurposeConfirm() {
    setTripPurpose(pendingPurpose);
    setShowPurposeModal(false);
    runTrip(pendingPurpose);
  }

  function handlePurposeSkip() {
    setTripPurpose(null);
    setPendingPurpose(null);
    setShowPurposeModal(false);
    runTrip(null);
  }

  async function runTrip(purposeOverride) {
    if (!userPos) {
      setErr("Chưa có GPS. Bấm 'Lấy GPS' trước.");
      return;
    }
    const activePurpose = purposeOverride !== undefined ? purposeOverride : tripPurpose;
    setErr("");
    setTripLoading(true);
    setTripRes(null);
    setRouteCoords([]);
    setForecastData([]);
    setSelectedDateIndex(0);
    setWeeklySummaryMsg("");

    try {
      let url =
        `/trip?destination=${encodeURIComponent(destination)}` +
        `&lat=${encodeURIComponent(String(userPos.lat))}` +
        `&lon=${encodeURIComponent(String(userPos.lon))}`;
      if (activePurpose) {
        url += `&trip_purpose=${encodeURIComponent(activePurpose)}`;
      }

      const data = await apiGet(url, session?.token);
      setTripRes(data);
      if (session?.token) loadTripHistory();

      // ===== Route polyline decode (respect polyline vs polyline6) =====
      const enc = data?.traffic?.route_polyline;
      const typ = data?.traffic?.route_polyline_type; // "polyline" | "polyline6"
      const decoded = decodeRoutePolyline(enc, typ);

      if (decoded?.length >= 2) {
        setRouteCoords(decoded);
        // focus route
        setMapAction({ type: "fitBounds", bounds: decoded, ts: Date.now() });
      } else {
        // fallback: straight line A->B
        const a = [data?.from?.lat, data?.from?.lon];
        const b = [data?.to?.lat, data?.to?.lon];
        if (a[0] && a[1] && b[0] && b[1]) {
          const straight = [a, b];
          setRouteCoords(straight);
          setMapAction({ type: "fitBounds", bounds: straight, ts: Date.now() });
        }
      }

      // ===== Fetch 7-day forecast for destination (best-effort) =====
      try {
        setForecastLoading(true);
        // Prefer short name: user input > inferred province > full resolved name
        const cityName = destination.trim()
          || data?.to?.province_inferred
          || data?.to?.name
          || "Unknown";
        const provParam = data?.to?.province_inferred
          ? `&province=${encodeURIComponent(data.to.province_inferred)}`
          : "";
        const purposeParam = activePurpose
          ? `&trip_purpose=${encodeURIComponent(activePurpose)}`
          : "";
        const fcUrl = `/weather/ai/forecast?city=${encodeURIComponent(cityName)}&days=7${provParam}${purposeParam}`;
        const fcData = await apiGet(fcUrl);
        if (fcData?.daily?.length) {
          setForecastData(fcData.daily);
          setSelectedDateIndex(0);
          setWeeklySummaryMsg(getWeeklySummary(fcData.daily));
        }
      } catch (fcErr) {
        console.warn("[Forecast] Could not load 7-day forecast:", fcErr);
      } finally {
        setForecastLoading(false);
      }
    } catch (e) {
      setErr(`Trip lỗi: ${String(e.message || e)}`);
    } finally {
      setTripLoading(false);
    }
  }


  const fitBounds = useMemo(() => {
    // If route -> fit route, else keep VN center (đỡ zoom kỳ)
    if (routeCoords && routeCoords.length >= 2) return routeCoords;
    return [];
  }, [routeCoords]);

  const trafficStatus = tripRes?.traffic?.status || "";
  const trafficClr = trafficColor(trafficStatus);

  // ===== NEW: search helpers =====
  const filteredProvinces = useMemo(() => {
    const q = provQuery.trim().toLowerCase();
    if (!q) return provinces;
    return provinces.filter((p) => p.province.toLowerCase().includes(q));
  }, [provinces, provQuery]);

  function pickProvinceFromSearch(p) {
    setProvQuery("");
    onPickProvince(p, { fly: true });
  }

  // ===== NEW: map quick actions =====
  function resetVN() {
    // Xóa hết các địa điểm đã chọn
    setSelectedProv(null);
    setSelectedRisk(null);
    setDestination("");
    setTripRes(null);
    setRouteCoords([]);
    setForecastData([]);
    setSelectedDateIndex(0);
    setWeeklySummaryMsg("");
    setShowProvincePanel(false);
    setTripPurpose(null);
    setPendingPurpose(null);
    // Reset map view
    setMapAction({ type: "resetVN", ts: Date.now() });
  }
  function focusUser() {
    if (!userPos) return;
    setMapAction({ type: "flyTo", center: [userPos.lat, userPos.lon], zoom: 10, ts: Date.now() });
  }
  function focusRoute() {
    if (!routeCoords?.length) return;
    setMapAction({ type: "fitBounds", bounds: routeCoords, ts: Date.now() });
  }

  // Open Google Maps directions using available origin/destination
  function openGoogleDirections() {
    try {
      let url = "";
      if (userPos && tripRes?.to?.lat && tripRes?.to?.lon) {
        const o = `${userPos.lat},${userPos.lon}`;
        const d = `${tripRes.to.lat},${tripRes.to.lon}`;
        url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(o)}&destination=${encodeURIComponent(d)}&travelmode=driving`;
      } else if (userPos && destination) {
        const o = `${userPos.lat},${userPos.lon}`;
        const d = encodeURIComponent(destination);
        url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(o)}&destination=${d}&travelmode=driving`;
      } else if (tripRes?.to?.lat && tripRes?.to?.lon) {
        const d = `${tripRes.to.lat},${tripRes.to.lon}`;
        url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(d)}&travelmode=driving`;
      } else if (destination) {
        url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;
      }

      if (url) window.open(url, "_blank");
      else setShowDirectionsWarning(true);
    } catch (e) {
      setErr("Không thể mở chỉ đường: " + String(e.message || e));
    }
  }

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        margin: 0,
        padding: 0,
        boxSizing: "border-box",
        overflowX: "hidden",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
      }}
    >
      {/* Trip Purpose Modal */}
      <TripPurposeModal
        open={showPurposeModal}
        selected={pendingPurpose}
        onSelect={setPendingPurpose}
        onConfirm={handlePurposeConfirm}
        onClose={handlePurposeSkip}
      />

      {/* Top bar */}
      <div
        style={{
          padding: "10px 16px",
          color: "var(--text-heading)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          position: "relative",
          zIndex: 1001,
        }}
      >
        <div style={{ position: "relative", display: "inline-block" }}>
          <style>{`
            .header-decor { position: absolute; inset: -28px -64px -28px -64px; pointer-events: none; z-index: 0; overflow: hidden }
            .hdr-icon { position: absolute; width: 20px; height: 20px; opacity: 0.98 }
            .hdr-sway { animation: sway 3.6s ease-in-out infinite }
            @keyframes sway { 0% { transform: translateY(0) rotate(-6deg) } 50% { transform: translateY(-6px) rotate(6deg) } 100% { transform: translateY(0) rotate(-6deg) } }
            .hdr-float { animation: floaty 4s ease-in-out infinite }
            @keyframes floaty { 0% { transform: translateY(0) } 50% { transform: translateY(-6px) } 100% { transform: translateY(0) } }
          `}</style>

          {/* Decorative icons around header (driven by last trip weather if available) */}
          <div className="header-decor">
            {(() => {
              const hw = tripRes?.weather || tripRes?.weather_info;
              if (!hw || hw.error) return null;
              const precip = Number(hw.precipitation || 0);
              const uv = Number(hw.uv_index || 0);
              const isHeavy = precip >= 10;
              const isDrizzle = precip > 0 && precip < 10;
              const isSunny = !precip && uv >= 3;
              const isNight = !precip && uv < 3;

              if (isSunny) {
                return Array.from({ length: 10 }).map((_, i) => (
                  <svg key={`hs-${i}`} className="hdr-icon hdr-sway" style={{ left: 8 + (i * 28) % 260, top: -18 + ((i % 3) * 8), zIndex: 0 }} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="5" fill="#FFB300" />
                    {[0,45,90,135,180,225,270,315].map((a, idx) => (
                      <rect key={idx} x="11.5" y="1" width="1.2" height="4" fill="#FFB300" transform={`rotate(${a} 12 12)`} />
                    ))}
                  </svg>
                ));
              }

              if (isNight) {
                const moons = Array.from({ length: 3 + Math.floor(Math.random() * 2) });
                const clouds = Array.from({ length: 5 });
                const stars = Array.from({ length: 8 });
                return (
                  <>
                    {moons.map((_, i) => (
                      <svg key={`moon-${i}`} className="hdr-icon hdr-float" style={{ left: 6 + i * 42, top: -22 + (i % 2) * 6 }} viewBox="0 0 24 24" fill="#000000"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>
                    ))}
                    {clouds.map((_, i) => (
                      <svg key={`cloud-${i}`} className="hdr-icon hdr-sway" style={{ left: 30 + i * 36, top: -6 + (i % 2) * 8 }} viewBox="0 0 64 32" width="64" height="36" fill="#9CA3AF"><path d="M20 10c-2.76 0-5 2.24-5 5h30c0-3.87-3.13-7-7-7-1.03 0-2.01.2-2.92.56C33.7 6.71 29.19 4 24 4c-5.52 0-10 4.48-10 10z" opacity="0.95"/></svg>
                    ))}
                    {stars.map((_, i) => (
                      <svg key={`star-${i}`} className="hdr-icon" style={{ left: 14 + i * 30, top: -34 + (i % 3) * 6 }} viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="#FFD700" /></svg>
                    ))}
                  </>
                );
              }

              if (isHeavy || isDrizzle) {
                // lots of raindrop-like small lines around header
                const count = isHeavy ? 60 : 30;
                return Array.from({ length: count }).map((_, i) => (
                  <div key={`rhd-${i}`} style={{ position: 'absolute', left: `${Math.random() * 100}%`, top: `${-40 + Math.random() * 60}px`, width: 2 + (Math.random() > 0.9 ? 2 : 0), height: 10 + Math.random() * 16, background: 'rgba(255,255,255,0.95)', opacity: 0.9, transform: `translateY(${Math.random() * 6}px)` }} />
                ));
              }

              return null;
            })()}
          </div>

          <div
            style={{
              fontWeight: 900,
              fontSize: 18,
              letterSpacing: 0.4,
              fontFamily:
                "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
              background: "linear-gradient(90deg,#ef4444,#f97316)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              position: 'relative',
              zIndex: 3,
              padding: '6px 8px',
            }}
          >
            AI RISK PREDICTION
          </div>
        </div>

<div style={{ position: "relative", width: 300, maxWidth: "38vw" }}>
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "7px 12px",
      borderRadius: 8,
      border: "1px solid var(--border)",
      background: "var(--surface)",
    }}
  >
    <span style={{ fontSize: 12, opacity: 0.75 }}>🔎</span>
    <input
      value={provQuery}
      onChange={(e) => setProvQuery(e.target.value)}
      placeholder="Tìm tỉnh... (vd: Khánh Hòa)"
      style={{
        width: "100%",
        border: "none",
        background: "transparent",
        color: "var(--text)",
        outline: "none",
        fontSize: 13,
        lineHeight: "18px",
        padding: "0px",
      }}
    />
  </div>

  {provQuery.trim() && (
    <div
      style={{
        position: "absolute",
        top: 42,
        left: 0,
        right: 0,
        maxHeight: 280,
        overflow: "auto",
        borderRadius: 12,
        border: "1px solid var(--border)",
        background: "var(--card)",
        boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
        zIndex: 1002,
      }}
    >
      {filteredProvinces.slice(0, 40).map((p) => (
        <div
          key={p.province}
          onClick={() => pickProvinceFromSearch(p)}
          style={{
            padding: "9px 12px",
            cursor: "pointer",
            borderBottom: "1px solid rgba(148,163,184,0.10)",
            fontSize: 13,
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 800 }}>{p.province}</div>
          <div style={{ opacity: 0.65, fontSize: 12 }}>
            {fmt(p.lat, 2)}, {fmt(p.lon, 2)}
          </div>
        </div>
      ))}
      {!filteredProvinces.length ? (
        <div style={{ padding: 12, fontSize: 12, opacity: 0.75 }}>
          Không tìm thấy.
        </div>
      ) : null}
    </div>
  )}
</div>

        {/* Standalone GPS button */}
        <button
          className={`btn-gps${!userPos ? ' pulse-active' : ''}`}
          onClick={() => getGPS()}
          disabled={gpsLoading}
          title="Click để lấy vị trí hiện tại của bạn"
        >
          📡 {gpsLoading ? "Đang lấy GPS..." : "Lấy GPS"}
        </button>

        {/* Modals for Help and Directions Warning are rendered below */}

        {showHelp ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.6)",
              zIndex: 600,
            }}
          >
            <div
              style={{
                width: 680,
                maxWidth: "94%",
                background: "var(--card)",
                borderRadius: 12,
                padding: 18,
                color: "var(--text)",
                border: "1px solid rgba(148,163,184,0.18)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontWeight: 900 }}>Hướng dẫn</div>
                <button onClick={() => setShowHelp(false)} style={{ background: "transparent", border: "none", color: "var(--text)", cursor: "pointer", fontSize: 18 }}>
                  ✕
                </button>
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                Click tỉnh để xem risk. Lấy GPS để xem risk của bạn theo tỉnh gần nhất. Check trip để vẽ tuyến đường.
              </div>
            </div>
          </div>
        ) : null}

        {showDirectionsWarning ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.6)",
              zIndex: 610,
            }}
          >
            <div
              style={{
                width: 520,
                maxWidth: "94%",
                background: "var(--card)",
                borderRadius: 12,
                padding: 18,
                color: "var(--text)",
                border: "1px solid rgba(148,163,184,0.18)",
                boxShadow: "0 8px 30px rgba(2,6,23,0.4)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontWeight: 900 }}>Chỉ đường</div>
                <button onClick={() => setShowDirectionsWarning(false)} style={{ background: "transparent", border: "none", color: "var(--text)", cursor: "pointer", fontSize: 18 }}>
                  ✕
                </button>
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                Chưa đủ 2 địa điểm để điều hướng, vui lòng chọn đủ 2 địa điểm.
              </div>
            </div>
          </div>
        ) : null}

        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{theme === 'dark' ? '🌙' : '☀️'}</div>
            <div
              role="button"
              tabIndex={0}
              onClick={toggleTheme}
              onKeyDown={(e) => e.key === 'Enter' && toggleTheme()}
              className={`theme-switch ${theme === 'dark' ? 'on' : ''}`}
              title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            >
              <div className="knob" />
            </div>
          </div>

          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {markersCount} tỉnh
          </div>

          {/* Reset VN button */}
          <button
            onClick={resetVN}
            aria-label="Reset map"
            style={{
              width: 36,
              height: 36,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              cursor: "pointer",
              padding: 0,
            }}
            title="Reset Việt Nam"
          >
            <img src="https://hilarious-silver-zrt1zpchqe.edgeone.app/reset-icon.png" alt="Reset" style={{ width: 28, height: 28, objectFit: "contain" }} />
          </button>

          {/* Dropdown menu for secondary actions */}
          <div className="header-dropdown">
            <button
              className="header-dropdown-toggle"
              onClick={() => setShowHeaderMenu(!showHeaderMenu)}
              title="More actions"
            >
              ⋮
            </button>
            {showHeaderMenu && (
              <>
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 1001 }}
                  onClick={() => setShowHeaderMenu(false)}
                />
                <div className="header-dropdown-menu">
                  <button
                    className="header-dropdown-item"
                    onClick={() => { setShowHelp(true); setShowHeaderMenu(false); }}
                  >
                    📖 Xem hướng dẫn
                  </button>

                  <button
                    className="header-dropdown-item"
                    onClick={() => { focusUser(); setShowHeaderMenu(false); }}
                    disabled={!userPos}
                  >
                    📍 Your Position
                  </button>
                  <button
                    className="header-dropdown-item"
                    onClick={() => { focusRoute(); setShowHeaderMenu(false); }}
                    disabled={!routeCoords?.length}
                  >
                    🗺️ Focus Route
                  </button>
                  <button
                    className="header-dropdown-item"
                    onClick={() => { openGoogleDirections(); setShowHeaderMenu(false); }}
                  >
                    🧭 Chỉ đường (Google Maps)
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Outline logout button */}
          <button
            className="btn-logout"
            onClick={logout}
            title={`Logout (${session?.user?.email || "user"})`}
          >
            Log Out
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "420px 1fr",
          gap: 12,
          padding: 12,
          minHeight: 0,
        }}
      >
        {/* Left panel */}
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: 16,
            color: "var(--text)",
            overflow: "auto",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
            display: "flex",
            flexDirection: "column",
            height: "100%",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-heading)" }}>Trip Advisor</div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>Destination</div>
            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="VD: Đà Lạt, Nha Trang..."
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--text)",
                  outline: "none",
                  fontSize: 13,
                }}
              />
              <button
                className="btn-primary"
                onClick={handleCheckTripClick}
                disabled={!canTrip || tripLoading}
              >
                {tripLoading ? "Đang check..." : "Check Trip"}
              </button>
            </div>

            {/* Trip purpose badge + Explore Province Risk button */}
            {(tripPurpose || tripRes?.matched_province) && (
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                {tripPurpose && (
                  <>
                    <div
                      style={{
                        padding: "4px 12px",
                        borderRadius: 999,
                        background: (TRIP_PURPOSES.find((p) => p.key === tripPurpose) || {}).gradient || "rgba(99,102,241,0.2)",
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#fff",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {(TRIP_PURPOSES.find((p) => p.key === tripPurpose) || {}).icon}{" "}
                      {(TRIP_PURPOSES.find((p) => p.key === tripPurpose) || {}).label}
                    </div>
                    <button
                      onClick={() => { setTripPurpose(null); setPendingPurpose(null); }}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--text)",
                        cursor: "pointer",
                        fontSize: 13,
                        opacity: 0.6,
                        padding: 2,
                      }}
                      title="Xóa mục đích"
                    >
                      ✕
                    </button>
                  </>
                )}

                {/* Explore Province Risk — compact inline button */}
                {tripRes?.matched_province && (() => {
                  const mp = provinces.find(
                    (p) => p.province === tripRes.matched_province
                  );
                  if (!mp) return null;
                  return (
                    <button
                      onClick={() => {
                        onPickProvince(mp, { fly: true });
                        setShowProvincePanel(true);
                      }}
                      style={{
                        padding: "4px 12px",
                        borderRadius: 999,
                        border: "1px solid rgba(59,130,246,0.30)",
                        background: "rgba(59,130,246,0.08)",
                        color: "var(--accent)",
                        cursor: "pointer",
                        fontWeight: 700,
                        fontSize: 12,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        transition: "all 0.2s ease",
                        whiteSpace: "nowrap",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(59,130,246,0.18)";
                        e.currentTarget.style.borderColor = "rgba(59,130,246,0.55)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "rgba(59,130,246,0.08)";
                        e.currentTarget.style.borderColor = "rgba(59,130,246,0.30)";
                      }}
                    >
                      🔍 Rủi ro tại {tripRes.matched_province}
                    </button>
                  );
                })()}
              </div>
            )}
          </div>

          {err && (
            <div
              style={{
                marginTop: 12,
                padding: 10,
                borderRadius: 8,
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
                color: "#DC2626",
                fontSize: 12,
                whiteSpace: "pre-wrap",
              }}
            >
              {err}
            </div>
          )}

          {/* ===== 7-DAY FORECAST SECTION ===== */}
          {(forecastData.length > 0 || forecastLoading) && (
            <div className="sidebar-card" style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: "var(--text-heading)" }}>
                🌤️ Dự báo thời tiết 7 ngày tới
              </div>
              {forecastLoading ? (
                <div style={{ fontSize: 12, color: "var(--muted)" }}>Đang tải dự báo...</div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    overflowX: "auto",
                    paddingBottom: 6,
                  }}
                >
                  {forecastData.map((day, idx) => {
                    const isActive = idx === selectedDateIndex;
                    const dateStr = (() => {
                      try {
                        const d = new Date(day.date);
                        return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
                      } catch {
                        return day.date || "—";
                      }
                    })();
                    const riskVal = day.adjusted_risk_score ?? day.risk_score;
                    const riskColor =
                      riskVal >= 7 ? "#EF4444" :
                      riskVal >= 4 ? "#F97316" :
                      riskVal >= 2 ? "#F59E0B" : "#22C55E";                      return (
                      <motion.button
                        key={day.date || idx}
                        onClick={() => setSelectedDateIndex(idx)}
                        whileHover={{ y: -3, scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        transition={{ type: "spring", stiffness: 400, damping: 17 }}
                        className={`forecast-day-btn${isActive ? ' active' : ''}`}
                        style={{}}
                      >
                        <span>{dateStr}</span>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>
                          {day.temperature != null ? `${Math.round(day.temperature)}°` : "—"}
                        </span>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: riskColor,
                            display: "inline-block",
                          }}
                        />
                      </motion.button>
                    );
                  })}
                </div>
              )}

              {/* Selected day summary + weekly overview */}
              {forecastData[selectedDateIndex] && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 10,
                    background: "var(--border-light)",
                    border: "1px solid var(--border)",
                    fontSize: 12,
                    lineHeight: 1.6,
                    color: "var(--text)",
                  }}
                >
                  <div>
                    <b>Suitability:</b>{" "}
                    {calculateSuitabilityStars(
                      forecastData[selectedDateIndex].risk_score,
                      forecastData[selectedDateIndex].adjusted_risk_score
                    )}
                  </div>

                  {/* Adjusted reason from trip purpose */}
                  {forecastData[selectedDateIndex].adjusted_reason && (
                    <div style={{ marginTop: 4, fontSize: 11, opacity: 0.85, fontStyle: "italic" }}>
                      🎯 {forecastData[selectedDateIndex].purpose_label}: {forecastData[selectedDateIndex].adjusted_reason}
                    </div>
                  )}

                  {weeklySummaryMsg && (
                    <>
                      <style>{`
                        @keyframes forecast-fade-in {
                          0% { opacity: 0; transform: translateY(4px); }
                          100% { opacity: 1; transform: translateY(0); }
                        }
                      `}</style>
                      <p
                        key={weeklySummaryMsg}
                        style={{
                          marginTop: 8,
                          marginBottom: 0,
                          fontSize: 12,
                          fontStyle: "italic",
                          opacity: 0.92,
                          lineHeight: 1.55,
                          animation: "forecast-fade-in 0.5s ease forwards",
                        }}
                      >
                        💡 {weeklySummaryMsg}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div
            className="sidebar-card"
            style={{
              marginTop: "auto",
            }}
          >
            <div style={{ fontWeight: 600, color: "var(--text-heading)" }}>Kết quả chuyến đi</div>
            {!tripRes ? (
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
                Chưa check trip.
              </div>
            ) : (
              <>
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Traffic</div>
                  <div
                    style={{
                      padding: "4px 8px",
                      borderRadius: 999,
                      background: trafficClr,
                      color: "#ffffff",
                      fontWeight: 900,
                      fontSize: 12,
                    }}
                  >
                    {String(tripRes?.traffic?.status || "")}
                  </div>
                </div>

                <div style={{ marginTop: 10, fontSize: 13, opacity: 0.95, lineHeight: 1.5 }}>
                  <div>
                    <b>To:</b> {tripRes?.to?.name}
                  </div>
                  <div>Distance: {tripRes?.traffic?.distance_km} km</div>
                  <div>Normal: {tripRes?.traffic?.time_normal_human || `${tripRes?.traffic?.time_normal_min} min`}</div>
                  <div>Traffic: {tripRes?.traffic?.time_traffic_human || `${tripRes?.traffic?.time_traffic_min} min`}</div>
                  <div>Speed: {Number(tripRes?.traffic?.speed_kmh || 0).toFixed(1)} km/h</div>

                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                    Polyline:{" "}
                    <b>{tripRes?.traffic?.route_polyline_provider || "unknown"}</b>{" "}
                    ({tripRes?.traffic?.route_polyline_type || "?"})
                  </div>

                  <div style={{ marginTop: 8, fontWeight: 900 }}>{tripRes?.recommendation}</div>

                  {/* Trip purpose adjusted info */}
                  {tripRes?.weather?.adjusted_reason && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: "6px 10px",
                        borderRadius: 8,
                        background: "rgba(99,102,241,0.10)",
                        border: "1px solid rgba(99,102,241,0.20)",
                        fontSize: 11,
                        lineHeight: 1.5,
                      }}
                    >
                      🎯 <b>{tripRes.weather.purpose_label || tripRes.trip_purpose}</b>: {tripRes.weather.adjusted_reason}
                    </div>
                  )}

                  {session?.token && isPushSupported() && (
                    <button
                      onClick={enableWeatherAlerts}
                      disabled={pushStatus === "loading" || pushStatus === "enabled"}
                      style={{
                        marginTop: 10,
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid rgba(99,102,241,0.35)",
                        background: pushStatus === "enabled" ? "rgba(34,197,94,0.15)" : "rgba(99,102,241,0.10)",
                        color: "var(--text-heading)",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: pushStatus === "loading" || pushStatus === "enabled" ? "default" : "pointer",
                      }}
                    >
                      {pushStatus === "enabled"
                        ? "🔔 Đã bật cảnh báo thời tiết"
                        : pushStatus === "loading"
                        ? "Đang bật..."
                        : pushStatus === "denied"
                        ? "🔕 Trình duyệt từ chối quyền thông báo"
                        : pushStatus === "error"
                        ? "⚠️ Lỗi bật cảnh báo, thử lại"
                        : "🔔 Bật cảnh báo thời tiết cho điểm này"}
                    </button>
                  )}
                </div>
                {/* Weather card removed from Trip Results — decorative icons moved to header */}
              </>
            )}
          </div>

          {session?.token && (
            <div className="sidebar-card">
              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
                onClick={() => setShowTripHistory((v) => !v)}
              >
                <div style={{ fontWeight: 600, color: "var(--text-heading)" }}>
                  🕓 Lịch sử chuyến đi {tripHistory.length > 0 && `(${tripHistory.length})`}
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>{showTripHistory ? "▲" : "▼"}</div>
              </div>
              {showTripHistory && (
                <div style={{ marginTop: 8, maxHeight: 220, overflowY: "auto" }}>
                  {tripHistoryLoading ? (
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>Đang tải...</div>
                  ) : tripHistory.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>Chưa có chuyến đi nào được lưu.</div>
                  ) : (
                    tripHistory.map((t) => (
                      <div
                        key={t.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "6px 0",
                          borderBottom: "1px solid var(--border, rgba(148,163,184,0.15))",
                          fontSize: 12,
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600 }}>{t.destination}</div>
                          <div style={{ opacity: 0.7 }}>
                            {t.recommendation} · {new Date(t.created_at).toLocaleString("vi-VN")}
                          </div>
                        </div>
                        <button
                          onClick={() => deleteTripHistoryEntry(t.id)}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "var(--muted)",
                            cursor: "pointer",
                            fontSize: 14,
                          }}
                          title="Xóa"
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right side: Map only */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              borderRadius: 14,
              overflow: "hidden",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              position: "relative",
            }}
          >
            {/* NEW: floating controls on map (extra friendly) */}
            <div
              style={{
                position: "absolute",
                zIndex: 500,
                right: 12,
                top: 12,
                display: "grid",
                gap: 8,
              }}
            >
              <button
                onClick={resetVN}
                aria-label="Reset map"
                style={{
                  width: 36,
                  height: 36,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  cursor: "pointer",
                  padding: 0,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                }}
                title="Reset VN"
              >
                <img src="https://hilarious-silver-zrt1zpchqe.edgeone.app/reset-icon.png" alt="Reset" style={{ width: 24, height: 24, objectFit: "contain" }} />
              </button>
              <button
                onClick={focusUser}
                disabled={!userPos}
                style={{
                  width: 36,
                  height: 36,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  cursor: userPos ? "pointer" : "not-allowed",
                  fontSize: 14,
                  padding: 0,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                  opacity: userPos ? 1 : 0.5,
                }}
                title="Về vị trí"
              >
                📍
              </button>
              <button
                onClick={focusRoute}
                disabled={!routeCoords?.length}
                style={{
                  width: 36,
                  height: 36,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  cursor: routeCoords?.length ? "pointer" : "not-allowed",
                  fontSize: 14,
                  padding: 0,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                  opacity: routeCoords?.length ? 1 : 0.5,
                }}
                title="Focus route"
              >
                🎯
              </button>
            </div>

            {/* Floating weather popup (liquid-glass style) */}
            {(() => {
              // Use selected forecast day data if available, else fall back to trip weather
              const tripWeather = tripRes?.weather || tripRes?.weather_info;
              const fc = forecastData[selectedDateIndex] || null;

              // Build the display object: forecast day overrides trip weather
              const w = fc
                ? {
                    temperature: fc.temperature,
                    humidity: fc.humidity,
                    precipitation: fc.precipitation,
                    wind: fc.wind,
                    visibility_km: fc.visibility_km,
                    uv_index: fc.uv_index,
                    risk_score: fc.risk_score,
                    risk_level: fc.risk_level,
                    message: fc.message,
                    detection_method: fc.detection_method,
                    temp_max: fc.temp_max,
                    temp_min: fc.temp_min,
                    health_advice: fc.health_advice,
                    adjusted_risk_score: fc.adjusted_risk_score,
                    adjusted_reason: fc.adjusted_reason,
                    purpose_label: fc.purpose_label,
                    provider: "Open-Meteo (forecast)",
                    _isForecast: true,
                    _forecastDate: fc.date,
                  }
                : tripWeather;

              if (!w || w.error) return null;

              // Format forecast date label for header
              const dateLabel = w._isForecast && w._forecastDate
                ? (() => {
                    try {
                      const d = new Date(w._forecastDate);
                      return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
                    } catch { return ""; }
                  })()
                : "";

              // determine simple weather category
              const precip = Number(w.precipitation || 0);
              const uv = Number(w.uv_index || 0);
              const isHeavy = precip >= 10;
              const isDrizzle = precip > 0 && precip < 10;
              const isSunny = !precip && uv >= 3;
              const isNight = !precip && uv < 3;

              // more pronounced effects per user request
              const dropsCount = isHeavy ? 80 : isDrizzle ? 35 : 0; // fill frame when raining
              const suns = isSunny ? 10 : 0; // 10 suns for bright morning
              const moons = isNight ? 3 + Math.floor(Math.random() * 2) : 0; // 3-4 moons
              const clouds = isNight ? 5 : isHeavy ? 6 : isDrizzle ? 4 : 0; // several clouds
              const stars = isNight ? 8 : 0; // small yellow stars

              return (
                <div>
                  <style>{`
                    @keyframes popup-entry { 0% { transform: translateY(-8px) scale(0.995); opacity: 0 } 60% { transform: translateY(2px) scale(1.01); opacity: 1 } 100% { transform: translateY(0) scale(1); } }
                    @keyframes popup-float { 0% { transform: translateY(0) } 50% { transform: translateY(-6px) } 100% { transform: translateY(0) } }
                    @keyframes rain-line-fall { 0% { transform: translateY(-18px); opacity: 0 } 10% { opacity: 0.7 } 100% { transform: translateY(300px); opacity: 0 } }
                    @keyframes uv-glow-pulse { 0% { box-shadow: 0 0 8px rgba(251,191,36,0.3), inset 0 0 6px rgba(251,191,36,0.08) } 50% { box-shadow: 0 0 22px rgba(251,191,36,0.55), inset 0 0 14px rgba(251,191,36,0.15) } 100% { box-shadow: 0 0 8px rgba(251,191,36,0.3), inset 0 0 6px rgba(251,191,36,0.08) } }
                    @keyframes risk-warning-pulse { 0% { box-shadow: 0 8px 30px rgba(2,6,23,0.28) } 50% { box-shadow: 0 8px 30px rgba(239,68,68,0.45), 0 0 16px rgba(239,68,68,0.2) } 100% { box-shadow: 0 8px 30px rgba(2,6,23,0.28) } }
                    .weather-popup {
                      position: absolute; top: 12px; right: 72px; width: 280px; z-index: 520; padding: 12px; border-radius: 14px;
                      border: 1px solid var(--border);
                      background: rgba(var(--card-rgb), 0.7);
                      box-shadow: 0 8px 32px 0 rgba(0,0,0,0.1); color: var(--text); backdrop-filter: blur(12px);
                      -webkit-backdrop-filter: blur(12px); display: flex; flex-direction: column; gap: 8px;
                      animation: popup-entry 600ms cubic-bezier(.22,.9,.26,1) forwards, popup-float 4s ease-in-out 700ms infinite;
                      overflow: visible;
                    }
                    .weather-popup.rain-active { border-color: rgba(96,165,250,0.35); }
                    .weather-popup.uv-glow { animation: popup-entry 600ms cubic-bezier(.22,.9,.26,1) forwards, uv-glow-pulse 2.5s ease-in-out infinite; border-color: rgba(251,191,36,0.5); }
                    .weather-popup.risk-warning { animation: popup-entry 600ms cubic-bezier(.22,.9,.26,1) forwards, risk-warning-pulse 2s ease-in-out infinite; border-color: rgba(239,68,68,0.4); }
                    .weather-header { display:flex; justify-content:space-between; align-items:center }
                    .weather-temp { font-size:28px; font-weight:900 }
                    .weather-meta { font-size:13px; opacity:0.95 }
                    .weather-badges { display:flex; gap:8px; flex-wrap:wrap; }
                    .badge { background: rgba(255,255,255,0.06); padding:6px 8px; border-radius:8px; font-size:13px }
                    .effect-layer { position:absolute; inset:0; pointer-events:none; border-radius:14px; overflow:hidden; z-index:0 }
                    .content-layer { position:relative; z-index:2 }
                    .rain-line { position: absolute; width: 1.5px; background: linear-gradient(180deg, rgba(96,165,250,0.7), rgba(96,165,250,0.1)); border-radius: 2px; opacity: 0; animation: rain-line-fall linear infinite; }
                  `}</style>

                      <div className={`weather-popup${precip > 0 ? ' rain-active' : ''}${uv > 7 ? ' uv-glow' : ''}${(Number(w.adjusted_risk_score ?? w.risk_score ?? 0)) > 7 ? ' risk-warning' : ''}`}>
                        {/* Rain effect overlay */}
                        {precip > 0 && (
                          <div className="effect-layer">
                            {Array.from({ length: precip >= 10 ? 24 : 10 }).map((_, i) => (
                              <div key={`rl-${i}`} className="rain-line" style={{
                                left: `${4 + Math.random() * 92}%`,
                                height: 14 + Math.random() * 20,
                                animationDuration: `${0.7 + Math.random() * 0.8}s`,
                                animationDelay: `${Math.random() * 1.5}s`,
                              }} />
                            ))}
                          </div>
                        )}
                        <div className="content-layer">
                    <div className="weather-header">
                      <div style={{ fontWeight: 800, fontSize: 14 }}>
                        Thời tiết điểm đến{dateLabel ? ` (${dateLabel})` : ""}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>{w.provider || ''}</div>
                    </div>

                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div className="weather-temp">{w.temperature ? Math.round(w.temperature) : '—'}°</div>
                      <div style={{ fontSize: 13, opacity: 0.95 }}>
                        <div>Trạng thái: <b>{w.message || (w.risk_level >= 4 ? 'Nguy hiểm' : w.risk_level >= 2 ? 'Cẩn thận' : 'An toàn')}</b></div>
                        <div>Gió: <b>{w.wind ?? '—'} km/h</b></div>
                        <div>Độ ẩm: <b>{w.humidity ?? '—'}%</b></div>
                      </div>
                    </div>

                    <div className="weather-badges">
                      <div className="badge">Mưa: <b>{w.precipitation ?? '—'} mm</b></div>
                      <div className="badge">Tầm nhìn: <b>{w.visibility_km ?? '—'} km</b></div>
                      <div className="badge">UV: <b>{w.uv_index ?? '—'}</b></div>
                    </div>

                    <div style={{ fontSize: 13, opacity: 0.95, marginTop: 6 }}>
                      <b>Weather Risk:</b> {String(w.adjusted_risk_score ?? w.risk_score ?? '—')}/10
                      {w.adjusted_risk_score != null && w.adjusted_risk_score !== w.risk_score && (
                        <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 4 }}>(base: {w.risk_score})</span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.95, marginTop: 4 }}>
                      <b>Weather Suitability:</b> {calculateSuitabilityStars(w.risk_score, w.adjusted_risk_score)}
                    </div>

                    {w.health_advice && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: "8px 10px",
                          borderRadius: 10,
                          background: "var(--surface)",
                          border: "1px solid rgba(251, 191, 36, 0.35)",
                          fontSize: 12,
                          lineHeight: 1.55,
                          color: "var(--text)",
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 6,
                        }}
                      >
                        <span style={{ fontSize: 15, flexShrink: 0, lineHeight: 1.3 }}>
                          {(() => {
                            const emoji = w.health_advice.match(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u);
                            return emoji ? emoji[0] : "💡";
                          })()}
                        </span>
                        <span>{w.health_advice}</span>
                      </div>
                    )}

                    </div>
                    {!precip && <div className="effect-layer" />}
                  </div>
                </div>
              );
            })()}


            {/* Cursor trail/pulse effect on map area */}
            <MapCursorEffect />

            <MapContainer
              center={VN_CENTER}
              zoom={6}
              style={{ height: "100%", width: "100%" }}
              whenCreated={(m) => (mapRef.current = m)}
            >
              <FixLeafletResize />
              <MapController action={mapAction} />

              {fitBounds && fitBounds.length >= 2 ? <FitBounds bounds={fitBounds} /> : null}

              <TileLayer
                attribution='&copy; OpenStreetMap'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {/* Province markers */}
              {provinces.map((p) => {
                const active = selectedProv?.province === p.province;
                return (
                  <Marker
                    key={p.province}
                    position={[p.lat, p.lon]}
                    icon={active ? ICONS.provinceActive : ICONS.province}
                    eventHandlers={{
                      click: () => onPickProvince(p),
                    }}
                  >
                    <Popup>
                      <div style={{ minWidth: 220 }}>
                        <div style={{ fontWeight: 900, marginBottom: 8 }}>{p.province}</div>
                        <div style={{ marginBottom: 8 }}>
                          {(() => {
                            // Get risk data for this province if available
                            const riskData = selectedProv?.province === p.province ? selectedRisk : null;
                            if (riskData) {
                              const rl = riskLabel(riskData.overall_risk_score);
                              return (
                                <div
                                  style={{
                                    display: "inline-block",
                                    padding: "4px 8px",
                                    borderRadius: 12,
                                    background: rl.color,
                                    color: "#ffffff",
                                    fontWeight: 900,
                                    fontSize: 12,
                                  }}
                                >
                                  {riskData.overall_risk_score}/10 • {rl.text}
                                </div>
                              );
                            } else {
                              return (
                                <div style={{ fontSize: 12, opacity: 0.7, fontStyle: "italic" }}>
                                  Chưa load risk
                                </div>
                              );
                            }
                          })()}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>
                          Bấm xem chi tiết ở dưới
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

              {/* User marker */}
              {userPos ? (
                <Marker position={[userPos.lat, userPos.lon]} icon={ICONS.user}>
                  <Popup>
                    <div style={{ minWidth: 240 }}>
                      <div style={{ fontWeight: 900 }}>Vị trí của bạn</div>
                      <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
                        lat {fmt(userPos.lat)} <br />
                        lon {fmt(userPos.lon)}
                      </div>

                      {userNearestProv ? (
                        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>
                          Nearest: <b>{userNearestProv.province}</b> • {userNearestProv.distance_km.toFixed(1)} km
                        </div>
                      ) : null}

                      {userRisk ? (
                        <div style={{ marginTop: 8, fontSize: 12 }}>
                          Risk: <b>{userRisk.overall_risk_score}/10</b>
                        </div>
                      ) : (
                        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
                          (Chưa load risk)
                        </div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ) : null}

              {/* Destination marker */}
              {tripRes?.to?.lat && tripRes?.to?.lon ? (
                <Marker position={[tripRes.to.lat, tripRes.to.lon]} icon={ICONS.dest}>
                  <Popup>
                    <div style={{ minWidth: 220 }}>
                      <div style={{ fontWeight: 900 }}>Điểm đến</div>
                      <div style={{ marginTop: 6 }}>{tripRes.to.name}</div>
                      <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
                        lat {fmt(tripRes.to.lat)} <br />
                        lon {fmt(tripRes.to.lon)}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ) : null}

              {/* Route polyline */}
              {routeCoords && routeCoords.length >= 2 ? (
                <Polyline
  positions={routeCoords}
  pathOptions={{
    color: "#2563EB",
    weight: 6,
    opacity: 1,
  }}
/>
              ) : null}
            </MapContainer>

            {/* Loading overlay when checking trip */}
            {tripLoading && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: "var(--bg)",
                  opacity: 0.85,
                  backdropFilter: "blur(4px)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 1000,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "16px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "18px",
                      fontWeight: 600,
                      color: "var(--text)",
                    }}
                  >
                    Đang check
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "4px",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "var(--accent)",
                        animation: "loading-dot 1.4s ease-in-out infinite",
                        animationDelay: "0s",
                      }}
                    />
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "var(--accent)",
                        animation: "loading-dot 1.4s ease-in-out infinite",
                        animationDelay: "0.2s",
                      }}
                    />
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "var(--accent)",
                        animation: "loading-dot 1.4s ease-in-out infinite",
                        animationDelay: "0.4s",
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* NEW: Toggle button (ALWAYS visible + clickable) */}
          <button
            onClick={() => setShowProvincePanel(!showProvincePanel)}
            style={{
              position: "fixed",
              bottom: showProvincePanel ? (selectedProv ? "calc(40vh)" : "calc(14.9vh)") : 0,
              left: "calc(50% + 216px)",
              transform: "translateX(-50%)",
              padding: "8px 18px",
              borderRadius: "8px 8px 0 0",
              border: "1px solid var(--border)",
              borderBottom: "none",
              background: "var(--surface)",
              color: "var(--text)",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 12,
              transition: "all 0.35s ease-out",
              zIndex: 450,
              pointerEvents: "auto",
              boxShadow: "0 -2px 8px rgba(0,0,0,0.06)",
            }}
            title="Toggle province panel"
          >
            {showProvincePanel ? "▼ Ẩn" : "▲ Xem chi tiết"}
          </button>

          {/* NEW: Slide panel at bottom */}
          <div
            style={{
              position: "fixed",
              bottom: 0,
              right: 0,
              left: 420 + 12,
              maxHeight: "50vh",
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "14px 14px 0 0",
              boxShadow: "0 -4px 16px rgba(0,0,0,0.06)",
              transform: showProvincePanel ? "translateY(0)" : "translateY(100%)",
              transition: "transform 0.6s cubic-bezier(.22,.9,.26,1), opacity 0.45s ease",
              zIndex: 400,
              pointerEvents: showProvincePanel ? "auto" : "none",
              opacity: showProvincePanel ? 1 : 0,
            }}
          >
            {/* Panel content */}
            <div
              style={{
                padding: 16,
                height: "100%",
                overflow: "auto",
              }}
            >
              <div
                className="sidebar-card"
                style={{
                  color: "var(--text)",
                }}
              >
                {!selectedProv ? (
                  <div style={{ fontSize: 13, color: "var(--muted)", padding: "20px 0", textAlign: "center" }}>
                    Chưa chọn tỉnh nào.
                  </div>
                ) : (
                  <>
                    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: 0.2, color: "var(--text-heading)" }}>
                      {selectedProv.province}
                    </h2>

                    {!selectedRisk ? (
                      <div style={{ marginTop: 12, fontSize: 12, color: "var(--muted)" }}>
                        Đang load risk...
                      </div>
                    ) : (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ fontSize: 12, color: "var(--muted)" }}>Overall risk</div>
                          {(() => {
                            const rl = riskLabel(selectedRisk.overall_risk_score);
                            return (
                              <div
                                style={{
                                  padding: "4px 10px",
                                  borderRadius: 999,
                                  background: rl.color,
                                  color: "#ffffff",
                                  fontWeight: 700,
                                  fontSize: 12,
                                }}
                              >
                                {selectedRisk.overall_risk_score}/10 • {rl.text}
                              </div>
                            );
                          })()}
                        </div>
                        <div style={{ marginTop: 12, fontSize: 12, color: "var(--text)", lineHeight: 1.6 }}>
                          <div>
                            Articles: <b>{selectedRisk.num_articles}</b>
                          </div>
                          <div style={{ marginTop: 8, color: "var(--muted)", fontWeight: 600 }}>Breakdown</div>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 70px",
                              gap: 6,
                              marginTop: 6,
                            }}
                          >
                            {Object.entries(selectedRisk.risk_assessment || {}).map(([k, v]) => (
                              <React.Fragment key={k}>
                                <div style={{ opacity: 0.9 }}>{k.replace(/_/g, ' ')}</div>
                                <div style={{ textAlign: "right", fontWeight: 900 }}>{v}</div>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


