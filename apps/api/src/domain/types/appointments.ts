export type AppointmentStatus =
  | 'confirmed'
  | 'pending_deposit'
  | 'rescheduled'
  | 'completed'
  | 'cancelled';

export type AppointmentSource = 'bot_ai' | 'operator';

export interface CommercialAppointment {
  id: string;
  workspaceId: string;
  journeyId?: string;
  leadName: string;
  leadPhone: string; // E.164
  serviceName: string;
  serviceValueMinor: number; // centavos
  scheduledAt: string; // ISO datetime
  durationMinutes: number;
  status: AppointmentStatus;
  source: AppointmentSource;
  operatorName?: string;
  notes?: string;
  location?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAppointmentInput {
  workspaceId: string;
  journeyId?: string;
  leadName: string;
  leadPhone: string;
  serviceName: string;
  serviceValueMinor: number;
  scheduledAt: string;
  durationMinutes?: number;
  status?: AppointmentStatus;
  source?: AppointmentSource;
  operatorName?: string;
  notes?: string;
  location?: string;
}

export interface UpdateAppointmentInput {
  leadName?: string;
  leadPhone?: string;
  serviceName?: string;
  serviceValueMinor?: number;
  scheduledAt?: string;
  durationMinutes?: number;
  status?: AppointmentStatus;
  operatorName?: string;
  notes?: string;
  location?: string;
}

export interface AppointmentFilters {
  status?: AppointmentStatus;
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
}
