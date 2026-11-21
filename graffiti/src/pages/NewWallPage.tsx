import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ImagePlus, Upload } from 'lucide-react';
import { api } from '../lib/api';
import {
  WALL_TERMS_META,
  WALL_TERMS_OPTIONS,
  WALL_TYPE_META,
  WALL_TYPE_OPTIONS,
} from '../lib/constants';
import type { WallTerms, WallType } from '../lib/types';
import { BackLink } from '../components/BackLink';

export function NewWallPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');
  const [contact, setContact] = useState('');
  const [type, setType] = useState<WallType>('wall');
  const [size, setSize] = useState('');
  const [terms, setTerms] = useState<WallTerms>('negotiable');
  const [priceNote, setPriceNote] = useState('');
  const [description, setDescription] = useState('');
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pickFile(nextFile: File | undefined) {
    if (!nextFile) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(nextFile.type)) {
      setError('Можно загрузить JPG, PNG или WEBP.');
      return;
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      setError('Файл больше 10 МБ.');
      return;
    }
    setError('');
    setFile(nextFile);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file || !title.trim() || !address.trim() || !contact.trim() || !consent) return;
    setSending(true);
    setError('');
    try {
      const form = new FormData();
      form.append('photo', file);
      form.append('title', title.trim());
      form.append('address', address.trim());
      form.append('contact', contact.trim());
      form.append('type', type);
      form.append('size', size.trim());
      form.append('terms', terms);
      form.append('price_note', priceNote.trim());
      form.append('description', description.trim());
      await api.createWall(form);
      navigate('/account', { state: { wallSubmitted: true } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось выложить стену');
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="page page-narrow">
      <BackLink fallback="/walls" />
      <div className="submit-head">
        <span className="section-kicker">Для владельцев</span>
        <h1>Выложить стену</h1>
        <p>Расскажите, что за поверхность, где она находится и на каких условиях готовы дать её художнику.</p>
      </div>

      <form className="submit-form" onSubmit={(event) => void submit(event)}>
        <div className={`upload-zone ${file ? 'has-file' : ''}`}>
          {preview ? (
            <img src={preview} alt="Предпросмотр стены" />
          ) : (
            <div className="upload-placeholder">
              <ImagePlus size={35} />
              <strong>Фото стены</strong>
              <span>JPG, PNG или WEBP · до 10 МБ</span>
            </div>
          )}
          <label className="upload-overlay">
            <Upload size={17} />
            {file ? 'Заменить фото' : 'Выбрать фото'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => pickFile(event.target.files?.[0])}
            />
          </label>
        </div>

        <div className="form-grid">
          <label className="field field-wide">
            <span>Название</span>
            <input
              className="input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Например: Гараж во дворе на Сакко"
              maxLength={100}
              required
            />
          </label>
          <label className="field field-wide">
            <span>Адрес</span>
            <input
              className="input"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Улица, дом, ориентир"
              maxLength={160}
              required
            />
          </label>
          <label className="field field-wide">
            <span>Контакт для связи</span>
            <input
              className="input"
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              placeholder="Телефон, email, Telegram или ВК"
              maxLength={200}
              required
            />
          </label>
          <label className="field">
            <span>Тип поверхности</span>
            <select className="input" value={type} onChange={(event) => setType(event.target.value as WallType)}>
              {WALL_TYPE_OPTIONS.map((value) => (
                <option key={value} value={value}>{WALL_TYPE_META[value].label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Размер <em>необязательно</em></span>
            <input
              className="input"
              value={size}
              onChange={(event) => setSize(event.target.value)}
              placeholder="Например: 6 × 2,5 м"
              maxLength={40}
            />
          </label>
          <label className="field">
            <span>Условия</span>
            <select className="input" value={terms} onChange={(event) => setTerms(event.target.value as WallTerms)}>
              {WALL_TERMS_OPTIONS.map((value) => (
                <option key={value} value={value}>{WALL_TERMS_META[value].label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Цена или комментарий <em>необязательно</em></span>
            <input
              className="input"
              value={priceNote}
              onChange={(event) => setPriceNote(event.target.value)}
              placeholder="Например: 3 000 ₽ или краска за ваш счёт"
              maxLength={200}
            />
          </label>
          <label className="field field-wide">
            <span>Описание</span>
            <textarea
              className="textarea"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Состояние стены, освещение, как пройти, что можно рисовать"
              maxLength={800}
              rows={4}
            />
          </label>
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          <span>Я владелец стены или представляю владельца и могу разрешить нанесение работы.</span>
        </label>

        {error ? <div className="notice error">{error}</div> : null}

        <button
          type="submit"
          className="button button-dark button-wide"
          disabled={sending || !file || !title.trim() || !address.trim() || !contact.trim() || !consent}
        >
          {sending ? 'Публикуем…' : 'Опубликовать стену'}
        </button>
      </form>
    </main>
  );
}
