import { Router } from 'express';
import { getUserId } from '../utils/jwt.js';
import pool from '../config/db.js';
import { getFeedValidation } from '../validations/feed.js';
import validationErrors from '../utils/validationErrors.js';

const router = Router();

router
  .get('/popular', getUserId, getFeedValidation, validationErrors, async (req, res) => {
    try {
      const { page, limit } = req.query;
      const skip = (page - 1) * limit;
      const date = Math.floor(Date.now() / 1000);

      let posts;
      let count;

      if (req.user?.id) {
        posts = await pool.query(
          `
        SELECT p.*, 
          jsonb_build_object('likes', COUNT(DISTINCT pl.id), 'views', COUNT(DISTINCT pv.id), 'commentsCount', COUNT(DISTINCT pc.id), 'liked', bool_or(pliked.id > 0)) as info,
          json_agg(DISTINCT jsonb_build_object('id', t.id, 'text', t.text)) as tags,
            jsonb_build_object('id', topic.id, 'avatar', topic.avatar, 'name', topic.name, 'slug', topic.slug) as topic,
          jsonb_build_object('name', u.name, 'id', u.id) as author
        FROM posts p
        INNER JOIN subscriptions s ON p.topic_id = s.target_id AND s.type = 'topic'
        JOIN topics topic ON topic.id = p.topic_id
        JOIN users u ON u.id = p.author
        LEFT JOIN post_views pv ON p.id = pv.post_id
        LEFT JOIN post_likes pl ON p.id = pl.post_id
        LEFT JOIN post_comments pc ON p.id = pc.post_id
        LEFT JOIN post_tags pt ON p.id = pt.post_id
        LEFT JOIN tags t ON pt.tag_id = t.id
        LEFT JOIN post_likes pliked ON pliked.post_id = p.id AND pliked.user_id = \$1
        WHERE s.user_id = $1
        AND p.created_at >= $2
        GROUP BY p.id, topic.id, topic.avatar, topic.name, topic.slug, u.name, u.id
        ORDER BY COUNT(DISTINCT pv.id) + COUNT(DISTINCT pl.id) DESC, p.id DESC
        LIMIT $3 OFFSET $4;`,
          [req.user.id, date - process.env.POPULAR_POSTS_TIME, limit, skip],
        );

        count = await pool.query(
          `
          SELECT COUNT(p.*)
          FROM posts p
          INNER JOIN subscriptions s ON p.topic_id = s.target_id AND s.type = 'topic'
          WHERE s.user_id = $1 AND p.created_at >= $2`,
          [req.user.id, date - process.env.POPULAR_POSTS_TIME],
        );
      } else {
        posts = await pool.query(
          `
          SELECT p.*, 
            jsonb_build_object('likes', COUNT(DISTINCT pl.id), 'views', COUNT(DISTINCT pv.id), 'commentsCount', COUNT(DISTINCT pc.id), 'liked', false) as info,
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
          WHERE p.created_at >= $1
          GROUP BY p.id, topic.id, topic.avatar, topic.name, topic.slug, u.name, u.id

          ORDER BY COUNT(DISTINCT pv.id) + COUNT(DISTINCT pl.id) DESC, p.id DESC
          LIMIT $2 OFFSET $3`,
          [date - process.env.POPULAR_POSTS_TIME, limit, skip],
        );

        count = await pool.query(`SELECT COUNT(*) FROM posts WHERE created_at >= $1`, [
          date - process.env.POPULAR_POSTS_TIME,
        ]);
      }

      count = count.rows[0].count;
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
  })
  .get('/new', getUserId, getFeedValidation, validationErrors, async (req, res) => {
    try {
      const { page, limit } = req.query;
      const skip = (page - 1) * limit;

      let posts;
      let count;

      if (req.user?.id) {
        posts = await pool.query(
          `
        SELECT p.*, 
          jsonb_build_object('likes', COUNT(DISTINCT pl.id), 'views', COUNT(DISTINCT pv.id), 'commentsCount', COUNT(DISTINCT pc.id), 'liked', bool_or(pliked.id > 0)) as info,
          json_agg(DISTINCT jsonb_build_object('id', t.id, 'text', t.text)) as tags,
          jsonb_build_object('id', topic.id, 'avatar', topic.avatar, 'name', topic.name, 'slug', topic.slug) as topic,
          jsonb_build_object('name', u.name, 'id', u.id) as author
        FROM posts p
        INNER JOIN subscriptions s ON p.topic_id = s.target_id AND s.type = 'topic'
        JOIN topics topic ON topic.id = p.topic_id
        JOIN users u ON u.id = p.author
        LEFT JOIN post_views pv ON p.id = pv.post_id
        LEFT JOIN post_likes pl ON p.id = pl.post_id
        LEFT JOIN post_comments pc ON p.id = pc.post_id
        LEFT JOIN post_tags pt ON p.id = pt.post_id
        LEFT JOIN tags t ON pt.tag_id = t.id
        LEFT JOIN post_likes pliked ON pliked.post_id = p.id AND pliked.user_id = \$1
        WHERE s.user_id = $1
        GROUP BY p.id, topic.id, topic.avatar, topic.name, topic.slug, u.name, u.id

        ORDER BY p.id DESC
        LIMIT $2 OFFSET $3;`,
          [req.user.id, limit, skip],
        );

        count = await pool.query(
          `
          SELECT COUNT(p.*)
          FROM posts p
          INNER JOIN subscriptions s ON p.topic_id = s.target_id AND s.type = 'topic'
          WHERE s.user_id = $1`,
          [req.user.id],
        );
      } else {
        posts = await pool.query(
          `
          SELECT p.*, 
            jsonb_build_object('likes', COUNT(DISTINCT pl.id), 'views', COUNT(DISTINCT pv.id), 'commentsCount', COUNT(DISTINCT pc.id), 'liked', false) as info,
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
          GROUP BY p.id, topic.id, topic.avatar, topic.name, topic.slug, u.name, u.id

          ORDER BY p.id DESC
          LIMIT $1 OFFSET $2`,
          [limit, skip],
        );

        count = await pool.query(`SELECT COUNT(*) FROM posts`);
      }

      count = count.rows[0].count;
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
  })
  .get('/my', getUserId, getFeedValidation, validationErrors, async (req, res) => {
    try {
      if (!req.user?.id) {
        return res.status(200).json({ data: [] });
      }

      const { page, limit } = req.query;
      const skip = (page - 1) * limit;

      const posts = await pool.query(
        `
        SELECT p.*, 
          jsonb_build_object('likes', COUNT(DISTINCT pl.id), 'views', COUNT(DISTINCT pv.id), 'commentsCount', COUNT(DISTINCT pc.id), 'liked', bool_or(pliked.id > 0)) as info,
          json_agg(DISTINCT jsonb_build_object('id', t.id, 'text', t.text)) as tags,
            jsonb_build_object('id', topic.id, 'avatar', topic.avatar, 'name', topic.name, 'slug', topic.slug) as topic,
          jsonb_build_object('name', u.name, 'id', u.id) as author
        FROM posts p
        INNER JOIN subscriptions s ON p.author = s.target_id AND s.type = 'user'
        JOIN topics topic ON topic.id = p.topic_id
        JOIN users u ON u.id = p.author
        LEFT JOIN post_views pv ON p.id = pv.post_id
        LEFT JOIN post_likes pl ON p.id = pl.post_id
        LEFT JOIN post_comments pc ON p.id = pc.post_id
        LEFT JOIN post_tags pt ON p.id = pt.post_id
        LEFT JOIN tags t ON pt.tag_id = t.id
        LEFT JOIN post_likes pliked ON pliked.post_id = p.id AND pliked.user_id = \$1
        WHERE s.user_id = \$1
        GROUP BY p.id, topic.id, topic.avatar, topic.name, topic.slug, u.name, u.id

        ORDER BY p.id DESC
        LIMIT \$2 OFFSET \$3;`,
        [req.user.id, limit, skip],
      );

      const countPosts = await pool.query(
        `SELECT COUNT(p.*)
        FROM posts p
        INNER JOIN subscriptions s ON p.author = s.target_id AND s.type = 'user'
        WHERE s.user_id = $1`,
        [req.user.id],
      );

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
