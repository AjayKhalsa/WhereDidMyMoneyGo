/** Public product information only. Never import a user's profile or ledger here. */
export const APP_NAME = 'Where Did My Money Go';
export const SUPPORT_EMAIL = 'ajaykhalsa.ak@gmail.com';
export const SITE_URL = 'https://where-did-my-money-go-chi.vercel.app';
export const POLICY_UPDATED = '27 November 2026';
export const PUBLIC_INFORMATION_PATHS = ['/about', '/privacy', '/terms'] as const;
export function isPublicInformationPath(pathname: string): boolean {
  return PUBLIC_INFORMATION_PATHS.some(path => path === pathname);
}
