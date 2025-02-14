import express, { json } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import dotenv from 'dotenv';
import {
  AuthRouter,
  ContentRouter,
  FeedRouter,
  NotificationRouter,
  PostRouter,
  TopicRouter,
  UserRouter,
} from './routers/index.js';
import { verifyAccessToken } from './utils/jwt.js';

const app = express();
app.use(json());
app.use(cookieParser());
app.use(helmet());
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
dotenv.config();

app.use('/auth', AuthRouter);
app.use('/topics', TopicRouter);
app.use('/users', UserRouter);
app.use('/posts', PostRouter);
app.use('/feed', FeedRouter);
app.use('/content', ContentRouter);
app.use('/notifications', verifyAccessToken, NotificationRouter);

app.listen(5000, (err) => {
  if (err) {
    return console.error('Server error: ', err);
  }

  console.log('Server OK');
});
