// Create or reset a user. Usage: npm run user:create -- <email> <password> [owner|admin|staff] [biz1,biz2]
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma';

async function main() {
  const [email, password, role = 'owner', biz = ''] = process.argv.slice(2);
  if (!email || !password || password.length < 8) throw new Error('Usage: <email> <password(min 8)> [owner|admin|staff] [biz1,biz2]');
  if (!['owner', 'admin', 'staff'].includes(role)) throw new Error('role must be owner|admin|staff');
  const passwordHash = await bcrypt.hash(password, 12);
  const businesses = biz ? biz.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const u = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    create: { email: email.toLowerCase(), passwordHash, role: role as 'owner', businesses },
    update: { passwordHash, role: role as 'owner', businesses, active: true },
  });
  console.log('OK', u.email, u.role, u.businesses.join(',') || '(all)');
}
main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e.message); await prisma.$disconnect(); process.exit(1); });
