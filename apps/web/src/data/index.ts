import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LocalRepository } from './local';
import type { Repository } from './repository';
import { SupabaseRepository } from './supabase';

export type Mode = 'local' | 'cloud';

export interface AuthUser {
  id: string;
  name: string;
}

export interface Auth {
  getSession(): Promise<AuthUser | null>;
  /** Cloud only: sends a magic link. */
  signInWithEmail(email: string): Promise<void>;
  signOut(): Promise<void>;
  /** Returns an unsubscribe function. */
  onAuthChange(callback: (user: AuthUser | null) => void): () => void;
}

const url: string | undefined = import.meta.env.VITE_SUPABASE_URL;
const anonKey: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (Boolean(url) !== Boolean(anonKey)) {
  console.warn('Only one of VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY is set; falling back to local mode.');
}
const client = url && anonKey ? createClient(url, anonKey) : null;

const LOCAL_USER: AuthUser = { id: 'local', name: 'Tom Reyes' };

const localAuth: Auth = {
  getSession: async () => LOCAL_USER,
  signInWithEmail: async () => undefined,
  signOut: async () => undefined,
  onAuthChange: () => () => undefined,
};

function cloudAuth(supabase: SupabaseClient): Auth {
  const toUser = (user: { id: string; email?: string } | undefined): AuthUser | null =>
    user ? { id: user.id, name: user.email ?? 'Account' } : null;

  return {
    async getSession() {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return toUser(data.session?.user);
    },
    async signInWithEmail(email) {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
    },
    async signOut() {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    onAuthChange(callback) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) =>
        callback(toUser(session?.user)),
      );
      return () => data.subscription.unsubscribe();
    },
  };
}

export const mode: Mode = client ? 'cloud' : 'local';
export const repo: Repository = client ? new SupabaseRepository(client) : new LocalRepository();
export const auth: Auth = client ? cloudAuth(client) : localAuth;
