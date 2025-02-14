import jwt from 'jsonwebtoken';
import cookie from 'cookie';

export function getTokens({ id }) {
  const accessToken = jwt.sign({ id }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: Number(process.env.ACCESS_TOKEN_AGE),
  });

  const refreshToken = jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: Number(process.env.REFRESH_TOKEN_AGE),
  });

  return { accessToken, refreshToken };
}

export function verifyRefreshToken(req, res, next) {
  const refreshToken = req.cookies?.refreshToken;

  if (!refreshToken) {
    res.setHeader(
      'Set-Cookie',
      cookie.serialize('refreshToken', '', {
        httpOnly: true,
        maxAge: 0,
        path: '/',
      }),
    );
    return res.sendStatus(401);
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    req.user = {
      id: decoded.id,
    };
  } catch (err) {
    res.setHeader(
      'Set-Cookie',
      cookie.serialize('refreshToken', '', {
        httpOnly: true,
        maxAge: 0,
        path: '/',
      }),
    );
    return res.sendStatus(401);
  }

  return next();
}

export function verifyAccessToken(req, res, next) {
  const token = req.headers.authorization ? req.headers.authorization.split(' ')[1] : '';

  if (!token) {
    return res.sendStatus(401);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = {
      id: decoded.id,
    };
  } catch (err) {
    return res.sendStatus(401);
  }
  return next();
}

export function getUserId(req, res, next) {
  const refreshToken = req.cookies?.refreshToken;

  if (!refreshToken) {
    return next();
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    req.user = {
      id: decoded.id,
    };
  } catch (err) {
    return next();
  }

  return next();
}
