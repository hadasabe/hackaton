import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import {
  Heart,
  HeartOff,
  MapPin,
  Maximize2,
  Minimize2,
  MoreVertical,
  Navigation,
  Plus,
  Route,
  Search,
  X,
} from 'lucide-react';
import { useCityObjects } from '../lib/cityObjects';
import type { CityObject } from '../lib/cityObjects';
import {
  PLACE_FAVORITES_EVENT,
  readFavoritePlaceIds,
  writeFavoritePlaceIds,
} from '../lib/placeFavorites';
import { readPlan, writePlan } from '../lib/plan';
import { tagsForObject } from '../lib/tags';
import { TagFilters } from '../components/TagFilters';


function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const lat1 = a.lat * rad;
  const lat2 = b.lat * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

type RouteStop = { id: string; lat: number; lng: number };

function optimizeStopOrder(stops: RouteStop[], start?: { lat: number; lng: number }): string[] {
  if (stops.length < 2) return stops.map((stop) => stop.id);
  const remaining = [...stops];
  const order: RouteStop[] = [];
  let current = start;
  if (current) {
    let nearest = 0;
    for (let index = 1; index < remaining.length; index += 1) {
      if (distanceMeters(current, remaining[index]) < distanceMeters(current, remaining[nearest])) {
        nearest = index;
      }
    }
    order.push(remaining.splice(nearest, 1)[0]);
    current = order[0];
  } else {
    order.push(remaining.shift()!);
    current = order[0];
  }
  while (remaining.length) {
    let nearest = 0;
    for (let index = 1; index < remaining.length; index += 1) {
      if (distanceMeters(current, remaining[index]) < distanceMeters(current, remaining[nearest])) {
        nearest = index;
      }
    }
    const next = remaining.splice(nearest, 1)[0];
    order.push(next);
    current = next;
  }

  const routeDistance = (route: RouteStop[]) => {
    let total = 0;
    let previous = start || route[0];
    for (const stop of route) {
      total += distanceMeters(previous, stop);
      previous = stop;
    }
    return total;
  };

  let best = order;
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i += 1) {
      for (let j = i + 1; j < best.length; j += 1) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ];
        if (routeDistance(candidate) + 0.5 < routeDistance(best)) {
          best = candidate;
          improved = true;
        }
      }
    }
  }
  return best.map((stop) => stop.id);
}

function readCurrentPoint(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

async function roadOptimizedOrder(
  stops: RouteStop[],
  start?: { lat: number; lng: number },
): Promise<string[]> {
  const points = [...(start ? [start] : []), ...stops.map((stop) => ({ lat: stop.lat, lng: stop.lng }))];
  const coordinates = points.map(({ lat, lng }) => `${lng},${lat}`).join(';');
  const response = await fetch(
    `https://routing.openstreetmap.de/routed-foot/trip/v1/driving/${coordinates}?roundtrip=false&source=first&destination=any&overview=false`,
  );
  if (!response.ok) throw new Error('trip request failed');
  const data = await response.json() as { waypoints?: Array<{ waypoint_index?: number }> };
  const waypoints = data.waypoints;
  if (!Array.isArray(waypoints) || waypoints.length !== points.length) {
    throw new Error('trip response is invalid');
  }
  const sorted = waypoints
    .map((waypoint, index) => ({ index, position: Number(waypoint.waypoint_index) }))
    .sort((a, b) => a.position - b.position);
  const offset = start ? 1 : 0;
  if (start && sorted[0]?.index !== 0) throw new Error('start point is not fixed');
  const ids = sorted.slice(offset).map(({ index }) => stops[index - offset]?.id).filter(Boolean) as string[];
  if (ids.length !== stops.length) throw new Error('trip order is incomplete');
  return ids;
}

function objectLabel(object: CityObject) {
  if (object.kind === 'graffiti') return 'Граффити';
  if (object.kind === 'building') return 'Здание';
  return object.artType || 'Место';
}

function MapObjectRow({
  object,
  selected,
  onSelect,
}: {
  object: CityObject;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`map-object-row${selected ? ' selected' : ''}`}
      onClick={onSelect}
    >
      {object.image ? (
        <img src={object.image} alt="" loading="lazy" />
      ) : (
        <span className="map-object-placeholder"><MapPin size={18} /></span>
      )}
      <span className="map-object-copy">
        <strong>{object.name}</strong>
        <span>{object.address}</span>
      </span>
      {object.lat == null || object.lng == null ? <em>без точки</em> : null}
    </button>
  );
}

