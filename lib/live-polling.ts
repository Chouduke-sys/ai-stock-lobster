/** Visible-only polling; coalesce resume events and back off explicit false/rejected loads. */
export const REFRESH_MS={quotes:10000,global:60000,positioning:300000,closing:300000,
 analysis:300000,sectors:300000,news:300000};
export function pollVisible(task:()=>Promise<unknown>|void,intervalMs:number|(()=>number)){
 let lastStartedAt=-Infinity;
 let stopped=false,inFlight=false,failures=0;
 const delay=()=>Math.min(1800000,(typeof intervalMs==="function"?intervalMs():intervalMs)*2**Math.min(failures,6));
 const trigger=async()=>{
  if(stopped||inFlight||document.visibilityState!=="visible")return;
  inFlight=true;lastStartedAt=Date.now();
  try{const result=await task();failures=result===false?failures+1:0;}catch{failures++;}
  finally{inFlight=false;}
 };
 const onResume=()=>{if(Date.now()-lastStartedAt<(failures?delay():Math.min(delay(),5000)))return;void trigger();};
 const tick=()=>{if(Date.now()-lastStartedAt<delay())return;onResume();};
 const timer=setInterval(tick,typeof intervalMs==="number"?intervalMs:1000);
 document.addEventListener("visibilitychange",onResume);
 window.addEventListener("focus",onResume);
 window.addEventListener("online",onResume);
 onResume();
 return ()=>{
  stopped=true;clearInterval(timer);
  document.removeEventListener("visibilitychange",onResume);
  window.removeEventListener("focus",onResume);
  window.removeEventListener("online",onResume);
 };
}
