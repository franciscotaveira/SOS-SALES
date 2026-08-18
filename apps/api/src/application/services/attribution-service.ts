import type { PoolClient } from 'pg';
import crypto from 'node:crypto';

export interface ExtractedAttribution {
  source: 'meta_ads' | 'google_ads' | 'instagram_organic' | 'google_business' | 'referral' | 'other';
  campaignId: string | null;
  campaignName: string | null;
  adSetId: string | null;
  adId: string | null;
  creativeCode: string | null;
  offerHook: string | null;
  entryMessage: string;
  clickIds: Record<string, string>;
  trackingCode: string | null;
  confidence: 'HIGH_CTWA' | 'HIGH_TRACKING_LINK' | 'MEDIUM_TEXT_CODE' | 'LOW_TIME_WINDOW' | 'MANUAL_DECLARED';
}

export class AttributionService {
  /**
   * Extracts attribution metadata from WhatsApp message payloads (CTWA referral object or UTM text).
   */
  public static extractAttribution(
    rawText: string,
    payloadObj?: any,
    configuredCampaigns: any[] = []
  ): ExtractedAttribution | null {
    const text = (rawText || '').trim();
    const referral =
      payloadObj?.referral ||
      payloadObj?._data?.referral ||
      payloadObj?._data?.message?.referral ||
      payloadObj?._data?.quotedMsg?.referral ||
      null;

    const clickIds: Record<string, string> = {};

    // 1. High-confidence: Meta Native CTWA Referral Object
    if (referral) {
      const sourceId = referral.source_id || referral.ad_id || null;
      const headline = referral.headline || referral.body || null;
      const sourceUrl = referral.source_url || '';
      const ctwaClid = referral.ctwa_clid || null;

      if (ctwaClid) clickIds.ctwaClid = ctwaClid;

      // Extract fbclid or utms from source_url if present
      if (sourceUrl) {
        try {
          const url = new URL(sourceUrl.startsWith('http') ? sourceUrl : `https://${sourceUrl}`);
          const fbclid = url.searchParams.get('fbclid');
          if (fbclid) clickIds.fbclid = fbclid;
        } catch {}
      }

      // Match against configured campaigns if any
      let matchedCamp = configuredCampaigns.find((c) =>
        (c.id && sourceId && String(c.id) === String(sourceId)) ||
        (c.offerHook && headline && headline.toLowerCase().includes(c.offerHook.toLowerCase())) ||
        (c.name && headline && headline.toLowerCase().includes(c.name.toLowerCase()))
      );

      return {
        source: 'meta_ads',
        campaignId: matchedCamp?.id || sourceId || 'ctwa_meta_ad',
        campaignName: matchedCamp?.name || headline || 'Meta Ads (Click to WhatsApp)',
        adSetId: matchedCamp?.adSetId || null,
        adId: sourceId || null,
        creativeCode: matchedCamp?.creativeCode || referral.source_type || 'CTWA_AD',
        offerHook: matchedCamp?.offerHook || headline || 'Oferta Meta Ads',
        entryMessage: text || headline || 'Entrada via anúncio Meta',
        clickIds,
        trackingCode: matchedCamp?.trackingCode || `trk_meta_${sourceId || Date.now()}`,
        confidence: 'HIGH_CTWA',
      };
    }

    // 2. Parse UTMs & Click IDs from message body
    const utmSourceMatch = text.match(/(?:utm_source|source)[=:]\s*([a-zA-Z0-9_\-\.]+)/i);
    const utmCampaignMatch = text.match(/(?:utm_campaign|campaign|campanha)[=:]\s*([a-zA-Z0-9_\-\.]+)/i);
    const utmContentMatch = text.match(/(?:utm_content|content|criativo|ad)[=:]\s*([a-zA-Z0-9_\-\.]+)/i);
    const utmMediumMatch = text.match(/(?:utm_medium|medium)[=:]\s*([a-zA-Z0-9_\-\.]+)/i);
    const fbclidMatch = text.match(/(?:fbclid|ctwa_clid)[=:]\s*([a-zA-Z0-9_\-\.]+)/i);
    const gclidMatch = text.match(/(?:gclid)[=:]\s*([a-zA-Z0-9_\-\.]+)/i);
    const refTagMatch = text.match(/\[(?:ref|anuncio|tag|trk):\s*([a-zA-Z0-9_\-\.]+)\]/i);

    if (fbclidMatch) clickIds.fbclid = fbclidMatch[1];
    if (gclidMatch) clickIds.gclid = gclidMatch[1];

    if (utmSourceMatch || utmCampaignMatch || refTagMatch || fbclidMatch || gclidMatch) {
      const srcRaw = (utmSourceMatch ? utmSourceMatch[1] : (fbclidMatch ? 'meta_ads' : (gclidMatch ? 'google_ads' : 'meta_ads'))).toLowerCase();
      const isMeta = srcRaw.includes('meta') || srcRaw.includes('insta') || srcRaw.includes('facebook') || srcRaw.includes('fb') || Boolean(fbclidMatch);
      const isGoogle = srcRaw.includes('google') || srcRaw.includes('gads') || Boolean(gclidMatch);
      const source = isMeta ? 'meta_ads' : isGoogle ? 'google_ads' : 'referral';

      const campName = utmCampaignMatch ? utmCampaignMatch[1] : (refTagMatch ? refTagMatch[1] : 'Campanha de Anúncios');
      const creative = utmContentMatch ? utmContentMatch[1] : (refTagMatch ? refTagMatch[1] : 'AD_DEFAULT');
      const confidence = (fbclidMatch || gclidMatch) ? 'HIGH_TRACKING_LINK' : 'MEDIUM_TEXT_CODE';

      return {
        source,
        campaignId: utmCampaignMatch ? utmCampaignMatch[1] : (refTagMatch ? refTagMatch[1] : 'cmp_utm'),
        campaignName: campName,
        adSetId: utmMediumMatch ? utmMediumMatch[1] : null,
        adId: refTagMatch ? refTagMatch[1] : null,
        creativeCode: creative,
        offerHook: campName,
        entryMessage: text,
        clickIds,
        trackingCode: refTagMatch ? refTagMatch[1] : `trk_${srcRaw}_${Date.now()}`,
        confidence,
      };
    }

    // 3. Match Entry Message with Pre-configured Campaigns / Hook Promises
    if (text && configuredCampaigns.length > 0) {
      const lower = text.toLowerCase();
      for (const camp of configuredCampaigns) {
        if (
          (camp.offerHook && lower.includes(camp.offerHook.toLowerCase())) ||
          (camp.name && lower.includes(camp.name.toLowerCase())) ||
          (camp.entryGreeting && lower.includes(camp.entryGreeting.toLowerCase()))
        ) {
          return {
            source: 'meta_ads',
            campaignId: camp.id || 'cmp_hook_match',
            campaignName: camp.name || 'Campanha Meta Ads',
            adSetId: camp.adSetId || null,
            adId: camp.adId || null,
            creativeCode: camp.creativeCode || 'HOOK_MATCH',
            offerHook: camp.offerHook || camp.name || 'Oferta Comercial',
            entryMessage: text,
            clickIds: {},
            trackingCode: camp.trackingCode || `trk_hook_${camp.id || Date.now()}`,
            confidence: 'MEDIUM_TEXT_CODE',
          };
        }
      }
    }

    return null;
  }


