import { body } from 'express-validator';

export const complaintValidation = [
  body('content').notEmpty().isString(),
  body('reason').notEmpty().isString(),
];
