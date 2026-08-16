export type AppointmentStatus =
  | 'confirmed'
  | 'pending_deposit'
  | 'rescheduled'
  | 'completed'
  | 'cancelled';

export interface CommercialAppointment {
  id: string;
  workspaceId: string;
  journeyId?: string;
  leadName: string;
  leadPhone: string;
  serviceName: string;
  serviceValue: number;
  serviceValueMinor?: number;
  scheduledAt: string; // ISO date string or YYYY-MM-DDTHH:mm
  durationMinutes: number;
  status: AppointmentStatus;
  source: 'bot_ai' | 'operator';
  operatorName?: string;
  notes?: string;
  location?: string;
}

export interface FollowUpAlarm {
  id: string;
  journeyId: string;
  leadName: string;
  leadPhone: string;
  triggerAt: string;
  reason: string;
  status: 'pending' | 'snoozed' | 'completed';
  assignedOperatorName: string;
  isUrgent?: boolean;
}

export type NoteCategory = 'script' | 'meeting' | 'lead_vip' | 'goal' | 'general';

export interface OperationalNote {
  id: string;
  workspaceId: string;
  title: string;
  content: string;
  category: NoteCategory;
  tags: string[];
  pinned: boolean;
  color?: 'emerald' | 'purple' | 'amber' | 'blue' | 'rose' | 'slate';
  authorName: string;
  createdAt: string;
  updatedAt: string;
}
