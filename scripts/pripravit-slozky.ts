// Vytvoří složku pro synchronizaci s appkou.
//
// Do každé podsložky položí `_co-sem-patri.txt` s jednou větou o tom, co
// do ní jde a kde se to v appce objeví. Za půl roku nikdo neví, jestli
// `stopy/` znamená rozdělené stopy k mixu, nebo stopy z nahrávání —
// a hádat se to nemá.
//
// Použití:
//   bun run scripts/pripravit-slozky.ts "/cesta/k/NeverLateSync"
//
// Nic nemaže a nic nepřepisuje: existující složky i popisky nechá být.

import fs from 'fs';
import path from 'path';

const KAM = process.argv[2];
if (!KAM) {
  console.error('Chybí cesta. Např.:');
  console.error('  bun run scripts/pripravit-slozky.ts "~/Library/Mobile Documents/com~apple~CloudDocs/NeverLateSync"');
  process.exit(1);
}

const ROOT = path.resolve(KAM.replace(/^~/, process.env.HOME || '~'));

const SLOZKY: { cesta: string; popis: string }[] = [
  {
    cesta: 'zpevnik',
    popis:
      'Texty s akordy: .txt, .chordpro, .cho, .crd\n' +
      'Objeví se jako skladba ve zpěvníku.\n' +
      'Název souboru ve tvaru "Interpret - Název.txt" appka rozebere na obojí.',
  },
  {
    cesta: 'noty',
    popis: 'Partitury a zpěvníky v .pdf\nObjeví se v okně Books u písně.',
  },
  {
    cesta: 'tabulatury',
    popis: 'Guitar Pro: .gp, .gp3, .gp4, .gp5, .gpx, .ptb, .tg\nObjeví se v okně Tabulatura.',
  },
  {
    cesta: 'midi',
    popis: 'MIDI soubory: .mid, .midi\nObjeví se v okně MIDI a ve Virtual Instruments.',
  },
  {
    cesta: 'samply/bici',
    popis:
      'Jednotlivé zvuky a krátké bicí samply: .wav, .mp3\n' +
      'Sekce Samples > Bicí.\n\n' +
      'Tempo, tóninu a takt appka čte z názvu souboru:\n' +
      '  funky-groove_120bpm_Am_4-4.wav\n' +
      'Co v názvu není, prostě zůstane prázdné — nic se nerozbije.',
  },
  { cesta: 'samply/basa', popis: 'Basové samply a riffy: .wav, .mp3\nSekce Samples > Basa.\nPojmenování stejné jako u bicích.' },
  { cesta: 'samply/kytara', popis: 'Kytarové samply a riffy: .wav, .mp3\nSekce Samples > Kytara.\nPojmenování stejné jako u bicích.' },
  { cesta: 'samply/vokaly', popis: 'Vokální samply: .wav, .mp3\nSekce Samples > Vokály.\nPojmenování stejné jako u bicích.' },
  {
    cesta: 'smycky',
    popis:
      'Celé smyčky, které hrají dokola: .wav, .mp3\n' +
      'Sekce Samples, řadí se podle tempa.\n' +
      'Tempo do názvu patří vždycky — bez něj se smyčka nedá srovnat s ostatními.',
  },
  {
    cesta: 'stopy',
    popis:
      'Rozdělené stopy jedné písně: .wav, .mp3\n' +
      'Mixážní pult, kde se věší na fadery.\n' +
      'Pojmenujte podle nástroje: "Pisen - kytara.wav", "Pisen - basa.wav".',
  },
  { cesta: 'nahravky', popis: 'Nahrávky ze zkoušek a demo: .wav, .mp3, .flac, .m4a, .ogg\nKnihovna, sekce Nahrávky.' },
  { cesta: 'fotky', popis: 'Obrázky, schémata a fotky tabule: .jpg, .png, .webp, .gif\nOkno Obrázky u písně.' },
  {
    cesta: 'bici-sady',
    popis:
      'Každá sada bicích má vlastní podsložku, např. "bici-sady/Moje sada/".\n' +
      'Uvnitř jsou vzorky pojmenované podle padu: kick.wav, snare.wav, hihat.wav.\n' +
      'Víc variant téhož padu: snare_hard_rr1.wav, snare_hard_rr2.wav',
  },
];

fs.mkdirSync(ROOT, { recursive: true });

let vytvoreno = 0;
let bylo = 0;

for (const s of SLOZKY) {
  const cesta = path.join(ROOT, s.cesta);
  if (fs.existsSync(cesta)) bylo++;
  else {
    fs.mkdirSync(cesta, { recursive: true });
    vytvoreno++;
  }

  const popisek = path.join(cesta, '_co-sem-patri.txt');
  if (!fs.existsSync(popisek)) fs.writeFileSync(popisek, s.popis + '\n', 'utf8');
}

const prehled = path.join(ROOT, '_jak-to-funguje.txt');
if (!fs.existsSync(prehled)) {
  fs.writeFileSync(
    prehled,
    [
      'NeverLate Studio — složka pro nahrávání do knihovny',
      '',
      'Soubory sem prostě zkopírujte. Do appky se dostanou až po spuštění:',
      '',
      '  bun run scripts/sync-folder.ts "' + ROOT + '"',
      '',
      'Není to hlídaná složka — synchronizace se pouští ručně, aby se',
      'nenahrávalo něco rozpracovaného.',
      '',
      'Skript se dá pustit opakovaně: co se nezměnilo, přeskočí; co jste',
      'upravili, nahradí; a nikdy nic nemaže. Smazání souboru odsud tedy',
      'z knihovny nic neodstraní.',
      '',
      'Jen část: --only zpevnik,noty',
      'Nanečisto:  --check',
      '',
      'Co do které složky patří, říká soubor _co-sem-patri.txt uvnitř.',
    ].join('\n'),
    'utf8'
  );
}

console.log(`Složka: ${ROOT}`);
console.log(`Vytvořeno ${vytvoreno} složek, ${bylo} už existovalo.`);
console.log('\nStruktura:');
for (const s of SLOZKY) console.log(`  ${s.cesta}/`);
console.log('\nSoubory nakopírujte a pak spusťte:');
console.log(`  bun run scripts/sync-folder.ts "${ROOT}"`);
