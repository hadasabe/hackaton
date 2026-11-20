import type {
  AdminCounts,
  AuthUser,
  Comment,
  FeedStats,
  Graffiti,
  ReactionValue,
  Status,
  StatusReport,
  Wall,
} from './types';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: init?.body instanceof FormData
      ? init.headers
      : {
          'Content-Type': 'application/json',
          ...(init?.headers || {}),
        },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data?.error || 'Что-то пошло не так', response.status);
  }
  return data as T;
}

export const api = {
  feed(params: { status?: string; style?: string; q?: string } = {}) {
    const query = new URLSearchParams();
    if (params.status && params.status !== 'all') query.set('status', params.status);
    if (params.style && params.style !== 'all') query.set('style', params.style);
    if (params.q) query.set('q', params.q);
    const suffix = query.toString();
    return request<{ items: Graffiti[]; stats: FeedStats }>(`/api/feed${suffix ? `?${suffix}` : ''}`);
  },

  graffiti(id: number) {
    return request<{ item: Graffiti; comments: Comment[] }>(`/api/graffiti/${id}`);
  },

  react(id: number, value: ReactionValue) {
    return request<{ likes: number; dislikes: number; my_reaction: ReactionValue | null }>(
      `/api/graffiti/${id}/reaction`,
      { method: 'POST', body: JSON.stringify({ value }) },
    );
  },

  addComment(id: number, body: string) {
    return request<Comment>(`/api/graffiti/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  },

  deleteComment(id: number) {
    return request<{ ok: true }>(`/api/comments/${id}`, { method: 'DELETE' });
  },

  reportStatus(id: number, status: Status, comment: string) {
    return request<{ id: number; status: Status; moderation_status: 'pending' }>(
      `/api/graffiti/${id}/status-reports`,
      { method: 'POST', body: JSON.stringify({ status, comment }) },
    );
  },

  adminStatusReports(tab: 'pending' | 'approved' | 'rejected') {
    return request<{
      items: StatusReport[];
      counts: { pending: number; approved: number; rejected: number };
    }>(`/api/admin/status-reports?tab=${tab}`);
  },

  approveStatusReport(id: number) {
    return request<{ ok: true; status: Status }>(`/api/admin/status-reports/${id}/approve`, {
      method: 'POST',
    });
  },

  rejectStatusReport(id: number, reason: string) {
    return request<{ ok: true }>(`/api/admin/status-reports/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  submit(form: FormData) {
    return request<{ id: number }>('/api/submissions', { method: 'POST', body: form });
  },

  register(name: string, email: string, password: string) {
    return request<{ user: AuthUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
  },

  login(email: string, password: string) {
    return request<{ user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  logout() {
    return request<{ ok: true }>('/api/auth/logout', { method: 'POST' });
  },

  me() {
    return request<{ user: AuthUser | null }>('/api/auth/me');
  },

  walls(params: { q?: string; terms?: string } = {}) {
    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    if (params.terms && params.terms !== 'all') query.set('terms', params.terms);
    const suffix = query.toString();
    return request<{ items: Wall[] }>(`/api/walls${suffix ? `?${suffix}` : ''}`);
  },

  wall(id: number) {
    return request<{ wall: Wall }>(`/api/walls/${id}`);
  },

  createWall(form: FormData) {
    return request<{ id: number }>('/api/walls', { method: 'POST', body: form });
  },

  updateWall(id: number, status: 'open' | 'closed') {
    return request<{ ok: true; status: string }>(`/api/walls/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  deleteWall(id: number) {
    return request<{ ok: true }>(`/api/walls/${id}`, { method: 'DELETE' });
  },

  myWalls() {
    return request<{ items: Wall[] }>('/api/my/walls');
  },

  adminList(tab: 'pending' | 'published' | 'rejected') {
    return request<{ items: Graffiti[]; counts: AdminCounts }>(`/api/admin/graffiti?tab=${tab}`);
  },

  adminWalls() {
    return request<{ items: Wall[]; counts: AdminCounts }>('/api/admin/walls');
  },

  approveWall(id: number) {
    return request<{ ok: true }>(`/api/admin/walls/${id}/approve`, { method: 'POST' });
  },

  rejectWall(id: number, reason: string) {
    return request<{ ok: true }>(`/api/admin/walls/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  approve(id: number) {
    return request<{ ok: true }>(`/api/admin/graffiti/${id}/approve`, { method: 'POST' });
  },

  reject(id: number, reason: string) {
    return request<{ ok: true }>(`/api/admin/graffiti/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  update(id: number, payload: Partial<Pick<Graffiti, 'address' | 'status' | 'style' | 'author_name' | 'description'>>) {
    return request<{ ok: true }>(`/api/admin/graffiti/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  remove(id: number) {
    return request<{ ok: true }>(`/api/admin/graffiti/${id}`, { method: 'DELETE' });
  },

  adminDeleteComment(id: number) {
    return request<{ ok: true }>(`/api/admin/comments/${id}`, { method: 'DELETE' });
  },
};
