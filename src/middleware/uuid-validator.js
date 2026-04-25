/**
 * Khalto — UUID Validation Middleware
 * Validates that route params named :id (or specified) are valid UUIDs
 * Returns 404 instead of letting Postgres throw 500
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isValidUUID = (str) => typeof str === 'string' && UUID_REGEX.test(str);

/**
 * Express middleware that validates the :id param.
 * Use as: router.get('/:id', validateUUID(), handler)
 * Or: router.get('/:userId', validateUUID('userId'), handler)
 */
const validateUUID = (paramName = 'id') => {
  return (req, res, next) => {
    const value = req.params[paramName];
    if (!value) return next();
    if (!isValidUUID(value)) {
      return res.status(404).json({ error: 'المعرّف غير صحيح' });
    }
    next();
  };
};

module.exports = { validateUUID, isValidUUID, UUID_REGEX };
