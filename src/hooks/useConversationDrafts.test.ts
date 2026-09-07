import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConversationDraftStore } from './useConversationDrafts';

describe('ConversationDraftStore', () => {
  let mockStore: Record<string, string> = {};

  beforeEach(() => {
    mockStore = {};
    const mockStorage = {
      getItem: (key: string) => mockStore[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStore[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStore[key];
      },
      clear: () => {
        mockStore = {};
      },
      get length() {
        return Object.keys(mockStore).length;
      },
      key: (i: number) => Object.keys(mockStore)[i] ?? null,
    };

    vi.stubGlobal('sessionStorage', mockStorage);
    vi.stubGlobal('window', { sessionStorage: mockStorage });

    ConversationDraftStore.clearUserDrafts('user-1');
    ConversationDraftStore.clearUserDrafts('user-2');
  });

  it('deve armazenar e recuperar rascunho por contato', () => {
    ConversationDraftStore.setDraft('user-1', 'ws-alpha', 'journey-100', 'Olá Marina, proposta enviada');
    expect(ConversationDraftStore.getDraft('user-1', 'ws-alpha', 'journey-100')).toBe('Olá Marina, proposta enviada');
    expect(ConversationDraftStore.getDraft('user-1', 'ws-alpha', 'journey-200')).toBe(''); // Outro contato está vazio
  });

  it('deve isolar rascunhos entre workspaces diferentes para o mesmo contato', () => {
    ConversationDraftStore.setDraft('user-1', 'ws-alpha', 'journey-100', 'Rascunho Alpha');
    ConversationDraftStore.setDraft('user-1', 'ws-beta', 'journey-100', 'Rascunho Beta');

    expect(ConversationDraftStore.getDraft('user-1', 'ws-alpha', 'journey-100')).toBe('Rascunho Alpha');
    expect(ConversationDraftStore.getDraft('user-1', 'ws-beta', 'journey-100')).toBe('Rascunho Beta');
  });

  it('deve limpar rascunho após confirmação de envio', () => {
    ConversationDraftStore.setDraft('user-1', 'ws-alpha', 'journey-100', 'Texto temporário');
    expect(ConversationDraftStore.getDraft('user-1', 'ws-alpha', 'journey-100')).toBe('Texto temporário');
    
    ConversationDraftStore.clearDraft('user-1', 'ws-alpha', 'journey-100');
    expect(ConversationDraftStore.getDraft('user-1', 'ws-alpha', 'journey-100')).toBe('');
  });

  it('deve limpar todos os rascunhos do usuário no logout sem afetar outros usuários', () => {
    ConversationDraftStore.setDraft('user-1', 'ws-alpha', 'journey-100', 'Texto User 1');
    ConversationDraftStore.setDraft('user-2', 'ws-alpha', 'journey-100', 'Texto User 2');

    ConversationDraftStore.clearUserDrafts('user-1');

    expect(ConversationDraftStore.getDraft('user-1', 'ws-alpha', 'journey-100')).toBe('');
    expect(ConversationDraftStore.getDraft('user-2', 'ws-alpha', 'journey-100')).toBe('Texto User 2');
  });
});
