import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const admin = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // Get all distinct categories using offset pagination
  const allCategories: Set<string> = new Set();
  let offset = 0;
  const limit = 1000;
  
  while (true) {
    const { data, error, count } = await admin
      .from('assets')
      .select('category')
      .range(offset, offset + limit - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.category) allCategories.add(row.category);
    }
    if ((count || data.length) < limit) break;
    offset += limit;
  }
  
  console.log('Všechny kategorie:', [...allCategories]);
  console.log('Celkem:', allCategories.size);
}
main().catch(e => { console.error(e); process.exit(1); });
