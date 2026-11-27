"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFinance } from './use-finance';
import { isSupabaseConfigured } from '@/lib/data/supabase-client';
import { moneyNotifications } from '@/lib/notifications/rules';
import { DEFAULT_NOTIFICATION_PREFERENCES, notificationPreferences, validNotificationKey, type MoneyNotification, type NotificationPreferences, type NotificationState, type NotificationSync } from '@/lib/notifications/model';

export interface NotificationDevice { endpoint_hash:string;device_name:string;last_sent_at:string|null;last_test_at?:string|null;delivery_failed:boolean }
export interface NotificationStatus {
  configured:boolean;publicKey?:string;devices:NotificationDevice[];
  preferences:NotificationPreferences;states:Record<string,NotificationState>;
  sync?:NotificationSync;lastCheckedAt:string|null;
}
interface NotificationContextValue {
  server:NotificationStatus;alerts:MoneyNotification[];unread:number;loading:boolean;error:string;
  refresh:()=>Promise<NotificationStatus|undefined>;
  savePreferences:(value:NotificationPreferences)=>Promise<void>;
  mark:(keys:string[],action:'read'|'dismiss'|'restore')=>Promise<void>;
}
const fresh=():NotificationStatus=>({configured:false,devices:[],preferences:{...DEFAULT_NOTIFICATION_PREFERENCES},states:{},lastCheckedAt:null});
const Context=createContext<NotificationContextValue|null>(null);
export async function notificationRequest(body?:Record<string,unknown>){
  const response=await fetch('/api/notifications',{method:body?'POST':'GET',cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  const result=await response.json();if(!response.ok)throw new Error(result.error??'Notifications could not be updated.');return result;
}
function cached(user:string):NotificationStatus{
  const result=fresh();
  try{const parsed=JSON.parse(localStorage.getItem(`wdmmg:notifications:${user}`)??'null');if(parsed){result.preferences=notificationPreferences(parsed.preferences);if(parsed.states&&typeof parsed.states==='object')result.states=Object.fromEntries(Object.entries(parsed.states).filter(([key,value])=>validNotificationKey(key)&&!!value&&typeof value==='object').slice(0,2000)) as Record<string,NotificationState>;}}catch{}
  return result;
}
export function NotificationProvider({children}:{children:ReactNode}){
  const {db,now}=useFinance(),user=db?.profile.id??'';
  const [saved,setSaved]=useState<{user:string;data:NotificationStatus}>({user:'',data:fresh()});
  const [loading,setLoading]=useState(false),[error,setError]=useState('');
  const epoch=useRef(0),owner=useRef(user),lastLoaded=useRef(0);
  owner.current=user;
  const server=saved.user===user?saved.data:fresh();
  const refresh=useCallback(async()=>{
    if(!user||!isSupabaseConfigured)return;
    const requestId=++epoch.current;setLoading(true);
    try{
      const result=await notificationRequest() as NotificationStatus;
      if(owner.current!==user||epoch.current!==requestId)return;
      const data={...result,preferences:notificationPreferences(result.preferences),devices:result.devices??[],states:result.states??{}};
      setSaved({user,data});setError('');lastLoaded.current=Date.now();return data;
    }catch(cause){if(owner.current===user&&epoch.current===requestId)setError(cause instanceof Error?cause.message:'Notification status could not be loaded.');}
    finally{if(owner.current===user&&epoch.current===requestId)setLoading(false);}
  },[user]);
  useEffect(()=>{
    ++epoch.current;setSaved({user,data:user?cached(user):fresh()});setError('');lastLoaded.current=0;
    if(user)void refresh();
    const onFocus=()=>{if(document.visibilityState==='visible'&&Date.now()-lastLoaded.current>60000)void refresh();};
    const interval=setInterval(onFocus,5*60000);
    window.addEventListener('focus',onFocus);document.addEventListener('visibilitychange',onFocus);
    return()=>{++epoch.current;clearInterval(interval);window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onFocus);};
  },[user,refresh]);
  useEffect(()=>{if(!user||saved.user!==user)return;try{localStorage.setItem(`wdmmg:notifications:${user}`,JSON.stringify({preferences:saved.data.preferences,states:saved.data.states}));}catch{}},[saved,user]);
  const alerts=useMemo(()=>db?moneyNotifications(db,now,server.preferences,server.sync):[],[db,now,server.preferences,server.sync]);
  const unread=alerts.filter(a=>!server.states[a.key]?.readAt&&!server.states[a.key]?.dismissedAt).length;
  const savePreferences=useCallback(async(preferences:NotificationPreferences)=>{
    ++epoch.current;
    try{if(isSupabaseConfigured)await notificationRequest({action:'preferences',preferences});if(owner.current===user){setSaved(old=>({user,data:{...(old.user===user?old.data:fresh()),preferences}}));setError('');}}
    catch(cause){const message=cause instanceof Error?cause.message:'Preferences could not be saved.';setError(message);throw new Error(message);}
    finally{setLoading(false);}
  },[user]);
  const mark=useCallback(async(keys:string[],action:'read'|'dismiss'|'restore')=>{
    if(!user||!keys.length)return;
    ++epoch.current;
    try{
      let values:NotificationState[];
      if(isSupabaseConfigured){values=[];for(let i=0;i<keys.length;i+=50){const response=await notificationRequest({action,keys:keys.slice(i,i+50)});values.push(...response.states);}}
      else{const time=new Date().toISOString();values=keys.map(key=>{const current=server.states[key];return{key,readAt:action==='restore'?null:current?.readAt??time,dismissedAt:action==='dismiss'?time:action==='restore'?null:current?.dismissedAt??null,pushedAt:current?.pushedAt??null,updatedAt:time};});}
      if(owner.current!==user)return;
      setSaved(old=>({user,data:{...(old.user===user?old.data:fresh()),states:{...(old.user===user?old.data.states:{}),...Object.fromEntries(values.map(value=>[value.key,value]))}}}));setError('');
    }catch(cause){const message=cause instanceof Error?cause.message:'Read status could not be saved.';setError(message);throw new Error(message);}
    finally{setLoading(false);}
  },[user,server.states]);
  return <Context.Provider value={{server,alerts,unread,loading,error,refresh,savePreferences,mark}}>{children}</Context.Provider>;
}
export function useNotifications(){const context=useContext(Context);if(!context)throw new Error('Notifications need their provider.');return context;}
