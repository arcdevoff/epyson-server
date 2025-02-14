import { body } from 'express-validator';

export const loginValidation = [
  body('email', 'Невалидный адрес эл. почты').isEmail(),
  body('password')
    .notEmpty()
    .withMessage('Введите пароль')
    .isLength({ min: 6, max: 26 })
    .withMessage('Пароль должно включать от 6 до 26 символов'),
];

export const signupValidation = [
  body('email', 'Невалидный адрес эл. почты').isEmail(),
  body('name')
    .notEmpty()
    .withMessage('Введите имя или название')
    .isLength({ min: 2 })
    .withMessage('Имя должно включать от 2 до 30 символов')
    .isString(),
  body('password')
    .notEmpty()
    .withMessage('Введите пароль')
    .isLength({ min: 6, max: 26 })
    .withMessage('Пароль должно включать от 6 до 26 символов'),
];
