/**
 * Customer identity verification. Document numbers are encrypted with AES-256-GCM before they
 * are stored, kept in a subcollection no client can read, and shown to staff only in masked form.
 * Revealing a full number requires the verification.reveal permission, a reason, and is audited.
 */
import { z } from 'zod';
import {
  submitVerificationSchema,
  reviewVerificationSchema,
  revealIdSchema,
  maskIdentifier,
  todayIn,
  type IdentificationType,
  type Verification,
} from '@courtsync/shared';
import { getStorage } from 'firebase-admin/storage';
import { callable } from '../lib/callable';
import { db, FieldValue } from '../lib/firebase';
import { fail } from '../lib/errors';
import { audit } from '../lib/audit';
import { refs, loadCompany, loadSettings, requireStaff } from '../lib/authz';
import { seal, open, type Sealed } from '../lib/crypto';
import { joinCompanyInternal } from '../company/customers';
import { notifyCompany, notifyUser } from '../notifications/notify';

const verRef = (cid: string, uid: string) => refs.company(cid).collection('verifications').doc(uid);
const aad = (cid: string, uid: string, typeId: string) => `${cid}:${uid}:${typeId}`;

export const submitVerification = callable(
  'submitVerification',
  submitVerificationSchema,
  async ({ companyId, documents }, caller) => {
    const company = await loadCompany(companyId);
    const settings = await loadSettings(companyId);
    await joinCompanyInternal(companyId, caller.uid, 'self');
    const allowed = new Set([...settings.verification.requiredTypeIds, ...settings.verification.optionalTypeIds]);
    const typeSnaps = await db.getAll(...documents.map((d) => db.collection('identificationTypes').doc(d.typeId)));
    const types = new Map(typeSnaps.filter((s) => s.exists).map((s) => [s.id, s.data() as IdentificationType]));
    const imagePrefix = `companies/${companyId}/verifications/${caller.uid}/`;

    const summaries = [];
    const sealedDocs: { typeId: string; sealed: Sealed }[] = [];
    let expiresOn: string | null = null;
    for (const d of documents) {
      const t = types.get(d.typeId);
      if (!t || !t.enabled || !t.appliesTo.customer || t.countryCode !== company.countryCode || !allowed.has(d.typeId)) {
        throw fail.invalid('This facility does not accept one of those documents.');
      }
      const f = t.fields;
      if (f.number.enabled && f.number.required && !d.number) throw fail.invalid(`${t.name}: the document number is required.`);
      if (d.number && f.number.pattern && !new RegExp(f.number.pattern).test(d.number)) throw fail.invalid(`${t.name}: the number format looks wrong.${f.number.hint ? ` ${f.number.hint}` : ''}`);
      if (f.expiryDate.enabled && f.expiryDate.required && !d.expiryDate) throw fail.invalid(`${t.name}: the expiry date is required.`);
      if (d.expiryDate && d.expiryDate < todayIn(company.timezone)) throw fail.invalid(`${t.name} has expired.`);
      if (f.image.enabled && f.image.required && !d.imagePath) throw fail.invalid(`${t.name}: upload a photo of the document.`);
      if (d.imagePath && !d.imagePath.startsWith(imagePrefix)) throw fail.invalid('The document photo was uploaded to the wrong place.');
      if (f.issuingRegion.enabled && f.issuingRegion.required && !d.issuingRegion) throw fail.invalid(`${t.name}: the issuing state or region is required.`);
      if (d.number && f.number.enabled) sealedDocs.push({ typeId: d.typeId, sealed: await seal(d.number, aad(companyId, caller.uid, d.typeId)) });
      if (d.expiryDate && (!expiresOn || d.expiryDate < expiresOn)) expiresOn = d.expiryDate;
      summaries.push({
        typeId: d.typeId,
        typeName: t.name,
        numberMasked: d.number && f.number.enabled ? maskIdentifier(d.number) : null,
        expiryDate: f.expiryDate.enabled ? d.expiryDate ?? null : null,
        issuingRegion: f.issuingRegion.enabled ? d.issuingRegion ?? null : null,
        imagePath: f.image.enabled ? d.imagePath ?? null : null,
      });
    }
    // When the facility lists required documents, at least one of them must be provided.
    const required = settings.verification.requiredTypeIds;
    if (required.length && !documents.some((d) => required.includes(d.typeId))) {
      throw fail.invalid('Provide at least one of the documents this facility requires.');
    }

    const ref = verRef(companyId, caller.uid);
    const batch = db.batch();
    batch.set(ref, {
      uid: caller.uid,
      companyId,
      status: 'pending',
      documents: summaries,
      consentAt: FieldValue.serverTimestamp(),
      submittedAt: FieldValue.serverTimestamp(),
      reviewedAt: null,
      reviewedBy: null,
      rejectionReason: null,
      expiresOn,
    });
    for (const s of sealedDocs) batch.set(ref.collection('secure').doc(s.typeId), { sealed: s.sealed, updatedAt: FieldValue.serverTimestamp() });
    batch.update(refs.customer(companyId, caller.uid), { verificationStatus: 'pending' });
    await batch.commit();
    await audit({ actorUid: caller.uid, actorEmail: caller.email, action: 'verification.submit', targetType: 'verification', targetId: caller.uid, companyId, after: { documents: summaries.map((s) => s.typeName) } });
    await notifyCompany(companyId, { title: 'Identity verification submitted', body: 'A customer submitted documents for review.', type: 'verification.submitted', link: `/manage/${companyId}/verification`, companyId });
    return { status: 'pending' };
  },
  { rateLimit: 5 },
);

