import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import maplibregl from 'maplibre-gl';
import KeplerGl from '@kepler.gl/components';
import { addDataToMap } from '@kepler.gl/actions';
import type { PlaceRow } from '@terramap/types';

const DATASET_ID = 'places';

// kepler fields, in the same column order as the row tuples below.
const FIELDS = [
  { name: 'name', type: 'string' },
  { name: 'category', type: 'string' },
  { name: 'address', type: 'string' },
  { name: 'rating', type: 'real' },
  { name: 'review_count', type: 'integer' },
  { name: 'lat', type: 'real' },
  { name: 'lng', type: 'real' },
];

function toRows(places: PlaceRow[]): Array<Array<string | number | null>> {
  return places
    .filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number')
    .map((p) => [
      p.name ?? '',
      p.category ?? '',
      p.address ?? '',
      p.rating ?? null,
      p.review_count ?? null,
      p.lat as number,
      p.lng as number,
    ]);
}

/** Center the initial viewport on the mean of the points. */
function centerOf(places: PlaceRow[]): { latitude: number; longitude: number } | null {
  const pts = places.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number');
  if (!pts.length) return null;
  const latitude = pts.reduce((a, p) => a + (p.lat as number), 0) / pts.length;
  const longitude = pts.reduce((a, p) => a + (p.lng as number), 0) / pts.length;
  return { latitude, longitude };
}

export function MapView({ rows }: { rows: PlaceRow[] }) {
  const dispatch = useDispatch();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Track container size — kepler needs explicit width/height.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ width: r.width, height: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Push rows into kepler whenever the filtered set changes.
  useEffect(() => {
    const data = toRows(rows);
    if (!data.length) return;
    const center = centerOf(rows);
    dispatch(
      addDataToMap({
        datasets: {
          info: { id: DATASET_ID, label: 'Scraped places' },
          data: { fields: FIELDS, rows: data },
        },
        options: { centerMap: true, readOnly: false },
        config: center
          ? { mapState: { latitude: center.latitude, longitude: center.longitude, zoom: 11 } }
          : {},
      }),
    );
  }, [rows, dispatch]);

  const hasCoords = rows.some((p) => typeof p.lat === 'number' && typeof p.lng === 'number');

  return (
    <div
      ref={containerRef}
      className="relative h-[70vh] w-full overflow-hidden rounded-lg border border-gray-200"
    >
      {!hasCoords && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-50 text-sm text-gray-500">
          No coordinates in this selection — nothing to plot.
        </div>
      )}
      {size.width > 0 && (
        <KeplerGl
          id="terramap"
          mapboxApiAccessToken=""
          mapLib={maplibregl}
          width={size.width}
          height={size.height}
        />
      )}
    </div>
  );
}
