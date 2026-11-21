export type Status = 'alive' | 'erased' | 'partial' | 'unknown';
export type Style = 'mural' | 'graffiti' | 'stencil' | 'sticker' | 'text' | 'other';
export type ModerationStatus = 'pending' | 'published' | 'rejected';
export type ReactionValue = 'like' | 'dislike';

export type WallType = 'garage' | 'facade' | 'fence' | 'wall' | 'other' | 'building';
export type WallTerms = 'free' | 'materials' | 'paid' | 'negotiable';

export interface Wall {
  id: number;
  owner_id: number;
  title: string;
  address: string;
  description: string;
  type: WallType;
  size: string;
  terms: WallTerms;
  price_note: string;
  contact?: string;
  image_path: string;
  status: 'open' | 'closed';
  moderation_status: 'pending' | 'published' | 'rejected';
  reject_reason: string;
  published_at?: string | null;
  created_at: string;
  owner_name: string;
  kind?: 'wall' | 'building';
  category?: string;
  lat?: number | null;
  lng?: number | null;
  hidden_reason?: string | null;
}

export interface SourceLink {
  title: string;
  url: string;
}

export interface PhotoMeta {
  src: string;
  author: string;
  license: string;
  licenseUrl?: string;
  source: string;
  title?: string;
  modified?: string;
  width?: number;
  height?: number;
}

export interface WalkPlace {
  id: string;
  name: string;
  category: string;
  address: string;
  description: string;
  story?: string;
  lookFor?: string;
  era?: string;
  artType?: string;
  artist?: string;
  city?: string;
  sources?: SourceLink[];
  photo?: PhotoMeta | null;
  gallery?: PhotoMeta[];
  image: string;
  lat: number | null;
  lng: number | null;
  likes: number;
  dislikes: number;
  comments_count: number;
  my_reaction: ReactionValue | null;
}

export interface AdminPlace extends WalkPlace {
  hidden_reason: string | null;
}

export interface WalkBuilding {
  id: number;
  title: string;
  address: string;
  category: string;
  description: string;
  lat: number | null;
  lng: number | null;
  image_path: string;
  status: 'open' | 'closed';
  moderation_status: 'pending' | 'published' | 'rejected';
  reject_reason: string;
  published_at?: string | null;
  created_at: string;
}


export interface Graffiti {
  id: number;
  image_path: string;
  address: string;
  status: Status;
  style: Style;
  author_name: string;
  description: string;
  moderation_status: ModerationStatus;
  reject_reason: string;
  created_by: string;
  created_at: string;
  published_at: string | null;
  likes: number;
  dislikes: number;
  comments_count: number;
  my_reaction: ReactionValue | null;
  favorite?: boolean;
  lat?: number | null;
  lng?: number | null;
  submitted_by?: { id: number; name: string; email: string } | null;
}

export interface Comment {
  id: number;
  parent_id?: number | null;
  author_name: string;
  avatar_url?: string;
  body: string;
  created_at: string;
  likes: number;
  dislikes: number;
  my_reaction: ReactionValue | null;
  reply_to_name?: string | null;
  can_delete: boolean;
  deleted?: boolean;
}

export interface FeedStats {
  total: number;
  alive: number;
  erased: number;
  partial: number;
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: 'user' | 'admin';
  avatar_url?: string;
}

export interface AdminCounts {
  pending: number;
  published: number;
  rejected: number;
  status: number;
  walls: number;
  buildings: number;
  places: number;
  reports: number;
  users: number;
}

export interface ContentReport {
  id: number;
  target_type: 'comment' | 'route_comment' | 'graffiti_comment' | 'place' | 'building';
  target_id: string;
  target_title: string;
  target_excerpt: string;
  reporter_name: string;
  reason: string;
  details: string;
  status: 'pending' | 'resolved' | 'rejected';
  created_at: string;
  reviewed_at?: string | null;
}

export interface CollectionSummary {
  id: number;
  owner_id: number;
  title: string;
  description: string;
  owner_name: string;
  item_count: number;
  covers: string[];
  can_edit: boolean;
  created_at: string;
  contains?: boolean;
}

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: 'user' | 'admin';
  created_at: string;
  shadow_banned: number;
  banned: number;
  graffiti_count: number;
  comments_count: number;
  walls_count: number;
}

export interface PublicUserProfile {
  id: number;
  name: string;
  role: 'user' | 'admin';
  created_at: string;
  avatar_url?: string;
  email?: string;
}

export interface UserRelation {
  id: number;
  name: string;
  role: 'user' | 'admin';
  created_at: string;
  avatar_url?: string;
  routes_count: number;
  is_following: boolean;
}

export interface WalkRouteSummary {
  id: number;
  owner_id: number;
  slug: string;
  title: string;
  description: string;
  duration_minutes: number;
  visibility: 'public' | 'link';
  created_at: string;
  updated_at: string;
  owner_name: string;
  likes: number;
  dislikes: number;
  comments_count: number;
  my_reaction: ReactionValue | null;
  favorite: boolean;
  can_edit: boolean;
  is_mine: boolean;
  stops: string[];
}

export interface UserProfileResponse {
  user: PublicUserProfile;
  routes: WalkRouteSummary[];
  followers_count: number;
  following_count: number;
  is_following: boolean;
  is_me: boolean;
}

export interface StatusReport {
  id: number;
  graffiti_id: number;
  image_path: string;
  address: string;
  current_status: Status;
  status: Status;
  comment: string;
  user_name: string;
  moderation_status: 'pending' | 'approved' | 'rejected';
  reject_reason: string;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}
