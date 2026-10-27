// Supabase REST, server-side only. Never expose the service-role key to the browser.
export function analyticsConfigured(){return Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY);}
export async function db(path:string,init:RequestInit={}){
 if(!analyticsConfigured())throw Error("尚未設定分析資料庫");
 const base=process.env.SUPABASE_URL!.replace(/\/$/,"");
 const res=await fetch(base+"/rest/v1/"+path,{...init,headers:{
  apikey:process.env.SUPABASE_SERVICE_ROLE_KEY!,
  Authorization:"Bearer "+process.env.SUPABASE_SERVICE_ROLE_KEY!,
  "Content-Type":"application/json",
  ...init.headers
 },cache:"no-store"});
 if(!res.ok)throw Error("分析資料庫請求失敗 ("+res.status+")");
 return res;
}
export function taipeiDay(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
