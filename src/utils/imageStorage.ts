import { supabase } from './supabase';

// Central place for putting images into Supabase Storage instead of embedding base64 blobs
// inside table rows. Storing base64 in `procurements.payment_history` and `daily_operations`
// photo columns was bloating rows to ~300-400KB each and driving Supabase egress/storage.
// Images now live in the `app-images` bucket and rows keep only a short public URL.

export const IMAGE_BUCKET = 'app-images';

// Maximum number of entries to retain in a procurement's payment_history audit array.
// Prevents unbounded growth from repeated edits. History is oldest-first, so we keep the tail.
export const MAX_PAYMENT_HISTORY_ENTRIES = 40;

/**
 * Trim a payment_history array to the most recent MAX_PAYMENT_HISTORY_ENTRIES entries.
 */
export function capPaymentHistory<T>(history: T[] | null | undefined): T[] {
  if (!Array.isArray(history)) return [];
  if (history.length <= MAX_PAYMENT_HISTORY_ENTRIES) return history;
  return history.slice(history.length - MAX_PAYMENT_HISTORY_ENTRIES);
}

/** Convert a data: URL to a Blob. Returns null if the string isn't a parseable data URL. */
function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } | null {
  try {
    const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
    if (!match) return null;
    const mime = match[1] || 'image/jpeg';
    const isBase64 = !!match[2];
    const dataPart = match[3];

    const binary = isBase64 ? atob(dataPart) : decodeURIComponent(dataPart);
    const buffer = new ArrayBuffer(binary.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);

    const ext = mime.includes('png') ? 'png'
      : mime.includes('webp') ? 'webp'
      : mime.includes('gif') ? 'gif'
      : 'jpg';
    return { blob: new Blob([buffer], { type: mime }), ext };
  } catch {
    return null;
  }
}

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* noop */ }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Upload a base64 data-URL image to Storage and return its public URL.
 * - If `value` is empty, null, or already an http(s) URL, it is returned unchanged (idempotent).
 * - On any upload failure the ORIGINAL value is returned so the caller still persists the image
 *   (as base64) rather than losing it — degraded, but never data-losing.
 */
export async function uploadImageIfDataUrl(
  value: string | null | undefined,
  folder: string
): Promise<string> {
  if (!value) return value || '';
  if (!value.startsWith('data:')) return value; // already a URL (or non-image string)

  const parsed = dataUrlToBlob(value);
  if (!parsed) return value;

  const path = `${folder}/${randomId()}.${parsed.ext}`;
  try {
    const { error } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(path, parsed.blob, { contentType: parsed.blob.type, upsert: false });
    if (error) {
      console.warn('Image upload failed, keeping inline image as fallback:', error.message);
      return value;
    }
    const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
    return data?.publicUrl || value;
  } catch (e) {
    console.warn('Image upload threw, keeping inline image as fallback:', e);
    return value;
  }
}

/** Upload an array of images, preserving order and count. */
export async function uploadImagesIfDataUrl(
  values: (string | null | undefined)[] | null | undefined,
  folder: string
): Promise<string[]> {
  if (!Array.isArray(values)) return [];
  return Promise.all(values.map(v => uploadImageIfDataUrl(v, folder)));
}

const isDataUrl = (v: any): v is string => typeof v === 'string' && v.startsWith('data:');

export interface LegacyMigrationResult {
  procurementRowsMigrated: number;
  procurementImagesMoved: number;
  dailyOpsRowsMigrated: number;
  dailyOpsImagesMoved: number;
  failures: number;
}

/**
 * One-time backfill: move base64 images that were previously stored INSIDE table rows
 * (procurements.payment_history bill images, and daily_operations photo columns) into the
 * app-images Storage bucket, replacing each with a short public URL.
 *
 * Safe to run repeatedly: rows whose images are already URLs are skipped, and a row is only
 * rewritten after its images upload successfully (upload failures leave the row untouched).
 * Must run in the browser (Storage uploads require normal network access).
 */
export async function migrateLegacyImagesToStorage(
  onProgress?: (msg: string) => void
): Promise<LegacyMigrationResult> {
  const { supabase } = await import('./supabase');
  const result: LegacyMigrationResult = {
    procurementRowsMigrated: 0,
    procurementImagesMoved: 0,
    dailyOpsRowsMigrated: 0,
    dailyOpsImagesMoved: 0,
    failures: 0,
  };

  // --- procurements.payment_history bill images ---
  onProgress?.('Scanning procurement payment history…');
  const { data: procs, error: procErr } = await supabase
    .from('procurements')
    .select('id, payment_history');
  if (procErr) {
    onProgress?.(`Procurement scan failed: ${procErr.message}`);
  } else {
    for (const proc of procs || []) {
      const history = Array.isArray(proc.payment_history) ? proc.payment_history : [];
      let changed = false;
      let movedInRow = 0;
      const nextHistory = [];
      for (const entry of history) {
        if (entry && isDataUrl(entry.bill_image)) {
          const url = await uploadImageIfDataUrl(entry.bill_image, `procurement-bills/${proc.id}`);
          if (url !== entry.bill_image) {
            nextHistory.push({ ...entry, bill_image: url });
            changed = true;
            movedInRow++;
            continue;
          } else {
            result.failures++;
          }
        }
        nextHistory.push(entry);
      }
      if (changed) {
        const { error: upErr } = await supabase
          .from('procurements')
          .update({ payment_history: capPaymentHistory(nextHistory) })
          .eq('id', proc.id);
        if (upErr) {
          result.failures++;
        } else {
          result.procurementRowsMigrated++;
          result.procurementImagesMoved += movedInRow;
          onProgress?.(`Migrated ${result.procurementImagesMoved} bill image(s)…`);
        }
      }
    }
  }

  // --- daily_operations photo columns ---
  onProgress?.('Scanning daily operations photos…');
  const { data: ops, error: opsErr } = await supabase
    .from('daily_operations')
    .select('id, branch_name, date, opening_photo, closing_photo, opening_sop_photos');
  if (opsErr) {
    onProgress?.(`Daily-ops scan failed: ${opsErr.message}`);
  } else {
    for (const op of ops || []) {
      const folder = `daily-ops/${op.branch_name}/${op.date}`;
      const update: Record<string, any> = {};
      let movedInRow = 0;

      if (isDataUrl(op.opening_photo)) {
        const url = await uploadImageIfDataUrl(op.opening_photo, folder);
        if (url !== op.opening_photo) { update.opening_photo = url; movedInRow++; } else { result.failures++; }
      }
      if (isDataUrl(op.closing_photo)) {
        const url = await uploadImageIfDataUrl(op.closing_photo, folder);
        if (url !== op.closing_photo) { update.closing_photo = url; movedInRow++; } else { result.failures++; }
      }
      if (Array.isArray(op.opening_sop_photos) && op.opening_sop_photos.some(isDataUrl)) {
        const urls = await uploadImagesIfDataUrl(op.opening_sop_photos, folder);
        const movedCount = urls.filter((u, i) => u !== op.opening_sop_photos[i]).length;
        if (movedCount > 0) { update.opening_sop_photos = urls; movedInRow += movedCount; }
      }

      if (Object.keys(update).length > 0) {
        const { error: upErr } = await supabase.from('daily_operations').update(update).eq('id', op.id);
        if (upErr) {
          result.failures++;
        } else {
          result.dailyOpsRowsMigrated++;
          result.dailyOpsImagesMoved += movedInRow;
          onProgress?.(`Migrated ${result.dailyOpsImagesMoved} operations photo(s)…`);
        }
      }
    }
  }

  onProgress?.('Migration complete.');
  return result;
}
