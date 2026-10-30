import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Item={title:string;url:string;publishedAt:string|null;source:string;summary:string|null;imageUrl:null};
const queries=[
 '"川普" "表示" 關稅 經濟 when:2d',
 '"鮑爾" "表示" 聯準會 利率 when:2d',
 '"黃仁勳" "表示" 輝達 AI 晶片 when:2d',
 '"台積電" "董事長" "表示" 半導體 when:2d',
 '"央行總裁" "表示" 匯率 利率 when:2d',
 '"金管會主委" "表示" 股市 金融 when:2d',
 '台積電 法說會 結果 展望 when:3d',
 '輝達 法說會 財報 展望 when:3d',
 '聯發科 法說會 結果 展望 when:3d',
 '鴻海 法說會 財報 展望 when:3d',
 '廣達 緯創 緯穎 法說會 展望 when:3d',
 '台灣 上市櫃 公司 法說會 結果 財測 展望 when:3d'
];
const namedPeople=/(川普|特朗普|Donald Trump|鮑爾|鮑威爾|Jerome Powell|黃仁勳|Jensen Huang|魏哲家|劉揚偉|蘇姿丰|蘇姿豐|Lisa Su|央行總裁|金管會主委|聯準會主席|Fed 主席)/i;
const speechWords=/(表示|指出|強調|宣布|宣佈|警告|談到|提到|說明|坦言|回應|稱|說|發言|談話|演說|致詞|透露|預告|呼籲|認為|承諾|證實|示警|said|says|stated|warned|announced|remarks)/i;
const financeWords=/(台股|股市|美股|股價|股票|經濟|金融|央行|聯準會|Fed|利率|降息|升息|通膨|匯率|美元|新台幣|關稅|半導體|晶片|輝達|台積電|AI|人工智慧|出口管制|投資|財報|營收|產業|供應鏈|科技|能源|油價)/i;
const irrelevantWords=/(卡比戰士|卡比|Kirby|電玩|遊戲攻略|動漫|動畫|影集|電影|演唱會|綜藝|網紅|粉絲見面會|寶可夢|Pokémon|Nintendo|任天堂|cosplay)/i;
const earningsWords=/(法說會|法人說明會|業績說明會|財報會議|earnings call|財測|展望|財報)/i;
const resultsWords=/(結果|公布|公佈|宣布|宣佈|上修|下修|優於|不如|調高|調降|預估|預期|成長|衰退|獲利|毛利率|營收|EPS|每股盈餘|資本支出|接單|訂單|產能|需求|指引|guidance|看好|看淡|釋出|說明|預測|目標)/i;
const companyWords=/(台積電|輝達|NVIDIA|聯發科|鴻海|廣達|緯創|緯穎|台達電|日月光|欣興|南亞科|華邦電|群聯|聯茂|台光電|智邦|奇鋐|雙鴻|健策|上市櫃|上市公司|企業|公司|半導體|記憶體|伺服器|PCB|AI)/i;
function isImportantStatement(item:Item):boolean{
 const title=item.title.split(" - ")[0];
 return !irrelevantWords.test(title)&&((namedPeople.test(title)&&speechWords.test(title)&&financeWords.test(title))||(earningsWords.test(title)&&resultsWords.test(title)&&companyWords.test(title)));
}
function decode(value:string):string{
 return value.replaceAll("<![CDATA[","").replaceAll("]]>","").replaceAll("&amp;","&").replaceAll("&quot;",'"').replaceAll("&#39;","'").replaceAll("&apos;","'").replaceAll("&lt;","<").replaceAll("&gt;",">").trim();
}
function extract(source:string,name:string):string{
 const begin=source.indexOf("<"+name);
 if(begin<0)return "";
 const start=source.indexOf(">",begin);
 if(start<0)return "";
 const end=source.indexOf("</"+name+">",start+1);
 if(end<0)return "";
 return decode(source.slice(start+1,end));
}
function itemsFromXml(xml:string):Item[]{
 const items:Item[]=[];
 let offset=0;
 while(items.length<20){
  const start=xml.indexOf("<item>",offset);
  if(start<0)break;
  const end=xml.indexOf("</item>",start+6);
  if(end<0)break;
  offset=end+7;
  const item=xml.slice(start+6,end);
  const title=extract(item,"title");
  const url=extract(item,"link");
  const published=extract(item,"pubDate");
  const source=extract(item,"source");
  if(!title||!url.startsWith("https://"))continue;
  const date=new Date(published);
  items.push({title,url,publishedAt:Number.isFinite(date.getTime())?date.toISOString():null,source:source||"Google 新聞 RSS",summary:null,imageUrl:null});
 }
 return items;
}
export async function GET(){
 const batches=await Promise.all(queries.map(async query=>{
  try{
   const url="https://news.google.com/rss/search?q="+encodeURIComponent(query)+"&hl=zh-TW&gl=TW&ceid=TW:zh-Hant";
   const response=await fetch(url,{next:{revalidate:180},signal:AbortSignal.timeout(6500),headers:{"User-Agent":"Mozilla/5.0"}});
   if(!response.ok)return [] as Item[];
   return itemsFromXml(await response.text());
  }catch{return [] as Item[];}
 }));
 const seen=new Set<string>();
 const cutoff=Date.now()-72*60*60*1000;
 const news=batches.flat().filter(item=>{const timestamp=item.publishedAt?Date.parse(item.publishedAt):NaN;return Number.isFinite(timestamp)&&timestamp>=cutoff&&timestamp<=Date.now()+5*60*1000;}).filter(isImportantStatement).filter(item=>{const title=item.title.replace(/\\s+[-–—]\\s+[^-–—]+$/,"").trim();const chinese=(title.match(/[\\u3400-\\u9fff]/g)||[]).length;if(chinese<4)return false;const key=title.toLowerCase().replace(/[\\s\\p{P}\\p{S}]/gu,"").slice(0,90);if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>Date.parse(b.publishedAt??"1970")-Date.parse(a.publishedAt??"1970")).slice(0,40);
 return NextResponse.json({status:news.length?"ok":"unavailable",news,source:"Google 新聞 RSS（多家媒體轉載，非官方發言逐字稿）",fetchedAt:new Date().toISOString()},{headers:{"Cache-Control":"public, s-maxage=180, stale-while-revalidate=180"}});
}
