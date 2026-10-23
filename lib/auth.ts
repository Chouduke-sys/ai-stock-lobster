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
export const authOptions:NextAuthOptions={
 providers,
 session:{strategy:"jwt",maxAge:7*24*60*60},
 secret:process.env.NEXTAUTH_SECRET,
 pages:{signIn:"/"},
 callbacks:{
  async jwt({token,account}){if(account?.provider)token.provider=account.provider;return token;},
  async session({session,token}){if(session.user){session.user.name=token.name??session.user.name;session.user.email=token.email??session.user.email;}return session;}
 }
};
