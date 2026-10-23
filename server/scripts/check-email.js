// Checks the SMTP settings and login without sending any email.
//   npm run email:check
import { verifyEmailConnection } from '../src/services/email.js';
import { env } from '../src/config/env.js';

const result = await verifyEmailConnection();
console.info(`SMTP host: ${env.smtp.host || '(not set)'}  port: ${env.smtp.port}  secure: ${env.smtp.secure}`);
console.info(`Admin notifications: ${env.smtp.adminTo ? 'configured' : 'not set (ADMIN_NOTIFICATION_EMAIL)'}`);
if (result.ok) {
  console.info('SMTP login succeeded. No email was sent.');
  process.exit(0);
}
console.error(`SMTP is not ready:\n- ${result.problems.join('\n- ')}`);
process.exit(1);
