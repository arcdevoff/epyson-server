import { body, param, query } from 'express-validator';

export const getBySlugValidation = [param('slug').isSlug()];

export const getInfoByIdValidation = [param('id').isInt()];

export const getFeedValidation = [
  param('id').isInt(),
  query('page').isInt(),
  query('limit').isInt(),
];

export const getSubscribersValidation = [
  param('id').isInt(),
  query('page').isInt(),
  query('limit').isInt(),
];

export const subscriptionValidation = [body('target_id').isInt(), body('action').isString()];
