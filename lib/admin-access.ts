import {getServerSession} from "next-auth";
import {authOptions} from "./auth";
export async function adminIdentity(){
 const session=await getServerSession(authOptions);
 const email=session?.user?.email?.trim().toLowerCase();
 const allowed=(process.env.ADMIN_EMAILS??"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
 // Only a verified Google OAuth identity can be granted admin access.
 const provider=(session as typeof session & {provider?:string}|null)?.provider;
 return email&&provider==="google"&&allowed.includes(email)?email:null;
}
