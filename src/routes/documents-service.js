/**
 * Khalto — Documents Service
 * Handles file uploads to local storage (will swap for S3/Spaces later)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const logger = require('./logger');

// ── Storage location ─────────────────────────────────────
// Files go into uploads/documents/<entity>/<id>/<doc_type>_<timestamp>.<ext>
const UPLOAD_ROOT = path.join(process.cwd(), 'uploads', 'documents');

// Ensure directory exists
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
ensureDir(UPLOAD_ROOT);

// ── Multer storage config ────────────────────────────────
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Will be set per-request in route handler
    const dir = req._uploadDir || UPLOAD_ROOT;
    ensureDir(dir);
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 8) || '.bin';
    const docType = req.body.doc_type || req.params.doc_type || 'doc';
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    cb(null, `${docType}_${timestamp}_${random}${ext}`);
  },
});

// ── File filter (allowed types) ──────────────────────────
const ALLOWED_MIMES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'application/pdf',
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIMES.includes(file.mimetype)) {
    return cb(new Error('نوع الملف غير مدعوم. يُسمح فقط بـ: JPG, PNG, WebP, PDF'));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

// ── Public URL builder ───────────────────────────────────
// Files are served via Express static at /uploads/documents/...
function buildPublicUrl(filePath) {
  // filePath is absolute, return relative URL from /uploads/...
  const relative = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
  return '/' + relative;
}

// ── Set upload directory based on entity ─────────────────
function setEntityUploadDir(entityType, entityId) {
  return (req, res, next) => {
    req._uploadDir = path.join(UPLOAD_ROOT, entityType, entityId);
    next();
  };
}

// ── Delete file safely ───────────────────────────────────
function deleteFile(fileUrl) {
  try {
    if (!fileUrl) return;
    const filePath = path.join(process.cwd(), fileUrl.replace(/^\//, ''));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info('File deleted', { fileUrl });
    }
  } catch (err) {
    logger.warn('Failed to delete file', { fileUrl, err: err.message });
  }
}

module.exports = {
  upload,
  buildPublicUrl,
  setEntityUploadDir,
  deleteFile,
  ALLOWED_MIMES,
  MAX_FILE_SIZE,
  UPLOAD_ROOT,
};
