/**
 * Small, dependency-free HTML table extractor for public market pages.
 * Matches column labels rather than fixed column positions; never fetches arbitrary user URLs.
 */
export type ExtractedTable={headers:string[];rows:string[][];caption:string};
export function htmlText(html:string):string{
 return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\s+/g," ").trim();
}
export function extractHtmlTables(html:string):ExtractedTable[]{
 const tables:ExtractedTable[]=[];
 for(const match of Array.from(html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi))){
  const body=match[0],rows:string[][]=[],headerRows:string[][]=[];
  for(const row of Array.from(body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi))){
   const cells=Array.from(row[1].matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi),m=>({header:m[1].toLowerCase()==="th",text:htmlText(m[2])}));
   if(!cells.length)continue;
   if(cells.every(c=>c.header))headerRows.push(cells.map(c=>c.text));
   else rows.push(cells.map(c=>c.text));
  }
  if(!rows.length)continue;
  const headers=headerRows.at(-1)??rows.shift()??[];
  tables.push({headers,rows,caption:htmlText(body.match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i)?.[1]??"")});
 }
 return tables;
}
export function parseMarketNumber(value:string):number|null{
 const raw=value.replace(/,/g,"").replace(/\s/g,"").replace(/[＋]/g,"+").replace(/[－−]/g,"-");
 if(!/^[+-]?\d+(?:\.\d+)?$/.test(raw))return null;
 const number=Number(raw);return Number.isFinite(number)?number:null;
}
export function findTableByHeaders(tables:ExtractedTable[],required:RegExp[]):ExtractedTable|null{
 return tables.find(t=>required.every(pattern=>t.headers.some(h=>pattern.test(h))))??null;
}
