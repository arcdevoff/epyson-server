import { Router } from 'express';
import {
  addCommentValidation,
  createValidation,
  deleteCommentValidation,
  getByIdValidation,
  getByTag,
  getCommentByIdValidation,
  getCommentsValidation,
  getRecommendationsByIdValidation,
  likeValidation,
  searchValidation,
} from '../validations/post.js';
import pool from '../config/db.js';
import { getUserId, verifyAccessToken } from '../utils/jwt.js';
import validationErrors from '../utils/validationErrors.js';
import googleapi from '../config/googleapi.js';

const router = Router();

// sitemap
router.get('/sitemap', async (req, res) => {
  try {
    const posts = await pool.query('SELECT id, updated_at, created_at  FROM posts');
    res.status(200).json([...posts.rows]);
  } catch (error) {
    console.log(error);
    res.sendStatus(400);
  }
});

// search
router.get('/search', getUserId, searchValidation, validationErrors, async (req, res) => {
  try {
    const { query, limit, page } = req.query;
    const skip = (page - 1) * limit;

    const posts = await pool.query(
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
      LEFT JOIN post_likes pliked ON pliked.post_id = p.id AND pliked.user_id = $1
      WHERE p.text ILIKE $2 OR p.title ILIKE $2
      GROUP BY p.id, topic.id, topic.avatar, topic.name, topic.slug, u.name, u.id
      ORDER BY p.id DESC
      LIMIT $3 OFFSET $4;`,
      [req.user?.id, `%${query ? query : ''}%`, limit, skip],
    );

    const countPosts = await pool.query(
      'SELECT COUNT(*) FROM posts WHERE text ILIKE $1 OR title ILIKE $1',
      [`%${query ? query : ''}%`],
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

// get by tag
router.get('/tag', getUserId, getByTag, validationErrors, async (req, res) => {
  try {
    const { tag, limit, page } = req.query;
    const skip = (page - 1) * limit;

    const decodedTag = decodeURI(tag);

    const posts = await pool.query(
      `
      SELECT p.*, 
        jsonb_build_object('likes', COUNT(DISTINCT pl.id), 'views', COUNT(DISTINCT pv.id), 'commentsCount', COUNT(DISTINCT pc.id), 'liked', bool_or(pliked.id > 0)) as info,
        (
          SELECT json_agg(jsonb_build_object('id', t1.id, 'text', t1.text))
          FROM post_tags pt1 
          JOIN tags t1 ON pt1.tag_id = t1.id
          WHERE pt1.post_id = p.id
        ) as tags,
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
      LEFT JOIN post_likes pliked ON pliked.post_id = p.id AND pliked.user_id = $1
      WHERE t.text = $2 
      GROUP BY p.id, topic.id, topic.avatar, topic.name, topic.slug, u.name, u.id

      ORDER BY p.id DESC
      LIMIT $3 OFFSET $4`,
      [req.user?.id, decodedTag, limit, skip],
    );

    const countPosts = await pool.query(
      `
      SELECT COUNT(p.*)
      FROM posts p
      JOIN post_tags pt ON p.id = pt.post_id
      JOIN tags t ON pt.tag_id = t.id
      WHERE t.text = $1`,
      [decodedTag],
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

// post
router
  .get('/:id', getByIdValidation, validationErrors, async (req, res) => {
    try {
      const { id } = req.params;
      const ipAddress = req.headers.ip ? req.headers.ip : req.ip;

      const post = await pool.query(
        `SELECT 
         p.*,
         json_agg(jsonb_build_object('id', t.id, 'text', t.text)) as tags,
           jsonb_build_object('id', topic.id, 'avatar', topic.avatar, 'name', topic.name, 'slug', topic.slug) as topic,
         jsonb_build_object('name', u.name, 'id', u.id) as author
       FROM posts p
       JOIN topics topic ON topic.id = p.topic_id
       JOIN users u ON u.id = p.author
       LEFT JOIN post_tags pt ON p.id = pt.post_id
       LEFT JOIN tags t ON pt.tag_id = t.id
       WHERE p.id = $1
       GROUP BY p.id, topic.id, topic.avatar, topic.name, topic.slug, u.name, u.id
      ;`,
        [id],
      );

      if (!post.rows[0]) {
        throw new Error();
      }

      const view = await pool.query(
        'SELECT COUNT(*) FROM post_views WHERE post_id = $1 AND ip = $2',
        [id, ipAddress],
      );

      if (Number(view.rows[0].count) === 0) {
        await pool.query('INSERT INTO post_views (post_id, ip) VALUES ($1, $2)', [id, ipAddress]);
      }

      res.status(200).json({ ...post.rows[0] });
    } catch (error) {
      console.log(error);
      res.sendStatus(400);
    }
  })
  .get(
    '/:id/recommendations',
    getRecommendationsByIdValidation,
    validationErrors,
    async (req, res) => {
      try {
        const { id } = req.params;
        const { page, limit } = req.query;
        const skip = (page - 1) * limit;

        const post = await pool.query('SELECT * FROM posts WHERE id = $1', [id]);

        if (!post.rows[0]) {
          throw new Error();
        }

        const posts = await pool.query(
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
          WHERE topic_id = $1 AND p.id != $2
          GROUP BY p.id, topic.id, topic.avatar, topic.name, topic.slug, u.name, u.id
          ORDER BY p.id DESC
          LIMIT $3 OFFSET $4`,
          [post.rows[0].topic_id, id, limit, skip],
        );

        const countPosts = await pool.query(
          `SELECT COUNT(*) FROM posts WHERE topic_id = $1 AND id != $2`,
          [post.rows[0].topic_id, id],
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
    },
  )
  .delete('/:id', verifyAccessToken, getByIdValidation, validationErrors, async (req, res) => {
    try {
      const { id } = req.params;
      const post = await pool.query('SELECT * FROM posts WHERE id = $1', [id]);

      if (!post.rows[0] || post.rows[0].author !== req.user.id) {
        throw new Error();
      }

      await pool.query('DELETE FROM notifications WHERE post_id = $1', [id]);
      await pool.query('DELETE FROM post_comments WHERE post_id = $1', [id]);
      await pool.query('DELETE FROM post_likes WHERE post_id = $1', [id]);
      await pool.query('DELETE FROM post_tags WHERE post_id = $1', [id]);
      await pool.query('DELETE FROM post_views WHERE post_id = $1', [id]);
      await pool.query('DELETE FROM posts WHERE id = $1', [id]);

      try {
        const indexnow = `?url=${process.env.CLIENT_DOMAIN}/post/${post.rows[0].id}&key=${process.env.INDEXNOW_KEY}`;
        await fetch('https://yandex.com/indexnow' + indexnow);
        await fetch('https://bing.com/indexnow' + indexnow);

        const googletokens = await googleapi.authorize();
        let googleoptions = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + googletokens.access_token,
          },
          body: JSON.stringify({
            url: `${process.env.CLIENT_DOMAIN}/post/${post.rows[0].id}`,
            type: 'URL_DELETED',
          }),
        };

        await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', googleoptions);
      } catch (error) {
        console.log('indexing error', error);
      }

      res.sendStatus(200);
    } catch (error) {
      console.log(error);
      res.sendStatus(400);
    }
  })
  .patch('/:id', verifyAccessToken, createValidation, validationErrors, async (req, res) => {
    try {
      const { id } = req.params;
      const { title, text, tags, topic_id } = req.body;
      const updated_at = Math.floor(Date.now() / 1000);

      const post = await pool.query('SELECT * FROM posts WHERE id = $1', [id]);

      if (!post.rows[0] || post.rows[0].author !== req.user.id) {
        throw new Error();
      }

      let cleanText = text.replace(/<[^>]*>/g, '');
      cleanText = cleanText.trim();

      if (cleanText.length <= 1 || cleanText.length >= 2500) {
        return res.status(400).json({ message: 'Текст должно включать от 1 до 2500 символов' });
      }

      await pool.query(
        'UPDATE posts SET title = $1, text = $2, topic_id = $3, updated_at = $4 WHERE id = $5 AND author = $6',
        [title, text, topic_id, updated_at, id, req.user.id],
      );

      await pool.query('DELETE FROM post_tags WHERE post_id = $1', [id]);
      if (tags.length) {
        tags.map(async (obj) => {
          let tag_id = '';
          const tagName = obj.text;
          const tagCount = await pool.query('SELECT * FROM tags WHERE text = $1', [tagName]);

          if (!tagCount.rows[0]) {
            const tag = await pool.query('INSERT INTO tags (text) VALUES ($1) RETURNING id', [
              tagName,
            ]);

            tag_id = tag.rows[0].id;
          } else {
            tag_id = tagCount.rows[0].id;
          }

          await pool.query('INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2)', [
            post.rows[0].id,
            tag_id,
          ]);
        });
      }

      try {
        const indexnow = `?url=${process.env.CLIENT_DOMAIN}/post/${post.rows[0].id}&key=${process.env.INDEXNOW_KEY}`;
        await fetch('https://yandex.com/indexnow' + indexnow);
        await fetch('https://bing.com/indexnow' + indexnow);

        const googletokens = await googleapi.authorize();
        let googleoptions = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + googletokens.access_token,
          },
          body: JSON.stringify({
            url: `${process.env.CLIENT_DOMAIN}/post/${post.rows[0].id}`,
            type: 'URL_UPDATED',
          }),
        };

        await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', googleoptions);
      } catch (error) {
        console.log('indexing error', error);
      }

      res.sendStatus(200);
    } catch (error) {
      console.log(error);
      res.sendStatus(400);
    }
  })
  .get('/:id/info', getByIdValidation, validationErrors, getUserId, async (req, res) => {
    try {
      const { id } = req.params;

      let result = {
        likes: null,
        liked: null,
        commentsCount: null,
        views: null,
      };

      // all likes
      const likes = await pool.query('SELECT COUNT(*) FROM post_likes WHERE post_id = $1', [id]);
      result.likes = Number(likes.rows[0].count);
      // ---- all likes

      // user liked
      if (req.user?.id) {
        const liked = await pool.query(
          'SELECT * FROM post_likes WHERE post_id = $1 AND user_id = $2',
          [id, req.user.id],
        );

        result.liked = liked.rows[0] ? true : false;
      }
      // --- user liked

      // comments count
      const commentsCount = await pool.query(
        'SELECT COUNT(*) FROM post_comments WHERE post_id = $1',
        [id],
      );
      result.commentsCount = commentsCount.rows[0].count;
      // ---- comments count

      // views count
      const views = await pool.query('SELECT COUNT(*) FROM post_views WHERE post_id = $1', [id]);
      result.views = views.rows[0].count;

      res.status(200).json({
        ...result,
      });
    } catch (error) {
      console.log(error);
      res.sendStatus(400);
    }
  });

