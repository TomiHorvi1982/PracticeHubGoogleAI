import { Song, SongAttachment } from '../../types';
import { assetLibraryService, LibraryAsset } from '../../services/assetLibraryService';
import { REGISTR_PODLE_ID, prijimaSoubor } from './moduleRegistry';

/**
 * Připojení souboru ke skladbě z prázdného modulu.
 *
 * Bajty jdou do úložiště, ne do metadat skladby. Vkládat je do `dataUrl` by
 * bylo o dva řádky kratší, jenže zpěvník se z metadat načítá celý — pár
 * příloh v base64 by z jednoho otevření udělalo stahování megabajtů. Zpátky
 * se ukládá jen odkaz.
 */

/** Do jaké kategorie knihovny soubor patří — podle modulu, kam se vkládá. */
const KATEGORIE: Record<string, { category: string; assetType: LibraryAsset['asset_type'] }> = {
  tabs: { category: 'guitar_pro', assetType: 'guitar_pro' },
  notes: { category: 'pdf', assetType: 'pdf' },
  midi: { category: 'midi', assetType: 'midi' },
  images: { category: 'images', assetType: 'image' },
  stems_mixer: { category: 'backing_tracks', assetType: 'audio' },
  text_chords: { category: 'pdf', assetType: 'pdf' },
};

export class NepodporovanySoubor extends Error {}

/**
 * Nahraje soubor a vrátí skladbu s připojenou přílohou.
 *
 * Skladbu jen vrací, neukládá — o zápis se stará volající, který jediný ví,
 * jestli mezitím nezměnil něco jiného.
 */
export async function pripojSouborKeSkladbe(
  song: Song,
  modulId: string,
  file: File
): Promise<Song> {
  if (!prijimaSoubor(modulId, file.name)) {
    const prijima = REGISTR_PODLE_ID[modulId]?.prijima || [];
    throw new NepodporovanySoubor(
      prijima.length
        ? `Sem patří ${prijima.join(', ')} — „${file.name}" ne.`
        : 'Do tohohle modulu se soubory nevkládají.'
    );
  }

  const kam = KATEGORIE[modulId];
  if (!kam) throw new NepodporovanySoubor('Do tohohle modulu se soubory nevkládají.');

  const asset = await assetLibraryService.upload(file, kam.category, kam.assetType, 'global');

  const priloha: SongAttachment = {
    id: asset.id,
    name: asset.name,
    type: (REGISTR_PODLE_ID[modulId]?.typPrilohy || 'txt') as SongAttachment['type'],
    // Vyplní se až při otevření skladby, podepsaným odkazem z úložiště.
    dataUrl: '',
    storageBucket: asset.storage_bucket,
    storagePath: asset.storage_path,
    size: Number(asset.size_bytes || file.size),
    uploadedAt: Date.now(),
  };

  return { ...song, attachments: [...(song.attachments || []), priloha], updatedAt: Date.now() };
}
