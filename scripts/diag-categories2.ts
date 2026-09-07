import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const admin = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // Get all assets with category
  const { data: assets, error } = await admin.from('assets').select('category, subcategory');
  if (error) throw error;
  
  // Count by category + subcategory
  const totalByCat: Record<string, number> = {};
  const nullSubByCat: Record<string, number> = {};
  const entries: {category: string; subcategory: string | null}[] = (assets || []);
  
  for (const a of entries) {
    const cat = a.category || 'unknown';
    const sub = a.subcategory;
    
    if (!totalByCat[cat]) totalByCat[cat] = 0;
    totalByCat[cat]++;
    
    if (sub === null) {
      if (!nullSubByCat[cat]) nullSubByCat[cat] = 0;
      nullSubByCat[cat]++;
    }
  }
  
  console.log('Všechny kategorie v databázi:');
  for (const [cat, cnt] of Object.entries(totalByCat).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: celkem=${cnt}, subcategory=NULL=${nullSubByCat[cat] || 0}`);
  }
  
  // Count total
  const total = entries.length;
  const nullTotal = entries.filter(a => a.subcategory === null).length;
  console.log(`\nCelkem: ${total}, NULL subcategory: ${nullTotal}`);
}
main().catch(e => { console.error(e); process.exit(1); });
