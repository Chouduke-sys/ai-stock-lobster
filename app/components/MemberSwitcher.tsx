"use client";
import {signOut} from "next-auth/react";
export default function MemberSwitcher({name}:{name:string}){
 return <details className="pro-member-switcher"><summary>會員：{name} <span aria-hidden="true">⌄</span></summary><nav aria-label="會員切換"><a href="/">市場總覽</a><a href="/pro" aria-current="page">研究工作台</a><button type="button" onClick={()=>{void signOut({callbackUrl:"/"});}}>登出會員</button></nav></details>;
}
