import { Router } from 'express';
import { body, param } from 'express-validator';
import cookie from 'cookie';
import pool from '../config/db.js';
import { getTokens, getUserId, verifyAccessToken } from '../utils/jwt.js';
import validationErrors from '../utils/validationErrors.js';
import {
  confirmValidation,
  getByIdValidation,
  getInfoByIdValidation,
  getSubscribersValidation,
  subscriptionValidation,
  getFeedValidation,
  searchValidation,
  changeProfileValidation,
} from '../validations/user.js';

const router = Router();

// /users/profile
router
  .get('/profile', verifyAccessToken, async (req, res) => {
    try {
      let user = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);

      if (!user.rows[0]) {
        throw new Error();
      }

      delete user.rows[0].password;

      res.status(200).json({
        ...user.rows[0],
      });
    } catch (error) {
      console.warn(error);
      res.sendStatus(401);
    }
  })
  .patch(
    '/profile',
    verifyAccessToken,
    changeProfileValidation,
    validationErrors,
    async (req, res) => {
      try {
        const { name, description } = req.body;

        await pool.query('UPDATE users SET name = $1, description = $2 WHERE id = $3', [
          name,
          description,
          req.user.id,
        ]);

        res.sendStatus(200);
      } catch (error) {
        console.warn(error);
        res.sendStatus(401);
      }
    },
  );

router.patch('/profile/cover', verifyAccessToken, async (req, res) => {
  try {
    const { cover } = req.body;

    await pool.query('UPDATE users SET cover = $1 WHERE id = $2', [cover, req.user.id]);

    res.sendStatus(200);
  } catch (error) {
    console.log(error);
    res.sendStatus(400);
  }
});

router.patch('/profile/avatar', verifyAccessToken, async (req, res) => {
  try {
    const { avatar } = req.body;

    await pool.query('UPDATE users SET avatar = $1 WHERE id = $2', [avatar, req.user.id]);

    res.sendStatus(200);
  } catch (error) {
    console.log(error);
    res.sendStatus(400);
  }
});

router.get('/search', searchValidation, validationErrors, async (req, res) => {
  try {
    const { query, limit, page } = req.query;
    const skip = (page - 1) * limit;

    const users = await pool.query(
      `SELECT u.name, u.avatar, u.id,
       count(s.id) as subscribers
       FROM users u
       LEFT JOIN subscriptions s ON s.target_id = u.id AND s.type = 'user'
       WHERE u.name ILIKE $1
       GROUP BY u.name, u.avatar, u.id
       ORDER BY u.id DESC
       LIMIT $2 OFFSET $3
      `,
      [`%${query ? query : ''}%`, limit, skip],
    );

    const countUsers = await pool.query('SELECT COUNT(*) FROM users WHERE name ILIKE $1', [
      `%${query ? query : ''}%`,
    ]);

    const count = countUsers.rows[0].count;
    const pages = Math.ceil(count / limit);
    let nextPage = Number(page) + 1;

    res.status(200).json({
      data: [...users.rows],
      nextPage: nextPage > pages ? null : nextPage,
    });
  } catch (error) {
    console.log(error);
    res.sendStatus(400);
  }
});

// /users/confirm
router.post('/confirm', confirmValidation, validationErrors, async (req, res) => {
  try {
    const { token } = req.body;

    const email_verification = await pool.query(
      'SELECT * FROM email_verification_tokens WHERE token = $1',
      [token],
    );

    if (!email_verification.rows[0]) {
      throw new Error();
    }

    await pool.query('UPDATE users SET confirmed = $1 WHERE id = $2', [
      true,
      email_verification.rows[0].user_id,
    ]);
    await pool.query('DELETE FROM email_verification_tokens WHERE id = $1', [
      email_verification.rows[0].id,
    ]);

    const { accessToken, refreshToken } = getTokens({
      id: email_verification.rows[0].user_id,
    });

    res
      .status(200)
      .setHeader(
        'Set-Cookie',
        cookie.serialize('refreshToken', refreshToken, {
          httpOnly: true,
          maxAge: process.env.REFRESH_TOKEN_AGE,
          path: '/',
        }),
      )
      .json({
        id: email_verification.rows[0].user_id,
        accessToken,
      });
  } catch (error) {
    console.log(error);
    res.sendStatus(400);
  }
});

