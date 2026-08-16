import { AuthenticatedActor } from './operator-authenticator.js';
import {
  CreateNoteInput,
  NoteFilters,
  OperationalNote,
  UpdateNoteInput,
} from '../../domain/types/notes.js';

export interface NotesGateway {
  list(
    actor: AuthenticatedActor,
    workspaceId: string,
    filters?: NoteFilters,
  ): Promise<OperationalNote[]>;

  getById(
    actor: AuthenticatedActor,
    workspaceId: string,
    noteId: string,
  ): Promise<OperationalNote | null>;

  create(
    actor: AuthenticatedActor,
    input: CreateNoteInput,
  ): Promise<OperationalNote>;

  update(
    actor: AuthenticatedActor,
    workspaceId: string,
    noteId: string,
    input: UpdateNoteInput,
  ): Promise<OperationalNote | null>;

  delete(
    actor: AuthenticatedActor,
    workspaceId: string,
    noteId: string,
  ): Promise<boolean>;
}
