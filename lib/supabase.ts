/**
 * TASH — Supabase Browser Client (Auth Only)
 *
 * This client uses the ANON KEY and is exposed to the browser.
 * It is used ONLY for authentication (signIn, signOut, session management).
 *
 * ALL database operations go through API routes using the service role key.
 * Do NOT use this client for .from() queries.
 *
 * The anon key is intentionally public — Supabase Auth requires it
 * to manage browser sessions. RLS policies ensure the anon key
 * has zero database access.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let projectRef = "default";
try {
  if (url) projectRef = new URL(url).hostname.split(".")[0];
} catch {}

const isBrowser = typeof window !== "undefined";

const cookieStorage = {
  getItem: (key: string) => {
    if (!isBrowser) return null;
    const match = document.cookie.match(new RegExp('(^| )' + key + '=([^;]+)'));
    if (match && match[2] === "chunked") {
      let value = "";
      let i = 0;
      while (true) {
        const chunkMatch = document.cookie.match(new RegExp('(^| )' + key + '\\.' + i + '=([^;]+)'));
        if (chunkMatch) {
          value += decodeURIComponent(chunkMatch[2]);
          i++;
        } else {
          break;
        }
      }
      return value || null;
    } else if (match) {
      return decodeURIComponent(match[2]);
    }
    return null;
  },
  setItem: (key: string, value: string) => {
    if (!isBrowser) return;
    const encoded = encodeURIComponent(value);
    const chunkSize = 3000;
    if (encoded.length > chunkSize) {
      const chunks = Math.ceil(encoded.length / chunkSize);
      for (let i = 0; i < chunks; i++) {
        const chunk = encoded.slice(i * chunkSize, (i + 1) * chunkSize);
        document.cookie = `${key}.${i}=${chunk}; path=/; max-age=31536000; SameSite=Lax`;
      }
      document.cookie = `${key}=chunked; path=/; max-age=31536000; SameSite=Lax`;
    } else {
      document.cookie = `${key}=${encoded}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `${key}.0=; path=/; max-age=0; SameSite=Lax`;
    }
  },
  removeItem: (key: string) => {
    if (!isBrowser) return;
    document.cookie = `${key}=; path=/; max-age=0; SameSite=Lax`;
    for (let i = 0; i < 5; i++) {
      document.cookie = `${key}.${i}=; path=/; max-age=0; SameSite=Lax`;
    }
  },
};

if (!url || !key) {
  if (isBrowser) {
    console.warn(
      "[tash] Supabase auth env vars not set. Auth will be disabled."
    );
  }
}

export const supabase = url && key
  ? createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: `sb-${projectRef}-auth-token`,
      storage: cookieStorage,
    }
  })
  : null;
