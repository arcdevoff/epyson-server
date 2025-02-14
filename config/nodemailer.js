import nodemailer from 'nodemailer';

// Создание настроек для отправки письма
const mailTransporter = nodemailer.createTransport({
  host: 'smtp.mail.ru', // SMTP-сервер
  port: 465, // Порт SMTP-сервера
  secure: true, // Использовать ли SSL/TLS
  auth: {
    user: 'arcmelkonyan524@mail.ru', // Ваш адрес электронной почты
    pass: 'QibZP7EADbEJDbJ4Tuvf', // Ваш пароль
  },
});

export default mailTransporter;
