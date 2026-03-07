import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailJustConfirmed, setEmailJustConfirmed] = useState(false);

  const clearEmailConfirmed = useCallback(() => {
    setEmailJustConfirmed(false);
  }, []);

  useEffect(() => {
    // 获取当前 session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // 监听 auth 状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: string, session: Session | null) => {
        setUser(session?.user ?? null);

        // 检测邮箱确认事件：用户点击确认链接后自动登录
        if (event === 'SIGNED_IN') {
          const hash = window.location.hash;
          if (hash.includes('type=signup') || hash.includes('type=email')) {
            setEmailJustConfirmed(true);
            window.history.replaceState(null, '', window.location.pathname);
          }
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  return { user, loading, signUp, signIn, signOut, emailJustConfirmed, clearEmailConfirmed };
}
