/**
 * Khalto — Admin Documents Management
 *
 * Endpoints:
 *   GET    /admin/documents/types                                — List all doc type definitions
 *   GET    /admin/documents/courier/:courier_id                  — List courier's documents
 *   GET    /admin/documents/kitchen/:kitchen_id                  — List kitchen's documents
 *   POST   /admin/documents/courier/:courier_id/upload           — Upload courier doc (admin)
 *   POST   /admin/documents/kitchen/:kitchen_id/upload           — Upload kitchen doc (admin)
 *   POST   /admin/documents/:entity/:doc_id/approve              — Approve a document
 *   POST   /admin/documents/:entity/:doc_id/reject               — Reject with reason
 *   DELETE /admin/documents/:entity/:doc_id                      — Delete document
 *   GET    /admin/documents/courier/:courier_id/check            — Check if all required uploaded
 *   GET    /admin/documents/kitchen/:kitchen_id/check            — Same for kitchen
 */

const router = require('express').Router();
const { v4: uuid } = require('uuid');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const logger = require('../utils/logger');
const { authenticate, requireRole } = require('../middleware/auth');
const { validateUUID } = require('../middleware/uuid-validator');
const docService = require('../utils/documents-service');

const ADMIN_ROLES = ['super_admin', 'operations'];

// Helper: get document table name and id column
function getDocTable(entityType) {
  if (entityType === 'courier') return { table: 'courier_documents', fk: 'courier_id' };
  if (entityType === 'kitchen') return { table: 'kitchen_documents', fk: 'kitchen_id' };
  return null;
}

// ═══════════════════════════════════════════════════════════
// GET /admin/documents/types
// ═══════════════════════════════════════════════════════════
router.get('/types', authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { entity_type } = req.query;
    let q = db('document_types').where({ is_active: true }).orderBy('sort_order', 'asc');
    if (entity_type) q = q.where({ entity_type });
    const types = await q;
    res.json({ types });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /admin/documents/:entity/:entity_id  — list documents
// ═══════════════════════════════════════════════════════════
router.get('/courier/:entity_id', validateUUID('entity_id'), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  await listDocuments('courier', req, res, next);
});
router.get('/kitchen/:entity_id', validateUUID('entity_id'), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  await listDocuments('kitchen', req, res, next);
});

async function listDocuments(entityType, req, res, next) {
  try {
    const { table, fk } = getDocTable(entityType);

    const documents = await db(`${table} as d`)
      .leftJoin('users as u', 'u.id', 'd.reviewed_by')
      .where(`d.${fk}`, req.params.entity_id)
      .select('d.*', 'u.full_name as reviewed_by_name')
      .orderBy('d.uploaded_at', 'desc');

    // Get all required types for this entity
    const types = await db('document_types')
      .where({ entity_type: entityType, is_active: true })
      .orderBy('sort_order', 'asc');

    // Build status: which types have been uploaded?
    const uploadedTypes = new Set(documents.map(d => d.doc_type));
    const missing = types.filter(t => t.is_required && !uploadedTypes.has(t.doc_type));
    const allRequired = types.filter(t => t.is_required);
    const approvedRequired = documents.filter(d => 
      d.status === 'approved' && allRequired.some(t => t.doc_type === d.doc_type)
    );

    res.json({
      documents,
      types,
      summary: {
        total_types: types.length,
        required_count: allRequired.length,
        uploaded_count: documents.length,
        approved_required_count: approvedRequired.length,
        missing_required: missing.map(t => ({ doc_type: t.doc_type, name_ar: t.name_ar })),
        all_required_approved: missing.length === 0 && approvedRequired.length === allRequired.length,
      },
    });
  } catch (err) { next(err); }
}

// ═══════════════════════════════════════════════════════════
// POST /admin/documents/:entity/:entity_id/upload
// ═══════════════════════════════════════════════════════════

// Set the upload dir before multer runs
function uploadMiddleware(entityType) {
  return [
    authenticate,
    requireRole(...ADMIN_ROLES),
    (req, res, next) => {
      // Pre-set the upload directory
      const entityId = req.params.entity_id;
      req._uploadDir = path.join(docService.UPLOAD_ROOT, entityType, entityId);
      next();
    },
    docService.upload.single('file'),
  ];
}

router.post('/courier/:entity_id/upload', validateUUID('entity_id'), ...uploadMiddleware('courier'), async (req, res, next) => {
  await handleUpload('courier', req, res, next);
});
router.post('/kitchen/:entity_id/upload', validateUUID('entity_id'), ...uploadMiddleware('kitchen'), async (req, res, next) => {
  await handleUpload('kitchen', req, res, next);
});

