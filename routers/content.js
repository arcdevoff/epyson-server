import { Router } from 'express';
import { complaintValidation } from '../validations/content.js';
import validationErrors from '../utils/validationErrors.js';

const router = Router();

router.post('/complaint', complaintValidation, validationErrors, async (req, res) => {
  try {
    const { content, reason } = req.body;

    const text = encodeURI(`Контент: ${content}\r\nПричина: ${reason}`);

    await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_REPORT}/sendMessage?chat_id=${process.env.TELEGRAM_CHATID}&text=${text}`,
    );

    res.sendStatus(200);
  } catch (error) {
    console.log(error);
    res.sendStatus(400);
  }
});

export default router;
