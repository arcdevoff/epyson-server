import { body, param, query } from "express-validator";

export const confirmValidation = [
  body("token").isLength({ min: 15 }).isString(),
];

export const getByIdValidation = [param("id").isInt()];

export const subscriptionValidation = [
  body("target_id").isInt(),
  body("action").isString(),
];

export const getSubscribersValidation = [
  param("id").isInt(),
  query("page").isInt(),
  query("limit").isInt(),
];

export const getFeedValidation = [
  param("id").isInt(),
  query("page").isInt(),
  query("limit").isInt(),
  query("filter").isString(),
];

export const searchValidation = [
  query("query").isString(),
  query("page").isInt(),
  query("limit").isInt(),
];

export const getInfoByIdValidation = [param("id").isInt()];

export const changeProfileValidation = [
  body("name")
    .notEmpty()
    .withMessage("Введите имя или название")
    .isLength({ min: 2 })
    .withMessage("Имя должно включать от 2 до 30 символов")
    .isString(),
  body("description")
    .optional({ checkFalsy: true })
    .isLength({ min: 1, max: 215 })
    .withMessage("Описание должно включать от 1 до 215 символов"),
];
