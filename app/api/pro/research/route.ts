import {NextResponse} from "next/server";
import {getServerSession} from "next-auth";
import {authOptions} from "../../../../lib/auth";
import {proResearch} from "../../../../lib/pro-data";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","Vary":"Cookie"};
export async function GET(request:Request){
 let session;
 try{session=await getServerSession(authOptions);}
 catch{return NextResponse.json({error:"會員驗證服務暫時無法使用，請稍後再試。"},{status:503,headers});}
 if(!session?.user?.email)return NextResponse.json({error:"請先登入會員，再開啟 Pro 免費體驗。"},{status:401,headers});
 const params=new URL(request.url).searchParams;
 const symbol=params.get("symbol")??"2330",lookback=Number(params.get("window")??5);
 if(!/^\d{4}$/.test(symbol)||![5,10,20].includes(lookback))return NextResponse.json({error:"請輸入四碼股票代號，並選擇 5、10 或 20 個交易日。"},{status:400,headers});
 try{return NextResponse.json({status:"ok",access:"member-free-preview",...await proResearch(symbol,lookback)},{headers});}
 catch{return NextResponse.json({error:"研究資料暫時無法取得，請稍後重新整理。"},{status:503,headers});}
}
