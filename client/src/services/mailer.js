import nodemailer from 'nodemailer';

// The transporter is the "connection to the post office"
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: Number(process.env.SMTP_PORT) === 465, // true for port 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendMail({ to, subject, html }) {
  return transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject,
    html,
  });
}