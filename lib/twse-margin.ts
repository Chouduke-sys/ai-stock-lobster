import {marketDate,strictNumber} from "./market-data";
export function parseTwseMargin(payload:any,referenceDate:string){
 if(payload?.stat!=="OK"||marketDate(payload.date)!==referenceDate)return null;
 const tables=Array.isArray(payload.tables)?payload.tables:[payload];
 for(const table of tables){
  if(!Array.isArray(table.fields)||!Array.isArray(table.data))continue;
  const previous=table.fields.indexOf("前日餘額"),current=table.fields.indexOf("今日餘額");
  if(previous<0||current<0)continue;
  const finance=table.data.find((row:unknown[])=>/^融資金額[（(]仟元[）)]$/.test(String(row[0])));
  const shorts=table.data.find((row:unknown[])=>/^融券[（(]交易單位[）)]$/.test(String(row[0])));
  if(!finance||!shorts)continue;
  const fb=strictNumber(finance[current]),fp=strictNumber(finance[previous]);
  const sb=strictNumber(shorts[current]),sp=strictNumber(shorts[previous]);
  if([fb,fp,sb,sp].some(n=>n===null||n<0))continue;
  return {date:referenceDate,financingBalance:fb!/100000,financingChange:(fb!-fp!)/100000,
   shortBalance:sb,shortChange:sb!-sp!,source:"TWSE MI_MARGN（仟元換算億元；融券交易單位為張）"};
 }
 return null;
}
