import { Link } from 'react-router-dom';
import { ArrowLeft, Building2, ImagePlus, ShieldCheck } from 'lucide-react';

export function AddObjectPage() {
  return (
    <main className="page page-narrow add-object-page">
      <Link to="/" className="back-link"><ArrowLeft size={16} /> К ленте</Link>

      <div className="submit-head">
        <span className="section-kicker">Пополнить ленту</span>
        <h1>Добавить объект</h1>
        <p>Предложите граффити или добавьте городское здание. Заявка появится в ленте после проверки.</p>
      </div>

      <div className="add-object-grid">
        <Link to="/submit" className="add-object-card">
          <span className="add-object-icon"><ImagePlus size={28} /></span>
          <div>
            <span className="section-kicker">Стрит-арт</span>
            <h2>Добавить граффити</h2>
            <p>Фото работы, адрес, стиль и состояние. Подойдёт мурал, надпись или дворовая работа.</p>
          </div>
        </Link>

        <Link to="/add-building" className="add-object-card">
          <span className="add-object-icon"><Building2 size={28} /></span>
          <div>
            <span className="section-kicker">Архитектура и места</span>
            <h2>Добавить здание</h2>
            <p>Фото, название, адрес и точка на карте. После проверки объект появится в ленте и на карте.</p>
          </div>
        </Link>
      </div>

      <p className="add-object-note"><ShieldCheck size={16} /> Все заявки проходят ручную проверку редакции.</p>
    </main>
  );
}
