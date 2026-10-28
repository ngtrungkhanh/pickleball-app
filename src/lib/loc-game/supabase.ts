import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

const DEFAULT_SUPABASE_URL = 'https://xjuokynhyzxpsccwqiik.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_H0T5OLgDPGxlRrKXcB5FnQ_TB-ZxpXG';

/**
 * Chuẩn hóa URL Supabase (loại bỏ đuôi /rest/v1 hoặc dấu gạch chéo thừa)
 */
function normalizeSupabaseUrl(url: string | null): string | null {
  if (!url) return null;
  let cleaned = url.trim();
  cleaned = cleaned.replace(/\/rest\/v1\/?$/i, '');
  cleaned = cleaned.replace(/\/+$/, '');
  return cleaned;
}

/**
 * Lấy Supabase URL từ env, localStorage hoặc fallback mặc định của ứng dụng
 */
export function getSupabaseConfig(): { url: string | null; anonKey: string | null } {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  let anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

  if (typeof window !== 'undefined') {
    const customUrl = localStorage.getItem('loc_supabase_url');
    const customKey = localStorage.getItem('loc_supabase_key');
    if (customUrl && customKey) {
      url = customUrl;
      anonKey = customKey;
    }
  }

  return { url: normalizeSupabaseUrl(url), anonKey: anonKey ? anonKey.trim() : null };
}

/**
 * Lấy Supabase Client singleton
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const { url, anonKey } = getSupabaseConfig();

  if (url && anonKey) {
    supabaseInstance = createClient(url, anonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    return supabaseInstance;
  }

  return null;
}