// comments
router
  .post(
    '/:id/comments',
    verifyAccessToken,
    addCommentValidation,
    validationErrors,
    async (req, res) => {
      try {
        const { id } = req.params;
        const { text, parent_id, parent_user_id } = req.body;
        const created_at = Math.floor(Date.now() / 1000);

        let cleanText = text.replace(/<[^>]*>/g, '');
        cleanText = cleanText.trim();

        if (cleanText.length < 1) {
          throw new Error();
        }

        const post = await pool.query('SELECT * FROM posts WHERE id = $1', [id]);

        if (!post.rows[0]) {
          throw new Error();
        }

        const comment = await pool.query(
          'INSERT INTO post_comments (post_id, parent_id , user_id, text, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [id, parent_id, req.user.id, text, created_at],
        );

        if (parent_user_id && parent_id && req.user.id !== parent_user_id) {
          await pool.query(
            'INSERT INTO notifications (sender_id, recipient_id, type, post_id, comment_id, is_read, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [req.user.id, parent_user_id, 'reply_comment', id, parent_id, false, created_at],
          );
        } else {
          if (req.user.id !== post.rows[0].author) {
            await pool.query(
              'INSERT INTO notifications (sender_id, recipient_id, type, post_id, comment_id, is_read, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
              [
                req.user.id,
                post.rows[0].author,
                'comment',
                id,
                comment.rows[0].id,
                false,
                created_at,
              ],
            );
          }
        }

        res.status(200).json(...comment.rows);
      } catch (error) {
        console.log(error);
        res.sendStatus(400);
      }
    },
  )
  .get('/:id/comments/replies', async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        throw new Error();
      }

      const replies = await pool.query(
        `
        SELECT 
        pc.*, 
        jsonb_build_object('name', u.name, 'avatar', u.avatar) as author
        FROM post_comments pc 
        JOIN users u ON u.id = pc.user_id
        WHERE 
          post_id = $1 AND parent_id >= 1
        GROUP BY pc.id, u.name, u.avatar
        `,
        [id],
      );

      res.status(200).json([...replies.rows]);
    } catch (error) {
      console.log(error);
      res.sendStatus(400);
    }
  })
  .get('/:id/comments', getCommentsValidation, validationErrors, async (req, res) => {
    try {
      const { id } = req.params;
      const { page, limit, filter } = req.query;
      const skip = (page - 1) * limit;

      const comments = await pool.query(
        `
        SELECT 
        pc.*, 
        jsonb_build_object('name', u.name, 'avatar', u.avatar) as author
        FROM post_comments pc 
        JOIN users u ON u.id = pc.user_id
        WHERE 
          post_id = $1 AND parent_id IS NULL 
        GROUP BY pc.id, u.name, u.avatar
        ORDER BY id ${filter ? filter : 'ASC'}
        LIMIT $2 OFFSET $3`,
        [id, limit, skip],
      );

      const commentsCount = await pool.query(
        'SELECT COUNT(*) FROM post_comments WHERE post_id = $1 AND parent_id IS NULL',
        [id],
      );

      const count = commentsCount.rows[0].count;
      const pages = Math.ceil(count / limit);

      res.status(200).json({
        data: [...comments.rows],
        pages,
      });
    } catch (error) {
      console.log(error);
      res.sendStatus(400);
    }
  });

