import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowLeft, CheckCircle2, ImagePlus, MapPin, Upload } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { BackLink } from '../components/BackLink';

const CATEGORIES = ['Архитектура', 'История', 'Природа', 'Стрит-арт'];

export function AddBuildingPage() {
  const { user } = useAuth();
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');
  const [category, setCategory] = useState('Архитектура');
  const [description, setDescription] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;
    const map = L.map(mapNode.current, { zoomControl: true, scrollWheelZoom: true })
      .setView([51.5305, 46.0375], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png', {
      subdomains: 'abc',
      maxZoom: 19,
      minZoom: 3,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
    }).addTo(map);
    map.on('click', (event: L.LeafletMouseEvent) => {
      const point = { lat: event.latlng.lat, lng: event.latlng.lng };
      setLat(point.lat);
      setLng(point.lng);
      if (!markerRef.current) {
        markerRef.current = L.marker([point.lat, point.lng], { icon: L.divIcon({ className: 'building-picker-pin', iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(map);
      } else {
        markerRef.current.setLatLng([point.lat, point.lng]);
      }
    });
    mapRef.current = map;
    const resize = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resize.observe(mapNode.current);
    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  function pickFile(next: File | undefined) {
    if (!next) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type)) {
      setError('Можно загрузить JPG, PNG или WEBP.');
      return;
    }
    if (next.size > 10 * 1024 * 1024) {
      setError('Файл больше 10 МБ.');
      return;
    }
    setError('');
    setFile(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file || !title.trim() || !address.trim() || lat === null || lng === null || !consent) return;
    setSending(true);
    setError('');
    try {
      const form = new FormData();
      form.append('photo', file);
      form.append('title', title.trim());
      form.append('address', address.trim());
      form.append('category', category);
      form.append('description', description.trim());
      form.append('lat', String(lat));
      form.append('lng', String(lng));
      form.append('consent', '1');
      await api.createWalkBuilding(form);
      setSuccess(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отправить заявку');
    } finally {
      setSending(false);
    }
  }

  if (success) {
    return (
      <main className="page page-narrow">
        <div className="success-card">
          <CheckCircle2 size={42} />
          <span className="section-kicker">Заявка отправлена</span>
          <h1>Объект отправлен на проверку</h1>
          <p>После проверки редакции объект появится в ленте и на карте.</p>
          <div className="row gap-10 wrap center">
            <Link to="/" className="button button-dark">К ленте</Link>
            <Link to="/account?tab=buildings" className="button button-outline">Мои объекты</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page page-narrow">
      <BackLink fallback="/add" />
      <div className="submit-head">
        <span className="section-kicker">Новый объект</span>
        <h1>Добавить объект</h1>
        <p>Загрузите фото, укажите адрес и отметьте точку на карте. После проверки объект появится в ленте.</p>
        {user ? <p className="submit-as">Заявка от <strong>{user.name}</strong></p> : null}
      </div>

      <form className="submit-form" onSubmit={(event) => void submit(event)}>
        <div className={`upload-zone ${file ? 'has-file' : ''}`}>
          {preview ? (
            <img src={preview} alt="Предпросмотр объекта" />
          ) : (
            <div className="upload-placeholder">
              <ImagePlus size={35} />
              <strong>Фото объекта</strong>
              <span>JPG, PNG или WEBP · до 10 МБ</span>
            </div>
          )}
          <label className="upload-overlay">
            <Upload size={17} />
            {file ? 'Заменить фото' : 'Выбрать фото'}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => pickFile(event.target.files?.[0])} />
          </label>
        </div>

        <div className="form-grid">
          <label className="field field-wide">
            <span>Название</span>
            <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} required />
          </label>
          <label className="field field-wide">
            <span>Адрес</span>
            <input className="input" value={address} onChange={(event) => setAddress(event.target.value)} maxLength={160} required />
          </label>
          <label className="field">
            <span>Категория</span>
            <select className="input" value={category} onChange={(event) => setCategory(event.target.value)}>
              {CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="field field-wide">
            <span>Описание <em>необязательно</em></span>
            <textarea className="textarea" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={800} rows={4} />
          </label>
        </div>

        <div className="building-picker">
          <div className="building-picker-head">
            <span><MapPin size={16} /> Точка на карте</span>
            <small>{lat !== null && lng !== null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : 'Кликните по карте'}</small>
          </div>
          <div className="building-picker-map" ref={mapNode} />
        </div>

        <label className="checkbox">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          <span>Я сделал это фото сам или у меня есть разрешение на публикацию.</span>
        </label>

        {error ? <div className="notice error">{error}</div> : null}

        <button
          type="submit"
          className="button button-dark button-wide"
          disabled={sending || !file || !title.trim() || !address.trim() || lat === null || lng === null || !consent}
        >
          {sending ? 'Отправляем…' : 'Отправить на проверку'}
        </button>
      </form>
    </main>
  );
}
