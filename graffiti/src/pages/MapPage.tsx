import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as L from 'leaflet';
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


function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const lat1 = a.lat * rad;
  const lat2 = b.lat * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
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
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('place'));
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => readFavoritePlaceIds());
  const [plan, setPlan] = useState<string[]>(() => readPlan());
  const [showPlan, setShowPlan] = useState(() => searchParams.get('plan') === '1');
  const [locating, setLocating] = useState(false);
  const [userPoint, setUserPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayer = useRef<L.MarkerClusterGroup | null>(null);
  const planLine = useRef<L.Polyline | null>(null);
  const markers = useRef(new Map<string, L.Marker>());

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;
    const map = L.map(mapNode.current, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: true,
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

    const resize = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resize.observe(mapNode.current);
    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
      markerLayer.current = null;
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
    if (!selectedId && searchParams.get('place')) setSelectedId(searchParams.get('place'));
  }, [searchParams, selectedId]);

  useEffect(() => {
    setPlan(readPlan());
  }, []);

  const visibleObjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return objects.filter((object) => {
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
  }, [objects, query]);

  const selected = objects.find((object) => object.id === selectedId) || null;

  useEffect(() => {
    if (!mapRef.current || !markerLayer.current) return;
    markerLayer.current.clearLayers();
    markers.current.clear();
    const map = mapRef.current;

    for (const object of visibleObjects) {
      if (object.lat == null || object.lng == null) continue;
      const icon = L.divIcon({
        className: `map-object-pin${selected?.id === object.id ? ' selected' : ''}`,
        html: object.image
          ? `<span class="map-pin-photo"><img src="${object.image}" alt="" loading="lazy"></span><span class="map-pin-dot"></span>`
          : '<span class="map-pin-dot"></span>',
        iconSize: [42, 48],
        iconAnchor: [21, 44],
      });
      const marker = L.marker([object.lat, object.lng], { icon, title: object.name, keyboard: true })
        .bindTooltip(object.name, { direction: 'top', offset: [0, -34] })
        .addTo(markerLayer.current)
        .on('click', () => setSelectedId(object.id));
      markers.current.set(object.id, marker);
    }

    planLine.current?.remove();
    planLine.current = null;
    const planPoints = plan
      .map((id) => objects.find((object) => object.id === id))
      .filter((object): object is CityObject => Boolean(object && object.lat != null && object.lng != null))
      .map((object) => [object.lat as number, object.lng as number] as [number, number]);
    if (planPoints.length > 1) {
      planLine.current = L.polyline(planPoints, {
        color: '#111111',
        weight: 5,
        opacity: 0.75,
        dashArray: '2 8',
      }).addTo(map);
    }
    return () => {
      planLine.current?.remove();
      planLine.current = null;
    };
  }, [objects, plan, selected?.id, visibleObjects]);

  useEffect(() => {
    if (!selected || selected.lat == null || selected.lng == null || !mapRef.current) return;
    const map = mapRef.current;
    const marker = markers.current.get(selected.id);
    if (marker && markerLayer.current) {
      markerLayer.current.zoomToShowLayer(marker, () => {
        marker.openTooltip();
        map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 16), { duration: 0.6 });
      });
      return;
    }
    map.flyTo([selected.lat, selected.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
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
    writePlan(next);
    setPlan(next);
  }

  function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        setUserPoint(point);
        mapRef.current?.flyTo([point.lat, point.lng], 15, { duration: 0.6 });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
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
          <button type="button" className="button button-dark" onClick={() => setShowPlan((value) => !value)}>
            Моя прогулка · {plan.length}
          </button>
          <button type="button" className="button button-outline" onClick={locate} disabled={locating}>
            <Navigation size={16} /> {locating ? 'Ищу…' : 'Рядом'}
          </button>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      <div className="map-layout">
        <aside className="map-sidebar">
          <div className="map-sidebar-head">
            <strong>{showPlan ? 'Моя прогулка' : 'Объекты'}</strong>
            <span>{showPlan ? planObjects.length : sortedObjects.length}</span>
          </div>

          {showPlan ? (
            planObjects.length ? (
              <div className="map-plan-list">
                {planObjects.map((object, index) => (
                  <div className="map-plan-row" key={object.id}>
                    <span>{index + 1}</span>
                    <button type="button" className="map-plan-object" onClick={() => setSelectedId(object.id)}>
                      <strong>{object.name}</strong>
                      <small>{object.address}</small>
                    </button>
                    <button type="button" className="icon-button" onClick={() => togglePlan(object.id)} aria-label={`Убрать из прогулки: ${object.name}`}>
                      <X size={15} />
                    </button>
                  </div>
                ))}
                {planObjects.length >= 2 ? (
                  <Link to="/routes?create=1" className="button button-dark">Опубликовать прогулку</Link>
                ) : null}
                <button type="button" className="text-button" onClick={() => {
                  writePlan([]);
                  setPlan([]);
                }}>
                  Очистить прогулку
                </button>
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

        <section className={`map-canvas-wrap${fullscreen ? ' is-fullscreen' : ''}`} aria-label="Карта объектов">
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
          {selected ? (
            <article className="map-selected-card">
              <button type="button" className="map-selected-close icon-button" onClick={() => setSelectedId(null)} aria-label="Закрыть карточку">
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
                    <Plus size={16} /> {plan.includes(selected.id) ? 'В прогулке' : 'В прогулку'}
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
