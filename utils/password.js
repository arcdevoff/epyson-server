import bcrypt from 'bcrypt';

export async function generateHashPassword(password) {
  const saltRounds = 10;
  const salt = await bcrypt.genSalt(saltRounds);
  const hashedPassword = await bcrypt.hash(password, salt);
  return hashedPassword;
}

export async function checkPassword({ password, hashedPassword }) {
  const isMatch = await bcrypt.compare(password, hashedPassword);
  return isMatch;
}
