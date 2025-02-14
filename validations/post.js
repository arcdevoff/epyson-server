import { body, param, query } from 'express-validator';

export const getByIdValidation = [param('id').notEmpty().isInt()];

export const getRecommendationsByIdValidation = [
  query('page').notEmpty().isInt(),
  query('limit').notEmpty().isInt(),
];

export const createValidation = [
  body('title')
    .notEmpty()
    .withMessage('Заголовок не должен быть пустым')
    .isLength({ min: 1, max: 500 })
    .withMessage('Заголовок должно включать от 1 до 500 символов'),
  body('text').notEmpty().withMessage('Текст не должен быть пустым').isString(),
  body('topic_id').notEmpty(),
];

export const likeValidation = [
  body('post_id').notEmpty().isInt(),
  body('action').notEmpty().isString(),
  body('author').notEmpty().isInt(),
];

// comments
export const addCommentValidation = [
  param('id').notEmpty().isInt(),
  body('text').notEmpty().isString().isLength({ min: 1 }),
];

export const getCommentsValidation = [
  param('id').notEmpty().isInt(),
  query('page').notEmpty().isInt(),
  query('filter').optional().isString(),
  query('limit').notEmpty().isInt(),
];

export const getCommentByIdValidation = [param('comment_id').notEmpty().isInt()];

export const deleteCommentValidation = [param('comment_id').notEmpty().isInt()];

export const searchValidation = [
  query('query').isString(),
  query('page').isInt(),
  query('limit').isInt(),
];

export const getByTag = [query('tag').isString(), query('page').isInt(), query('limit').isInt()];
