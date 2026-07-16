const { validationResult } = require('express-validator');
const { AppError } = require('../utils/errors');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const message = errors
      .array()
      .map((e) => e.msg)
      .join('; ');
    return next(new AppError(message, 400));
  }
  next();
}

module.exports = { validate };
