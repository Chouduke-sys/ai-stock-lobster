import {createHash} from "node:crypto";
import {verifiedSnapshot} from "./market-data";
export function snapshotHash(brief:unknown){return createHash("sha256").update(JSON.stringify(brief)).digest("hex");}
export function validSnapshot(record:any){
 if(!verifiedSnapshot(record)||snapshotHash(record.brief)!==record.snapshot.sha256)return false;
 const summary=record.brief.sections?.find((item:any)=>item.title==="今日盤前小總結");
 return Boolean(summary&&record.brief.modelVersion==="market-integrity-v2"&&
 record.snapshot.modelVersion===record.brief.modelVersion&&
 record.prediction===summary.sentiment&&record.predictionLabel===summary.verdict);
}
export async function loadMorningSnapshot(date:string){
 const response=await fetch("https://raw.githubusercontent.com/Chouduke-sys/ai-stock-lobster/main/data/daily-review.json",{cache:"no-store",signal:AbortSignal.timeout(6000)});
 if(!response.ok)throw Error("盤前封存暫時無法讀取");
 const records=await response.json();
 if(!Array.isArray(records))throw Error("盤前封存格式錯誤");
 const record=records.find(x=>x.date===date);
 return validSnapshot(record)?record:null;
}
