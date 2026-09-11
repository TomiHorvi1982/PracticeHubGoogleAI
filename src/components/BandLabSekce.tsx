import React, { useEffect, useState } from 'react';
import { ExternalLink, Plus, Trash2, TriangleAlert } from 'lucide-react';
import {
  UlozenaSkladba, adresaPrehravace, nactiSkladby, odeberSkladbu,
  pridejSkladbu, rozborOdkazu, ulozSkladby,
} from '../services/bandlabOdkaz';

/**
 * BandLab v aplikaci.
 *
 * Jejich studio vložit nejde a nepůjde: `bandlab.com` i `/studio` posílá
 * `X-Frame-Options: SAMEORIGIN`. Je to vědomý zákaz majitele, ne chyba
 * — obejít by se dal jedině přeposíláním jejich stránky přes náš server,
 * což je obcházení cizího zákazu a dělat se to nebude.
 *
 * Jejich **vlastní** vkládaný přehrávač na `/embed/` ale zákaz nemá,
 * protože je na vkládání přímo určený. Hotové skladby z účtu se tu tedy
 * dají poslouchat, porovnávat s vlastním mixem a mít po ruce při
 * zkoušce; nahrávat se v nich musí u nich.
 *
 * Seznam skladeb si pamatuje prohlížeč, takže přepnutí sekce ani zavření
 * aplikace o něj nepřipraví.
 */

export const BandLabSekce: React.FC = () => {
  const [skladby, setSkladby] = useState<UlozenaSkladba[]>(() => nactiSkladby());
  const [odkaz, setOdkaz] = useState('');
  const [nazev, setNazev] = useState('');
  const [chyba, setChyba] = useState<string | null>(null);

  useEffect(() => { ulozSkladby(skladby); }, [skladby]);

  const pridej = () => {
    const rozbor = rozborOdkazu(odkaz);
    if (!rozbor) {
      setChyba('Tohle není odkaz na skladbu z BandLabu. Použij „Share" → „Copy link" u konkrétní skladby.');
      return;
    }
    setChyba(null);
    setSkladby((p) => pridejSkladbu(p, {
      ...rozbor,
      nazev: nazev.trim() || `Skladba ${p.length + 1}`,
      pridano: Date.now(),
    }));
    setOdkaz('');
    setNazev('');
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="nadpis-sekce">BandLab</h2>
        <p className="text-drobne text-pismo-tlum max-w-[74ch]">
          Hotové skladby z tvého BandLabu rovnou tady — pro poslech při
          zkoušce a porovnání s vlastním mixem. Přidané skladby tu zůstanou
          i po přepnutí sekce a po zavření aplikace.
        </p>
      </div>

      <p className="flex items-start gap-2 text-drobne text-pozor bg-pozor/10 border border-pozor/30 rounded-panel p-3 max-w-[74ch]">
        <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          <strong>Nahrávat se musí u nich.</strong> Studio BandLabu posílá
          hlavičku <code>X-Frame-Options: SAMEORIGIN</code>, kterou zakazuje
          zobrazení na cizím webu. Je to jejich vědomé rozhodnutí a obejít
          ho by šlo jedině přeposíláním jejich stránky přes náš server —
          to dělat nebudeme. Vkládaný přehrávač níž je naopak věc, kterou
          BandLab sám nabízí.
        </span>
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 grow min-w-[260px]">
          <span className="stitek-pole block">Odkaz na skladbu</span>
          <input
            value={odkaz}
            onChange={(e) => { setOdkaz(e.target.value); setChyba(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); pridej(); } }}
            placeholder="https://www.bandlab.com/track/…?revId=…"
            className="w-full bg-vhloubeni border border-kresba rounded-prvek px-2 py-1.5 text-drobne text-pismo outline-none focus:border-znacka-okraj"
          />
        </label>
        <label className="space-y-1">
          <span className="stitek-pole block">Jak si ji pojmenuješ</span>
          <input
            value={nazev}
            onChange={(e) => setNazev(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); pridej(); } }}
            placeholder="nepovinné"
            className="bg-vhloubeni border border-kresba rounded-prvek px-2 py-1.5 text-drobne text-pismo outline-none focus:border-znacka-okraj w-44"
          />
        </label>
        <button
          onClick={pridej}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-prvek text-drobne zlata-plocha cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />Přidat
        </button>
        <a
          href="https://www.bandlab.com/studio"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-prvek text-drobne font-bold bg-plocha-3 text-pismo-tlum hover:text-pismo cursor-pointer"
        >
          <ExternalLink className="w-3.5 h-3.5" />Otevřít studio
        </a>
      </div>

      {chyba && <p className="text-drobne text-chyba max-w-[74ch]">{chyba}</p>}

      {skladby.length === 0 ? (
        <p className="text-drobne text-pismo-slaby max-w-[74ch]">
          Zatím prázdné. Na BandLabu otevři skladbu, dej „Share" a „Copy
          link", a odkaz sem vlož.
        </p>
      ) : (
        <div className="space-y-2">
          {skladby.map((s) => (
            <div key={s.id} className="karta p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="nadpis-panelu grow truncate">{s.nazev}</span>
                {/* Jen když odkaz nesl adresu stránky. Poskládat ji z toho,
                    co hraje přehrávač, nejde — na `revId` BandLab vrací 404. */}
                {s.stranka && (
                  <a
                    href={s.stranka}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Otevřít na BandLabu"
                    className="p-1.5 text-pismo-slaby hover:text-pismo cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <button
                  onClick={() => setSkladby((p) => odeberSkladbu(p, s.id))}
                  aria-label={`Odebrat ${s.nazev}`}
                  className="p-1.5 text-pismo-slaby hover:text-chyba cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {/* `credentialless`, protože aplikace běží cross-origin
                  izolovaná kvůli openDAW — bez toho by rám zůstal černý. */}
              <iframe
                credentialless=""
                src={adresaPrehravace(s.id)}
                title={s.nazev}
                allow="autoplay; encrypted-media"
                className="w-full h-[168px] border-0 rounded-prvek block"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
