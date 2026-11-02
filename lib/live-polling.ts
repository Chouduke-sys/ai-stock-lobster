/** Refresh visible pages immediately on focus/reconnect, without overlapping requests. */
export const REFRESH_MS={quotes:1000,global:15000,positioning:15000,closing:15000,
 analysis:30000,sectors:30000,news:60000};
export function pollVisible(task:()=>Promise<unknown>|void,intervalMs:number|(()=>number)){
 let lastStartedAt=-Infinity;
 let stopped=false,inFlight=false;
 const trigger=async()=>{
  if(stopped||inFlight||document.visibilityState!=="visible")return;
  inFlight=true;lastStartedAt=Date.now();
  try{await task();}catch{/* Each loader owns its user-facing error state. */}
  finally{inFlight=false;}
 };
 const onResume=()=>{void trigger();};
 const tick=()=>{if(typeof intervalMs==="function"&&Date.now()-lastStartedAt<intervalMs())return;onResume();};
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