  /**
   * Persists extracted attribution context into PostgreSQL tables (acquisition_contexts, known_facts, commercial_journeys).
   */
  public static async persistAttribution(
    client: PoolClient,
    workspaceId: string,
    journeyId: string,
    attribution: ExtractedAttribution,
    occurredAt: Date = new Date()
  ): Promise<string> {
    // 1. Upsert into public.acquisition_contexts
    const insertRes = await client.query(`
      INSERT INTO public.acquisition_contexts (
        id, workspace_id, journey_id, source, campaign_id, campaign_name,
        ad_set_id, ad_id, creative_code, offer_hook, entry_message,
        click_ids, tracking_code, confidence, occurred_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      )
      RETURNING id
    `, [
      workspaceId,
      journeyId,
      attribution.source,
      attribution.campaignId,
      attribution.campaignName,
      attribution.adSetId,
      attribution.adId,
      attribution.creativeCode,
      attribution.offerHook,
      attribution.entryMessage,
      JSON.stringify(attribution.clickIds || {}),
      attribution.trackingCode,
      attribution.confidence,
      occurredAt,
    ]);

    const contextId = insertRes.rows[0].id;

    // 2. Insert Known Facts for real-time Cockpit visibility
    const facts = [
      { key: 'traffic.source', value: JSON.stringify(attribution.source) },
      { key: 'ad.campaign', value: JSON.stringify(attribution.campaignName) },
      { key: 'ad.creative', value: JSON.stringify(attribution.creativeCode) },
      { key: 'ad.offer_hook', value: JSON.stringify(attribution.offerHook) },
      { key: 'ad.confidence', value: JSON.stringify(attribution.confidence) },
    ];

    for (const f of facts) {
      if (f.value && f.value !== 'null') {
        await client.query(`
          INSERT INTO public.known_facts (
            id, workspace_id, journey_id, key, value, confidence, confirmed_by_customer, source, observed_at
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4::jsonb, 1.0, true, 'ad_payload', $5
          )
          ON CONFLICT DO NOTHING
        `, [workspaceId, journeyId, f.key, f.value, occurredAt]);
      }
    }

    // 3. Update commercial_journeys primary_service_or_product if empty
    if (attribution.offerHook) {
      await client.query(`
        UPDATE public.commercial_journeys 
        SET primary_service_or_product = COALESCE(NULLIF(primary_service_or_product, ''), $1),
            updated_at = NOW()
        WHERE id = $2
      `, [attribution.offerHook, journeyId]);
    }

    return contextId;
  }
}
