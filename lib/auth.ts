import CredentialsProvider from "next-auth/providers/credentials";
import type {NextAuthOptions} from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
const providers:NextAuthOptions["providers"]=[];
if(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET){
 providers.push(GoogleProvider({clientId:process.env.GOOGLE_CLIENT_ID,clientSecret:process.env.GOOGLE_CLIENT_SECRET}));
}
if(process.env.APPLE_CLIENT_ID&&process.env.APPLE_CLIENT_SECRET){
 providers.push(AppleProvider({clientId:process.env.APPLE_CLIENT_ID,clientSecret:process.env.APPLE_CLIENT_SECRET}));
}
if(process.env.SUPABASE_URL&&process.env.SUPABASE_PUBLISHABLE_KEY){
 providers.push(CredentialsProvider({id:"email-code",name:"Email 驗證碼",credentials:{accessToken:{label:"驗證憑證",type:"text"}},async authorize(credentials){
  const token=credentials?.accessToken;
  if(!token||token.length>4096)return null;
  const response=await fetch(process.env.SUPABASE_URL+"/auth/v1/user",{headers:{apikey:process.env.SUPABASE_PUBLISHABLE_KEY! ,Authorization:"Bearer "+token},cache:"no-store",signal:AbortSignal.timeout(7000)});
  if(!response.ok)return null;
  const user=await response.json() as {id?:string;email?:string;email_confirmed_at?:string;user_metadata?:{full_name?:string}};
  if(!user.id||!user.email||!user.email_confirmed_at)return null;
  return {id:user.id,email:user.email,name:user.user_metadata?.full_name??user.email.split("@")[0]};
 }}));
}
export const authOptions:NextAuthOptions={
 providers,
 session:{strategy:"jwt",maxAge:7*24*60*60},
 secret:process.env.NEXTAUTH_SECRET,
 pages:{signIn:"/"},
 callbacks:{
  async jwt({token,account}){if(account?.provider)token.provider=account.provider;return token;},
  async session({session,token}){if(session.user){session.user.name=token.name??session.user.name;session.user.email=token.email??session.user.email;}(session as typeof session & {provider?:string}).provider=typeof token.provider==="string"?token.provider:undefined;return session;}
 }
};
