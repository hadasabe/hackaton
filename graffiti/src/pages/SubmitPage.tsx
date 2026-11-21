import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ImagePlus, Sparkles, Upload } from 'lucide-react';
import { api } from '../lib/api';
import { STATUS_META, STATUS_OPTIONS, STYLE_META, STYLE_OPTIONS } from '../lib/constants';
import type { Status, Style } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { BackLink } from '../components/BackLink';

export function SubmitPage() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState<Status>('alive');
  const [style, setStyle] = useState<Style>('graffiti');
  const [description, setDescription] = useState('');
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
    if (!file || !address.trim() || !consent) return;
    setSending(true);
    setError('');
    try {
      const form = new FormData();
      form.append('photo', file);
      form.append('address', address.trim());
      form.append('status', status);
      form.append('style', style);
      form.append('description', description.trim());
      await api.submit(form);
      setSuccess(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отправить заявку');
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setFile(null);
    setAddress('');
    setStatus('alive');
    setStyle('graffiti');
    setDescription('');
    setConsent(false);
    setSuccess(false);
    setError('');
  }

  if (success) {
    return (
      <main className="page page-narrow">
        <div className="success-card">
          <CheckCircle2 size={42} />
          <span className="section-kicker">Заявка отправлена</span>
          <h1>Спасибо! Фото ушло на проверку</h1>
          <p>
            Администратор посмотрит адрес и теги. После публикации работа появится в ленте.
            Обычно это занимает немного времени.
          </p>
          <div className="row gap-10 wrap center">
            <Link to="/" className="button button-dark">К ленте</Link>
            <button type="button" className="button button-outline" onClick={reset}>
              Добавить ещё
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page page-narrow">
      <BackLink fallback="/add" />
      <div className="submit-head">
        <span className="section-kicker">Пополнить архив</span>
        <h1>Добавить граффити</h1>
        <p>Загрузите фото, укажите адрес и два тега. Опубликуем после проверки — так в ленте не будет мусора.</p>
        <div className="ai-note">
          <Sparkles size={16} />
          <span>
            Фото сначала проверяет AI: граффити ли это, нет ли NSFW и плохого качества.
            Спорные заявки смотрит администратор.
          </span>
        </div>
        {user ? <p className="submit-as">Заявка от <strong>{user.name}</strong></p> : null}
      </div>

      <form className="submit-form" onSubmit={(event) => void submit(event)}>
        <div className={`upload-zone ${file ? 'has-file' : ''}`}>
          {preview ? (
            <img src={preview} alt="Предпросмотр загруженного граффити" />
          ) : (
            <div className="upload-placeholder">
              <ImagePlus size={35} />
              <strong>Фото работы</strong>
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
            <span>Адрес</span>
            <input
              className="input"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Например: проспект Кирова, 34"
              maxLength={160}
              required
            />
          </label>

          <label className="field">
            <span>Статус</span>
            <select className="input" value={status} onChange={(event) => setStatus(event.target.value as Status)}>
              {STATUS_OPTIONS.map((value) => (
                <option key={value} value={value}>{STATUS_META[value].label}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Стиль</span>
            <select className="input" value={style} onChange={(event) => setStyle(event.target.value as Style)}>
              {STYLE_OPTIONS.map((value) => (
                <option key={value} value={value}>{STYLE_META[value].label}</option>
              ))}
            </select>
          </label>

          <label className="field field-wide">
            <span>Описание <em>необязательно</em></span>
            <textarea
              className="textarea"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Что изображено, когда появилось, что важно знать"
              maxLength={600}
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
          <span>Я сделал это фото сам или у меня есть разрешение на публикацию.</span>
        </label>

        {error ? <div className="notice error">{error}</div> : null}

        <button
          type="submit"
          className="button button-dark button-wide"
          disabled={sending || !file || !address.trim() || !consent}
        >
          {sending ? 'Отправляем…' : 'Отправить на проверку'}
        </button>
      </form>
    </main>
  );
}
