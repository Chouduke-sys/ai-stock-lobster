// Warm-instance single-flight cache. Never use for user-specific responses or mutations.
// No stale-while-revalidate: expired data must pass normal date validation again.
type Entry={until:number;response?:Response;pending?:Promise<Response>};
const entries=new Map<string,Entry>();
export async function cachedResponse(key:string,ttlMs:number,task:()=>Promise<Response>):Promise<Response>{
 const previous=entries.get(key);
 if(previous?.pending)return (await previous.pending).clone();
 if(previous?.response&&previous.until>Date.now())return previous.response.clone();
 const entry:Entry={until:0};
 entry.pending=Promise.resolve().then(task).then(response=>{
  entry.response=response;entry.until=Date.now()+(response.status===200?ttlMs:15000);
  return response;
 }).finally(()=>{entry.pending=undefined;});
 entries.set(key,entry);
 if(entries.size>64)entries.delete(entries.keys().next().value!);
 return (await entry.pending).clone();
}
