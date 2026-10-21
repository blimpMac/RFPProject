import { useEffect,useRef } from 'react';

export function useAutoRefresh(refresh:()=>void|Promise<void>,intervalMs=15_000){
  const refreshRef=useRef(refresh);
  useEffect(()=>{refreshRef.current=refresh},[refresh]);
  useEffect(()=>{
    const run=()=>{if(document.visibilityState==='visible')void refreshRef.current()};
    const timer=window.setInterval(run,intervalMs);
    window.addEventListener('focus',run);
    document.addEventListener('visibilitychange',run);
    return()=>{
      window.clearInterval(timer);
      window.removeEventListener('focus',run);
      document.removeEventListener('visibilitychange',run);
    };
  },[intervalMs]);
}
