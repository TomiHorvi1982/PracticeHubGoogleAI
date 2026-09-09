import React, { useEffect, useState } from 'react';
import { GraduationCap, KeyRound, Plus, Trash2, UserPlus } from 'lucide-react';
import { MOTIVY, NABIDKA_SEKCI, Zak, vyukaService } from '../../services/vyukaService';

/**
 * Výuka — žáci.
 *
 * První obrazovka celé výuky: založit dítě, dát mu PIN a rozhodnout,
 * co ze studia uvidí. Zaškrtávátka jsou prázdná schválně — povoluje se
 * výčtem toho, co smí, ne výčtem zákazů. Kdo nic nezaškrtne, dostane
 * jen žákovskou obrazovku, a to je správný výchozí stav.
 *
 * Osnova, lekce a úkoly přijdou v dalších fázích; tahle obrazovka na ně
 * má místo, ale zatím je nesbírá.
 */

const PRAZDNY = { prezdivka: '', pin: '', stupen: 1, sekce: [] as string[], motiv: 'vesmir', poznamka: '' };

export const VyukaSekce: React.FC = () => {
  const [zaci, setZaci] = useState<Zak[]>([]);
  const [nacitam, setNacitam] = useState(true);
  const [chyba, setChyba] = useState<string | null>(null);
  const [zakladam, setZakladam] = useState(false);
  const [novy, setNovy] = useState({ ...PRAZDNY });
  const [meniPin, setMeniPin] = useState<{ id: string; pin: string } | null>(null);

  const nacti = async () => {
    setNacitam(true);
    try {
      setZaci(await vyukaService.seznamZaku());
      setChyba(null);
    } catch (e: any) {
      setChyba(e?.message || 'Žáky se nepodařilo načíst.');
    } finally {
      setNacitam(false);
    }
  };

  useEffect(() => { void nacti(); }, []);

  const zaloz = async () => {
    setChyba(null);
    try {
      await vyukaService.zalozZaka(novy);
      setNovy({ ...PRAZDNY });
      setZakladam(false);
      await nacti();
    } catch (e: any) {
      setChyba(e?.message || 'Žáka se nepodařilo založit.');
    }
  };

  const prepniSekci = (zak: Zak, sekce: string) => {
    const nove = zak.sekce.includes(sekce)
      ? zak.sekce.filter((s) => s !== sekce)
      : [...zak.sekce, sekce];
    setZaci((p) => p.map((z) => (z.id === zak.id ? { ...z, sekce: nove } : z)));
    void vyukaService.upravZaka(zak.id, { sekce: nove }).catch((e) => {
      setChyba(e?.message || 'Uložit se to nepodařilo.');
      void nacti();
    });
  };

  const smaz = async (zak: Zak) => {
    // Bez potvrzení to nejde: mizí účet dítěte i všechno, co k němu patří.
    if (!window.confirm(`Smazat žáka ${zak.prezdivka}? Zmizí i jeho účet a všechno, co k němu patří.`)) return;
    try {
      await vyukaService.smazZaka(zak.id);
      await nacti();
    } catch (e: any) {
      setChyba(e?.message || 'Smazat se to nepodařilo.');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="nadpis-sekce">Výuka</h2>
        <p className="text-drobne text-pismo-tlum max-w-[70ch]">
          Žáci se hlásí přezdívkou a čtyřmístným PINem — e-mail nepotřebují.
          Po přihlášení se jim studio vůbec nesestaví; uvidí vlastní obrazovku
          a k tomu jen to, co jim tady zaškrtneš.
        </p>
      </div>

      {chyba && (
        <p className="text-drobne text-chyba bg-chyba/10 border border-chyba/30 rounded-panel p-2.5">{chyba}</p>
      )}

      {!zakladam ? (
        <button
          onClick={() => setZakladam(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-prvek text-drobne zlata-plocha cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />Přidat žáka
        </button>
      ) : (
        <div className="karta p-4 space-y-3">
          <span className="nadpis-panelu">Nový žák</span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="space-y-1">
              <span className="stitek-pole block">Přezdívka</span>
              <input
                autoFocus
                value={novy.prezdivka}
                onChange={(e) => setNovy((p) => ({ ...p, prezdivka: e.target.value }))}
                placeholder="Kuba"
                className="w-full bg-vhloubeni border border-kresba rounded-prvek px-2 py-1.5 text-drobne text-pismo outline-none focus:border-znacka-okraj"
              />
              <span className="text-stitek text-pismo-slaby block">
                Bez mezer a háčků — dítě to musí trefit napoprvé.
              </span>
            </label>
            <label className="space-y-1">
              <span className="stitek-pole block">PIN</span>
              <input
                value={novy.pin}
                onChange={(e) => setNovy((p) => ({ ...p, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                inputMode="numeric"
                placeholder="1234"
                className="w-full bg-vhloubeni border border-kresba rounded-prvek px-2 py-1.5 text-drobne text-pismo font-mono tracking-[0.3em] outline-none focus:border-znacka-okraj"
              />
            </label>
            <label className="space-y-1">
              <span className="stitek-pole block">Stupeň</span>
              <select
                value={novy.stupen}
                onChange={(e) => setNovy((p) => ({ ...p, stupen: Number(e.target.value) }))}
                className="w-full bg-vhloubeni border border-kresba rounded-prvek px-2 py-1.5 text-drobne text-pismo outline-none focus:border-znacka-okraj"
              >
                {[1, 2, 3, 4, 5, 6].map((s) => <option key={s} value={s}>{s}. stupeň</option>)}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="stitek-pole mr-1">motiv</span>
            {MOTIVY.map((m) => (
              <button
                key={m.id}
                onClick={() => setNovy((p) => ({ ...p, motiv: m.id }))}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-prvek text-drobne font-bold cursor-pointer ${
                  novy.motiv === m.id ? 'bg-znacka-tlum text-znacka ring-1 ring-znacka-okraj' : 'bg-plocha-3 text-pismo-tlum'
                }`}
              >
                <span className="w-4 h-2 rounded-full" style={{ background: m.pruh }} />
                {m.nazev}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5">
            <button
              onClick={zaloz}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-prvek text-drobne zlata-plocha cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />Založit
            </button>
            <button
              onClick={() => { setZakladam(false); setNovy({ ...PRAZDNY }); }}
              className="px-3 py-1.5 rounded-prvek text-drobne text-pismo-slaby hover:text-pismo cursor-pointer"
            >
              Zpět
            </button>
          </div>
        </div>
      )}

      {nacitam ? (
        <p className="text-drobne text-pismo-slaby">Načítám žáky…</p>
      ) : !zaci.length ? (
        <div className="karta p-6 text-center space-y-2">
          <GraduationCap className="w-8 h-8 text-pismo-slaby mx-auto" />
          <p className="text-drobne text-pismo-tlum">
            Zatím žádný žák. Přidej prvního a dej mu přezdívku a PIN — pak se
            přihlásí sám z přihlašovacího okna, záložka <strong>Jsem žák</strong>.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {zaci.map((zak) => (
            <div key={zak.id} className="karta p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="nadpis-panelu">{zak.prezdivka}</span>
                <span className="odznak bg-znacka-tlum text-znacka px-2 py-0.5 rounded-prvek">
                  {zak.stupen}. stupeň
                </span>
                {!zak.aktivni && (
                  <span className="odznak bg-chyba/15 text-chyba px-2 py-0.5 rounded-prvek">vypnutý</span>
                )}
                <span className="text-stitek text-pismo-slaby">
                  {zak.sekce.length
                    ? `${zak.sekce.length} sekcí navíc`
                    : 'jen žákovská obrazovka'}
                </span>

                <button
                  onClick={() => setMeniPin({ id: zak.id, pin: '' })}
                  title="Nastavit nový PIN"
                  className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-prvek text-drobne font-bold bg-plocha-3 text-pismo-tlum hover:text-pismo cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />Nový PIN
                </button>
                <button
                  onClick={() => smaz(zak)}
                  aria-label={`Smazat žáka ${zak.prezdivka}`}
                  className="px-2 py-1.5 rounded-prvek text-pismo-slaby hover:text-chyba cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {meniPin?.id === zak.id && (
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={meniPin.pin}
                    onChange={(e) => setMeniPin({ id: zak.id, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                    inputMode="numeric"
                    placeholder="nový PIN"
                    className="bg-vhloubeni border border-kresba rounded-prvek px-2 py-1.5 text-drobne text-pismo font-mono tracking-[0.3em] outline-none focus:border-znacka-okraj w-28"
                  />
                  <button
                    onClick={async () => {
                      try {
                        await vyukaService.upravZaka(zak.id, { pin: meniPin.pin });
                        setMeniPin(null);
                      } catch (e: any) { setChyba(e?.message || 'PIN se nepodařilo změnit.'); }
                    }}
                    className="px-2.5 py-1.5 rounded-prvek text-drobne zlata-plocha cursor-pointer"
                  >
                    Uložit PIN
                  </button>
                  <button
                    onClick={() => setMeniPin(null)}
                    className="px-2 py-1.5 text-drobne text-pismo-slaby hover:text-pismo cursor-pointer"
                  >
                    Zpět
                  </button>
                </div>
              )}

              <div className="space-y-1.5">
                <span className="stitek-pole block">Co uvidí ze studia navíc</span>
                <div className="flex flex-wrap gap-1.5">
                  {NABIDKA_SEKCI.map((s) => {
                    const ma = zak.sekce.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => prepniSekci(zak, s.id)}
                        className={`px-2.5 py-1.5 rounded-prvek text-drobne font-bold cursor-pointer ${
                          ma ? 'bg-uspech/15 text-uspech ring-1 ring-uspech/40' : 'bg-plocha-3 text-pismo-slaby hover:text-pismo'
                        }`}
                      >
                        {ma ? '✓ ' : ''}{s.nazev}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
