import { Router } from 'express';
import pool from '../config/db.js';
import validationErrors from '../utils/validationErrors.js';
import { getAllValidation } from '../validations/notification.js';

const router = Router();

router.get('/', getAllValidation, validationErrors, async (req, res) => {
  try {
    const { page, limit } = req.query;
    const skip = (page - 1) * limit;

    const notifications = await pool.query(
      `
     SELECT n.*,
        jsonb_build_object('id', u.id, 'name', u.name) as sender
     FROM notifications n
     LEFT JOIN users u ON u.id = n.sender_id
     WHERE recipient_id = $1
     GROUP BY n.id, u.id, u.name
     ORDER BY n.id DESC
     LIMIT $2 OFFSET $3
      `,
      [req.user.id, limit, skip],
    );

    notifications.rows.map(async (notification) => {
      if (!notification.is_read) {
        await pool.query('UPDATE notifications SET is_read = true');
      }
    });

    const countNotifications = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE recipient_id = $1',
      [req.user.id],
    );

    const count = countNotifications.rows[0].count;
    const pages = Math.ceil(count / limit);
    let nextPage = Number(page) + 1;

    res.status(200).json({
      data: [...notifications.rows],
      nextPage: nextPage > pages ? null : nextPage,
    });
  } catch (error) {
    console.log(error);
    res.sendStatus(400);
  }
});

router.get('/info', async (req, res) => {
  try {
    const unreadCount = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE recipient_id = $1 AND is_read = $2',
      [req.user.id, false],
    );

    res.status(200).json({
      unread: Number(unreadCount.rows[0].count),
    });
  } catch (error) {
    console.log(error);
    res.sendStatus(400);
  }
});

export default router;
