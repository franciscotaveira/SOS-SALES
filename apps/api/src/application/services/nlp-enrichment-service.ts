/**
 * NLP Enrichment Service — Wit.ai / Meta Built-in NLP Processor
 *
 * Processes native NLP traits and entities parsed by Meta:
 * - Entities: wit$datetime, wit$amount_of_money, wit$phone_number, wit$email, wit$location
 * - Traits: wit$sentiment, wit$greetings, wit$bye, wit$thanks
 *
 * Persists high-confidence entities as verified domain facts in known_facts
 * and nlp_extracted_entities tables.
 */

import { dbPool } from '../../infrastructure/database/pool.js';

export interface NlpEntityItem {
  type: string;
  value: any;
  confidence: number;
}

export interface NlpPayload {
  entities?: Record<string, Array<{ value: any; confidence: number }>>;
  traits?: Record<string, Array<{ value: any; confidence: number }>>;
}

export class NlpEnrichmentService {
  /**
   * Extracts and stores NLP entities from a Meta message payload.
   */
  public static async processAndEnrich(
    workspaceId: string,
    journeyId: string,
    messageId: string | null,
    nlpPayload: NlpPayload
  ): Promise<NlpEntityItem[]> {
    const minConfidence = 0.70;
    const extracted: NlpEntityItem[] = [];

    // 1. Process entities
    if (nlpPayload.entities) {
      for (const [entityName, items] of Object.entries(nlpPayload.entities)) {
        for (const item of items) {
          if (item.confidence >= minConfidence) {
            extracted.push({
              type: entityName,
              value: item.value,
              confidence: item.confidence,
            });
          }
        }
      }
    }

    // 2. Process traits
    if (nlpPayload.traits) {
      for (const [traitName, items] of Object.entries(nlpPayload.traits)) {
        for (const item of items) {
          if (item.confidence >= minConfidence) {
            extracted.push({
              type: traitName,
              value: item.value,
              confidence: item.confidence,
            });
          }
        }
      }
    }

    if (extracted.length === 0) return [];

    // 3. Batch insert into nlp_extracted_entities
    try {
      const placeholders: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      for (const item of extracted) {
        placeholders.push(`(gen_random_uuid(), $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
        values.push(workspaceId, journeyId, messageId, item.type, JSON.stringify(item.value), item.confidence);
      }

      await dbPool.query(
        `INSERT INTO public.nlp_extracted_entities (id, workspace_id, journey_id, message_id, entity_type, entity_value, confidence)
         VALUES ${placeholders.join(', ')}`,
        values
      );

      // 4. Upsert key known_facts for instant sales copilot reasoning
      for (const item of extracted) {
        let key: string | null = null;
        let valStr: string | null = null;

        if (item.type === 'wit$datetime') {
          key = 'customer.intent_datetime';
          valStr = typeof item.value === 'string' ? item.value : JSON.stringify(item.value);
        } else if (item.type === 'wit$amount_of_money') {
          key = 'customer.declared_budget';
          valStr = typeof item.value === 'object' ? `${item.value.value} ${item.value.unit || 'BRL'}` : String(item.value);
        } else if (item.type === 'wit$sentiment') {
          key = 'customer.nlp_sentiment';
          valStr = String(item.value);
        } else if (item.type === 'wit$phone_number') {
          key = 'customer.declared_phone';
          valStr = String(item.value);
        } else if (item.type === 'wit$email') {
          key = 'customer.declared_email';
          valStr = String(item.value);
        }

        if (key && valStr) {
          await dbPool.query(
            `INSERT INTO public.known_facts (id, workspace_id, journey_id, key, value, confidence, confirmed_by_customer, source, observed_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, false, 'meta_wit_nlp', NOW())
             ON CONFLICT (workspace_id, journey_id, key) 
             DO UPDATE SET value = EXCLUDED.value, confidence = EXCLUDED.confidence, observed_at = NOW()`,
            [workspaceId, journeyId, key, valStr, item.confidence]
          );
        }
      }
    } catch (err) {
      console.warn('Error persisting NLP enrichment data:', err);
    }

    return extracted;
  }
}
