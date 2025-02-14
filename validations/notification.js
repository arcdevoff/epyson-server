import { query } from 'express-validator';

export const getAllValidation = [query('page').isInt(), query('limit').isInt()];
