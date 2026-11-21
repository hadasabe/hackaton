import type { CityObject } from '../lib/cityObjects';
import { sortedTagOptions, tagCountsFor } from '../lib/tags';

export function TagFilters({
  objects,
  activeTag,
  onSelect,
}: {
  objects: CityObject[];
  activeTag: string | null;
  onSelect: (tag: string | null) => void;
}) {
  const options = sortedTagOptions(tagCountsFor(objects));

  return (
    <div className="tag-filters">
      <span className="tag-filters-label">Теги</span>
      <div className="chip-row tag-filter-row" role="group" aria-label="Фильтр по тегам">
        <button
          type="button"
          className={`chip ${activeTag === null ? 'active' : ''}`}
          onClick={() => onSelect(null)}
        >
          Все · {objects.length}
        </button>
        {options.map(([tag, count]) => (
          <button
            key={tag}
            type="button"
            className={`chip ${activeTag === tag ? 'active' : ''}`}
            onClick={() => onSelect(tag)}
          >
            {tag} · {count}
          </button>
        ))}
      </div>
    </div>
  );
}
