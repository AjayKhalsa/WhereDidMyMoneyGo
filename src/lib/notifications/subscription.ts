export interface BrowserSubscription { endpoint: string; keys: { p256dh: string; auth: string } }
/** Endpoints are later fetched by the server. Restrict them to Web Push providers. */
export function validSubscription(value: unknown): value is BrowserSubscription {
  if (!value || typeof value !== 'object') return false;
  const s=value as BrowserSubscription;
  if (typeof s.endpoint!=='string' || s.endpoint.length>4096) return false;
  try {
    const u=new URL(s.endpoint);
    const host=u.hostname;
    const provider=host==='fcm.googleapis.com'||host==='web.push.apple.com'||host==='updates.push.services.mozilla.com'||host.endsWith('.notify.windows.com');
    if(u.protocol!=='https:'||u.port||u.username||u.password||u.hash||!provider) return false;
  } catch { return false; }
  return !!s.keys && typeof s.keys.p256dh==='string' && /^[A-Za-z0-9_-]{87}=?$/.test(s.keys.p256dh) && typeof s.keys.auth==='string' && /^[A-Za-z0-9_-]{22}(?:==)?$/.test(s.keys.auth);
}
export function syncNotice(kind: 'failed'|'incomplete'|'test') {
  return { title: 'Where Did My Money Go', body: kind==='test' ? 'Notifications are connected on this device.' : kind==='failed' ? 'Gmail sync could not finish. Open Settings to check the connection and retry.' : 'Gmail sync has unfinished work. Open Settings to review the backlog.', tag: 'wdmmg-sync', url: '/settings' };
}
