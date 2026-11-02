import {marketDate,strictNumber} from "./market-data";
export function sourceQuality(rows:unknown,required:string[],minimum:number,referenceDate:string,today:string){
 if(!Array.isArray(rows)||rows.length<minimum)return {ok:false,detail:"資料筆數或格式異常",date:null};
 const valid=rows.filter(row=>row&&typeof row==="object"&&required.every(key=>strictNumber(row[key])!==null));
 const dates=valid.map(row=>marketDate(row.Date)).filter((date):date is string=>Boolean(date)&&date!<=today).sort();
 const latest=dates.at(-1)??null;
 const dated=valid.filter(row=>{const date=marketDate(row.Date);return date&&date>=referenceDate&&date<=today;});
 return {ok:dated.length>=minimum&&latest!==null&&latest>=referenceDate,
  detail:latest===null?"缺少可驗證的日期／數值欄位":latest<referenceDate?"來源資料過期":"日期與必要數值欄位已驗證",date:latest};
}
