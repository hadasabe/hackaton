import type {
  AdminCounts,
  AdminPlace,
  AdminUser,
  AuthUser,
  CollectionSummary,
  Comment,
  ContentReport,
  FeedStats,
  Graffiti,
  ReactionValue,
  Status,
  StatusReport,
  UserProfileResponse,
  WalkBuilding,
  WalkPlace,
  WalkRouteSummary,
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

  collections() {
    return request<{ items: CollectionSummary[] }>('/api/collections');
  },

  collection(id: number) {
    return request<{ collection: CollectionSummary; items: Graffiti[] }>(`/api/collections/${id}`);
  },

  myCollections(graffitiId?: number) {
    const query = graffitiId ? `?graffiti_id=${graffitiId}` : '';
    return request<{ items: CollectionSummary[] }>(`/api/my/collections${query}`);
  },

  createCollection(payload: { title: string; description: string }) {
    return request<{ collection: CollectionSummary }>('/api/collections', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateCollection(id: number, payload: { title: string; description: string }) {
    return request<{ ok: true; title: string; description: string }>(`/api/collections/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  deleteCollection(id: number) {
    return request<{ ok: true }>(`/api/collections/${id}`, { method: 'DELETE' });
  },

  addToCollection(collectionId: number, graffitiId: number) {
    return request<{ ok: true; contains: boolean }>(`/api/collections/${collectionId}/items`, {
      method: 'POST',
      body: JSON.stringify({ graffiti_id: graffitiId }),
    });
  },

  removeFromCollection(collectionId: number, graffitiId: number) {
    return request<{ ok: true; contains: boolean }>(
      `/api/collections/${collectionId}/items/${graffitiId}`,
      { method: 'DELETE' },
    );
  },

  react(id: number, value: ReactionValue) {
    return request<{ likes: number; dislikes: number; my_reaction: ReactionValue | null }>(
      `/api/graffiti/${id}/reaction`,
      { method: 'POST', body: JSON.stringify({ value }) },
    );
  },

  toggleGraffitiFavorite(id: number) {
    return request<{ favorite: boolean }>(`/api/graffiti/${id}/favorite`, { method: 'POST' });
  },

  favoriteGraffiti() {
    return request<{ items: Graffiti[] }>('/api/graffiti/favorites');
  },

  addComment(id: number, body: string, parentId?: number | null) {
    return request<Comment>(`/api/graffiti/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body, parent_id: parentId || null }),
    });
  },

  reactComment(id: number, value: ReactionValue) {
    return request<{ likes: number; dislikes: number; my_reaction: ReactionValue | null }>(
      `/api/comments/${id}/reaction`,
      { method: 'POST', body: JSON.stringify({ value }) },
    );
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

  walkRoutes(scope: 'all' | 'public' | 'mine' = 'public') {
    return request<{ items: WalkRouteSummary[] }>(`/api/walk-routes?scope=${scope}`);
  },

  walkRoute(slug: string) {
    return request<{ route: WalkRouteSummary; comments: Comment[] }>(
      `/api/walk-routes/${encodeURIComponent(slug)}`,
    );
  },

  createWalkRoute(payload: {
    title: string;
    description: string;
    duration_minutes: number;
    visibility: 'public' | 'link';
    stops: string[];
  }) {
    return request<{ route: WalkRouteSummary }>('/api/walk-routes', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  toggleWalkRouteFavorite(id: number) {
    return request<{ favorite: boolean }>(`/api/walk-routes/${id}/favorite`, { method: 'POST' });
  },

  reactWalkRoute(id: number, value: ReactionValue) {
    return request<{ likes: number; dislikes: number; my_reaction: ReactionValue | null }>(
      `/api/walk-routes/${id}/reaction`,
      { method: 'POST', body: JSON.stringify({ value }) },
    );
  },

  addWalkRouteComment(id: number, body: string, parentId?: number | null) {
    return request<Comment>(`/api/walk-routes/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body, parent_id: parentId || null }),
    });
  },

  myWalkRoutes() {
    return request<{ items: WalkRouteSummary[] }>('/api/walk-routes?scope=mine');
  },

  createWalkBuilding(form: FormData) {
    return request<{ id: number }>('/api/walk-buildings', { method: 'POST', body: form });
  },

  myWalkBuildings() {
    return request<{ items: WalkBuilding[] }>('/api/my/walk-buildings');
  },

  walkPlaces() {
    return request<{ items: WalkPlace[] }>('/api/walk-places');
  },

  walkPlace(id: string) {
    return request<{ item: WalkPlace; comments: Comment[] }>(`/api/walk-places/${encodeURIComponent(id)}`);
  },

  reactWalkPlace(id: string, value: ReactionValue) {
    return request<{ likes: number; dislikes: number; my_reaction: ReactionValue | null }>(
      `/api/walk-places/${encodeURIComponent(id)}/reaction`,
      { method: 'POST', body: JSON.stringify({ value }) },
    );
  },

  addWalkPlaceComment(id: string, body: string, parentId?: number | null) {
    return request<Comment>(`/api/walk-places/${encodeURIComponent(id)}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body, parent_id: parentId || null }),
    });
  },

  walkBuildings() {
    return request<{ items: WalkBuilding[] }>('/api/walk-buildings');
  },

  favoriteWalkRoutes() {
    return request<{ items: WalkRouteSummary[] }>('/api/walk-routes/favorites');
  },

  userProfile(id: number) {
    return request<UserProfileResponse>(`/api/users/${id}`);
  },

  adminList(tab: 'pending' | 'published' | 'rejected') {
    return request<{ items: Graffiti[]; counts: AdminCounts }>(`/api/admin/graffiti?tab=${tab}`);
  },

  adminWalls() {
    return request<{ items: Wall[]; counts: AdminCounts }>('/api/admin/walls');
  },

  adminBuildings() {
    return request<{ items: Wall[] }>('/api/admin/buildings');
  },

  adminPlaces() {
    return request<{ items: AdminPlace[] }>('/api/admin/places');
  },

  setPlaceHidden(id: string, hidden: boolean) {
    return request<{ ok: true; hidden: boolean }>(`/api/admin/places/${encodeURIComponent(id)}/hidden`, {
      method: 'POST',
      body: JSON.stringify({ hidden }),
    });
  },

  adminReports() {
    return request<{ items: ContentReport[]; counts: { pending: number } }>('/api/admin/reports');
  },

  resolveReport(id: number) {
    return request<{ ok: true }>(`/api/admin/reports/${id}/resolve`, { method: 'POST' });
  },

  rejectReport(id: number) {
    return request<{ ok: true }>(`/api/admin/reports/${id}/reject`, { method: 'POST' });
  },

  adminCounts() {
    return request<AdminCounts>('/api/admin/counts');
  },

  adminUsers() {
    return request<{ items: AdminUser[]; counts: AdminCounts }>('/api/admin/users');
  },

  setBan(id: number, type: 'none' | 'shadow' | 'full') {
    return request<{ ok: true; shadow_banned: boolean; banned: boolean }>(`/api/admin/users/${id}/ban`, {
      method: 'POST',
      body: JSON.stringify({ type }),
    });
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
