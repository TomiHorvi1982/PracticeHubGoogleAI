import { Song, SongAttachment } from '../types';
import { supabase } from './supabaseClient';
import { authService } from './authService';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { fileUrlService, FileRef } from './fileUrlService';

type SongsCallback = (songs: Song[]) => void;

/**
 * `songs` table row shape (see docs/migration Phase 2/9). Core columns hold
 * what every song has; everything else (chords/lyrics content, key, tuning,
 * attachments, locking, etc.) lives in `metadata` — the same rich Song
 * object this app has always used, just stored in Postgres jsonb instead of
 * a Firestore document.
 */
interface SongRow {
  id: string;
  title: string;
  artist: string | null;
  owner_id: string | null;
  status: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

const CORE_FIELDS = new Set(['id', 'title', 'artist', 'createdAt', 'updatedAt']);

function rowToSong(row: SongRow): Song {
  return {
    ...(row.metadata as Partial<Song>),
    id: row.id,
    title: row.title,
    artist: row.artist || '',
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  } as Song;
}

/**
 * Attachments imported in bulk keep their bytes in Storage and carry a
 * `storagePath` instead of an inline base64 `dataUrl`, so the songbook fetch
 * doesn't drag megabytes of tabs along with it. The UI only knows about
 * `dataUrl`, so hand it a signed URL — one batched call for every attachment
 * in the whole songbook rather than one per file.
 */
async function resolveStoredAttachments(songs: Song[]): Promise<void> {
  const byBucket = new Map<string, Set<string>>();
  for (const song of songs) {
    for (const att of song.attachments || []) {
      if (!att.storagePath || att.dataUrl) continue;
      const bucket = att.storageBucket || 'assets';
      if (!byBucket.has(bucket)) byBucket.set(bucket, new Set());
      byBucket.get(bucket)!.add(att.storagePath);
    }
  }
  if (byBucket.size === 0) return;

  // Podepisuje server: soubory jsou v R2 a podpis k nim vyžaduje tajný
  // klíč, který v prohlížeči být nesmí. Jde to jednou dávkou za celý
  // zpěvník, ne dotaz na přílohu.
  const refs: FileRef[] = [];
  for (const [bucket, paths] of byBucket) {
    for (const p of paths) refs.push({ bucket, path: p });
  }
  const urls = await fileUrlService.getMany(refs);

  for (const song of songs) {
    if (!song.attachments) continue;
    song.attachments = song.attachments.map((att) => {
      if (!att.storagePath || att.dataUrl) return att;
      const url = urls.get(`${att.storageBucket || 'assets'}/${att.storagePath}`);
      return url ? { ...att, dataUrl: url } : att;
    });
  }
}

function songToRowUpdate(song: Song) {
  const metadata: Record<string, any> = {};
  for (const [key, value] of Object.entries(song)) {
    if (!CORE_FIELDS.has(key)) metadata[key] = value;
  }
  // Signed URLs resolved at load time expire; storing one would leave a dead
  // link behind. The `storagePath` is the durable reference — keep only that.
  if (Array.isArray(metadata.attachments)) {
    metadata.attachments = (metadata.attachments as SongAttachment[]).map((att) =>
      att.storagePath ? { ...att, dataUrl: '' } : att
    );
  }
  return { title: song.title, artist: song.artist || null, metadata };
}

/**
 * Shared, collaborative songbook: songs are global (owner_id NULL) by
 * default — any signed-in band member can add/edit them, matching the
 * app's real behavior (this is one shared songbook, not per-user private
 * songs). RLS (`songs_insert_own_or_shared` etc.) enforces this the same
 * way regardless of whether the write comes from here or anywhere else.
 */
/** Porovnání písní odolné vůči diakritice, velkým písmenům a interpunkci. */
export function klicPisne(artist: string | undefined | null, title: string): string {
  const n = (x: string) =>
    String(x || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  return `${n(artist || '')}|${n(title)}`;
}

/** Sjednocení pole bez duplicit podle zadaného klíče. */
function spojPole<T>(a: T[] | undefined, b: T[] | undefined, klic: (x: T) => string): T[] {
  const out: T[] = [];
  const videne = new Set<string>();
  for (const x of [...(a || []), ...(b || [])]) {
    const k = klic(x);
    if (videne.has(k)) continue;
    videne.add(k);
    out.push(x);
  }
  return out;
}

/**
 * Přilije novou píseň do té, která ve zpěvníku už je.
 *
 * Zachovává si totožnost té stávající — odkazy na ni z playlistů a modulů
 * musí dál platit. Z textů vítězí delší; kratší bývá zbytek po importu,
 * který se nepovedl.
 */
export function slucPisne(stavajici: Song, nova: Song): Song {
  return {
    ...stavajici,
    content:
      (nova.content || '').length > (stavajici.content || '').length ? nova.content : stavajici.content,
    key: stavajici.key || nova.key,
    bpm: stavajici.bpm || nova.bpm,
    tuning: stavajici.tuning || nova.tuning,
    capo: stavajici.capo ?? nova.capo,
    attachments: spojPole(stavajici.attachments, nova.attachments, (x: any) => x.storagePath || x.name),
    youtubeVideos: spojPole(stavajici.youtubeVideos, nova.youtubeVideos, (x: any) => x.id || x.url),
    links: spojPole(stavajici.links, nova.links, (x: any) => x.url),
    images: spojPole(stavajici.images, nova.images, (x: any) => x.id || x.name),
    chordsUsed: spojPole(stavajici.chordsUsed, nova.chordsUsed, (x) => x),
    updatedAt: Date.now(),
  };
}

class SongDatabaseService {
  private songs: Song[] = [];
  private subscribers: Set<SongsCallback> = new Set();
  private realtimeChannel: RealtimeChannel | null = null;

  constructor() {
    this.init();
  }

  public subscribe(cb: SongsCallback): () => void {
    this.subscribers.add(cb);
    cb(this.songs);
    return () => this.subscribers.delete(cb);
  }

  private notify() {
    for (const sub of this.subscribers) {
      try {
        sub(this.songs);
      } catch (e) {
        console.error('Error in songDatabase subscriber', e);
      }
    }
  }

  public getSongs(): Song[] {
    return this.songs;
  }

  private async fetchAll() {
    const { data, error } = await supabase
      .from('songs')
      .select('*')
      .eq('status', 'active')
      .order('updated_at', { ascending: false });

    if (error) {
      console.warn('[songDatabaseService] Failed to load songs:', error.message);
      return;
    }
    const songs = (data as SongRow[]).map(rowToSong);
    await resolveStoredAttachments(songs);
    this.songs = songs;
    this.notify();
  }

  public async init() {
    await this.fetchAll();

    // Realtime: any insert/update/delete on `songs` (from this tab, another
    // tab, or another band member) re-syncs everyone's local list.
    //
    // Kanál se zakládá jen jednou. `supabase.channel()` vrací pro totéž
    // jméno tentýž kanál, a na už přihlášený kanál se `.on()` navěsit nedá —
    // druhé volání skončí chybou a živá synchronizace se nenaváže vůbec.
    //
    // Nestačí hlídat vlastní pole: kanál si drží klient Supabase, takže
    // přežije i to, když se služba vytvoří znovu. Starý se proto nejdřív
    // odstraní.
    if (this.realtimeChannel) return;

    const stary = supabase.getChannels().find((k) => k.topic === 'realtime:songs-changes');
    if (stary) void supabase.removeChannel(stary);

    this.realtimeChannel = supabase
      .channel('songs-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'songs' }, () => {
        this.fetchAll();
      })
      .subscribe();
  }

  public async saveSong(song: Song): Promise<Song> {
    if (!authService.isAuthenticated()) {
      throw new Error('Pro úpravu zpěvníku musíte být přihlášeni.');
    }

    const existing =
      this.songs.find((s) => s.id === song.id) ||
      // Táž píseň přidaná podruhé z jiné strany — z YouTube, z importu,
      // ze synchronizace složky — dřív založila nový řádek a ve zpěvníku
      // pak byla dvakrát. Metallica se takhle rozmnožila na čtyři kopie.
      // Když se najde podle názvu a interpreta, doplní se do ní, co nese
      // ta nová, místo aby vznikl další záznam.
      this.songs.find((s) => s.id !== song.id && klicPisne(s.artist, s.title) === klicPisne(song.artist, song.title));

    // Do nalezené písně se přilévá, nepřepisuje se. Nový import obvykle
    // nese jen část toho, co u písně už je, a přepis by zbytek smazal.
    if (existing && existing.id !== song.id) {
      song = slucPisne(existing, song);
    }

    const update = songToRowUpdate(song);

    if (existing) {
      const { data, error } = await supabase.from('songs').update(update).eq('id', existing.id).select().single();
      if (error) throw new Error(error.message);
      const updated = rowToSong(data as SongRow);
      await resolveStoredAttachments([updated]);
      this.songs = this.songs.map((s) => (s.id === updated.id ? updated : s));
      this.notify();
      return updated;
    }

    // Identitu nechává na databázi, pokud ji appka vyrobila po svém.
    // Nové písně dostávají `song_<čas>_<náhoda>` a zástupná píseň na
    // prázdném zpěvníku má id `sample`; sloupec je ale `uuid`, takže by
    // takový zápis skončil chybou „invalid input syntax for type uuid"
    // a píseň by se tiše neuložila.
    const jeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(song.id);
    const { data, error } = await supabase
      .from('songs')
      .insert({
        ...(jeUuid ? { id: song.id } : {}),
        ...update,
        owner_id: null,
        source_type: 'library',
        status: 'active',
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    const created = rowToSong(data as SongRow);
    await resolveStoredAttachments([created]);
    this.songs = [created, ...this.songs];
    this.notify();
    return created;
  }

  public async deleteSong(songId: string) {
    if (!authService.isAuthenticated()) {
      console.warn('[songDatabaseService] Cannot delete while signed out.');
      return;
    }
    const { error } = await supabase.from('songs').delete().eq('id', songId);
    if (error) {
      console.warn('[songDatabaseService] Failed to delete song:', error.message);
      return;
    }
    this.songs = this.songs.filter((s) => s.id !== songId);
    this.notify();
  }
}

export const songDatabaseService = new SongDatabaseService();
