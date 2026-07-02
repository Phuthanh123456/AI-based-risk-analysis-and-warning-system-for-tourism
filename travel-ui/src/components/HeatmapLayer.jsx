import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";

export default function HeatmapLayer({ points }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    if (!points || points.length === 0) return;

    const heatData = points.map((p) => [p.lat, p.lon, p.intensity ?? 0.2]);

    const layer = L.heatLayer(heatData, {
      radius: 35,
      blur: 25,
      maxZoom: 7,
    });

    layer.addTo(map);
    layerRef.current = layer;

    return () => {
      if (layerRef.current) map.removeLayer(layerRef.current);
      layerRef.current = null;
    };
  }, [points, map]);

  return null;
}
