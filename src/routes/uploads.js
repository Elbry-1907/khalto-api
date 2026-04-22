const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db     = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const {
  uploadImage, uploadDoc,
  handleKitchenImage, handleMenuItemImage,
  handleAvatar, handleDocument,
} = require('../services/upload.service');

// ── Kitchen logo ──────────────────────────────────────────
router.post('/kitchen/:id/logo',
  authenticate, requireRole('chef'),
  uploadImage,
  handleKitchenImage('logo'),
  async (req, res, next) => {
    try {
      await db('kitchens').where({ id: req.params.id, user_id: req.user.id })
        .update({ logo_url: req.uploadedUrl, updated_at: new Date() });
      res.json({ url: req.uploadedUrl });
    } catch (err) { next(err); }
  }
);

// ── Kitchen banner ────────────────────────────────────────
router.post('/kitchen/:id/banner',
  authenticate, requireRole('chef'),
  uploadImage,
  handleKitchenImage('banner'),
  async (req, res, next) => {
    try {
      await db('kitchens').where({ id: req.params.id, user_id: req.user.id })
        .update({ banner_url: req.uploadedUrl, updated_at: new Date() });
      res.json({ url: req.uploadedUrl });
    } catch (err) { next(err); }
  }
);

// ── Menu item image ───────────────────────────────────────
router.post('/menu-item/:id/image',
  authenticate, requireRole('chef'),
  uploadImage,
  handleMenuItemImage,
  async (req, res, next) => {
    try {
      await db('menu_items').where({ id: req.params.id })
        .update({ image_url: req.uploadedUrl, updated_at: new Date() });
      res.json({ url: req.uploadedUrl });
    } catch (err) { next(err); }
  }
);

// ── User avatar ───────────────────────────────────────────
router.post('/avatar',
  authenticate,
  uploadImage,
  handleAvatar,
  async (req, res, next) => {
    try {
      await db('users').where({ id: req.user.id })
        .update({ avatar_url: req.uploadedUrl, updated_at: new Date() });
      res.json({ url: req.uploadedUrl });
    } catch (err) { next(err); }
  }
);

// ── Kitchen document upload ───────────────────────────────
router.post('/kitchen/:id/document',
  authenticate, requireRole('chef'),
  uploadDoc,
  handleDocument,
  async (req, res, next) => {
    try {
      const { doc_type } = req.body;
      if (!doc_type) return res.status(400).json({ error: 'doc_type required' });
      const [doc] = await db('kitchen_documents').insert({
        id:         uuid(),
        kitchen_id: req.params.id,
        doc_type,
        file_url:   req.uploadedUrl,
      }).returning('*');
      res.status(201).json({ document: doc });
    } catch (err) { next(err); }
  }
);

// ── Courier document upload ───────────────────────────────
router.post('/courier/:id/document',
  authenticate, requireRole('courier'),
  uploadDoc,
  handleDocument,
  async (req, res, next) => {
    try {
      const { doc_type } = req.body;
      if (!doc_type) return res.status(400).json({ error: 'doc_type required' });
      const [doc] = await db('courier_documents').insert({
        id:         uuid(),
        courier_id: req.params.id,
        doc_type,
        file_url:   req.uploadedUrl,
      }).returning('*');
      res.status(201).json({ document: doc });
    } catch (err) { next(err); }
  }
);

module.exports = router;
