/**
 * External Tools & Visual Bridge Abstraction for MCT OS / SOS Sales
 * 
 * Provides unified schema for embedding, reading, and reasoning over
 * third-party legacy tools (Agendas, ERPs, Inventory, Catalogs).
 */

export type ExternalToolCategory = 'agenda' | 'inventory' | 'erp' | 'catalog' | 'custom';

export interface ExternalToolConnector {
  id: string;
  workspaceId: string;
  name: string;
  category: ExternalToolCategory;
  provider: 'trinks' | 'bling' | 'tiny' | 'omie' | 'simples_agenda' | 'shopify' | 'custom_webview';
  url: string;
  enabled: boolean;
  autoSyncMinutes: number;
  lastSyncedAt?: string;
  authRequired?: boolean;
  metadata?: Record<string, any>;
}

export interface InventoryItemSnapshot {
  sku: string;
  name: string;
  category: string;
  variant?: string; // ex: "Tamanho M", "Cor Terracota", "300ml"
  stockQuantity: number;
  priceFormatted: string;
  numericPrice: number;
  available: boolean;
}

export interface ExternalReasoningResult {
  connectorId: string;
  category: ExternalToolCategory;
  headline: string;
  summary: string;
  actionableDraftText: string;
  confidenceScore: number;
  dataPoints: Record<string, any>;
}
