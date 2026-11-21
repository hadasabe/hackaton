import { ArrowLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

export function BackLink({ fallback = '/' }: { fallback?: string }) {
  const navigate = useNavigate();
  const location = useLocation();

  function goBack() {
    if (location.key !== 'default' && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(fallback);
  }

  return (
    <button type="button" className="back-link" onClick={goBack}>
      <ArrowLeft size={16} /> Назад
    </button>
  );
}