router
  .delete(
    '/comments/:comment_id',
    verifyAccessToken,
    deleteCommentValidation,
    validationErrors,
    async (req, res) => {
      try {
        const { comment_id } = req.params;

        const comment = await pool.query('SELECT * FROM post_comments WHERE id = $1', [comment_id]);

        if (!comment.rows[0] || comment.rows[0].user_id !== req.user.id) {
          throw new Error();
        }

        await pool.query('DELETE FROM notifications WHERE comment_id = $1', [comment_id]);
        await pool.query(
          `
          WITH RECURSIVE cte AS (
            SELECT id
            FROM post_comments
            WHERE id = $1
            UNION ALL
            SELECT pc.id
            FROM post_comments pc
            JOIN cte ON pc.parent_id = cte.id
          )
          DELETE FROM post_comments
          WHERE id IN (SELECT id FROM cte);
        `,
          [comment_id],
        );

        res.sendStatus(200);
      } catch (error) {
        console.log(error);
        res.sendStatus(400);
      }
    },
  )
  .get('/comments/:comment_id', getCommentByIdValidation, validationErrors, async (req, res) => {
    try {
      const { comment_id } = req.params;

      const comment = await pool.query(
        `
        SELECT 
        pc.*, 
          jsonb_build_object('name', u.name, 'avatar', u.avatar) as author
        FROM post_comments pc 
        JOIN users u ON u.id = pc.user_id
        WHERE pc.id = $1 
        GROUP BY pc.id, u.name, u.avatar`,
        [comment_id],
      );

      if (!comment.rows[0]) {
        throw new Error();
      }

      res.status(200).json([comment.rows[0]]);
    } catch (error) {
      console.log(error);
      res.sendStatus(400);
    }
  });

