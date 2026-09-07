import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const admin = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // Get total count
  const { count: total } = await admin.from('assets').select('*', { count: 'exact', head: true });
  console.log(`Total count: ${total}`);
  
  // Get all assets with category in batches
  let allAssets: any[] = [];
  let offset = 0;
  const batchSize = 1000;
  
  while (true) {
    const { data: assets, error } = await admin
      .from('assets')
      .select('category, subcategory')
      .range(offset, offset + batchSize - 1);
    if (error) throw error;
    if (!assets || assets.length === 0) break;
    allAssets.push(...assets);
    console.log(`  Fetched ${assets.length} rows (offset ${offset})`);
    offset += batchSize;
    if (assets.length < batchSize) break;
  }
  
  console.log(`Total fetched: ${allAssets.length}`);
  
  // Count by category + subcategory
  const totalByCat: Record<string, number> = {};
  const nullSubByCat: Record<string, number> = {};
  
  for (const a of allAssets) {
    const cat = a.category || 'unknown';
    const sub = a.subcategory;
    
    if (!totalByCat[cat]) totalByCat[cat] = 0;
    totalByCat[cat]++;
    
    if (sub === null) {
      if (!nullSubByCat[cat]) nullSubByCat[cat] = 0;
      nullSubByCat[cat]++;
    }
  }
  
  console.log('\nVšechny kategorie v databázi:');
  for (const [cat, cnt] of Object.entries(totalByCat).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: celkem=${cnt}, subcategory=NULL=${nullSubByCat[cat] || 0}`);
  }
  
  const nullTotal = allAssets.filter(a => a.subcategory === null).length;
  console.log(`\nCelkem: ${allAssets.length}, NULL subcategory: ${nullTotal}`);
}
main().catch(e => { console.error(e); process.exit(1); });
