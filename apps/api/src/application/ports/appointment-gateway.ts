import { AuthenticatedActor } from './operator-authenticator.js';
import {
  AppointmentFilters,
  CommercialAppointment,
  CreateAppointmentInput,
  UpdateAppointmentInput,
} from '../../domain/types/appointments.js';

export interface AppointmentGateway {
  list(
    actor: AuthenticatedActor,
    workspaceId: string,
    filters?: AppointmentFilters,
  ): Promise<CommercialAppointment[]>;

  getById(
    actor: AuthenticatedActor,
    workspaceId: string,
    appointmentId: string,
  ): Promise<CommercialAppointment | null>;

  create(
    actor: AuthenticatedActor,
    input: CreateAppointmentInput,
  ): Promise<CommercialAppointment>;

  update(
    actor: AuthenticatedActor,
    workspaceId: string,
    appointmentId: string,
    input: UpdateAppointmentInput,
  ): Promise<CommercialAppointment | null>;

  delete(
    actor: AuthenticatedActor,
    workspaceId: string,
    appointmentId: string,
  ): Promise<boolean>;
}
