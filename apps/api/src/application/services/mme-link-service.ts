/**
 * m.me Link Service — Generates and tracks shortlinks for Messenger & Instagram
 *
 * Implements Meta m.me referral protocol:
 * - https://m.me/<PAGE_NAME>?ref=<PARAM>
 * - Tracks link creations, click metrics, and attribution integration
 * - Generates QR codes for offline marketing (flyers, store counters, events)
 */

import { dbPool } from '../../infrastructure/database/pool.js';

export interface MmeLinkCreateOptions {
  workspaceId: string;
  pageName: string;
  refCode: string;
  label?: string;
}

export interface MmeLinkRecord {
  id: string;
  workspaceId: string;
  pageName: string;
  refCode: string;
  fullUrl: string;
  label?: string;
  clickCount: number;
  createdAt: string;
}

export class MmeLinkService {
  /**
   * Creates or returns an existing tracked m.me link.
   */
  async createTrackedLink(options: MmeLinkCreateOptions): Promise<MmeLinkRecord> {
    const { workspaceId, pageName, refCode, label } = options;

    const cleanPage = pageName.trim();
    const cleanRef = refCode.trim().replace(/\s+/g, '_');
    const fullUrl = `https://m.me/${encodeURIComponent(cleanPage)}?ref=${encodeURIComponent(cleanRef)}`;

    const res = await dbPool.query(
      `INSERT INTO public.mme_tracking_links (id, workspace_id, page_name, ref_code, full_url, label, click_count, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 0, NOW(), NOW())
       ON CONFLICT (workspace_id, ref_code) 
       DO UPDATE SET page_name = EXCLUDED.page_name, full_url = EXCLUDED.full_url, label = COALESCE(EXCLUDED.label, mme_tracking_links.label), updated_at = NOW()
       RETURNING id, workspace_id, page_name, ref_code, full_url, label, click_count, created_at`,
      [workspaceId, cleanPage, cleanRef, fullUrl, label || null]
    );

    const row = res.rows[0];
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      pageName: row.page_name,
      refCode: row.ref_code,
      fullUrl: row.full_url,
      label: row.label,
      clickCount: parseInt(row.click_count || '0', 10),
      createdAt: row.created_at,
    };
  }

  /**
   * Lists all tracked m.me links for a workspace.
   */
  async listTrackedLinks(workspaceId: string): Promise<MmeLinkRecord[]> {
    const res = await dbPool.query(
      `SELECT id, workspace_id, page_name, ref_code, full_url, label, click_count, created_at 
       FROM public.mme_tracking_links
       WHERE workspace_id = $1
       ORDER BY created_at DESC`,
      [workspaceId]
    );

    return res.rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      pageName: row.page_name,
      refCode: row.ref_code,
      fullUrl: row.full_url,
      label: row.label,
      clickCount: parseInt(row.click_count || '0', 10),
      createdAt: row.created_at,
    }));
  }

  /**
   * Increments the click/entry count for a specific refCode.
   */
  async recordClick(workspaceId: string, refCode: string): Promise<void> {
    await dbPool.query(
      `UPDATE public.mme_tracking_links 
       SET click_count = click_count + 1, updated_at = NOW()
       WHERE workspace_id = $1 AND ref_code = $2`,
      [workspaceId, refCode]
    );
  }
}
