import { Song, SongAttachment } from '../types';
import { authService } from './authService';
import { nazevSouboru, souboru } from './nazvySouboru';

/**
 * Stažení vlastních příloh z knihovny do počítače.
 *
 * Soubory, které do aplikace někdo nahrál, z ní dosud nešly dostat ven —
 * daly se otevřít v přehrávači, ale ne uložit zpátky na disk. To je u
 * vlastních dat mezera, ne bezpečnostní opatření.
 *
 * Bajty leží podle původu buď v úložišti, nebo přímo u přílohy; volající
 * to řešit nemusí.
 */

async function bajtyPrilohy(att: SongAttachment): Promise<Blob> {
  if (att.storageBucket && att.storagePath) {
    const token = authService.getCurrentSession()?.token;
    const odpoved = await fetch(
      `/api/files/content?bucket=${encodeURIComponent(att.storageBucket)}&path=${encodeURIComponent(att.storagePath)}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    );
    if (!odpoved.ok) {
      const chyba = await odpoved.json().catch(() => ({}));
      throw new Error(chyba?.error || `Soubor se nepodařilo načíst (HTTP ${odpoved.status}).`);
    }
    return odpoved.blob();
  }

  if (att.dataUrl) {
    // Datová adresa i odkaz na objekt jdou přečíst stejně.
    const odpoved = await fetch(att.dataUrl);
    if (!odpoved.ok) throw new Error('Soubor se nepodařilo přečíst.');
    return odpoved.blob();
  }

  throw new Error('Příloha nemá kde vzít data.');
}

/**
 * Podstrčí prohlížeči soubor ke stažení.
 *
 * Odkaz na objekt se hned uklízí — bez toho drží data v paměti, dokud
 * se stránka nezavře, což u nahrávek dělá desítky megabajtů.
 */
function uloz(blob: Blob, nazev: string): void {
  const url = URL.createObjectURL(blob);
  const odkaz = document.createElement('a');
  odkaz.href = url;
  odkaz.download = nazev;
  document.body.appendChild(odkaz);
  odkaz.click();
  odkaz.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function stahniPrilohu(att: SongAttachment): Promise<void> {
  uloz(await bajtyPrilohy(att), nazevSouboru(att));
}

export { nazevSouboru, souboru };

export interface VysledekStazeni {
  stazeno: number;
  chyby: string[];
}

/**
 * Stáhne všechny přílohy písně.
 *
 * Jde jedna po druhé s krátkou pauzou: prohlížeče spuštění několika
 * stahování v jednom okamžiku berou jako vyskakovací okna a tiše je
 * zahodí. Neúspěšná příloha zbytek nezastaví — sepíše se na konec.
 */
export async function stahniPrilohyPisne(song: Song): Promise<VysledekStazeni> {
  const prilohy = song.attachments || [];
  const chyby: string[] = [];
  let stazeno = 0;

  for (const att of prilohy) {
    try {
      await stahniPrilohu(att);
      stazeno += 1;
      if (prilohy.length > 1) await new Promise((r) => setTimeout(r, 400));
    } catch (e: any) {
      chyby.push(`${att.name}: ${e?.message || 'nepodařilo se'}`);
    }
  }

  return { stazeno, chyby };
}
