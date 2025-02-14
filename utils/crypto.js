import crypto from 'crypto';

export function generateToken(length) {
  const token = crypto.randomBytes(length).toString('hex');
  return token;
}