// like
router.post('/reaction', verifyAccessToken, likeValidation, validationErrors, async (req, res) => {
  try {
    const { post_id, action, author } = req.body;

    if (action === 'like') {
      const created_at = Math.floor(Date.now() / 1000);

      await pool.query('INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2)', [
        post_id,
        req.user.id,
      ]);

      if (Number(req.user.id) !== Number(author)) {
        await pool.query(
          'INSERT INTO notifications (sender_id, recipient_id, type, post_id, is_read, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
          [req.user.id, author, 'like', post_id, false, created_at],
        );
      }
    }

    if (action === 'dislike') {
      await pool.query('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2', [
        post_id,
        req.user.id,
      ]);

      if (Number(req.user.id) !== Number(author)) {
        await pool.query(
          'DELETE FROM notifications WHERE sender_id = $1 AND recipient_id = $2 AND type = $3 AND post_id = $4',
          [req.user.id, author, 'like', post_id],
        );
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.log(error);
    res.sendStatus(400);
  }
});

// add
router.post('/', verifyAccessToken, createValidation, validationErrors, async (req, res) => {
  try {
    const { title, text, attachments, topic_id, tags } = req.body;

    let cleanText = text.replace(/<[^>]*>/g, '');
    cleanText = cleanText.trim();

    if (cleanText.length <= 1 || cleanText.length >= 2500) {
      return res.status(400).json({ message: 'Текст должно включать от 1 до 2500 символов' });
    }

    const post = await pool.query(
      'INSERT INTO posts (title, text, attachments, author, topic_id, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [
        title,
        text,
        JSON.stringify(attachments),
        req.user.id,
        topic_id,
        Math.floor(Date.now() / 1000),
      ],
    );

    if (tags.length) {
      tags.map(async (obj) => {
        let tag_id = '';
        const tagName = obj.text;
        const tagCount = await pool.query('SELECT * FROM tags WHERE text = $1', [tagName]);

        if (!tagCount.rows[0]) {
          const tag = await pool.query('INSERT INTO tags (text) VALUES ($1) RETURNING id', [
            tagName,
          ]);

          tag_id = tag.rows[0].id;
        } else {
          tag_id = tagCount.rows[0].id;
        }

        await pool.query('INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2)', [
          post.rows[0].id,
          tag_id,
        ]);
      });
    }

    try {
      const indexnow = `?url=${process.env.CLIENT_DOMAIN}/post/${post.rows[0].id}&key=${process.env.INDEXNOW_KEY}`;
      await fetch('https://yandex.com/indexnow' + indexnow);
      await fetch('https://bing.com/indexnow' + indexnow);

      const googletokens = await googleapi.authorize();
      let googleoptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + googletokens.access_token,
        },
        body: JSON.stringify({
          url: `${process.env.CLIENT_DOMAIN}/post/${post.rows[0].id}`,
          type: 'URL_NOTIFICATION_TYPE_UNSPECIFIED',
        }),
      };

      await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', googleoptions);
    } catch (error) {
      console.log('indexing error', error);
    }

    res.status(200).json({ id: post.rows[0].id });
  } catch (error) {
    console.log(error);
    res.status(400).json({
      message: 'Ошибки при создании поста',
    });
  }
});

export default router;
