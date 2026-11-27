"use client";
import Link from 'next/link';
import {Bell} from 'lucide-react';
import {useNotifications} from '@/lib/hooks/use-notifications';
export function NotificationBell({label=false}:{label?:boolean}){
  const {unread}=useNotifications();
  return <Link href="/notifications" aria-label={unread?`Notifications, ${unread} unread`:'Notifications'} className={label?'relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-ink-secondary hover:bg-surface-hover':'relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-secondary hover:bg-surface-sunken'}>
    <Bell aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75}/>{label&&<span>Notifications</span>}
    {unread>0&&<span aria-hidden="true" className={label?'ml-auto rounded-full bg-accent px-1.5 text-[10px] font-semibold leading-5 text-white':'absolute right-0.5 top-0.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-4 text-white'}>{unread>99?'99+':unread}</span>}
  </Link>;
}
