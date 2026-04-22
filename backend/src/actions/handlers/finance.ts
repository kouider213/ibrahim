import { supabase } from '../../integrations/supabase.js';
import { getFinancialReport, formatFinancialReport } from '../../integrations/finance.js';
import { getFileContent, updateFile } from '../../integrations/github.js';
import type { ActionPayload, ActionResult } from '../executor.js';

const BUCKET = 'client-documents';

export async function handleFinance(payload: ActionPayload): Promise<ActionResult> {
  switch (payload.action) {
    case 'get_financial_report':
      return financialReport(payload.params);
    case 'set_booking_owner':
      return setBookingOwner(payload.params);
    case 'store_document':
      return storeDocument(payload.params);
    case 'read_site_file':
      return readSiteFile(payload.params);
    case 'update_site_file':
      return updateSiteFile(payload.params);
    default:
      return { success: false, error: 'Unknown finance action', message: 'Action finance inconnue' };
  }
}

async function financialReport(params: Record<string, unknown>): Promise<ActionResult> {
  const year  = Number(params['year']  ?? new Date().getFullYear());
  const month = params['month'] ? Number(params['month']) : undefined;

  try {
    const report = await getFinancialReport(year, month);
    const text   = formatFinancialReport(report);
    return { success: true, data: report, message: text };
  } catch (err) {
    return { success: false, error: String(err), message: `Erreur rapport financier: ${String(err)}` };
  }
}

async function setBookingOwner(params: Record<string, unknown>): Promise<ActionResult> {
  const { id, rented_by } = params as { id: string; rented_by: string };
  if (!id || !rented_by) {
    return { success: false, error: 'missing_params', message: 'id et rented_by requis' };
  }
  if (!['Kouider', 'Houari'].includes(rented_by)) {
    return { success: false, error: 'invalid_owner', message: 'rented_by doit être Kouider ou Houari' };
  }

  const { data, error } = await supabase
    .from('bookings')
    .update({ rented_by, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return { success: false, error: error.message, message: `Erreur: ${error.message}` };
  return { success: true, data, message: `✅ Réservation attribuée à ${rented_by}` };
}

async function storeDocument(params: Record<string, unknown>): Promise<ActionResult> {
  const { clientPhone, clientName, bookingId, type, fileName, mimeType, base64, notes } = params as {
    clientPhone: string;
    clientName:  string;
    bookingId?:  string;
    type:        'passport' | 'license' | 'contract' | 'other';
    fileName:    string;
    mimeType?:   string;
    base64:      string;
    notes?:      string;
  };

  if (!clientPhone || !clientName || !type || !fileName || !base64) {
    return { success: false, error: 'missing_params', message: 'clientPhone, clientName, type, fileName, base64 requis' };
  }

  try {
    const buffer   = Buffer.from(base64, 'base64');
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path     = `${clientPhone}/${type}/${Date.now()}_${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: mimeType ?? 'application/octet-stream', upsert: false });

    if (uploadError) throw new Error(uploadError.message);

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

    const { data: doc, error: dbError } = await supabase
      .from('client_documents')
      .insert({
        client_phone: clientPhone,
        client_name:  clientName,
        booking_id:   bookingId,
        type,
        file_url:     urlData.publicUrl,
        storage_path: path,
        notes,
      })
      .select()
      .single();

    if (dbError) throw new Error(dbError.message);

    return {
      success: true,
      data:    doc,
      message: `✅ Document ${type} stocké pour ${clientName} — accessible à tout moment`,
    };
  } catch (err) {
    return { success: false, error: String(err), message: `Erreur stockage: ${String(err)}` };
  }
}

async function readSiteFile(params: Record<string, unknown>): Promise<ActionResult> {
  const { path } = params as { path: string };
  if (!path) return { success: false, error: 'missing_path', message: 'path requis' };

  const file = await getFileContent(path);
  if (!file) return { success: false, error: 'not_found', message: `Fichier introuvable: ${path}` };

  return {
    success: true,
    data:    { path, content: file.content, sha: file.sha },
    message: `✅ Fichier lu: ${path} (${file.content.length} caractères)`,
  };
}

async function updateSiteFile(params: Record<string, unknown>): Promise<ActionResult> {
  const { path, content, message: commitMsg } = params as {
    path: string; content: string; message?: string;
  };

  if (!path || !content) {
    return { success: false, error: 'missing_params', message: 'path et content requis' };
  }

  const result = await updateFile(path, content, commitMsg ?? `Ibrahim: mise à jour ${path}`);
  if (!result) {
    return { success: false, error: 'github_failed', message: `Échec mise à jour GitHub: ${path}` };
  }

  return {
    success: true,
    data:    { commitSha: result.commitSha },
    message: `✅ Site mis à jour: ${path} — commit ${result.commitSha} — Vercel va redéployer automatiquement`,
  };
}
