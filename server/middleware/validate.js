import { ZodError } from 'zod';
import { ValidationError } from './errorHandler.js';

/**
 * Zod validation middleware factory.
 * Validates req.body, req.query, and/or req.params against Zod schemas.
 *
 * @param {object} schemas - { body?: ZodSchema, query?: ZodSchema, params?: ZodSchema }
 * @returns {Function} Express middleware
 *
 * @example
 *   import { z } from 'zod';
 *   router.post('/', validate({ body: z.object({ content: z.string().min(1) }) }), handler);
 */
export function validate(schemas) {
  return (req, _res, next) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code,
        }));
        return next(new ValidationError('Validation failed', details));
      }
      next(error);
    }
  };
}
