import { describe, it, expect } from 'vitest';
import {
  normalizeWorkspaceUuid,
  getSessionName,
  getWorkspaceIdFromSession,
} from '../../src/interfaces/http/routes/whatsapp-channel-routes.js';

describe('Strict Multi-Tenancy — Workspace Normalization & Session Resolution', () => {
  describe('normalizeWorkspaceUuid', () => {
    it('returns exact lowercase UUID for any valid UUID string', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(normalizeWorkspaceUuid(validUuid)).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(normalizeWorkspaceUuid('  550E8400-E29B-41D4-A716-446655440000  ')).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(normalizeWorkspaceUuid('11111111-1111-1111-1111-111111111111')).toBe('11111111-1111-1111-1111-111111111111');
      expect(normalizeWorkspaceUuid('22222222-2222-2222-2222-222222222222')).toBe('22222222-2222-2222-2222-222222222222');
      expect(normalizeWorkspaceUuid('33333333-3333-3333-3333-333333333333')).toBe('33333333-3333-3333-3333-333333333333');
    });

    it('resolves only exact canonical aliases', () => {
      expect(normalizeWorkspaceUuid('haven')).toBe('22222222-2222-2222-2222-222222222222');
      expect(normalizeWorkspaceUuid('HAVEN')).toBe('22222222-2222-2222-2222-222222222222');
      expect(normalizeWorkspaceUuid('sora')).toBe('33333333-3333-3333-3333-333333333333');
      expect(normalizeWorkspaceUuid('matriz')).toBe('11111111-1111-1111-1111-111111111111');
      expect(normalizeWorkspaceUuid('default')).toBe('11111111-1111-1111-1111-111111111111');
    });

    it('P0 SECURITY TRAP: Rejects any substring matches that are not exact UUIDs or aliases', () => {
      // Substring attacks or accidental name overlaps MUST NOT be routed to special workspaces
      expect(normalizeWorkspaceUuid('my-haven-workspace')).toBeNull();
      expect(normalizeWorkspaceUuid('haven-saloon')).toBeNull();
      expect(normalizeWorkspaceUuid('default-company-123')).toBeNull();
      expect(normalizeWorkspaceUuid('matriz-filial-01')).toBeNull();
      expect(normalizeWorkspaceUuid('company-22222222-test')).toBeNull();
      expect(normalizeWorkspaceUuid('business-33333333-unit')).toBeNull();
      expect(normalizeWorkspaceUuid('enterprise-11111111-div')).toBeNull();
      expect(normalizeWorkspaceUuid('sora_boutique')).toBeNull();
    });

    it('returns null for empty, whitespace or invalid inputs', () => {
      expect(normalizeWorkspaceUuid('')).toBeNull();
      expect(normalizeWorkspaceUuid('   ')).toBeNull();
      expect(normalizeWorkspaceUuid(undefined as any)).toBeNull();
      expect(normalizeWorkspaceUuid(null as any)).toBeNull();
      expect(normalizeWorkspaceUuid('not-a-uuid')).toBeNull();
    });
  });

  describe('getSessionName', () => {
    it('generates dynamic ws_<hex> for standard tenant UUIDs', () => {
      expect(getSessionName('550e8400-e29b-41d4-a716-446655440000')).toBe('ws_550e8400e29b41d4a716446655440000');
      expect(getSessionName('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d')).toBe('ws_a1b2c3d4e5f67a8b9c0d1e2f3a4b5c6d');
    });

    it('returns named sessions for known canonical system workspaces', () => {
      expect(getSessionName('22222222-2222-2222-2222-222222222222')).toBe('haven');
      expect(getSessionName('haven')).toBe('haven');
      expect(getSessionName('33333333-3333-3333-3333-333333333333')).toBe('sora');
      expect(getSessionName('sora')).toBe('sora');
      expect(getSessionName('11111111-1111-1111-1111-111111111111')).toBe('default');
      expect(getSessionName('matriz')).toBe('default');
    });

    it('returns null for invalid or malicious workspace inputs', () => {
      expect(getSessionName('my-haven-workspace')).toBeNull();
      expect(getSessionName('invalid-ws')).toBeNull();
      expect(getSessionName('')).toBeNull();
    });
  });

  describe('getWorkspaceIdFromSession', () => {
    it('correctly decodes standard dynamic ws_<hex32> session names', () => {
      const originalUuid = '550e8400-e29b-41d4-a716-446655440000';
      const sessionName = 'ws_550e8400e29b41d4a716446655440000';
      expect(getWorkspaceIdFromSession(sessionName)).toBe(originalUuid);
    });

    it('correctly maps named sessions to canonical UUIDs', () => {
      expect(getWorkspaceIdFromSession('haven')).toBe('22222222-2222-2222-2222-222222222222');
      expect(getWorkspaceIdFromSession('sora')).toBe('33333333-3333-3333-3333-333333333333');
      expect(getWorkspaceIdFromSession('default')).toBe('11111111-1111-1111-1111-111111111111');
      expect(getWorkspaceIdFromSession('matriz')).toBe('11111111-1111-1111-1111-111111111111');
      expect(getWorkspaceIdFromSession('sos_sales')).toBe('11111111-1111-1111-1111-111111111111');
    });

    it('accepts raw UUID format in session', () => {
      const rawUuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(getWorkspaceIdFromSession(rawUuid)).toBe(rawUuid);
    });

    it('returns null for malformed session names', () => {
      expect(getWorkspaceIdFromSession('')).toBeNull();
      expect(getWorkspaceIdFromSession('ws_short123')).toBeNull();
      expect(getWorkspaceIdFromSession('ws_invalid_hex_characters_in_name_xxx')).toBeNull();
      expect(getWorkspaceIdFromSession('unknown_session')).toBeNull();
    });
  });
});