export function MapPage() {
  const { objects, loading, error } = useCityObjects();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('place'));
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => readFavoritePlaceIds());
  const [plan, setPlan] = useState<string[]>(() => readPlan());
  const [showPlan, setShowPlan] = useState(() => searchParams.get('plan') === '1');
  const [dragPlanId, setDragPlanId] = useState<string | null>(null);
  const [dragPlanInsert, setDragPlanInsert] = useState<number | null>(null);
  const dragPlanRef = useRef<{ id: string; pointerId: number } | null>(null);
  const dragPlanTarget = useRef<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [planOptimizing, setPlanOptimizing] = useState(false);
  const [walkStarted, setWalkStarted] = useState(false);
  const [userPoint, setUserPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayer = useRef<L.MarkerClusterGroup | null>(null);
  const planLine = useRef<L.Polyline | null>(null);
  const userMarker = useRef<L.Marker | null>(null);
  const [planGeometry, setPlanGeometry] = useState<[number, number][] | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const map = L.map(mapNode.current, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: true,
      zoomSnap: coarsePointer ? 0.05 : 1,
      zoomDelta: coarsePointer ? 0.5 : 1,
      doubleClickZoom: !coarsePointer,
    }).setView([51.5305, 46.0375], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png', {
      subdomains: 'abc',
      maxZoom: 19,
      minZoom: 3,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
    markerLayer.current = L.markerClusterGroup({
      maxClusterRadius: 38,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      zoomToBoundsOnClick: true,
      iconCreateFunction: (cluster) => L.divIcon({
        className: 'map-cluster',
        html: `<span>${cluster.getChildCount()}</span>`,
        iconSize: [40, 40],
      }),
    }).addTo(map);
    mapRef.current = map;
    const updateZoom = () => {
      if (mapNode.current) mapNode.current.dataset.zoom = String(map.getZoom());
    };
    map.on('zoomend', updateZoom);
    updateZoom();

    const resize = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resize.observe(mapNode.current);
    return () => {
      resize.disconnect();
      userMarker.current?.remove();
      userMarker.current = null;
      map.remove();
      mapRef.current = null;
      markerLayer.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!userPoint) {
      userMarker.current?.remove();
      userMarker.current = null;
      return;
    }
    const position: [number, number] = [userPoint.lat, userPoint.lng];
    if (userMarker.current) {
      userMarker.current.setLatLng(position);
      return;
    }
    const icon = L.divIcon({
      className: 'map-user-pin',
      html: '<span class="map-user-pin-pulse"></span><span class="map-user-pin-dot"></span>',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
    userMarker.current = L.marker(position, {
      icon,
      interactive: false,
      zIndexOffset: 1200,
    }).addTo(map);
  }, [userPoint]);

  useEffect(() => {
    if (!window.matchMedia('(pointer: coarse)').matches) return;
    const node = mapNode.current;
    const map: L.Map | null = mapRef.current;
    if (!map || !node) return;
    const activeMap: L.Map = map;
    const activeNode: HTMLDivElement = node;

    let lastTapAt = 0;
    let lastTapPoint: L.Point | null = null;
    let gesture: { startY: number; startZoom: number; anchor: L.LatLng; moved: boolean } | null = null;
    let pendingZoom: number | null = null;
    let zoomFrame = 0;

    function pointFor(touch: Touch) {
      const rect = activeNode.getBoundingClientRect();
      return L.point(touch.clientX - rect.left, touch.clientY - rect.top);
    }

    function applyPendingZoom() {
      zoomFrame = 0;
      if (!gesture || pendingZoom === null) return;
      const nextZoom = pendingZoom;
      pendingZoom = null;
      if (Math.abs(nextZoom - activeMap.getZoom()) > 0.001) {
        activeMap.setZoomAround(gesture.anchor, nextZoom, { animate: false });
      }
    }

    function cancelGesture() {
      if (zoomFrame) {
        cancelAnimationFrame(zoomFrame);
        zoomFrame = 0;
      }
      pendingZoom = null;
      if (!gesture) return;
      gesture = null;
      activeMap.dragging.enable();
    }

    function onTouchStart(event: TouchEvent) {
      if (event.touches.length !== 1) {
        cancelGesture();
        lastTapAt = 0;
        lastTapPoint = null;
        return;
      }
      if (event.target instanceof Element && event.target.closest('.leaflet-control')) return;
      if (gesture) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const point = pointFor(event.touches[0]);
      const now = Date.now();
      if (lastTapPoint && now - lastTapAt < 320 && point.distanceTo(lastTapPoint) < 32) {
        event.preventDefault();
        event.stopPropagation();
        activeMap.dragging.disable();
        gesture = {
          startY: point.y,
          startZoom: activeMap.getZoom(),
          anchor: activeMap.containerPointToLatLng(point),
          moved: false,
        };
        lastTapAt = 0;
        lastTapPoint = null;
        return;
      }
      lastTapAt = now;
      lastTapPoint = point;
    }

    function onTouchMove(event: TouchEvent) {
      if (!gesture) return;
      if (event.touches.length !== 1) {
        cancelGesture();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const point = pointFor(event.touches[0]);
      if (Math.abs(point.y - gesture.startY) > 6) gesture.moved = true;
      const delta = (gesture.startY - point.y) / 120;
      pendingZoom = Math.max(
        activeMap.getMinZoom(),
        Math.min(activeMap.getMaxZoom(), gesture.startZoom + delta),
      );
      if (!zoomFrame) zoomFrame = requestAnimationFrame(applyPendingZoom);
    }

    function onTouchEnd(event: TouchEvent) {
      if (!gesture) return;
      event.preventDefault();
      event.stopPropagation();
      const finished = gesture;
      gesture = null;
      if (zoomFrame) {
        cancelAnimationFrame(zoomFrame);
        zoomFrame = 0;
      }
      pendingZoom = null;
      activeMap.dragging.enable();
      if (!finished.moved) {
        activeMap.setZoomAround(
          finished.anchor,
          Math.min(activeMap.getMaxZoom(), finished.startZoom + 1),
          { animate: true },
        );
      }
    }

    function onTouchCancel() {
      cancelGesture();
    }

    node.addEventListener('touchstart', onTouchStart, { passive: false, capture: true });
    node.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    node.addEventListener('touchend', onTouchEnd, { passive: false, capture: true });
    node.addEventListener('touchcancel', onTouchCancel, { capture: true });
    return () => {
      node.removeEventListener('touchstart', onTouchStart, { capture: true });
      node.removeEventListener('touchmove', onTouchMove, { capture: true });
      node.removeEventListener('touchend', onTouchEnd, { capture: true });
      node.removeEventListener('touchcancel', onTouchCancel, { capture: true });
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle('map-is-fullscreen', fullscreen);
    const timer = window.setTimeout(() => mapRef.current?.invalidateSize({ pan: false }), 120);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('map-is-fullscreen');
    };
  }, [fullscreen]);

  useEffect(() => {
    const sync = () => setFavoriteIds(readFavoritePlaceIds());
    window.addEventListener('storage', sync);
    window.addEventListener(PLACE_FAVORITES_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(PLACE_FAVORITES_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    const place = searchParams.get('place');
    if (place) setSelectedId(place);
  }, [searchParams]);

  useEffect(() => {
    setPlan(readPlan());
  }, []);

  const requestedTag = searchParams.get('tag');
  const availableTags = new Set(objects.flatMap((object) => [...tagsForObject(object)]));
  const activeTag = requestedTag && availableTags.has(requestedTag) ? requestedTag : null;

  const visibleObjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return objects.filter((object) => {
      if (activeTag && !tagsForObject(object).has(activeTag)) return false;
      if (!needle) return true;
      return [
        object.name,
        object.address,
        object.description,
        object.category,
        object.era,
        object.artType,
        object.artist,
      ].some((value) => String(value || '').toLowerCase().includes(needle));
    });
  }, [activeTag, objects, query]);

  const selected = objects.find((object) => object.id === selectedId) || null;

  useEffect(() => {
    if (loading || !selectedId) return;
    if (!visibleObjects.some((object) => object.id === selectedId)) {
      setSelectedId(null);
    }
  }, [loading, selectedId, visibleObjects]);

  function selectTag(tag: string | null) {
    const next = new URLSearchParams(searchParams);
    if (tag) next.set('tag', tag);
    else next.delete('tag');
    next.delete('place');
    setSelectedId(null);
    setSearchParams(next, { replace: true });
  }

  function closeSelected() {
    setSelectedId(null);
    if (searchParams.get('place')) {
      const next = new URLSearchParams(searchParams);
      next.delete('place');
      setSearchParams(next, { replace: true });
    }
  }

  useEffect(() => {
    if (!mapRef.current || !markerLayer.current) return;
    markerLayer.current.clearLayers();
    markers.current.clear();

    for (const object of visibleObjects) {
      if (object.lat == null || object.lng == null) continue;
      const icon = L.divIcon({
        className: `map-object-pin${selectedIdRef.current === object.id ? ' selected' : ''}`,
        html: object.image
          ? `<span class="map-pin-photo"><img src="${object.image}" alt="" loading="lazy"></span><span class="map-pin-dot"></span>`
          : '<span class="map-pin-dot"></span>',
        iconSize: [42, 48],
        iconAnchor: [21, 44],
      });
      const marker = L.marker([object.lat, object.lng], { icon, title: object.name, keyboard: true })
        .addTo(markerLayer.current)
        .on('click', () => setSelectedId(object.id));
      markers.current.set(object.id, marker);
    }
  }, [objects, visibleObjects]);

  const routeWaypoints = useMemo(() => {
    const stops = plan
      .map((id) => objects.find((object) => object.id === id))
      .filter((object): object is CityObject => Boolean(object && object.lat != null && object.lng != null))
      .map((object) => [object.lat as number, object.lng as number] as [number, number]);
    if (walkStarted && userPoint) {
      return [[userPoint.lat, userPoint.lng] as [number, number], ...stops];
    }
    return stops;
  }, [objects, plan, userPoint, walkStarted]);

  useEffect(() => {
    if (routeWaypoints.length < 2) {
      setPlanGeometry(null);
      return;
    }
    setPlanGeometry(null);
    const controller = new AbortController();
    const coordinates = routeWaypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
    fetch(
      `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${coordinates}?overview=full&geometries=geojson`,
      { signal: controller.signal },
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { routes?: Array<{ geometry?: { coordinates?: [number, number][] } }> } | null) => {
        const coordinatesList = data?.routes?.[0]?.geometry?.coordinates;
        if (!Array.isArray(coordinatesList) || coordinatesList.length < 2) return;
        setPlanGeometry(coordinatesList.map(([lng, lat]) => [lat, lng] as [number, number]));
      })
      .catch(() => {
        // Keep the straight fallback when routing is unavailable.
      });
    return () => controller.abort();
  }, [routeWaypoints]);

  useEffect(() => {
    if (!mapRef.current) return;
    planLine.current?.remove();
    planLine.current = null;
    const planPoints = planGeometry && planGeometry.length > 1 ? planGeometry : routeWaypoints;
    if (planPoints.length > 1) {
      planLine.current = L.polyline(planPoints, {
        color: '#d8ff3e',
        weight: 6,
        opacity: 1,
        dashArray: '2 8',
      }).addTo(mapRef.current);
    }
    return () => {
      planLine.current?.remove();
      planLine.current = null;
    };
  }, [routeWaypoints, planGeometry]);

  useEffect(() => {
    for (const marker of markers.current.values()) {
      marker.getElement()?.classList.remove('selected');
    }
    if (!selected || selected.lat == null || selected.lng == null || !mapRef.current) return;
    const map = mapRef.current;
    const marker = markers.current.get(selected.id);
    if (marker && markerLayer.current) {
      markerLayer.current.zoomToShowLayer(marker, () => {
        marker.getElement()?.classList.add('selected');
        map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 16), { duration: 0.45 });
      });
      return;
    }
    map.flyTo([selected.lat, selected.lng], Math.max(map.getZoom(), 15), { duration: 0.45 });
  }, [selected]);

  function toggleFavorite(id: string) {
    const next = favoriteIds.includes(id)
      ? favoriteIds.filter((favoriteId) => favoriteId !== id)
      : [...favoriteIds, id];
    writeFavoritePlaceIds(next);
    setFavoriteIds(next);
  }

  function togglePlan(id: string) {
    const next = plan.includes(id) ? plan.filter((planId) => planId !== id) : [...plan, id];
    if (!next.length) setWalkStarted(false);
    writePlan(next);
    setPlan(next);
  }

  function startPlanDrag(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
    event.preventDefault();
    event.stopPropagation();
    const index = plan.indexOf(id);
    if (index < 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragPlanRef.current = { id, pointerId: event.pointerId };
    dragPlanTarget.current = index;
    setDragPlanId(id);
    setDragPlanInsert(index);
  }

  function movePlanDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragPlanRef.current) return;
    event.preventDefault();
    const rows = [...document.querySelectorAll<HTMLElement>('.map-plan-row[data-plan-id]')];
    if (!rows.length) return;
    let insert = rows.length;
    for (let index = 0; index < rows.length; index += 1) {
      const rect = rows[index].getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) {
        insert = index;
        break;
      }
    }
    insert = Math.max(0, Math.min(plan.length, insert));
    dragPlanTarget.current = insert;
    setDragPlanInsert(insert);
  }

  function endPlanDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragged = dragPlanRef.current;
    if (!dragged) return;
    event.preventDefault();
    event.stopPropagation();
    const from = plan.indexOf(dragged.id);
    const insert = dragPlanTarget.current ?? from;
    const target = insert > from ? insert - 1 : insert;
    dragPlanRef.current = null;
    dragPlanTarget.current = null;
    if (event.currentTarget.hasPointerCapture(dragged.pointerId)) {
      event.currentTarget.releasePointerCapture(dragged.pointerId);
    }
    setDragPlanId(null);
    setDragPlanInsert(null);
    if (from < 0 || target === from) return;
    const next = [...plan];
    const [moved] = next.splice(from, 1);
    next.splice(target, 0, moved);
    writePlan(next);
    setPlan(next);
  }

  function cancelPlanDrag() {
    dragPlanRef.current = null;
    dragPlanTarget.current = null;
    setDragPlanId(null);
    setDragPlanInsert(null);
  }

  async function locate() {
    setLocating(true);
    const point = await readCurrentPoint();
    setLocating(false);
    if (!point) return;
    setUserPoint(point);
    mapRef.current?.flyTo([point.lat, point.lng], 15, { duration: 0.6 });
  }

  async function startWalk() {
    setLocating(true);
    const point = await readCurrentPoint();
    setLocating(false);
    if (point) setUserPoint(point);
    setWalkStarted(true);
    const first = planObjects.find((object) => object.lat != null && object.lng != null) || planObjects[0];
    if (first) setSelectedId(first.id);
  }

  async function optimizePlan() {
    const stops = plan
      .map((id) => objects.find((object) => object.id === id))
      .filter((object): object is CityObject => Boolean(object && object.lat != null && object.lng != null))
      .map((object) => ({ id: object.id, lat: object.lat as number, lng: object.lng as number }));
    if (stops.length < 2) return;
    setPlanOptimizing(true);
    let start = userPoint ?? undefined;
    if (!start) {
      const point = await readCurrentPoint();
      if (point) {
        start = point;
        setUserPoint(point);
      }
    }
    try {
      let ordered: string[];
      try {
        ordered = await roadOptimizedOrder(stops, start);
      } catch {
        ordered = optimizeStopOrder(stops, start);
      }
      const missing = plan.filter((id) => !ordered.includes(id));
      const next = [...ordered, ...missing];
      writePlan(next);
      setPlan(next);
    } finally {
      setPlanOptimizing(false);
    }
  }

  const sortedObjects = useMemo(() => {
    if (!userPoint) return visibleObjects;
    return [...visibleObjects].sort((a, b) => {
      if (a.lat == null || a.lng == null) return 1;
      if (b.lat == null || b.lng == null) return -1;
      return distanceMeters(userPoint, { lat: a.lat, lng: a.lng })
        - distanceMeters(userPoint, { lat: b.lat, lng: b.lng });
    });
  }, [userPoint, visibleObjects]);

  const planObjects = plan
    .map((id) => objects.find((object) => object.id === id))
    .filter((object): object is CityObject => Boolean(object));

  return (
    <main className="page map-page">
      <div className="map-page-tools">
        <label className="search-box">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Название, адрес или описание"
            aria-label="Поиск объектов на карте"
          />
        </label>
        <div className="map-head-actions">
          <Link to="/routes" className="button button-outline"><Route size={16} /> Маршруты</Link>
          <button type="button" className="button button-dark" onClick={() => setShowPlan(true)}>
            Моя прогулка · {plan.length}
          </button>
        </div>
      </div>

      <TagFilters objects={objects} activeTag={activeTag} onSelect={selectTag} />

      {error ? <div className="notice error">{error}</div> : null}

      <div className="map-layout">
        <aside className="map-sidebar">
          <div className="map-sidebar-head">
            <strong>{showPlan ? 'Моя прогулка' : 'Объекты'}</strong>
            <div className="map-sidebar-head-right">
              <span>{showPlan ? planObjects.length : sortedObjects.length}</span>
              {showPlan ? (
                <button
                  type="button"
                  className="icon-button map-plan-close"
                  onClick={() => setShowPlan(false)}
                  aria-label="Показать объекты"
                >
                  <X size={15} />
                </button>
              ) : null}
            </div>
          </div>

          {showPlan ? (
            planObjects.length ? (
              <div className="map-plan-list">
                {planObjects.map((object, index) => (
                  <div
                    className={`map-plan-row${dragPlanId === object.id ? ' is-dragging' : ''}${dragPlanId && dragPlanInsert === index ? ' is-drop-before' : ''}${dragPlanId && dragPlanInsert === planObjects.length && index === planObjects.length - 1 ? ' is-drop-after' : ''}`}
                    key={object.id}
                    data-plan-id={object.id}
                  >
                    <span>{index + 1}</span>
                    <button type="button" className="map-plan-object" onClick={() => setSelectedId(object.id)}>
                      <strong title={object.name}>{object.name}</strong>
                      <small title={object.address}>{object.address}</small>
                    </button>
                    <button
                      type="button"
                      className="map-plan-drag"
                      onPointerDown={(event) => startPlanDrag(event, object.id)}
                      onPointerMove={movePlanDrag}
                      onPointerUp={endPlanDrag}
                      onPointerCancel={cancelPlanDrag}
                      aria-label={`Перетащить остановку: ${object.name}`}
                      title="Перетащить"
                    >
                      <MoreVertical size={17} />
                    </button>
                    <button type="button" className="icon-button map-plan-remove" onClick={() => togglePlan(object.id)} aria-label={`Убрать из прогулки: ${object.name}`}>
                      <X size={15} />
                    </button>
                  </div>
                ))}
                <div className="map-plan-actions">
                  {planObjects.length > 0 ? (
                    <button
                      type="button"
                      className="button button-dark"
                      onClick={() => void startWalk()}
                      disabled={locating}
                    >
                      Начать прогулку
                    </button>
                  ) : null}
                  {planObjects.length >= 2 ? (
                    <button
                      type="button"
                      className="button button-outline"
                      onClick={() => void optimizePlan()}
                      disabled={planOptimizing}
                    >
                      {planOptimizing ? 'Строю…' : 'Кратчайший маршрут'}
                    </button>
                  ) : null}
                  <button type="button" className="button button-outline" onClick={() => {
                    writePlan([]);
                    setPlan([]);
                    setWalkStarted(false);
                  }}>
                    Очистить прогулку
                  </button>
                </div>
              </div>
            ) : (
              <div className="map-empty">
                <Route size={28} />
                <p>Добавляйте объекты в прогулку кнопкой на карточке.</p>
              </div>
            )
          ) : (
            <div className="map-object-list">
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => <div className="map-object-skeleton" key={index} />)
              ) : sortedObjects.map((object) => (
                <MapObjectRow
                  key={object.key}
                  object={object}
                  selected={selected?.id === object.id}
                  onSelect={() => setSelectedId(object.id)}
                />
              ))}
            </div>
          )}
        </aside>

        <section className={`map-canvas-wrap${fullscreen ? ' is-fullscreen' : ''}${selected ? ' has-selection' : ''}`} aria-label="Карта объектов">
          <div className="map-canvas" ref={mapNode} />
          <button
            type="button"
            className="map-fullscreen-toggle"
            onClick={() => setFullscreen((value) => !value)}
            aria-label={fullscreen ? 'Закрыть полноэкранную карту' : 'Открыть карту на весь экран'}
            title={fullscreen ? 'Выйти из полноэкранного режима' : 'На весь экран'}
          >
            {fullscreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
          </button>
          <button
            type="button"
            className="map-locate-toggle"
            onClick={locate}
            disabled={locating}
            aria-label="Показать мое местоположение"
            title="Найти меня"
          >
            <Navigation size={18} />
          </button>
          {selected ? (
            <article className="map-selected-card">
              <button type="button" className="map-selected-close icon-button" onClick={closeSelected} aria-label="Закрыть карточку">
                <X size={16} />
              </button>
              {selected.image ? <img src={selected.image} alt={selected.name} /> : null}
              <div className="map-selected-copy">
                <span className="section-kicker">{selected.category}</span>
                <h2>{selected.name}</h2>
                <p className="map-selected-address"><MapPin size={14} /> {selected.address}</p>
                <p>{selected.description}</p>
                <div className="map-selected-actions">
                  <Link to={selected.detailPath} className="button button-dark">Подробнее</Link>
                  <button
                    type="button"
                    className={`button button-outline${favoriteIds.includes(selected.id) ? ' is-saved' : ''}`}
                    onClick={() => toggleFavorite(selected.id)}
                  >
                    {favoriteIds.includes(selected.id) ? <HeartOff size={16} /> : <Heart size={16} />}
                    {favoriteIds.includes(selected.id) ? 'В избранном' : 'В избранное'}
                  </button>
                  <button
                    type="button"
                    className={`button ${plan.includes(selected.id) ? 'button-dark' : 'button-outline'}`}
                    onClick={() => togglePlan(selected.id)}
                    disabled={selected.lat == null || selected.lng == null}
                  >
                    <Plus size={16} /> {plan.includes(selected.id) ? 'В маршруте' : 'Добавить в маршрут'}
                  </button>
                </div>
                {selected.lat == null || selected.lng == null ? (
                  <small className="map-no-point">У объекта нет точной точки на карте.</small>
                ) : null}
              </div>
            </article>
          ) : null}
        </section>
      </div>
      <p className="map-attribution">
        Карта: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>
      </p>
    </main>
  );
}
