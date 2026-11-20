export type Status = 'alive' | 'erased' | 'partial' | 'unknown';
export type Style = 'mural' | 'graffiti' | 'stencil' | 'sticker' | 'text' | 'other';
export type ModerationStatus = 'pending' | 'published' | 'rejected';
export type ReactionValue = 'like' | 'dislike';

export type WallType = 'garage' | 'facade' | 'fence' | 'wall' | 'other';
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
  image_path: string;
  status: 'open' | 'closed';
  created_at: string;
  owner_name: string;
  inquiries_count?: number;
  last_inquiry_at?: string | null;
}

export interface WallMessage {
  id: number;
  body: string;
  created_at: string;
  sender_id: number;
  sender_name: string;
}

export interface WallInquiry {
  id: number;
  wall_id: number;
  owner_id: number;
  artist_id: number;
  status: string;
  created_at: string;
  updated_at: string;
  artist_name?: string;
  owner_name?: string;
  title?: string;
  address?: string;
  image_path?: string;
  wall_status?: string;
  last_message?: string;
  messages?: WallMessage[];
}

export interface AiCheck {
  provider: string;
  model: string;
  confidence: number;
  summary: string;
  verdict: {
    isGraffiti?: boolean;
    nsfw?: boolean;
    violence?: boolean;
    extremism?: boolean;
    personalData?: boolean;
    textSafe?: boolean;
    quality?: string;
    isScreenshot?: boolean;
    hasWatermark?: boolean;
    likelyRepost?: boolean;
    sameAsReference?: boolean | null;
    duplicate?: boolean;
    duplicateOf?: number;
    duplicateDistance?: number;
    labels?: string[];
  };
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
  ai?: AiCheck;
}

export interface Comment {
  id: number;
  author_name: string;
  body: string;
  created_at: string;
  can_delete: boolean;
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
}

export interface AdminCounts {
  pending: number;
  published: number;
  rejected: number;
  status: number;
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
