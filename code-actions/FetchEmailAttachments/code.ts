import { BlocksClient, Item } from '../shared/blocks/blocks-client.ts';
import { errText, mapLimit, readAll, readByIds, str } from '../shared/collections-data.ts';
import { clean } from '../shared/collections-mail.ts';
import { buildSortingBrief, candidatesOf, ROLE_OTHER } from '../shared/collections-inbox.ts';
import { extractFile, fileKindOf, S_DONE, S_FAILED, S_OCR, S_PENDING, S_UNSUPPORTED } from './extract.ts';

// Code, not an agent: downloads every attachment of one inbound email (an attachment that comes
// with a url is fetched from it; one without a url is saved as ממתין – no mail provider is connected), stores the file
// (UploadBase64File → protected url) and writes one EmailAttachments row per file (unique messageId + fileName;
// a file already extracted is not downloaded again). Extraction by code: PDF text (unpdf), Excel / CSV sheets as
// tab-separated text (xlsx), image / scanned PDF → דורש OCR, anything else → לא נתמך; a failed file is נכשל with
// the error and never stops the email. Then builds promptForAgent – Maya's full sorting brief in the fixed format –
// with each file's text (capped per file and in total). Sends nothing.

/** Files above this size are extracted but not copied into app storage (the provider reference is kept). */
const MAX_STORE_BYTES = 15 * 1024 * 1024;
const NO_PROVIDER_REASON = 'אין ספק דואר מחובר';
const FINAL_STATES = [S_DONE, S_OCR, S_UNSUPPORTED];

interface FileMeta {
  fileName: string;
  mimeType: string;
  attachmentId: string;
  url: string;
  size: number | null;
}

/** The provider's attachment list (array, single object or a JSON string), de-duplicated by file name. */
function parseMeta(raw: unknown): { files: FileMeta[]; duplicates: string[] } {
  let list: any = raw;
  if (typeof list === 'string') {
    const s = list.trim();
    try {
      list = s && s !== 'undefined' && s !== 'null' ? JSON.parse(s) : [];
    } catch {
      list = [];
    }
  }
  if (list && !Array.isArray(list) && typeof list === 'object') list = [list];
  if (!Array.isArray(list)) list = [];
  const files: FileMeta[] = [];
  const duplicates: string[] = [];
  for (const a of list) {
    if (!a || typeof a !== 'object') continue;
    const fileName = clean(a.filename ?? a.fileName ?? a.name ?? a.title).replace(/[\r\n]+/g, ' ');
    const attachmentId = clean(a.attachmentId ?? a.attachment_id ?? a.id);
    const url = clean(a.url ?? a.fileUrl ?? a.downloadUrl ?? a.link);
    if (!fileName && !attachmentId && !url) continue;
    const name = fileName || `attachment-${files.length + 1}`;
    if (files.some((f) => f.fileName === name)) {
      duplicates.push(name);
      continue;
    }
    const size = Number(a.size ?? a.sizeBytes ?? a.fileSize);
    files.push({ fileName: name, mimeType: clean(a.mimeType ?? a.mime_type ?? a.mimetype ?? a.contentType), attachmentId, url, size: Number.isFinite(size) && size > 0 ? size : null });
  }
  return { files, duplicates };
}

async function fetchBytes(client: BlocksClient, url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  let target = url;
  if (/\/redirect(\?|$)/.test(url)) target = (await client.generateFileSignedUrl(url)).signedUrl;
  const res = await fetch(target);
  if (!res.ok) throw new Error(`הורדת הקובץ נכשלה (HTTP ${res.status})`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get('content-type') ?? '' };
}


