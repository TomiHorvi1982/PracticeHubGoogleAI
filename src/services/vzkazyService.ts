import { supabase } from './supabaseClient';
import { authService } from './authService';

/**
 * Vzkazy u písně.
 *
 * Kapela se u zkoušky domlouvá na věcech, které patří ke konkrétní písni —
 * „pozor na předěl", „zkusíme to o půltón níž". Do textu písně to nepatří
 * a v hlavě to do příště nevydrží.
 *
 * Čte se i zapisuje přímo přes Supabase: pravidla v databázi hlídají, že
 * vidí všichni a píše každý jen sám za sebe. Nové vzkazy chodí realtimem,
 * takže na zkoušce vidí ostatní, co kdo napsal, hned.
 */

export interface Vzkaz {
  id: string;
  song_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

/**
 * Barva podle autora.
 *
 * Odvozuje se z jeho id, ne z pořadí v seznamu — jinak by se barvy
 * přeházely pokaždé, když někdo přibude nebo odejde, a v historii by
 * najednou mluvil někdo jiný.
 */
const BARVY = [
  { text: 'text-[#FF9F0A]', pozadi: 'bg-[#FF9F0A]/10', okraj: 'border-[#FF9F0A]/30' },
  { text: 'text-[#30D158]', pozadi: 'bg-[#30D158]/10', okraj: 'border-[#30D158]/30' },
  { text: 'text-[#0A84FF]', pozadi: 'bg-[#0A84FF]/10', okraj: 'border-[#0A84FF]/30' },
  { text: 'text-[#FF453A]', pozadi: 'bg-[#FF453A]/10', okraj: 'border-[#FF453A]/30' },
  { text: 'text-[#BF5AF2]', pozadi: 'bg-[#BF5AF2]/10', okraj: 'border-[#BF5AF2]/30' },
  { text: 'text-[#5AC8FA]', pozadi: 'bg-[#5AC8FA]/10', okraj: 'border-[#5AC8FA]/30' },
];

export function barvaAutora(authorId: string): (typeof BARVY)[number] {
  let soucet = 0;
  for (let i = 0; i < authorId.length; i++) soucet = (soucet * 31 + authorId.charCodeAt(i)) >>> 0;
  return BARVY[soucet % BARVY.length];
}

export const vzkazyService = {
  async nacti(songId: string): Promise<Vzkaz[]> {
    const { data, error } = await supabase
      .from('song_messages')
      .select('*')
      .eq('song_id', songId)
      .order('created_at', { ascending: true })
      .limit(300);
    if (error) throw new Error(error.message);
    return (data || []) as Vzkaz[];
  },

  async posli(songId: string, text: string): Promise<void> {
    const s = authService.getCurrentSession();
    if (!s?.user?.id) throw new Error('Pro psaní vzkazů musíš být přihlášený.');
    const { error } = await supabase.from('song_messages').insert({
      song_id: songId,
      author_id: s.user.id,
      author_name: s.user.displayName || s.user.email || 'Někdo z kapely',
      body: text.trim().slice(0, 2000),
    });
    if (error) throw new Error(error.message);
  },

  async smaz(id: string): Promise<void> {
    const { error } = await supabase.from('song_messages').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  /**
   * Sleduje nové vzkazy u jedné písně.
   *
   * Kanál má v názvu id písně — dva otevřené vzkazníky u různých písní by
   * se jinak dělily o jeden a každý by dostával i cizí zprávy.
   */
  sleduj(songId: string, onZmena: () => void): () => void {
    const kanal = supabase
      .channel(`song-messages-${songId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'song_messages', filter: `song_id=eq.${songId}` },
        () => onZmena()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(kanal);
    };
  },
};