export const reviewVerification = callable('reviewVerification', reviewVerificationSchema, async ({ companyId, uid, decision, reason }, caller) => {
  await requireStaff(caller, companyId, 'verification.review');
  if (decision === 'rejected' && !reason) throw fail.invalid('Give the customer a reason.');
  const ref = verRef(companyId, uid);
  const before = await db.runTransaction(async (tx) => {
    const v = (await tx.get(ref)).data() as Verification | undefined;
    if (!v) throw fail.notFound('Verification');
    if (v.status !== 'pending') throw fail.precondition(`This verification is ${v.status}.`);
    tx.update(ref, { status: decision, reviewedAt: FieldValue.serverTimestamp(), reviewedBy: caller.uid, rejectionReason: decision === 'rejected' ? reason : null });
    tx.update(refs.customer(companyId, uid), { verificationStatus: decision });
    return v;
  });
  await audit({ actorUid: caller.uid, actorEmail: caller.email, action: `verification.${decision}`, targetType: 'verification', targetId: uid, companyId, before: { status: before.status }, after: { status: decision }, metadata: { reason } });
  await notifyUser(uid, { title: 'Identity verification updated', body: decision === 'verified' ? 'Your identity has been verified.' : `Your verification was not accepted: ${reason}`, type: 'verification.updated', link: `/c/${companyId}/verify`, companyId });
  return { ok: true };
});

export const revealIdNumber = callable(
  'revealIdNumber',
  revealIdSchema,
  async ({ companyId, uid, typeId, reason }, caller) => {
    await requireStaff(caller, companyId, 'verification.reveal');
    const snap = await verRef(companyId, uid).collection('secure').doc(typeId).get();
    if (!snap.exists) throw fail.notFound('Document number');
    const number = await open(snap.get('sealed') as Sealed, aad(companyId, uid, typeId));
    await audit({ actorUid: caller.uid, actorEmail: caller.email, action: 'verification.reveal', targetType: 'verification', targetId: uid, companyId, metadata: { typeId, reason } });
    return { number };
  },
  { rateLimit: 10 },
);

/** Customer withdraws consent: encrypted numbers and document images are deleted. */
export const withdrawVerification = callable('withdrawVerification', z.object({ companyId: z.string().min(1) }), async ({ companyId }, caller) => {
  await purgeVerification(companyId, caller.uid);
  await audit({ actorUid: caller.uid, actorEmail: caller.email, action: 'verification.withdraw', targetType: 'verification', targetId: caller.uid, companyId });
  return { ok: true };
});

export async function purgeVerification(companyId: string, uid: string, status: 'notSubmitted' | 'expired' = 'notSubmitted') {
  const ref = verRef(companyId, uid);
  const secure = await ref.collection('secure').get();
  const batch = db.batch();
  secure.forEach((d) => batch.delete(d.ref));
  batch.set(ref, { uid, companyId, status, documents: [], consentAt: null, expiresOn: null }, { merge: true });
  batch.set(refs.customer(companyId, uid), { verificationStatus: status }, { merge: true });
  await batch.commit();
  try {
    await getStorage().bucket().deleteFiles({ prefix: `companies/${companyId}/verifications/${uid}/` });
  } catch {
    // Bucket may be empty or unavailable in tests.
  }
}
