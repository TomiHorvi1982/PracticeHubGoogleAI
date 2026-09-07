import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const admin = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // Get samples by category
  const cats = ['midi', 'drum_kit_sample', 'guitar_pro', 'stem_mix', 'pdf', 'my_songs', 'soundfont'];
  for (const cat of cats) {
    const { data: sample } = await admin
      .from('assets')
      .select('id, name, original_filename, category, subcategory')
      .eq('category', cat)
      .limit(8);
    console.log(`\n=== ${cat} ===`);
    for (const s of sample || []) {
      console.log(`  id=${s.id.slice(0, 8)} name="${s.name}" orig="${s.original_filename}"`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
