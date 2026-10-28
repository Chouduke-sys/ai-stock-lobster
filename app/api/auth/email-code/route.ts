import {NextRequest,NextResponse} from "next/server";
export const runtime="nodejs";
const url=process.env.SUPABASE_URL;
const key=process.env.SUPABASE_PUBLISHABLE_KEY;
export async function POST(req:NextRequest){
 if(!url||!key)return NextResponse.json({error:"Email 登入尚未啟用"},{status:503});
 let input:{action?:string;email?:string;code?:string};
 try{input=await req.json();}catch{return NextResponse.json({error:"輸入格式錯誤"},{status:400});}
 const email=String(input.email??"").trim().toLowerCase();
 if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return NextResponse.json({error:"請輸入有效的 Email"},{status:400});
 if(input.action!=="send"&&input.action!=="verify")return NextResponse.json({error:"無效操作"},{status:400});
 if(input.action==="verify"&&!/^\d{6,8}$/.test(String(input.code??"")))return NextResponse.json({error:"請輸入正確的驗證碼"},{status:400});
 const endpoint=input.action==="send"?"/auth/v1/otp":"/auth/v1/verify";
 const body=input.action==="send"?{email,create_user:true}:{email,token:input.code,type:"email"};
 try{
  const res=await fetch(url+endpoint,{method:"POST",headers:{"Content-Type":"application/json",apikey:key},body:JSON.stringify(body),cache:"no-store",signal:AbortSignal.timeout(9000)});
  const data=await res.json() as {access_token?:string;msg?:string;error_description?:string};
  if(!res.ok)return NextResponse.json({error:res.status===429?"請稍候再重試，驗證碼寄送過於頻繁":input.action==="send"?"驗證碼暫時無法寄送，請稍後重試":"驗證碼錯誤或已過期"},{status:res.status===429?429:400});
  if(input.action==="verify"){if(!data.access_token)return NextResponse.json({error:"驗證失敗"},{status:400});return NextResponse.json({status:"ok",accessToken:data.access_token},{headers:{"Cache-Control":"no-store"}});}
  return NextResponse.json({status:"ok"},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"驗證服務暫時無法連線"},{status:503});}
}
