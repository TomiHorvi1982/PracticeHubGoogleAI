import React, { useMemo, useState } from 'react';
import { Printer, RefreshCw } from 'lucide-react';
import {
  POJMY_STUPNE, TAJENKY_STUPNE, bingoKarta, kvintovyKruh, nahodaZeSemene,
  osmismerka, spojovacka,
} from '../../services/pracovniListy';
import { STUPNE, nazevStupne } from '../../services/osnova';

/**
 * Pracovní listy k tisku.
 *
 * Tiskne se z prohlížeče — bez knihovny na PDF. Ta by přidala megabajty
 * kvůli tomu, co prohlížeč umí sám, a hlavně: tisk z prohlížeče vidí
 * učitel dopředu v náhledu a může si vybrat papír, měřítko i tiskárnu.
 *
 * List je vždycky černobílý na bílém. Aplikace je tmavá, ale vytisknout
 * tmavé pozadí znamená prázdnou kazetu po třech listech.
 */

type Druh = 'osmismerka' | 'spojovacka' | 'hmatnik' | 'tabulatura' | 'kruh' | 'bingo';

const DRUHY: { id: Druh; nazev: string; popis: string }[] = [
  { id: 'osmismerka', nazev: 'Osmisměrka', popis: 'Pojmy podle stupně, zbylá písmena dají tajenku.' },
  { id: 'spojovacka', nazev: 'Spojovačka', popis: 'Akordová značka vlevo, jméno vpravo, čárou k sobě.' },
  { id: 'hmatnik', nazev: 'Prázdný hmatník', popis: 'Šest strun, dvanáct pražců. Dokresluje se, kde co leží.' },
  { id: 'tabulatura', nazev: 'Tabulatura a osnova', popis: 'Šest linek na vlastní riff, pět na noty.' },
  { id: 'kruh', nazev: 'Kvintový kruh', popis: 'Prázdné kolo, dvanáct políček k doplnění.' },
  { id: 'bingo', nazev: 'Notové bingo', popis: 'Karta s tóny. Ty hraješ, dítě škrtá.' },
];

const AKORDY: [string, string][] = [
  ['Em', 'e moll'], ['Am', 'a moll'], ['C', 'C dur'], ['G', 'G dur'],
  ['D', 'D dur'], ['A7', 'A dur se septimou'], ['F', 'F dur (barré)'], ['Dm', 'd moll'],
];

const TONY_BINGA = ['C', 'D', 'E', 'F', 'G', 'A', 'H', 'c', 'd', 'e', 'f', 'g'];

