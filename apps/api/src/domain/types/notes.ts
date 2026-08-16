export type NoteCategory = 'script' | 'meeting' | 'lead_vip' | 'goal' | 'general';
export type NoteColor = 'emerald' | 'purple' | 'amber' | 'blue' | 'rose' | 'slate';

export interface OperationalNote {
  id: string;
  workspaceId: string;
  title: string;
  content: string;
  category: NoteCategory;
  tags: string[];
  pinned: boolean;
  color?: NoteColor;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteInput {
  workspaceId: string;
  title: string;
  content: string;
  category?: NoteCategory;
  tags?: string[];
  pinned?: boolean;
  color?: NoteColor;
  authorId: string;
  authorName: string;
}

export interface UpdateNoteInput {
  title?: string;
  content?: string;
  category?: NoteCategory;
  tags?: string[];
  pinned?: boolean;
  color?: NoteColor;
}

export interface NoteFilters {
  category?: NoteCategory;
  search?: string;
  pinnedOnly?: boolean;
  limit?: number;
}