async function handleUpload(entityType, req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'لم يتم رفع ملف' });
    }

    const { doc_type, expires_at } = req.body;
    if (!doc_type) {
      // Cleanup uploaded file
      docService.deleteFile(docService.buildPublicUrl(req.file.path));
      return res.status(400).json({ error: 'نوع المستند مطلوب' });
    }

    // Verify doc_type exists
    const docTypeDef = await db('document_types')
      .where({ entity_type: entityType, doc_type, is_active: true })
      .first();
    if (!docTypeDef) {
      docService.deleteFile(docService.buildPublicUrl(req.file.path));
      return res.status(400).json({ error: 'نوع المستند غير صحيح' });
    }

    const { table, fk } = getDocTable(entityType);

    // Verify entity exists
    const entityTable = entityType === 'courier' ? 'couriers' : 'kitchens';
    const entity = await db(entityTable).where({ id: req.params.entity_id }).first();
    if (!entity) {
      docService.deleteFile(docService.buildPublicUrl(req.file.path));
      return res.status(404).json({ error: `${entityType === 'courier' ? 'المندوب' : 'المطبخ'} غير موجود` });
    }

    // Delete previous document of same type (if any) and its file
    const existing = await db(table)
      .where({ [fk]: req.params.entity_id, doc_type })
      .first();
    if (existing) {
      docService.deleteFile(existing.file_url);
      await db(table).where({ id: existing.id }).del();
    }

    // Insert new document record
    const fileUrl = docService.buildPublicUrl(req.file.path);
    const [doc] = await db(table).insert({
      id: uuid(),
      [fk]: req.params.entity_id,
      doc_type,
      file_url: fileUrl,
      original_name: req.file.originalname,
      mime_type: req.file.mimetype,
      file_size_bytes: req.file.size,
      status: 'pending',
      expires_at: expires_at || null,
      is_required: docTypeDef.is_required,
      uploaded_at: new Date(),
    }).returning('*');

    logger.info('Document uploaded', {
      entityType, entity_id: req.params.entity_id, doc_type, by: req.user.id, file: fileUrl,
    });

    res.status(201).json({ ok: true, document: doc });
  } catch (err) {
    // Cleanup file on error
    if (req.file) {
      docService.deleteFile(docService.buildPublicUrl(req.file.path));
    }
    next(err);
  }
}

// ═══════════════════════════════════════════════════════════
// POST /admin/documents/:entity/:doc_id/approve
// ═══════════════════════════════════════════════════════════
router.post('/courier/doc/:doc_id/approve', validateUUID('doc_id'), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  await reviewDocument('courier', 'approve', req, res, next);
});
router.post('/kitchen/doc/:doc_id/approve', validateUUID('doc_id'), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  await reviewDocument('kitchen', 'approve', req, res, next);
});
router.post('/courier/doc/:doc_id/reject', validateUUID('doc_id'), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  await reviewDocument('courier', 'reject', req, res, next);
});
router.post('/kitchen/doc/:doc_id/reject', validateUUID('doc_id'), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  await reviewDocument('kitchen', 'reject', req, res, next);
});

async function reviewDocument(entityType, action, req, res, next) {
  try {
    const { table } = getDocTable(entityType);
    const doc = await db(table).where({ id: req.params.doc_id }).first();
    if (!doc) return res.status(404).json({ error: 'المستند غير موجود' });

    if (action === 'reject') {
      const { reason } = req.body;
      if (!reason || reason.trim().length < 5) {
        return res.status(400).json({ error: 'سبب الرفض مطلوب (5 أحرف على الأقل)' });
      }
      await db(table).where({ id: req.params.doc_id }).update({
        status: 'rejected',
        rejected_reason: reason,
        rejection_reason: reason,
        reviewed_by: req.user.id,
        reviewed_at: new Date(),
      });
      res.json({ ok: true, message: 'تم رفض المستند' });
    } else {
      await db(table).where({ id: req.params.doc_id }).update({
        status: 'approved',
        rejection_reason: null,
        reviewed_by: req.user.id,
        reviewed_at: new Date(),
      });
      res.json({ ok: true, message: 'تم اعتماد المستند' });
    }

    logger.info(`Document ${action}ed`, { doc_id: req.params.doc_id, by: req.user.id });
  } catch (err) { next(err); }
}

// ═══════════════════════════════════════════════════════════
// DELETE /admin/documents/:entity/doc/:doc_id
// ═══════════════════════════════════════════════════════════
router.delete('/courier/doc/:doc_id', validateUUID('doc_id'), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  await deleteDocument('courier', req, res, next);
});
router.delete('/kitchen/doc/:doc_id', validateUUID('doc_id'), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  await deleteDocument('kitchen', req, res, next);
});

async function deleteDocument(entityType, req, res, next) {
  try {
    const { table } = getDocTable(entityType);
    const doc = await db(table).where({ id: req.params.doc_id }).first();
    if (!doc) return res.status(404).json({ error: 'المستند غير موجود' });

    docService.deleteFile(doc.file_url);
    await db(table).where({ id: req.params.doc_id }).del();

    logger.info('Document deleted', { doc_id: req.params.doc_id, by: req.user.id });
    res.json({ ok: true, message: 'تم حذف المستند' });
  } catch (err) { next(err); }
}

// ═══════════════════════════════════════════════════════════
// GET /admin/documents/:entity/:id/check — readiness check
// ═══════════════════════════════════════════════════════════
router.get('/courier/:entity_id/check', validateUUID('entity_id'), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  await checkReadiness('courier', req, res, next);
});
router.get('/kitchen/:entity_id/check', validateUUID('entity_id'), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  await checkReadiness('kitchen', req, res, next);
});

async function checkReadiness(entityType, req, res, next) {
  try {
    const { table, fk } = getDocTable(entityType);

    const requiredTypes = await db('document_types')
      .where({ entity_type: entityType, is_required: true, is_active: true });

    const documents = await db(table)
      .where({ [fk]: req.params.entity_id })
      .whereIn('doc_type', requiredTypes.map(t => t.doc_type));

    const result = {
      ready_for_approval: false,
      total_required: requiredTypes.length,
      uploaded: documents.length,
      approved: documents.filter(d => d.status === 'approved').length,
      pending: documents.filter(d => d.status === 'pending').length,
      rejected: documents.filter(d => d.status === 'rejected').length,
      missing: [],
    };

    requiredTypes.forEach(type => {
      const doc = documents.find(d => d.doc_type === type.doc_type);
      if (!doc) {
        result.missing.push({ doc_type: type.doc_type, name_ar: type.name_ar, status: 'missing' });
      } else if (doc.status !== 'approved') {
        result.missing.push({ doc_type: type.doc_type, name_ar: type.name_ar, status: doc.status });
      }
    });

    result.ready_for_approval = result.missing.length === 0;

    res.json(result);
  } catch (err) { next(err); }
}

module.exports = router;