export const invoke = async (input: any, context: any) => {
  const dryRun = input?.dryRun === true;
  const emailId = clean(input?.inboundEmailId);
  const errors: string[] = [];
  const out = (o: Item) => ({ dryRun, attachments: [] as Item[], extractedCount: 0, promptForAgent: '', errors, ...o });
  if (!emailId) return out({ errors: ['חסר מזהה מייל (inboundEmailId)'] });

  const client = new BlocksClient(context);
  const [email] = await readByIds(client, 'InboundEmails', [emailId]);
  if (!email) return out({ errors: [`המייל ${emailId} לא נמצא`] });
  const messageId = clean(input?.messageId) || str(email.messageId);
  const isTest = email.isTestFixture === true || email.isTestFixture === 'true';
  const { files, duplicates } = parseMeta(input?.attachments);
  for (const d of duplicates) errors.push(`${d}: שם קובץ כפול באותו מייל – נשמר פעם אחת`);

  const existing = messageId ? await readAll(client, 'EmailAttachments', { column: 'messageId', value: messageId }) : [];
  const existingByName = new Map<string, Item>();
  for (const r of existing.sort((a, b) => Number(a.id) - Number(b.id))) if (!existingByName.has(str(r.fileName))) existingByName.set(str(r.fileName), r);

  const rows = await mapLimit(files, 2, async (f): Promise<Item> => {
    const prev = existingByName.get(f.fileName) ?? null;
    if (prev && FINAL_STATES.includes(str(prev.extractionState))) return { ...prev, _reused: true };
    const base: Item = {
      inboundEmailId: emailId,
      messageId,
      providerAttachmentId: f.attachmentId || null,
      fileName: f.fileName,
      mimeType: f.mimeType || null,
      fileKind: fileKindOf(f.fileName, f.mimeType),
      fileUrl: str(prev?.fileUrl) || null,
      sizeBytes: f.size,
      extractionState: S_PENDING,
      extractedText: null,
      extractionError: null,
      extractedAt: null,
      isTestFixture: isTest,
    };
    if (dryRun) return { ...base, id: prev?.id ?? null };
    if (!f.url) {
      // no mail provider is connected to download from: keep the row ממתין, never a failure
      base.extractionError = NO_PROVIDER_REASON;
      try {
        const saved = prev ? (await client.updateItem('EmailAttachments', str(prev.id), base))?.item : (await client.createItem('EmailAttachments', base))?.item;
        return { ...base, ...(saved ?? {}), id: saved?.id ?? prev?.id ?? null, _skipped: true };
      } catch (e) {
        errors.push(`${f.fileName}: שמירת השורה ב-EmailAttachments נכשלה – ${errText(e)}`);
        return { ...base, id: prev?.id ?? null, _skipped: true };
      }
    }
    try {
      // download
      const got = await fetchBytes(client, f.url);
      const mimeType = f.mimeType || got.contentType.split(';')[0].trim();
      base.mimeType = mimeType || null;
      base.fileKind = fileKindOf(f.fileName, mimeType);
      base.sizeBytes = got.bytes.length;

      // store the file
      if (!base.fileUrl) {
        if (got.bytes.length <= MAX_STORE_BYTES) {
          try {
            const up: any = await client.invokeAction('UploadBase64File', {
              base64: Buffer.from(got.bytes).toString('base64'),
              fileName: f.fileName,
              mimeType: mimeType || 'application/octet-stream',
            });
            base.fileUrl = str(up?.protectedUrl ?? up?.output?.protectedUrl) || null;
          } catch (e) {
            errors.push(`${f.fileName}: שמירת הקובץ נכשלה (${errText(e)}) – נשמר מזהה הקובץ אצל ספק הדואר`);
          }
        } else errors.push(`${f.fileName}: הקובץ גדול מ-15MB – לא הועתק, נשמר מזהה הקובץ אצל ספק הדואר`);
      }

      // extract
      const ex = await extractFile(got.bytes, f.fileName, mimeType);
      Object.assign(base, ex, { extractedAt: new Date().toISOString() });
      if (ex.extractionState === S_FAILED) errors.push(`${f.fileName}: ${ex.extractionError}`);
    } catch (e) {
      base.extractionState = S_FAILED;
      base.extractionError = errText(e);
      base.extractedAt = new Date().toISOString();
      errors.push(`${f.fileName}: ${errText(e)}`);
    }
    try {
      const saved = prev ? (await client.updateItem('EmailAttachments', str(prev.id), base))?.item : (await client.createItem('EmailAttachments', base))?.item;
      return { ...base, ...(saved ?? {}), id: saved?.id ?? prev?.id ?? null };
    } catch (e) {
      errors.push(`${f.fileName}: שמירת השורה ב-EmailAttachments נכשלה – ${errText(e)}`);
      return { ...base, id: prev?.id ?? null };
    }
  });

  // rows that exist from an earlier run but were not in this call's list stay part of the email
  const names = new Set(rows.map((r) => str(r.fileName)));
  const all = [...rows, ...[...existingByName.values()].filter((r) => !names.has(str(r.fileName)))];

  // the stored file links on the email itself (cases and drafts link the customer's files from there)
  const urls = all.map((r) => str(r.fileUrl)).filter(Boolean);
  if (!dryRun && all.length) {
    try {
      await client.updateItem('InboundEmails', emailId, {
        attachmentNames: all.map((r) => str(r.fileName).replace(/,/g, ' ')).join(', '),
        ...(urls.length ? { attachmentUrls: urls.join('\n') } : {}),
      });
    } catch (e) {
      errors.push(`InboundEmails: ${errText(e)}`);
    }
  }

  const stored = !(email.bodyStored === false || email.bodyStored === 'false');
  const promptForAgent = buildSortingBrief({
    fromAddress: str(email.fromAddress),
    fromName: str(email.fromName),
    verification: str(email.senderVerification),
    senderRole: str(email.senderRole) || ROLE_OTHER,
    verificationBasis: str(email.verificationBasis),
    candidates: candidatesOf(email),
    subject: str(email.subject),
    files: all.map((r) => ({ fileName: str(r.fileName), fileKind: str(r.fileKind), extractionState: str(r.extractionState), text: str(r.extractedText) })),
    body: stored ? str(email.bodyText) : '',
  });

  const attachments = all.map((r) => ({
    id: r.id ? str(r.id) : null,
    fileName: str(r.fileName),
    fileKind: str(r.fileKind),
    extractionState: str(r.extractionState),
    chars: str(r.extractedText).length,
    fileUrl: str(r.fileUrl) || null,
    reused: r._reused === true,
    skipped: r._skipped === true,
    skipReason: r._skipped === true ? NO_PROVIDER_REASON : null,
    error: str(r.extractionError) || null,
  }));
  return out({ attachments, extractedCount: attachments.filter((a) => a.extractionState === S_DONE).length, promptForAgent });
};
