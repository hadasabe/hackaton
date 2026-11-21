import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Check,
  Clock3,
  MapPin,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { STATUS_META, STATUS_OPTIONS, STYLE_META, STYLE_OPTIONS } from '../lib/constants';
import type { AdminCounts, AdminUser, AiCheck, ContentReport, Graffiti, Status, StatusReport, Style, Wall } from '../lib/types';
import { formatDate } from '../lib/format';
import { Tags } from '../components/GraffitiCard';
import { useConfirm } from '../components/ConfirmDialog';

type Tab = 'pending' | 'published' | 'rejected' | 'walls' | 'buildings' | 'reports' | 'status' | 'users';
type ReportTab = 'pending' | 'approved' | 'rejected';
type ReasonKind = 'graffiti' | 'wall' | 'report';

interface ReasonRequest {
  kind: ReasonKind;
  id: number;
  title: string;
  label: string;
  defaultValue: string;
}

const TAB_LABEL: Record<Tab, string> = {
  pending: 'На модерации',
  published: 'Опубликованные',
  rejected: 'Отклонённые',
  walls: 'Стены',
  buildings: 'Здания',
  reports: 'Жалобы',
  status: 'Статусы',
  users: 'Пользователи',
};

const REPORT_TAB_LABEL: Record<ReportTab, string> = {
  pending: 'На проверке',
  approved: 'Подтверждённые',
  rejected: 'Отклонённые',
};

