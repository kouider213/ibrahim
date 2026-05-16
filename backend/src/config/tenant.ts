import { env } from './env.js';

/**
 * Tenant configuration — all business-specific values in one place.
 * For a new subscription client: fork this backend deployment on Railway,
 * set these env vars, and the entire system adapts automatically.
 */
export interface TenantConfig {
  // Identity
  businessName:   string;   // "Fik Conciergerie Oran"
  ownerName:      string;   // "Kouider"
  partnerName:    string;   // "Houari"
  city:           string;   // "Oran"
  country:        string;   // "Algeria"

  // Localization
  timezone:       string;   // "Africa/Algiers"
  currency:       string;   // "DZD"
  locale:         string;   // "fr-DZ"

  // AI persona
  aiName:         string;   // "Dzaryx"
  aiPersonality:  string;   // system prompt additions

  // Industry context
  industry:       'car_rental' | 'hotel' | 'event' | 'restaurant' | 'custom';
}

export const TENANT: TenantConfig = {
  businessName:  env.BUSINESS_NAME,
  ownerName:     env.OWNER_NAME,
  partnerName:   env.PARTNER_NAME,
  city:          process.env['TENANT_CITY']     ?? 'Oran',
  country:       process.env['TENANT_COUNTRY']  ?? 'Algérie',
  timezone:      process.env['TENANT_TZ']       ?? 'Africa/Algiers',
  currency:      process.env['TENANT_CURRENCY'] ?? 'DZD',
  locale:        process.env['TENANT_LOCALE']   ?? 'fr-DZ',
  aiName:        process.env['AI_NAME']         ?? 'Dzaryx',
  aiPersonality: process.env['AI_PERSONALITY']  ?? '',
  industry:      (process.env['TENANT_INDUSTRY'] as TenantConfig['industry']) ?? 'car_rental',
};

// System prompt additions for this tenant
export function buildTenantSystemContext(): string {
  return [
    `TU ES: ${TENANT.aiName}, assistant IA privé de ${TENANT.businessName}.`,
    `GÉRANTS: ${TENANT.ownerName} (propriétaire principal) et ${TENANT.partnerName} (associé).`,
    `LOCALISATION: ${TENANT.city}, ${TENANT.country} — fuseau horaire: ${TENANT.timezone}.`,
    `SECTEUR: ${TENANT.industry === 'car_rental' ? 'Location de voitures' : TENANT.industry}.`,
    TENANT.aiPersonality ? `PERSONNALITÉ: ${TENANT.aiPersonality}` : '',
  ].filter(Boolean).join('\n');
}