// /users/:id
router.get('/:id', getByIdValidation, validationErrors, async (req, res) => {
  try {
    const { id } = req.params;

    const user = await pool.query(
      'SELECT name, avatar, cover, description, created_at, id FROM users WHERE id = $1',
      [id],
    );

    if (!user.rows[0]) {
      throw new Error();
    }

    res.status(200).json({
      ...user.rows[0],
    });
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
});

router
  .get('/:id/info', getUserId, getInfoByIdValidation, validationErrors, async (req, res) => {
    try {
      const { id } = req.params;
      let result = {
        isSubscribed: false,
        subscribers: null,
        subscriptions: null,
      };

      if (req.user?.id) {
        const isSubscribed = await pool.query(
          'SELECT COUNT(*) FROM subscriptions WHERE user_id = $1 AND target_id = $2 AND type = $3',
          [req.user.id, id, 'user'],
        );

        result.isSubscribed = isSubscribed.rows[0].count > 0;
      }

      const subscribers = await pool.query(
        'SELECT COUNT(*) FROM subscriptions WHERE target_id = $1 AND type = $2',
        [id, 'user'],
      );

      const subscriptions = await pool.query(
        'SELECT COUNT(*) FROM subscriptions WHERE user_id = $1',
        [id],
      );

      result.subscribers = Number(subscribers.rows[0].count);
      result.subscriptions = Number(subscriptions.rows[0].count);

      res.status(200).json({ ...result });
    } catch (error) {
      console.log(error);
      res.sendStatus(500);
    }
  })
  .get('/:id/info/subscribers', getSubscribersValidation, validationErrors, async (req, res) => {
    try {
      const { id } = req.params;
      const { page, limit } = req.query;
      const offset = (page - 1) * limit;

      const subscribers = await pool.query(
        `SELECT u.id, u.name, u.avatar 
        FROM users u
        JOIN subscriptions s ON s.target_id = $1 AND s.user_id = u.id AND type = $2
        ORDER BY s.id DESC 
        LIMIT $3 OFFSET $4;`,
        [id, 'user', limit, offset],
      );

      if (!subscribers.rows[0]) {
        throw new Error();
      }

      res.status(200).json({
        result: subscribers.rows,
      });
    } catch (error) {
      console.log(error);
      res.sendStatus(500);
    }
  })
  .get('/:id/info/subscriptions', getSubscribersValidation, validationErrors, async (req, res) => {
    try {
      const { id } = req.params;
      const { page, limit } = req.query;
      const offset = (page - 1) * limit;

      const subscriptions = await pool.query(
        `SELECT 
          CASE WHEN s.type = 'user' THEN 'user' ELSE 'topic' END AS type,
          CASE WHEN s.type = 'user' THEN u.avatar ELSE t.avatar END AS avatar,
          CASE WHEN s.type = 'user' THEN u.name ELSE t.name END AS name,
          CASE WHEN s.type = 'user' THEN u.id::varchar ELSE t.slug END AS id
        FROM subscriptions s
        LEFT JOIN users u ON s.target_id = u.id AND s.type = 'user'
        LEFT JOIN topics t ON s.target_id = t.id AND s.type = 'topic'
        WHERE s.user_id = $1
        LIMIT $2 OFFSET $3;`,
        [id, limit, offset],
      );

      if (!subscriptions.rows[0]) {
        throw new Error();
      }

      res.status(200).json({
        result: subscriptions.rows,
      });
    } catch (error) {
      console.log(error);
      res.sendStatus(500);
    }
  });

router.post(
  '/subscription',
  verifyAccessToken,
  subscriptionValidation,
  validationErrors,
  async (req, res) => {
    try {
      const { target_id, action } = req.body;

      if (action === 'subscribe') {
        const created_at = Math.floor(Date.now() / 1000);
        await pool.query(
          'INSERT INTO subscriptions (user_id, target_id, type, created_at) VALUES ($1, $2, $3, $4)',
          [req.user.id, target_id, 'user', created_at],
        );

        await pool.query(
          'INSERT INTO notifications (sender_id, recipient_id, type, is_read, created_at) VALUES ($1, $2, $3, $4, $5)',
          [req.user.id, target_id, 'subscribe', false, created_at],
        );
      }

      if (action === 'unsubscribe') {
        await pool.query(
          'DELETE FROM subscriptions WHERE user_id = $1 AND target_id = $2 AND type = $3',
          [req.user.id, target_id, 'user'],
        );

        await pool.query(
          'DELETE FROM notifications WHERE sender_id = $1 AND recipient_id = $2 AND type = $3',
          [req.user.id, target_id, 'subscribe'],
        );
      }

      res.sendStatus(200);
    } catch (error) {
      console.log(error);
      res.sendStatus(500);
    }
  },
);

router.get('/:id/feed', getUserId, getFeedValidation, validationErrors, async (req, res) => {
  try {
    const { id } = req.params;
    const { page, limit, filter } = req.query;
    const skip = (page - 1) * limit;
    const user_id = req.user?.id ? req.user.id : null;
    let posts, countPosts;

    if (filter === 'new') {
      posts = await pool.query(
        `
        SELECT p.*, 
          jsonb_build_object('likes', COUNT(DISTINCT pl.id), 'views', COUNT(DISTINCT pv.id), 'commentsCount', COUNT(DISTINCT pc.id), 'liked', bool_or(pliked.id > 0)) as info,
          json_agg(DISTINCT jsonb_build_object('id', t.id, 'text', t.text)) as tags,
            jsonb_build_object('id', topic.id, 'avatar', topic.avatar, 'name', topic.name, 'slug', topic.slug) as topic,
          jsonb_build_object('name', u.name, 'id', u.id) as author
        FROM posts p
        JOIN topics topic ON topic.id = p.topic_id
        JOIN users u ON u.id = p.author
        LEFT JOIN post_views pv ON p.id = pv.post_id
        LEFT JOIN post_likes pl ON p.id = pl.post_id
        LEFT JOIN post_comments pc ON p.id = pc.post_id
        LEFT JOIN post_tags pt ON p.id = pt.post_id
        LEFT JOIN tags t ON pt.tag_id = t.id
        LEFT JOIN post_likes pliked ON pliked.post_id = p.id AND pliked.user_id = \$1
        WHERE p.author = $2
        GROUP BY p.id, topic.id, topic.avatar, topic.name, topic.slug, u.name, u.id

        ORDER BY p.id DESC
        LIMIT \$3 OFFSET \$4;`,
        [user_id, id, limit, skip],
      );

      countPosts = await pool.query(`SELECT COUNT(*) FROM posts WHERE topic_id = $1`, [id]);
    } else {
      posts = await pool.query(
        `
        SELECT p.*, 
          jsonb_build_object('likes', COUNT(DISTINCT pl.id), 'views', COUNT(DISTINCT pv.id), 'commentsCount', COUNT(DISTINCT pc.id), 'liked', bool_or(pliked.id > 0)) as info,
          json_agg(DISTINCT jsonb_build_object('id', t.id, 'text', t.text)) as tags,
            jsonb_build_object('id', topic.id, 'avatar', topic.avatar, 'name', topic.name, 'slug', topic.slug) as topic,
          jsonb_build_object('name', u.name, 'id', u.id) as author
        FROM posts p
        JOIN topics topic ON topic.id = p.topic_id
        JOIN users u ON u.id = p.author
        LEFT JOIN post_views pv ON p.id = pv.post_id
        LEFT JOIN post_likes pl ON p.id = pl.post_id
        LEFT JOIN post_comments pc ON p.id = pc.post_id
        LEFT JOIN post_tags pt ON p.id = pt.post_id
        LEFT JOIN tags t ON pt.tag_id = t.id
        LEFT JOIN post_likes pliked ON pliked.post_id = p.id AND pliked.user_id = \$1
        WHERE p.author = $2
        GROUP BY p.id, topic.id, topic.avatar, topic.name, topic.slug, u.name, u.id

        ORDER BY COUNT(DISTINCT pv.id) + COUNT(DISTINCT pl.id) DESC, p.id DESC
        LIMIT \$3 OFFSET \$4;`,
        [user_id, id, limit, skip],
      );
    }

    countPosts = await pool.query(`SELECT COUNT(*) FROM posts WHERE author = $1`, [id]);

    const count = countPosts.rows[0].count;
    const pages = Math.ceil(count / limit);
    let nextPage = Number(page) + 1;

    res.status(200).json({
      data: [...posts.rows],
      nextPage: nextPage > pages ? null : nextPage,
    });
  } catch (error) {
    console.log(error);
    res.sendStatus(400);
  }
});

export default router;
