import { query } from 'express-validator';

export const getFeedValidation = [query('page').isInt(), query('limit').isInt()];
