import type {NextRequest} from 'next/server';
import {json,safeEqual} from '@/lib/gmail/server';
import {notificationAdmin} from '@/lib/notifications/data';
import {checkMoneyNotifications} from '@/lib/notifications/dispatch';
export const maxDuration=120;
export async function GET(request:NextRequest){
  if(!process.env.CRON_SECRET||!safeEqual(request.headers.get('authorization')??'',`Bearer ${process.env.CRON_SECRET}`))return json({error:'Unauthorized'},401);
  try{
    const users=await notificationAdmin().rpc('notification_recipients');
    if(users.error)throw new Error('Recipients unavailable');
    let checked=0,sent=0,failed=0;
    for(const user of users.data??[]){
      try{const result=await checkMoneyNotifications(String(user));checked++;sent+=result.sent;}
      catch{failed++;}
    }
    return json({complete:failed===0,checked,sent,failed},failed?503:200);
  }catch{return json({error:'The notification check could not finish.',complete:false},503);}
}
