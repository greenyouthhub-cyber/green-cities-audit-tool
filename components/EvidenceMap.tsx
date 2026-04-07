'use client';

import { useEffect, useMemo, useState } from 'react';
import type { LatLngTuple, Icon } from 'leaflet';

type MediaPoint = {
  id: number;
  submission_id: string;
  block_name: string;
  media_type: string;
  image_url: string;
  location_name: string | null;
  latitude: number;
  longitude: number;
  city: string | null;
  country: string | null;
};

type ReactLeafletModule = typeof import('react-leaflet');

function getTypeLabel(mediaType: string) {
  if (mediaType === 'good_practice') return 'Good practice';
  if (mediaType === 'problem') return 'Problem';
  return mediaType;
}

function getTypeStyles(mediaType: string) {
  if (mediaType === 'good_practice') {
    return {
      backgroundColor: '#dcfce7',
      color: '#166534',
      border: '1px solid #86efac',
    };
  }

  return {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    border: '1px solid #fca5a5',
  };
}

function formatAreaLabel(area: string) {
  return area
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function FitBounds({
  points,
  fitTrigger,
  useMap,
}: {
  points: MediaPoint[];
  fitTrigger: number;
  useMap: () => any;
}) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;

    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 15);
      return;
    }

    const bounds = points.map((point) => [point.latitude, point.longitude]);

    map.fitBounds(bounds, {
      padding: [40, 40],
      maxZoom: 15,
    });
  }, [points, fitTrigger, map]);

  return null;
}

export default function EvidenceMap({
  points,
  fitTrigger,
}: {
  points: MediaPoint[];
  fitTrigger: number;
}) {
  const center: LatLngTuple = [42.24, -8.72];

  const [redIcon, setRedIcon] = useState<Icon | null>(null);
  const [greenIcon, setGreenIcon] = useState<Icon | null>(null);
  const [leafletComponents, setLeafletComponents] = useState<ReactLeafletModule | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadMapDeps() {
      const L = await import('leaflet');
      const RL = await import('react-leaflet');

      const red = new L.Icon({
        iconUrl:
          'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });

      const green = new L.Icon({
        iconUrl:
          'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });

      if (mounted) {
        setRedIcon(red);
        setGreenIcon(green);
        setLeafletComponents(RL);
      }
    }

    loadMapDeps();

    return () => {
      mounted = false;
    };
  }, []);

  const ready = useMemo(
    () => !!redIcon && !!greenIcon && !!leafletComponents,
    [redIcon, greenIcon, leafletComponents]
  );

  function getMarkerIcon(mediaType: string) {
    if (mediaType === 'good_practice') return greenIcon;
    return redIcon;
  }

  if (!ready || !leafletComponents) {
    return (
      <div
        style={{
          height: '70vh',
          width: '100%',
          borderRadius: '16px',
          display: 'grid',
          placeItems: 'center',
          background: '#f8fafc',
        }}
      >
        Loading map...
      </div>
    );
  }

  const { MapContainer, TileLayer, Marker, Popup, useMap } = leafletComponents;

  return (
    <div
      style={{
        height: '70vh',
        width: '100%',
        borderRadius: '16px',
        overflow: 'hidden',
      }}
    >
      <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitBounds points={points} fitTrigger={fitTrigger} useMap={useMap} />

        <>
          {points.map((point) => (
            <Marker
              key={point.id}
              position={[point.latitude, point.longitude] as LatLngTuple}
              icon={getMarkerIcon(point.media_type)!}
            >
              <Popup>
                <div
                  style={{
                    width: 250,
                    fontFamily: 'system-ui, sans-serif',
                  }}
                >
                  <img
                    src={point.image_url}
                    alt=""
                    style={{
                      width: '100%',
                      height: 140,
                      objectFit: 'cover',
                      borderRadius: '10px',
                      marginBottom: '10px',
                    }}
                  />

                  <div
                    style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      borderRadius: '999px',
                      fontSize: '12px',
                      fontWeight: 600,
                      marginBottom: '10px',
                      ...getTypeStyles(point.media_type),
                    }}
                  >
                    {getTypeLabel(point.media_type)}
                  </div>

                  <div
                    style={{
                      fontSize: '16px',
                      fontWeight: 700,
                      color: '#0f172a',
                      marginBottom: '6px',
                      lineHeight: 1.3,
                    }}
                  >
                    {point.location_name || 'Unnamed location'}
                  </div>

                  {(point.city || point.country) && (
                    <div
                      style={{
                        fontSize: '13px',
                        color: '#475569',
                        marginBottom: '8px',
                      }}
                    >
                      {[point.city, point.country].filter(Boolean).join(', ')}
                    </div>
                  )}

                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#334155',
                      marginBottom: '4px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Area
                  </div>

                  <div
                    style={{
                      fontSize: '14px',
                      color: '#0f172a',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '8px 10px',
                    }}
                  >
                    {formatAreaLabel(point.block_name)}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </>
      </MapContainer>
    </div>
  );
}