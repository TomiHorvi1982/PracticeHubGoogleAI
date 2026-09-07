import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const admin = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // List all distinct categories
  // supabase-js `.distinct()` nemá — unikáty se udělají až tady.
  const { data: radky } = await admin.from('assets').select('category');
  const cats = [...new Set((radky || []).map((r: any) => r.category))].map((category) => ({ category }));
  console.log('Všechny kategorie v databázi:');
  const totalByCat: Record<string, number> = {};
  const nullByCat: Record<string, number> = {};
  for (const c of cats || []) {
    const cat = c.category || 'unknown';
    const { count } = await admin.from('assets').select('*', { count: 'exact', head: true }).eq('category', cat);
    const { count: nullCount } = await admin.from('assets').select('*', { count: 'exact', head: true }).eq('category', cat).is('subcategory', null);
    totalByCat[cat] = count || 0;
    nullByCat[cat] = nullCount || 0;
  }
  for (const [cat, cnt] of Object.entries(totalByCat).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: celkem=${cnt}, null=${nullByCat[cat]}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
