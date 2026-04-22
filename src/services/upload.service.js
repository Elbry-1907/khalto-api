const multer  = require('multer');
const sharp   = require('sharp');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuid } = require('uuid');
const path    = require('path');
const logger  = require('../utils/logger');

// ── S3 Client (works with AWS S3 and Cloudflare R2) ──────
const s3 = new S3Client({
  region:   process.env.S3_REGION || 'me-south-1',
  endpoint: process.env.S3_ENDPOINT,           // set for R2
  credentials: {
    accessKeyId:     process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
  forcePathStyle: !!process.env.S3_ENDPOINT,   // required for R2
});

const BUCKET = process.env.S3_BUCKET || 'khalto-uploads';
const CDN    = process.env.CDN_URL || `https://${BUCKET}.s3.amazonaws.com`;

// ── Allowed types ─────────────────────────────────────────
const IMAGE_TYPES = ['image/jpeg','image/png','image/webp'];
const DOC_TYPES   = ['image/jpeg','image/png','application/pdf'];

// ── Multer (memory storage — we process before uploading) ─
const storage = multer.memoryStorage();

const imageFilter = (req, file, cb) => {
  if (IMAGE_TYPES.includes(file.mimetype)) cb(null, true);
  else cb(new Error(`Invalid file type. Allowed: ${IMAGE_TYPES.join(', ')}`));
};

const docFilter = (req, file, cb) => {
  if (DOC_TYPES.includes(file.mimetype)) cb(null, true);
  else cb(new Error(`Invalid file type. Allowed: ${DOC_TYPES.join(', ')}`));
};

// ── Multer instances ──────────────────────────────────────
const uploadImage = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },   // 5MB
}).single('image');

const uploadImages = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
}).array('images', 10);

const uploadDoc = multer({
  storage,
  fileFilter: docFilter,
  limits: { fileSize: 10 * 1024 * 1024 },  // 10MB
}).single('file');

// ── Process & Upload to S3 ────────────────────────────────
const processAndUpload = async (buffer, mimetype, folder, options = {}) => {
  const {
    width    = 1200,
    height   = null,
    quality  = 85,
    thumb    = false,
    thumbW   = 300,
    thumbH   = 300,
  } = options;

  let processed = buffer;
  let ext = 'jpg';

  // Resize & compress images
  if (IMAGE_TYPES.includes(mimetype) && mimetype !== 'image/gif') {
    const pipeline = sharp(buffer)
      .resize(width, height, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, progressive: true });
    processed = await pipeline.toBuffer();
  } else if (mimetype === 'application/pdf') {
    ext = 'pdf';
    processed = buffer;
  }

  const key = `${folder}/${uuid()}.${ext}`;

  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        processed,
    ContentType: mimetype === 'application/pdf' ? 'application/pdf' : 'image/jpeg',
    CacheControl: 'public, max-age=31536000',
    ACL:         'public-read',
  }));

  const url = `${CDN}/${key}`;

  // Thumbnail
  let thumbUrl = null;
  if (thumb && IMAGE_TYPES.includes(mimetype)) {
    const thumbBuf = await sharp(buffer)
      .resize(thumbW, thumbH, { fit: 'cover' })
      .jpeg({ quality: 70 })
      .toBuffer();
    const thumbKey = `${folder}/thumb_${uuid()}.jpg`;
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET, Key: thumbKey,
      Body: thumbBuf, ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000', ACL: 'public-read',
    }));
    thumbUrl = `${CDN}/${thumbKey}`;
  }

  return { url, thumbUrl, key };
};

const deleteFromS3 = async (url) => {
  try {
    const key = url.replace(`${CDN}/`, '');
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (err) {
    logger.warn(`Failed to delete S3 object: ${url}`, { err });
  }
};

// ── Express middleware helpers ────────────────────────────

// Kitchen logo / banner
const handleKitchenImage = (field = 'logo') => async (req, res, next) => {
  if (!req.file) return next();
  try {
    const { url, thumbUrl } = await processAndUpload(
      req.file.buffer, req.file.mimetype,
      `kitchens/${req.user?.id}`,
      { width: field === 'banner' ? 1400 : 800, thumb: true, thumbW: 200, thumbH: 200 }
    );
    req.uploadedUrl = url;
    req.uploadedThumb = thumbUrl;
    next();
  } catch (err) { next(err); }
};

// Menu item image
const handleMenuItemImage = async (req, res, next) => {
  if (!req.file) return next();
  try {
    const { url } = await processAndUpload(
      req.file.buffer, req.file.mimetype,
      `menu/${req.params.kitchen_id || 'items'}`,
      { width: 800, height: 800, quality: 80, thumb: true, thumbW: 300, thumbH: 300 }
    );
    req.uploadedUrl = url;
    next();
  } catch (err) { next(err); }
};

// User avatar
const handleAvatar = async (req, res, next) => {
  if (!req.file) return next();
  try {
    const { url } = await processAndUpload(
      req.file.buffer, req.file.mimetype,
      `avatars/${req.user?.id}`,
      { width: 400, height: 400, quality: 85 }
    );
    req.uploadedUrl = url;
    next();
  } catch (err) { next(err); }
};

// Document upload (ID, health cert, etc.)
const handleDocument = async (req, res, next) => {
  if (!req.file) return next();
  try {
    const { url } = await processAndUpload(
      req.file.buffer, req.file.mimetype,
      `documents/${req.user?.id}`,
      { quality: 90 }
    );
    req.uploadedUrl = url;
    next();
  } catch (err) { next(err); }
};

// Multer error handler
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE')
      return res.status(413).json({ error: 'File too large. Max size: 10MB' });
    return res.status(400).json({ error: err.message });
  }
  if (err.message?.includes('Invalid file type'))
    return res.status(415).json({ error: err.message });
  next(err);
};

module.exports = {
  uploadImage, uploadImages, uploadDoc,
  handleKitchenImage, handleMenuItemImage, handleAvatar, handleDocument,
  handleMulterError, deleteFromS3, processAndUpload,
};
