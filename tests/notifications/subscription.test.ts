import assert from 'node:assert/strict';
import test from 'node:test';
import {validSubscription,syncNotice} from '@/lib/notifications/subscription';
const keys={p256dh:'A'.repeat(87),auth:'B'.repeat(22)};
test('push endpoints accept supported HTTPS providers and reject server-side request targets',()=>{
 for(const host of ['fcm.googleapis.com','web.push.apple.com','updates.push.services.mozilla.com','wns2.notify.windows.com'])assert.ok(validSubscription({endpoint:`https://${host}/subscription/token`,keys}));
 for(const endpoint of ['http://fcm.googleapis.com/token','https://localhost/token','https://169.254.169.254/token','https://fcm.googleapis.com.evil.example/token','https://evilnotify.windows.com/token','https://user:pass@fcm.googleapis.com/token','https://fcm.googleapis.com:444/token','https://fcm.googleapis.com/token#fragment'])assert.equal(validSubscription({endpoint,keys}),false);
 assert.equal(validSubscription({endpoint:'https://fcm.googleapis.com/token',keys:{...keys,auth:'invalid'}}),false);
});
test('notifications expose no private financial data and only open Settings',()=>{
 for(const kind of ['failed','incomplete','test'] as const){const notice=syncNotice(kind);assert.equal(notice.url,'/settings');assert.doesNotMatch(JSON.stringify(notice),/amount|account|merchant|balance|₹/i);}
});
