const { ApiError } = require('../utils/api-error');

function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      return next(new ApiError(400, 'Validation failed.', error.details.map((d) => d.message)));
    }

    req.body = value;
    next();
  };
}

module.exports = { validate };
