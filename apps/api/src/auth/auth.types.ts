/** The authenticated principal attached to the request by AuthGuard. */
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: boolean;
}
