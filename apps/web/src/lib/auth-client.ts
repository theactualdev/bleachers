'use client';

import { createAuthClient } from 'better-auth/react';
import { magicLinkClient } from 'better-auth/client/plugins';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Better Auth client pointed at the API's mounted auth handler. */
export const authClient = createAuthClient({
  baseURL: `${API_URL}/api/auth`,
  plugins: [magicLinkClient()],
});

export const { useSession, signOut, signIn } = authClient;