export const PracovniListy: React.FC = () => {
  const [stupen, setStupen] = useState(1);
  const [druh, setDruh] = useState<Druh>('osmismerka');
  /** Semínko drží podobu listu. Změnou se vygeneruje jiný, stejným se týž. */
  const [semeno, setSemeno] = useState(1);

  const nahoda = () => nahodaZeSemene(semeno * 7919 + stupen * 31);

  const os = useMemo(
    () => osmismerka(POJMY_STUPNE[stupen] || [], TAJENKY_STUPNE[stupen] || '', nahoda()),
    [stupen, semeno],
  );
  const sp = useMemo(() => spojovacka(AKORDY.slice(0, 6), nahoda()), [stupen, semeno]);
  const bingo = useMemo(() => bingoKarta(TONY_BINGA, nahoda()), [stupen, semeno]);
  const kruh = useMemo(() => kvintovyKruh(), []);

  const zvolenyDruh = DRUHY.find((d) => d.id === druh)!;

  return (
    <div className="space-y-3">
      {/* Ovládání se netiskne — na papíře nemá co dělat. */}
      <div className="netisknout space-y-3">
        <div>
          <h3 className="nadpis-panelu">Pracovní listy</h3>
          <p className="text-drobne text-pismo-tlum max-w-[70ch]">
            Vyber stupeň a list, pak dej Vytisknout. Pojmy se berou z osnovy,
            takže list vždycky sedí na to, co se dítě zrovna učí.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="stitek-pole mr-1">stupeň</span>
          {STUPNE.map((s) => (
            <button
              key={s.cislo}
              onClick={() => setStupen(s.cislo)}
              title={s.nazev}
              className={`px-2.5 py-1.5 rounded-prvek text-drobne font-bold cursor-pointer ${
                stupen === s.cislo ? 'zlata-plocha' : 'bg-plocha-3 text-pismo-tlum hover:text-pismo'
              }`}
            >
              {s.cislo}.
            </button>
          ))}
          <span className="text-drobne text-pismo-tlum ml-1">{nazevStupne(stupen)}</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {DRUHY.map((d) => (
            <button
              key={d.id}
              onClick={() => setDruh(d.id)}
              title={d.popis}
              className={`px-2.5 py-1.5 rounded-prvek text-drobne font-bold cursor-pointer ${
                druh === d.id ? 'bg-znacka-tlum text-znacka ring-1 ring-znacka-okraj' : 'bg-plocha-3 text-pismo-tlum hover:text-pismo'
              }`}
            >
              {d.nazev}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-prvek text-drobne zlata-plocha cursor-pointer"
          >
            <Printer className="w-4 h-4" />Vytisknout
          </button>
          <button
            onClick={() => setSemeno((s) => s + 1)}
            title="Vygenerovat jinou podobu téhož listu"
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-prvek text-drobne font-bold bg-plocha-3 text-pismo-tlum hover:text-pismo cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />Jiná varianta
          </button>
          <span className="text-stitek text-pismo-slaby">{zvolenyDruh.popis}</span>
        </div>
      </div>

      {/* Samotný list. Bílý papír i v tmavé aplikaci — náhled má vypadat
          jako výsledek. */}
      <div className="list-papir">
        <div className="list-hlavicka">
          <strong>{zvolenyDruh.nazev}</strong>
          <span>{stupen}. stupeň — {nazevStupne(stupen)}</span>
          <span className="list-jmeno">Jméno: ______________________</span>
        </div>

        {druh === 'osmismerka' && (
          <>
            <p className="list-zadani">
              Najdi a škrtni všechna slova. Zbylá písmena po řádcích dají tajenku.
            </p>
            <table className="list-mrizka">
              <tbody>
                {os.mrizka.map((radek, r) => (
                  <tr key={r}>
                    {radek.map((p, c) => <td key={c}>{p}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="list-slova">{os.slova.join(' · ')}</p>
            <p className="list-zadani">
              Tajenka: {'_ '.repeat(os.tajenka.replace(/\s/g, '').length)}
            </p>
          </>
        )}

        {druh === 'spojovacka' && (
          <>
            <p className="list-zadani">Spoj čarou akordovou značku s jejím jménem.</p>
            <div className="list-spojovacka">
              <ul>{sp.vlevo.map((x) => <li key={x.klic}>{x.text}</li>)}</ul>
              <ul>{sp.vpravo.map((x) => <li key={x.klic}>{x.text}</li>)}</ul>
            </div>
          </>
        )}

        {druh === 'hmatnik' && (
          <>
            <p className="list-zadani">
              Zakresli, kde leží tóny zadaného akordu nebo stupnice.
              Struny odshora: e H G D A E.
            </p>
            <table className="list-hmatnik">
              <tbody>
                {['e', 'H', 'G', 'D', 'A', 'E'].map((struna) => (
                  <tr key={struna}>
                    <th>{struna}</th>
                    {Array.from({ length: 12 }, (_, i) => <td key={i} />)}
                  </tr>
                ))}
                <tr className="list-prazce">
                  <th />
                  {Array.from({ length: 12 }, (_, i) => <td key={i}>{i + 1}</td>)}
                </tr>
              </tbody>
            </table>
          </>
        )}

        {druh === 'tabulatura' && (
          <>
            <p className="list-zadani">Zapiš, co sis vymyslel. Nahoře noty, dole tabulatura.</p>
            {[0, 1, 2].map((blok) => (
              <div key={blok} className="list-zapis">
                <div className="list-osnova">
                  {[0, 1, 2, 3, 4].map((l) => <span key={l} />)}
                </div>
                <div className="list-tab">
                  {['e', 'H', 'G', 'D', 'A', 'E'].map((s) => (
                    <span key={s} data-struna={s} />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {druh === 'kruh' && (
          <>
            <p className="list-zadani">
              Doplň tóniny po kvintách a k nim počet křížků nebo béček.
              C je nahoře, jde se po směru hodin.
            </p>
            <svg viewBox="0 0 340 340" className="list-kruh" role="img" aria-label="Kvintový kruh k doplnění">
              <circle cx="170" cy="170" r="130" fill="none" stroke="#000" strokeWidth="1.5" />
              {kruh.map((p) => {
                const rad = ((p.uhel - 90) * Math.PI) / 180;
                const x = 170 + Math.cos(rad) * 130;
                const y = 170 + Math.sin(rad) * 130;
                return (
                  <g key={p.tonina}>
                    <circle cx={x} cy={y} r="22" fill="#fff" stroke="#000" strokeWidth="1.5" />
                    {/* Značka nahoře napovídá, kde začít; zbytek je prázdný. */}
                    {p.uhel === 0 && (
                      <text x={x} y={y + 5} textAnchor="middle" fontSize="15" fill="#000">C</text>
                    )}
                  </g>
                );
              })}
            </svg>
          </>
        )}

        {druh === 'bingo' && (
          <>
            <p className="list-zadani">
              Učitel hraje tóny, ty je škrtáš. Kdo má řadu, křičí bingo.
            </p>
            <table className="list-bingo">
              <tbody>
                {bingo.map((radek, r) => (
                  <tr key={r}>
                    {radek.map((t, c) => <td key={c}>{t ?? '★'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
};
