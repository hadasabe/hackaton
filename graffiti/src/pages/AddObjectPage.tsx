import { Link } from 'react-router-dom';
import { Building2, ImagePlus, Paintbrush, ShieldCheck } from 'lucide-react';
import { BackLink } from '../components/BackLink';

export function AddObjectPage() {
  return (
    <main className="page page-narrow add-object-page">
      <BackLink />

      <div className="submit-head">
        <span className="section-kicker">Пополнить ленту</span>
        <h1>Добавить объект</h1>
        <p>Выберите, что хотите добавить: граффити, городской объект или свободную стену. Заявка появится в ленте после проверки.</p>
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
            <span className="section-kicker">Архитектура, история, природа</span>
            <h2>Добавить объект</h2>
            <p>Фото, название, адрес и точка на карте. После проверки объект появится в ленте и на карте.</p>
          </div>
        </Link>

        <Link to="/walls/new" className="add-object-card">
          <span className="add-object-icon"><Paintbrush size={28} /></span>
          <div>
            <span className="section-kicker">Для владельцев</span>
            <h2>Выложить стену</h2>
            <p>Свободный фасад, гараж или забор для художников. Укажите фото, адрес и условия.</p>
          </div>
        </Link>
      </div>

      <p className="add-object-note"><ShieldCheck size={16} /> Все заявки проходят ручную проверку редакции.</p>
    </main>
  );
}
