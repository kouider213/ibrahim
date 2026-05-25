import axios from 'axios';
import { supabase } from './supabase.js';
import { env } from '../config/env.js';

interface TwilioCredentials {
  account_sid:     string;
  auth_token:      string;
  whatsapp_from:   string;  // e.g. "whatsapp:+14155238886"
}

// Fetch Twilio credentials for an org (falls back to main account if not configured)
async function getOrgTwilioCredentials(orgId: string): Promise<TwilioCredentials | null> {
  const { data: cfg } = await supabase
    .from('org_configs')
    .select('integrations')
    .eq('org_id', orgId)
    .maybeSingle();

  const integ = cfg?.integrations as Record<string, string> | null;

  if (integ?.twilio_account_sid && integ?.twilio_auth_token && integ?.twilio_whatsapp_from) {
    return {
      account_sid:   integ.twilio_account_sid,
      auth_token:    integ.twilio_auth_token,
      whatsapp_from: integ.twilio_whatsapp_from,
    };
  }

  // Fallback to main account
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM) {
    return {
      account_sid:   env.TWILIO_ACCOUNT_SID,
      auth_token:    env.TWILIO_AUTH_TOKEN,
      whatsapp_from: env.TWILIO_WHATSAPP_FROM,
    };
  }

  return null;
}

// Send WhatsApp message using org-specific or shared Twilio credentials
export async function sendSaasWhatsApp(
  orgId: string,
  to: string,
  body: string,
): Promise<{ success: boolean; sid?: string; error?: string }> {
  const creds = await getOrgTwilioCredentials(orgId);
  if (!creds) return { success: false, error: 'WhatsApp non configuré pour cette organisation' };

  const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

  try {
    const res = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${creds.account_sid}/Messages.json`,
      new URLSearchParams({
        From: creds.whatsapp_from,
        To:   toNumber,
        Body: body,
      }).toString(),
      {
        auth:    { username: creds.account_sid, password: creds.auth_token },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10_000,
      },
    );
    return { success: true, sid: (res.data as { sid: string }).sid };
  } catch (err: unknown) {
    const msg = axios.isAxiosError(err)
      ? (err.response?.data as { message?: string })?.message ?? err.message
      : String(err);
    console.error(`[saas-whatsapp] Send failed for org ${orgId}:`, msg);
    return { success: false, error: msg };
  }
}

// Validate Twilio credentials (test send)
export async function validateTwilioCredentials(
  accountSid: string,
  authToken:  string,
): Promise<{ valid: boolean; account_name?: string; error?: string }> {
  try {
    const res = await axios.get(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
      { auth: { username: accountSid, password: authToken }, timeout: 8_000 },
    );
    return { valid: true, account_name: (res.data as { friendly_name: string }).friendly_name };
  } catch {
    return { valid: false, error: 'Identifiants Twilio invalides' };
  }
}
