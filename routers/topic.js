import { Router } from 'express';
import pool from '../config/db.js';
import { getUserId, verifyAccessToken } from '../utils/jwt.js';
import validationErrors from '../utils/validationErrors.js';
import {
  getBySlugValidation,
  getInfoByIdValidation,
  getFeedValidation,
  getSubscribersValidation,
  subscriptionValidation,
} from '../validations/topic.js';

const router = Router();

// /topics
router.get('/all', async (req, res) => {
  try {
    const topics = await pool.query('SELECT * FROM topics');

    res.status(200).json([...topics.rows]);
  } catch (error) {
    console.log(error);
    res.sendStatus(400);
  }
});

router
  .get('/', getUserId, validationErrors, async (req, res) => {
    try {
      const { page, limit } = req.query;
      const skip = (page - 1) * limit;
      let topics;
      let countTopics;

      if (req.user?.id) {
        topics = await pool.query(
          `
          SELECT t.id, t.name, t.slug, t.avatar
          FROM topics t
          JOIN subscriptions s ON t.id = s.target_id
          WHERE s.user_id = $1 AND s.type = $2
          LIMIT $3 OFFSET $4;
          `,
          [req.user.id, 'topic', limit, skip],
        );

        countTopics = await pool.query(
          `SELECT COUNT(t.*)
          FROM topics t
          JOIN subscriptions s ON t.id = s.target_id
          WHERE s.user_id = $1 AND s.type = $2`,
          [req.user.id, 'topic'],
        );
      } else {
        topics = await pool.query('SELECT * FROM topics LIMIT $1 OFFSET $2', [limit, skip]);
        countTopics = await pool.query('SELECT COUNT(*) FROM topics');
      }

      const pages = Math.ceil(countTopics.rows[0].count / limit);
      let nextPage = Number(page) + 1;

      res.status(200).json({
        data: [...topics.rows],
        nextPage: nextPage > pages ? null : nextPage,
      });
    } catch (error) {
      console.log(error);
      res.sendStatus(400);
    }
  })
  .post('/', async (req, res) => {
    const { name, description, avatar, cover, slug } = req.body;

    await pool.query(
      `INSERT INTO topics (name, description, avatar, cover, slug) VALUES ($1, $2, $3, $4, $5)`,
      [name, description, avatar, cover, slug],
    );

    res.sendStatus(200);
  });

router.get('/:slug', getBySlugValidation, validationErrors, async (req, res) => {
  try {
    const { slug } = req.params;

    const topic = await pool.query('SELECT * FROM topics WHERE slug = $1', [slug]);

    if (!topic.rows[0]) throw new Error();

    res.status(200).json({
      ...topic.rows[0],
    });
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
});

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
        WHERE p.topic_id = $2
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
        WHERE p.topic_id = $2
        GROUP BY p.id, topic.id, topic.avatar, topic.name, topic.slug, u.name, u.id

        ORDER BY COUNT(DISTINCT pv.id) + COUNT(DISTINCT pl.id) DESC, p.id DESC
        LIMIT \$3 OFFSET \$4;`,
        [user_id, id, limit, skip],
      );
    }

    countPosts = await pool.query(`SELECT COUNT(*) FROM posts WHERE topic_id = $1`, [id]);

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
// /topics/:id/info
router
  .get('/:id/info', getUserId, getInfoByIdValidation, validationErrors, async (req, res) => {
    try {
      const { id } = req.params;
      let result = {
        isSubscribed: true,
        subscribers: null,
      };

      if (req.user?.id) {
        const isSubscribed = await pool.query(
          'SELECT COUNT(*) FROM subscriptions WHERE user_id = $1 AND target_id = $2 AND type = $3',
          [req.user.id, id, 'topic'],
        );

        result.isSubscribed = isSubscribed.rows[0].count > 0;
      }

      const subscribers = await pool.query(
        'SELECT COUNT(*) FROM subscriptions WHERE target_id = $1 AND type = $2',
        [id, 'topic'],
      );

      result.subscribers = Number(subscribers.rows[0].count);

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
        [id, 'topic', limit, offset],
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
  });

// /topics/subscription
router.post(
  '/subscription',
  verifyAccessToken,
  subscriptionValidation,
  validationErrors,
  async (req, res) => {
    try {
      const { target_id, action } = req.body;

      if (action === 'subscribe') {
        await pool.query(
          'INSERT INTO subscriptions (user_id, target_id, type, created_at) VALUES ($1, $2, $3, $4)',
          [req.user.id, target_id, 'topic', Math.floor(Date.now() / 1000)],
        );
      }

      if (action === 'unsubscribe') {
        await pool.query(
          'DELETE FROM subscriptions WHERE user_id = $1 AND target_id = $2 AND type = $3',
          [req.user.id, target_id, 'topic'],
        );
      }

      res.sendStatus(200);
    } catch (error) {
      console.log(error);
      res.sendStatus(500);
    }
  },
);

export default router;
