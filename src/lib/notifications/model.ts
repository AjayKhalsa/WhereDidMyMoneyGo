export interface NotificationPreferences {
  bills: boolean;
  budgets: boolean;
  weeklyRecap: boolean;
  syncIssues: boolean;
  moneyPush: boolean;
  showDetails: boolean;
  quietHours: boolean;
  quietStart: number;
  quietEnd: number;
}
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  bills: true, budgets: true, weeklyRecap: true, syncIssues: true, moneyPush: true,
  showDetails: false, quietHours: true, quietStart: 21, quietEnd: 9,
};
export type NotificationKind = 'bill' | 'card' | 'budget' | 'recap' | 'sync';
export interface MoneyNotification {
  key: string; kind: NotificationKind; title: string; body: string;
  url: string; priority: number; tone: 'neutral' | 'warning' | 'danger';
  transactionIds: string[]; amount?: number; date?: string; estimated?: boolean;
}
export interface NotificationState {
  key: string; readAt: string | null; dismissedAt: string | null; pushedAt: string | null; updatedAt: string;
}
export interface NotificationSync {
  state: 'ok' | 'failed' | 'incomplete' | 'stale' | 'review' | 'disconnected';
  lastCheckedAt?: string | null; review?: number;
}
export function validNotificationPreferences(value: unknown): value is NotificationPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  const bools = ['bills','budgets','weeklyRecap','syncIssues','moneyPush','showDetails','quietHours'];
  return Object.keys(p).length === 9 && bools.every(k => typeof p[k] === 'boolean') &&
    ['quietStart','quietEnd'].every(k => Number.isInteger(p[k]) && Number(p[k]) >= 0 && Number(p[k]) <= 23) &&
    (!p.quietHours || p.quietStart !== p.quietEnd);
}
export function notificationPreferences(value: unknown): NotificationPreferences {
  return validNotificationPreferences(value) ? value : { ...DEFAULT_NOTIFICATION_PREFERENCES };
}
export function validNotificationKey(value: unknown): value is string {
  return typeof value === 'string' && /^(bill|card|budget|recap|sync):[A-Za-z0-9_.:%-]{1,230}$/.test(value);
}
export const notificationKey = (kind: NotificationKind, ...parts: string[]) => `${kind}:${parts.map(encodeURIComponent).join(':')}`;
const DESTINATIONS = new Set(['/', '/notifications', '/budgets', '/insights', '/money', '/money#bills', '/money#cards', '/settings', '/settings#gmail', '/settings#notifications']);
export function notificationDestination(value: unknown): string {
  return typeof value === 'string' && DESTINATIONS.has(value) ? value : '/notifications';
}
export function inQuietHours(p: NotificationPreferences, now: Date): boolean {
  if (!p.quietHours) return false;
  const hour = new Date(now.getTime() + 330 * 60000).getUTCHours();
  return p.quietStart > p.quietEnd ? hour >= p.quietStart || hour < p.quietEnd : hour >= p.quietStart && hour < p.quietEnd;
}
export function pushEligible(alerts: MoneyNotification[], states: Record<string, NotificationState>, preferences: NotificationPreferences) {
  return alerts.filter(a => a.kind === 'sync' ? preferences.syncIssues : preferences.moneyPush && ((a.kind==='bill'||a.kind==='card') ? preferences.bills : a.kind==='budget' ? preferences.budgets : preferences.weeklyRecap))
    .filter(a => !states[a.key]?.readAt && !states[a.key]?.dismissedAt && !states[a.key]?.pushedAt)
    .sort((a,b) => b.priority-a.priority || a.key.localeCompare(b.key));
}
export interface PushNotice { title: string; body: string; tag: string; url: string }
export function moneyPushNotice(alerts: MoneyNotification[], p: NotificationPreferences, day: string, channel: 'money' | 'sync'): PushNotice {
  const first = alerts[0];
  const generic = first?.kind === 'bill' || first?.kind === 'card' ? 'An upcoming payment needs your attention.' : first?.kind === 'budget' ? 'A spending limit needs your attention.' : first?.kind === 'recap' ? 'Your weekly money review is ready.' : 'Your email imports need attention.';
  return { title: 'Where Did My Money Go', body: p.showDetails && first ? `${first.title}. ${first.body}`.slice(0,240) : alerts.length > 1 ? `${alerts.length} money alerts are ready to review in the app.` : generic,
    tag: `wdmmg-${channel}-${day}`, url: alerts.length === 1 && first ? notificationDestination(first.url) : '/notifications' };
}
