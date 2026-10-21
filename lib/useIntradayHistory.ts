"use client";
import {useEffect,useState} from "react";

export type MinutePoint={time:string;price:number;date:string};
type MinuteHistory={symbol:string;points:MinutePoint[];source:string};

export function useIntradayHistory(symbol:string):MinuteHistory {
  const [history,setHistory]=useState<MinuteHistory>({symbol:"",points:[],source:""});
  useEffect(()=>{
    const controller=new AbortController();
    async function load(){
      try{
        const response=await fetch(`/api/stocks/${symbol}/intraday`,{signal:controller.signal});
        if(!response.ok)return;
        const data=await response.json();
        if(controller.signal.aborted||data.status!=="ok"||!Array.isArray(data.points))return;
        setHistory({symbol,points:data.points.filter((p:MinutePoint)=>typeof p.time==="string"&&Number.isFinite(p.price)),source:data.source??"分鐘歷史資料"});
      }catch{}
    }
    void load();
    const timer=window.setInterval(()=>{void load();},60000);
    return ()=>{controller.abort();window.clearInterval(timer);};
  },[symbol]);
  return history.symbol===symbol?history:{symbol,points:[],source:""};
}
