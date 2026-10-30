import { NextResponse, type NextRequest } from "next/server";
import {randomUUID} from 'node:crypto';
import { admin, google, origin, requireConfig, safeEqual, seal, tokenRequest, unseal, userFor,json,GmailError } from "@/lib/gmail/server";

export async function GET(request: NextRequest) {
  let response: NextResponse;
  const session=json({});let db:ReturnType<typeof admin>|undefined,userId:string|undefined,lease:string|undefined;
  try {
    requireConfig();
    response = NextResponse.redirect(`${origin()}/settings?gmail=connected`);
    const user = await userFor(request, session);userId=user.id;
    const saved = JSON.parse(unseal(request.cookies.get("gmail_oauth")?.value ?? "", "oauth"));
    if (saved.userId !== user.id || saved.expires < Date.now() || !safeEqual(saved.state, request.nextUrl.searchParams.get("state") ?? "")) throw new Error("Invalid state");
    const code = request.nextUrl.searchParams.get("code");
    if (!code || request.nextUrl.searchParams.has("error")) throw new Error("Denied");
    db=admin();
    const existing=await db.from('gmail_connections').select('user_id,email').eq('user_id',user.id).maybeSingle();if(existing.error)throw existing.error;
    if(existing.data){
      const candidate=randomUUID(),lock=await db.rpc('gmail_acquire_lease',{p_user:user.id,p_lease:candidate});if(lock.error)throw lock.error;
      if(!lock.data)throw new GmailError('Gmail sync is busy.',409);lease=candidate;
    }
    const tokens = await tokenRequest({ grant_type: "authorization_code", code, code_verifier: saved.verifier, redirect_uri: `${origin()}/api/gmail/callback` });
    if (!tokens.refresh_token || !tokens.scope?.split(" ").includes("https://www.googleapis.com/auth/gmail.readonly")) throw new Error("Missing permission");
    const profile = await google<{ emailAddress: string }>("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    if (profile.emailAddress.toLowerCase() !== user.email?.toLowerCase()) throw new Error("Use your app email");
    if(existing.data&&existing.data.email.toLowerCase()!==profile.emailAddress.toLowerCase())throw new Error('Existing mailbox differs');
    const result = existing.data
      ?await db.from('gmail_connections').update({refresh_token:seal(tokens.refresh_token,user.id),last_error:null}).eq('user_id',user.id).eq('lease_id',lease!).gt('lease_until',new Date().toISOString()).select('user_id').maybeSingle()
      :await db.from('gmail_connections').insert({user_id:user.id,email:profile.emailAddress,refresh_token:seal(tokens.refresh_token,user.id),start_date:saved.startDate}).select('user_id').single();
    if (result.error) throw result.error;
    if(!result.data)throw new GmailError('Gmail sync is busy.',409);
  } catch(error) {
    const outcome=error instanceof GmailError&&error.status===409?'busy':error instanceof GmailError&&error.code==='gmail_server_setup'?'setup':'failed';
    response = NextResponse.redirect(new URL(`/settings?gmail=${outcome}`, process.env.APP_ORIGIN || request.url));
  }finally{
    if(db&&userId&&lease)try{await db.from('gmail_connections').update({lease_id:null,lease_until:null}).eq('user_id',userId).eq('lease_id',lease);}catch{/* The lease expires; never expose OAuth errors. */}
  }
  for(const cookie of session.cookies.getAll())response.cookies.set(cookie);
  response.cookies.set("gmail_oauth", "", { path: "/api/gmail", maxAge: 0 });
  response.headers.set("Cache-Control", "private, no-store"); response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