export function AdminPage() {
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>('pending');
  const [reportTab, setReportTab] = useState<ReportTab>('pending');
  const [items, setItems] = useState<Graffiti[]>([]);
  const [walls, setWalls] = useState<Wall[]>([]);
  const [buildings, setBuildings] = useState<Wall[]>([]);
  const [contentReports, setContentReports] = useState<ContentReport[]>([]);
  const [reports, setReports] = useState<StatusReport[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [reportCounts, setReportCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [counts, setCounts] = useState<AdminCounts>({
    pending: 0,
    published: 0,
    rejected: 0,
    walls: 0,
    buildings: 0,
    reports: 0,
    status: 0,
    users: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Graffiti | null>(null);
  const [reasonRequest, setReasonRequest] = useState<ReasonRequest | null>(null);
  const [banTarget, setBanTarget] = useState<AdminUser | null>(null);
  const [banSaving, setBanSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const countData = await api.adminCounts();
      setCounts(countData);
      if (tab === 'walls') {
        const data = await api.adminWalls();
        setWalls(data.items);
      } else if (tab === 'buildings') {
        const data = await api.adminBuildings();
        setBuildings(data.items);
      } else if (tab === 'reports') {
        const data = await api.adminReports();
        setContentReports(data.items);
      } else if (tab === 'users') {
        const data = await api.adminUsers();
        setUsers(data.items);
      } else if (tab === 'status') {
        const data = await api.adminStatusReports(reportTab);
        setReports(data.items);
        setReportCounts(data.counts);
      } else {
        const data = await api.adminList(tab);
        setItems(data.items);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить заявки');
    } finally {
      setLoading(false);
    }
  }, [tab, reportTab]);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(id: number) {
    try {
      await api.approve(id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось опубликовать');
    }
  }

  function reject(id: number) {
    setReasonRequest({
      kind: 'graffiti',
      id,
      title: 'Отклонить работу?',
      label: 'Причина отклонения (увидит только администратор)',
      defaultValue: 'Не соответствует правилам публикации.',
    });
  }

  async function remove(item: Graffiti) {
    const confirmed = await confirm({
      title: 'Удалить работу?',
      message: `«${item.address}» исчезнет из ленты без возможности восстановления.`,
      confirmLabel: 'Удалить',
      skipKey: 'delete-graffiti',
    });
    if (!confirmed) return;
    try {
      await api.remove(item.id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось удалить');
    }
  }

  async function approveWall(id: number) {
    try {
      await api.approveWall(id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось опубликовать стену');
    }
  }

  function rejectWall(id: number) {
    setReasonRequest({
      kind: 'wall',
      id,
      title: 'Отклонить стену?',
      label: 'Причина отклонения (увидит только владелец)',
      defaultValue: 'Фото или адрес не соответствуют правилам публикации.',
    });
  }

  async function resolveContentReport(id: number) {
    try {
      await api.resolveReport(id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось обновить жалобу');
    }
  }

  async function rejectContentReport(id: number) {
    try {
      await api.rejectReport(id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось обновить жалобу');
    }
  }

  async function approveReport(id: number) {
    try {
      await api.approveStatusReport(id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось подтвердить статус');
    }
  }

  function rejectReport(id: number) {
    setReasonRequest({
      kind: 'report',
      id,
      title: 'Отклонить статус?',
      label: 'Почему статус не подтверждён?',
      defaultValue: 'Не удалось подтвердить изменения по фото.',
    });
  }

  async function submitReason(reason: string) {
    if (!reasonRequest) return;
    const { kind, id } = reasonRequest;
    try {
      if (kind === 'graffiti') await api.reject(id, reason);
      else if (kind === 'wall') await api.rejectWall(id, reason);
      else await api.rejectStatusReport(id, reason);
      setReasonRequest(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отклонить');
    }
  }

  async function applyBan(type: 'none' | 'shadow' | 'full') {
    if (!banTarget) return;
    setBanSaving(true);
    try {
      await api.setBan(banTarget.id, type);
      setBanTarget(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось изменить ограничение');
    } finally {
      setBanSaving(false);
    }
  }

  return (
    <main className="page admin-page">
      <div className="admin-head">
        <div>
          <span className="section-kicker"><ShieldCheck size={14} /> Администратор</span>
          <h1>Заявки и публикации</h1>
          <p>Проверяйте работы, стены и здания: фото, адреса, теги и координаты. Одобренные объекты сразу появляются на сайте.</p>
        </div>
        <button type="button" className="button button-outline" onClick={() => void load()}>
          <RefreshCw size={15} /> Обновить
        </button>
      </div>

      <div className="admin-tabs">
        {(Object.keys(TAB_LABEL) as Tab[]).map((value) => (
          <button
            key={value}
            type="button"
            className={`admin-tab ${tab === value ? 'active' : ''}`}
            onClick={() => setTab(value)}
          >
            {TAB_LABEL[value]}
            <span>{counts[value]}</span>
          </button>
        ))}
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      {tab === 'users' ? (
        <UsersPanel
          users={users}
          loading={loading}
          onBan={(user) => setBanTarget(user)}
        />
      ) : tab === 'walls' ? (
        <WallsPanel
          walls={walls}
          kind="wall"
          loading={loading}
          onApprove={(id) => void approveWall(id)}
          onReject={(id) => void rejectWall(id)}
        />
      ) : tab === 'buildings' ? (
        <WallsPanel
          walls={buildings}
          kind="building"
          loading={loading}
          onApprove={(id) => void approveWall(id)}
          onReject={(id) => void rejectWall(id)}
        />
      ) : tab === 'reports' ? (
        <ReportsPanel
          reports={contentReports}
          loading={loading}
          onResolve={(id) => void resolveContentReport(id)}
          onReject={(id) => void rejectContentReport(id)}
        />
      ) : tab === 'status' ? (
        <StatusReportsPanel
          reports={reports}
          reportTab={reportTab}
          counts={reportCounts}
          loading={loading}
          onTab={setReportTab}
          onApprove={(id) => void approveReport(id)}
          onReject={(id) => void rejectReport(id)}
        />
      ) : loading ? (
        <div className="admin-list">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="admin-skeleton" key={index} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="empty-admin">
          <Clock3 size={32} />
          <h3>Здесь пусто</h3>
          <p>{tab === 'pending' ? 'Новых заявок пока нет.' : 'В этой вкладке пока нет работ.'}</p>
        </div>
      ) : (
        <div className="admin-list">
          {items.map((item) => (
            <article className="admin-card" key={item.id}>
              <img src={item.image_path} alt={`Заявка: ${item.address}`} loading="lazy" />
              <div className="admin-card-body">
                <div className="admin-card-top">
                  <span className="admin-id">#{item.id}</span>
                  <Tags item={item} />
                  <span className={`moderation-badge ${item.moderation_status}`}>
                    {item.moderation_status === 'pending' ? 'на проверке' : item.moderation_status === 'published' ? 'опубликовано' : 'отклонено'}
                  </span>
                </div>
                <h3><MapPin size={15} /> {item.address}</h3>
                <p className="admin-description">{item.description || 'Без описания'}</p>
                {item.ai ? <AiCheckBadge check={item.ai} /> : null}
                <div className="admin-meta">
                  <span>Заявка от: {item.submitted_by?.name || 'неизвестный пользователь'}</span>
                  {item.submitted_by?.email ? <span>{item.submitted_by.email}</span> : null}
                  {item.author_name ? <span>Художник: {item.author_name}</span> : null}
                  <span>{formatDate(item.created_at)}</span>
                  <span>❤ {item.likes} · 👎 {item.dislikes} · 💬 {item.comments_count}</span>
                </div>
                {item.reject_reason ? <p className="reject-reason">Причина: {item.reject_reason}</p> : null}
                <div className="admin-actions">
                  {item.moderation_status !== 'published' ? (
                    <button type="button" className="button button-lime" onClick={() => void approve(item.id)}>
                      <Check size={15} /> Опубликовать
                    </button>
                  ) : null}
                  {item.moderation_status !== 'rejected' ? (
                    <button type="button" className="button button-outline" onClick={() => void reject(item.id)}>
                      <X size={15} /> Отклонить
                    </button>
                  ) : null}
                  <button type="button" className="button button-outline" onClick={() => setEditing(item)}>
                    <Pencil size={15} /> Редактировать
                  </button>
                  <button type="button" className="button button-danger" onClick={() => void remove(item)}>
                    <Trash2 size={15} /> Удалить
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing ? (
        <EditModal
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      ) : null}

      {reasonRequest ? (
        <ReasonModal
          request={reasonRequest}
          onClose={() => setReasonRequest(null)}
          onSubmit={submitReason}
        />
      ) : null}

      {banTarget ? (
        <BanDialog
          user={banTarget}
          saving={banSaving}
          onClose={() => setBanTarget(null)}
          onChoose={(type) => void applyBan(type)}
        />
      ) : null}
    </main>
  );
}

function AiCheckBadge({ check }: { check: AiCheck }) {
  const flags = [
    check.verdict.nsfw ? 'NSFW' : '',
    check.verdict.violence ? 'насилие' : '',
    check.verdict.extremism ? 'экстремизм' : '',
    check.verdict.personalData ? 'персональные данные' : '',
    check.verdict.isGraffiti === false ? 'не граффити' : '',
    check.verdict.duplicate ? `дубль #${check.verdict.duplicateOf ?? '?'}` : '',
    check.verdict.isScreenshot ? 'скриншот' : '',
    check.verdict.hasWatermark ? 'водяной знак' : '',
    check.verdict.likelyRepost ? 'похоже на репост' : '',
    check.verdict.sameAsReference ? 'та же работа с другого ракурса' : '',
  ].filter(Boolean);
  const warn = flags.length > 0;
  return (
    <div className={`ai-check ${warn ? 'warn' : ''}`}>
      <div className="ai-check-head">
        <strong>AI {Math.round(check.confidence * 100)}%</strong>
        <span>{check.provider}/{check.model}</span>
      </div>
      <p>{check.summary || 'Без комментария'}</p>
      {flags.length > 0 ? <small>Флаги: {flags.join(', ')}</small> : null}
    </div>
  );
}

function WallsPanel({
  walls,
  kind,
  loading,
  onApprove,
  onReject,
}: {
  walls: Wall[];
  kind: 'wall' | 'building';
  loading: boolean;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
}) {
  if (loading) {
    return (
      <div className="admin-list">
        {Array.from({ length: 3 }).map((_, index) => (
          <div className="admin-skeleton" key={index} />
        ))}
      </div>
    );
  }
  if (walls.length === 0) {
    return (
      <div className="empty-admin">
        <Clock3 size={32} />
        <h3>{kind === 'building' ? 'Зданий пока нет' : 'Стен пока нет'}</h3>
        <p>{kind === 'building' ? 'Когда пользователь добавит здание, заявка появится здесь на проверке.' : 'Когда владелец добавит стену, она появится здесь на проверке.'}</p>
      </div>
    );
  }
  return (
    <div className="admin-list">
      {walls.map((wall) => (
        <article className="admin-card" key={wall.id}>
          <img src={wall.image_path} alt={`${kind === 'building' ? 'Здание' : 'Стена'}: ${wall.title}`} loading="lazy" />
          <div className="admin-card-body">
            <div className="admin-card-top">
              <span className="admin-id">#{wall.id}</span>
              <span className={`moderation-badge ${wall.moderation_status}`}>
                {wall.moderation_status === 'pending'
                  ? 'на проверке'
                  : wall.moderation_status === 'published'
                    ? (kind === 'building' ? 'опубликовано' : 'опубликована')
                    : (kind === 'building' ? 'отклонено' : 'отклонена')}
              </span>
            </div>
            <h3><MapPin size={15} /> {wall.title}</h3>
            <p className="admin-description">{wall.address}</p>
            {kind === 'building' ? (
              <div className="admin-building-meta">
                <span className="moderation-badge published">здание</span>
                {wall.category ? <span>{wall.category}</span> : null}
                {Number.isFinite(wall.lat) && Number.isFinite(wall.lng)
                  ? <span>{Number(wall.lat).toFixed(5)}, {Number(wall.lng).toFixed(5)}</span>
                  : null}
              </div>
            ) : null}
            <p className="admin-description">{wall.description}</p>
            <div className="admin-meta">
              <span>{wall.owner_name}</span>
              <span>{formatDate(wall.created_at)}</span>
              {kind === 'wall' ? <span>Контакт: {wall.contact || 'не указан'}</span> : null}
            </div>
            {wall.reject_reason ? <p className="reject-reason">Причина: {wall.reject_reason}</p> : null}
            <div className="admin-actions">
              {wall.moderation_status !== 'published' ? (
                <button type="button" className="button button-lime" onClick={() => onApprove(wall.id)}>
                  <Check size={15} /> Опубликовать
                </button>
              ) : null}
              {wall.moderation_status !== 'rejected' ? (
                <button type="button" className="button button-outline" onClick={() => onReject(wall.id)}>
                  <X size={15} /> Отклонить
                </button>
              ) : null}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function ReportsPanel({
  reports,
  loading,
  onResolve,
  onReject,
}: {
  reports: ContentReport[];
  loading: boolean;
  onResolve: (id: number) => void;
  onReject: (id: number) => void;
}) {
  if (loading) {
    return (
      <div className="admin-list">
        {Array.from({ length: 3 }).map((_, index) => <div className="admin-skeleton" key={index} />)}
      </div>
    );
  }
  if (reports.length === 0) {
    return (
      <div className="empty-admin">
        <ShieldCheck size={32} />
        <h3>Жалоб пока нет</h3>
        <p>Когда пользователи пожалуются на комментарий или объект, обращение появится здесь.</p>
      </div>
    );
  }
  return (
    <div className="admin-list">
      {reports.map((report) => (
        <article className="report-card" key={report.id}>
          <div className="report-card-body">
            <div className="admin-card-top">
              <span className="admin-id">#{report.id}</span>
              <span className={`moderation-badge ${report.status === 'pending' ? 'pending' : report.status === 'resolved' ? 'published' : 'rejected'}`}>
                {report.status === 'pending' ? 'на проверке' : report.status === 'resolved' ? 'решена' : 'отклонена'}
              </span>
            </div>
            <h3>{report.target_type === 'comment' ? 'Комментарий' : 'Объект'}: {report.target_title || report.target_id}</h3>
            <p className="report-reason">Причина: {report.reason}</p>
            {report.details ? <p className="admin-description">{report.details}</p> : null}
            <div className="admin-meta">
              <span>От: {report.reporter_name}</span>
              <span>{formatDate(report.created_at)}</span>
            </div>
            <div className="admin-actions">
              {report.status === 'pending' ? (
                <>
                  <button type="button" className="button button-lime" onClick={() => onResolve(report.id)}>
                    <Check size={15} /> Решить
                  </button>
                  <button type="button" className="button button-outline" onClick={() => onReject(report.id)}>
                    <X size={15} /> Отклонить
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function BanDialog({
  user,
  saving,
  onClose,
  onChoose,
}: {
  user: AdminUser;
  saving: boolean;
  onClose: () => void;
  onChoose: (type: 'none' | 'shadow' | 'full') => void;
}) {
  const restricted = Boolean(user.banned || user.shadow_banned);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Ограничить пользователя">
      <div className="modal-card ban-card">
        <div className="modal-head">
          <div>
            <span className="section-kicker">Пользователь</span>
            <h2>{user.name}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>
        <p className="muted">
          {user.email}
          <br />
          Выберите, как ограничить доступ. Обычный бан не даст войти, теневой оставит сайт доступным, но скроет новый контент от других.
        </p>
        <div className="ban-options">
          <button
            type="button"
            className="ban-option danger"
            onClick={() => onChoose('full')}
            disabled={saving || Boolean(user.banned)}
          >
            <UserX size={20} />
            <span><strong>Обычный бан</strong><small>Пользователь не сможет войти в аккаунт.</small></span>
          </button>
          <button
            type="button"
            className="ban-option"
            onClick={() => onChoose('shadow')}
            disabled={saving || Boolean(user.shadow_banned)}
          >
            <UserX size={20} />
            <span><strong>Теневой бан</strong><small>Сайт останется доступен, но новый контент не увидят другие.</small></span>
          </button>
          <button
            type="button"
            className="ban-option safe"
            onClick={() => onChoose('none')}
            disabled={saving || !restricted}
          >
            <UserCheck size={20} />
            <span><strong>Разбанить</strong><small>Вернуть обычный доступ.</small></span>
          </button>
        </div>
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}

function UsersPanel({
  users,
  loading,
  onBan,
}: {
  users: AdminUser[];
  loading: boolean;
  onBan: (user: AdminUser) => void;
}) {
  if (loading) {
    return (
      <div className="admin-list">
        {Array.from({ length: 3 }).map((_, index) => (
          <div className="admin-skeleton" key={index} />
        ))}
      </div>
    );
  }
  if (users.length === 0) {
    return (
      <div className="empty-admin">
        <Clock3 size={32} />
        <h3>Пользователей пока нет</h3>
        <p>Зарегистрированные пользователи появятся здесь.</p>
      </div>
    );
  }
  return (
    <div className="admin-users">
      {users.map((user) => (
        <article className={`admin-user-card ${user.shadow_banned || user.banned ? 'is-shadow' : ''}`} key={user.id}>
          <div className="admin-user-info">
            <div className="admin-user-head">
              <strong>{user.name}</strong>
              {user.role === 'admin' ? <span className="moderation-badge published">админ</span> : null}
              {user.shadow_banned ? <span className="moderation-badge rejected">теневой бан</span> : null}
              {user.banned ? <span className="moderation-badge rejected">забанен</span> : null}
            </div>
            <span className="admin-user-email">{user.email}</span>
            <div className="admin-meta">
              <span>#{user.id}</span>
              <span>с {formatDate(user.created_at)}</span>
              <span>работ: {user.graffiti_count}</span>
              <span>комментариев: {user.comments_count}</span>
              <span>стен: {user.walls_count}</span>
            </div>
          </div>
          {user.role === 'admin' ? null : (
            <button
              type="button"
              className={`button ${user.shadow_banned || user.banned ? 'button-outline' : 'button-danger'}`}
              onClick={() => onBan(user)}
            >
              {user.shadow_banned || user.banned ? <UserCheck size={15} /> : <UserX size={15} />}
              {user.shadow_banned || user.banned ? 'Изменить бан' : 'Бан'}
            </button>
          )}
        </article>
      ))}
    </div>
  );
}

function ReasonModal({
  request,
  onClose,
  onSubmit,
}: {
  request: ReasonRequest;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState(request.defaultValue);
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) return;
    setSending(true);
    try {
      await onSubmit(reason.trim());
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={request.title}>
      <form className="modal-card" onSubmit={(event) => void submit(event)}>
        <div className="modal-head">
          <div>
            <span className="section-kicker">Модерация</span>
            <h2>{request.title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>
        <label className="field">
          <span>{request.label}</span>
          <textarea
            className="textarea"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            autoFocus
            required
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Отмена</button>
          <button type="submit" className="button button-danger" disabled={sending || !reason.trim()}>
            {sending ? 'Сохраняем…' : 'Отклонить'}
          </button>
        </div>
      </form>
    </div>
  );
}

function StatusReportsPanel({
  reports,
  reportTab,
  counts,
  loading,
  onTab,
  onApprove,
  onReject,
}: {
  reports: StatusReport[];
  reportTab: ReportTab;
  counts: { pending: number; approved: number; rejected: number };
  loading: boolean;
  onTab: (tab: ReportTab) => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
}) {
  return (
    <>
      <div className="report-tabs">
        {(Object.keys(REPORT_TAB_LABEL) as ReportTab[]).map((value) => (
          <button
            key={value}
            type="button"
            className={`chip ${reportTab === value ? 'active' : ''}`}
            onClick={() => onTab(value)}
          >
            {REPORT_TAB_LABEL[value]} <span>{counts[value]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="admin-list">
          {Array.from({ length: 3 }).map((_, index) => (
            <div className="admin-skeleton" key={index} />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="empty-admin">
          <Clock3 size={32} />
          <h3>Здесь пусто</h3>
          <p>
            {reportTab === 'pending'
              ? 'Новых сообщений о статусе пока нет.'
              : 'В этой вкладке пока нет заявок.'}
          </p>
        </div>
      ) : (
        <div className="admin-list">
          {reports.map((report) => {
            const current = STATUS_META[report.current_status];
            const proposed = STATUS_META[report.status];
            return (
              <article className="admin-card status-report-card" key={report.id}>
                <img src={report.image_path} alt={`Работа: ${report.address}`} loading="lazy" />
                <div className="admin-card-body">
                  <div className="admin-card-top">
                    <span className="admin-id">#{report.id}</span>
                    <span className={`moderation-badge ${report.moderation_status}`}>
                      {report.moderation_status === 'pending'
                        ? 'на проверке'
                        : report.moderation_status === 'approved'
                          ? 'подтверждено'
                          : 'отклонено'}
                    </span>
                  </div>
                  <h3><MapPin size={15} /> {report.address}</h3>
                  <div className="status-diff">
                    <span className="tag" style={{ color: current.color, background: current.background }}>
                      {current.label}
                    </span>
                    <span className="status-arrow">→</span>
                    <span className="tag" style={{ color: proposed.color, background: proposed.background }}>
                      {proposed.label}
                    </span>
                  </div>
                  <p className="admin-description">
                    {report.comment || 'Без комментария'}
                  </p>
                  <div className="admin-meta">
                    <span>сообщил: {report.user_name}</span>
                    <span>{formatDate(report.created_at)}</span>
                    {report.reviewed_by ? <span>проверил: {report.reviewed_by}</span> : null}
                  </div>
                  {report.reject_reason ? (
                    <p className="reject-reason">Причина: {report.reject_reason}</p>
                  ) : null}
                  {report.moderation_status === 'pending' ? (
                    <div className="admin-actions">
                      <button type="button" className="button button-lime" onClick={() => onApprove(report.id)}>
                        <Check size={15} /> Подтвердить статус
                      </button>
                      <button type="button" className="button button-outline" onClick={() => onReject(report.id)}>
                        <X size={15} /> Отклонить
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

function EditModal({
  item,
  onClose,
  onSaved,
}: {
  item: Graffiti;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [address, setAddress] = useState(item.address);
  const [status, setStatus] = useState<Status>(item.status);
  const [style, setStyle] = useState<Style>(item.style);
  const [author, setAuthor] = useState(item.author_name);
  const [description, setDescription] = useState(item.description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.update(item.id, {
        address,
        status,
        style,
        author_name: author,
        description,
      });
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Редактировать работу">
      <form className="modal-card" onSubmit={(event) => void save(event)}>
        <div className="modal-head">
          <div>
            <span className="section-kicker">Редактирование #{item.id}</span>
            <h2>Параметры работы</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>

        <label className="field">
          <span>Адрес</span>
          <input className="input" value={address} onChange={(event) => setAddress(event.target.value)} required />
        </label>
        <div className="form-grid">
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
        </div>
        <label className="field">
          <span>Автор</span>
          <input className="input" value={author} onChange={(event) => setAuthor(event.target.value)} />
        </label>
        <label className="field">
          <span>Описание</span>
          <textarea className="textarea" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>

        {error ? <div className="notice error">{error}</div> : null}
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Отмена</button>
          <button type="submit" className="button button-dark" disabled={saving}>
            {saving ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  );
}
