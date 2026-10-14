import { createContext,useContext,useEffect,useState,type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { get } from '../lib/api';
import type { Role } from '../types';

type AuthValue={session:Session|null;roles:Role[];loading:boolean;refresh:()=>Promise<void>};
const AuthContext=createContext<AuthValue>({session:null,roles:[],loading:true,refresh:async()=>{}});
export function AuthProvider({children}:{children:ReactNode}){const[session,setSession]=useState<Session|null>(null);const[roles,setRoles]=useState<Role[]>([]);const[loading,setLoading]=useState(true);const refresh=async()=>{const{data}=await supabase.auth.getSession();setSession(data.session);if(data.session){try{const me=await get<{ok:true;roles:Role[]}>('me');setRoles(me.roles)}catch{setRoles([])}}else setRoles([]);setLoading(false)};useEffect(()=>{void refresh();const{data}=supabase.auth.onAuthStateChange(()=>void refresh());return()=>data.subscription.unsubscribe()},[]);return <AuthContext.Provider value={{session,roles,loading,refresh}}>{children}</AuthContext.Provider>}
export const useAuth=()=>useContext(AuthContext);
