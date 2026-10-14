// Give an existing account a role: `npm run set-role -- someone@example.com STAFF`
// Roles: CUSTOMER, STAFF (checks tickets at the door), ADMIN.
// There is deliberately no web page for this: roles are changed by someone with database access.
import { getPrisma } from '../server/db.js';

const [email, role] = process.argv.slice(2);
if (!email || !['CUSTOMER', 'STAFF', 'ADMIN'].includes(role)) {
  console.error('usage: npm run set-role -- <email> <CUSTOMER|STAFF|ADMIN>');
  process.exit(1);
}

const prisma = getPrisma();
try {
  const user = await prisma.user.update({ where: { email: email.trim().toLowerCase() }, data: { role } });
  // Sign the user out so the new role applies to the next login, not to an old session.
  await prisma.session.deleteMany({ where: { userId: user.id } });
  console.log(`${user.email} is now ${role}`);
} catch {
  console.error('no account with that e-mail');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
