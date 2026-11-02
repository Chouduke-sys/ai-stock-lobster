import {marketDate,strictNumber} from "./market-data";
type Row=Record<string,unknown>;
// Field names and count/percent units follow TAIFEX's published OpenAPI schema.
export function parseTaifexPositioning(ratios:Row[],institutions:Row[],referenceDate:string){
 const ratio=ratios.find(row=>marketDate(row.Date)===referenceDate);
 const foreign=institutions.find(row=>marketDate(row.Date)===referenceDate&&
  ["臺股期貨","台股期貨","TX"].includes(String(row.ContractCode??"").trim())&&
  ["外資及陸資","外資","Foreign Investors"].includes(String(row.Item??"").trim()));
 const count=(value:unknown)=>{const n=strictNumber(value);return n!==null&&Number.isSafeInteger(n)?n:null;};
 const percent=(published:unknown,put:unknown,call:unknown)=>{
  const p=count(put),c=count(call),value=strictNumber(published);
  if(p===null||c===null||p<0||c<=0||value===null||value<0)return null;
  return Math.abs(value-p/c*100)<=0.02?value:null;
 };
 const foreignTxNet=foreign?count(foreign["OpenInterest(Net)"]):null;
 const putCallVolume=ratio?percent(ratio["PutCallVolumeRatio%"],ratio.PutVolume,ratio.CallVolume):null;
 const putCallOpenInterest=ratio?percent(ratio["PutCallOIRatio%"],ratio.PutOI,ratio.CallOI):null;
 if(foreignTxNet===null&&putCallVolume===null&&putCallOpenInterest===null)return null;
 return {date:referenceDate,foreignTxNet,putCallVolume,putCallOpenInterest,source:"臺灣期貨交易所 OpenAPI（口數／百分比）"};
}
