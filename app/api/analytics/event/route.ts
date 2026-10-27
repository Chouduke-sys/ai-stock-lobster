import {NextRequest,NextResponse} from "next/server";
import {getServerSession} from "next-auth";
import {authOptions} from "../../../../lib/auth";
import {analyticsConfigured,db} from "../../../../lib/analytics-store";
import {createHash} from "crypto";
export const runtime="nodejs";
const events=["page_view","morning_brief_view"] as const;
export async function POST(req:NextRequest){
 if(!analyticsConfigured())return NextResponse.json({status:"unconfigured"},{status:503});
 const origin=req.headers.get("origin");
 if(origin&&origin!==req.nextUrl.origin)return NextResponse.json({error:"origin rejected"},{status:403});
 let body:{event?:string;visitorId?:string};
 try{body=await req.json();}catch{return NextResponse.json({error:"invalid json"},{status:400});}
 if(!events.includes(body.event as typeof events[number])||typeof body.visitorId!=="string"||!/^[a-f0-9-]{16,64}$/i.test(body.visitorId))return NextResponse.json({error:"invalid event"},{status:400});
 const session=await getServerSession(authOptions);
 if(body.event==="morning_brief_view"&&!session?.user?.email)return NextResponse.json({error:"login required"},{status:401});
 const email=session?.user?.email?.toLowerCase()??null;
 const provider=(session as typeof session & {provider?:string}|null)?.provider??null;
 const salt=process.env.ANALYTICS_HASH_SALT||process.env.NEXTAUTH_SECRET;
 if(!salt)return NextResponse.json({error:"analytics hash secret missing"},{status:503});
 const hash=(v:string)=>createHash("sha256").update(salt+":"+v).digest("hex");
 try{
  await db("analytics_events",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({
   event_name:body.event,visitor_hash:hash(body.visitorId),user_hash:email?hash(email):null,provider:email?provider:null
  })});
  return NextResponse.json({status:"ok"});
 }catch{return NextResponse.json({status:"unavailable"},{status:503});}
}
