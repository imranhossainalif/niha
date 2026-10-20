import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import type { Role } from '@/lib/access';

declare module 'next-auth' {
  interface Session {
    user: { id: string; role: Role; businesses: string[] } & DefaultSession['user'];
  }
  interface User {
    role?: Role;
    businesses?: string[];
  }
}

const creds = z.object({ email: z.string().email(), password: z.string().min(1) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET || process.env.SESSION_SECRET,
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 30 * 24 * 3600 },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const p = creds.safeParse(raw);
        if (!p.success) return null;
        const u = await prisma.user.findUnique({ where: { email: p.data.email.toLowerCase() } });
        if (!u || !u.active || !(await bcrypt.compare(p.data.password, u.passwordHash))) return null;
        return { id: u.id, email: u.email, name: u.name ?? u.email, role: u.role, businesses: u.businesses };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) { token.uid = user.id; token.role = user.role; token.businesses = user.businesses; }
      return token;
    },
    async session({ session, token }) {
      session.user.id = String(token.uid);
      session.user.role = token.role as Role;
      session.user.businesses = (token.businesses as string[]) ?? [];
      return session;
    },
  },
});
