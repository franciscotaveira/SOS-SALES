import { describe, expect, it, vi } from 'vitest';
import { PostgresWabaChannelInfoGateway } from '../../src/infrastructure/database/postgres-waba-channel-info-gateway.js';

describe('PostgresWabaChannelInfoGateway', () => {
  it('uses the persisted connection phone when legacy public metadata lacks a display number', async () => {
    const query = vi.fn().mockResolvedValue({
      rowCount: 1,
      rows: [{
        verified_phone: null,
        display_phone: null,
        connection_phone: '+55 49 98837-0054',
        verified_name: 'Haven',
        phone_number_id: 'phone-id',
        waba_id: 'waba-id',
        quality_rating: null,
      }],
    });
    const gateway = new PostgresWabaChannelInfoGateway({ query } as any);

    await expect(gateway.findConnectedByWorkspaceId('workspace-id')).resolves.toEqual({
      verifiedPhone: '+55 49 98837-0054',
      displayPhone: '+55 49 98837-0054',
      verifiedName: 'Haven',
      phoneNumberId: 'phone-id',
      wabaId: 'waba-id',
      qualityRating: undefined,
    });
    expect(query.mock.calls[0][0]).toContain('phone_number AS connection_phone');
  });
});
