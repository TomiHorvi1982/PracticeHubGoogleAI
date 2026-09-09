import React, { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList, GraduationCap, KeyRound, Plus, Trash2, UserPlus } from 'lucide-react';
import { MOTIVY, NABIDKA_SEKCI, Zak, vyukaService } from '../../services/vyukaService';
import { NAZVY_STAVU, Ukol, poTerminu, seradProZaka } from '../../services/ukoly';
import { ukolyService } from '../../services/ukolyService';
import { VlastniCvik } from '../../services/vlastniCviky';
import { cvikyUloziste } from '../../services/vlastniCvikyUloziste';
import { PostupZaka } from './PostupZaka';

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

  /* Úkoly a cviky, ze kterých se dá zadávat. */
  const [ukoly, setUkoly] = useState<Record<string, Ukol[]>>({});
  const [cviky, setCviky] = useState<VlastniCvik[]>([]);
  const [zadava, setZadava] = useState<string | null>(null);
  /** U kterého žáka je rozbalený postup v osnově. */
  const [otevrenyPostup, setOtevrenyPostup] = useState<string | null>(null);
  const [novy2, setNovy2] = useState({ druh: 'text', cil_id: '', zadani: '', do_kdy: '', cilove_tempo: '' });

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

  const nactiUkoly = async (seznam: Zak[]) => {
    try {
      const vse = await ukolyService.nacti();
      const podleZaka: Record<string, Ukol[]> = {};
      for (const z of seznam) podleZaka[z.id] = vse.filter((u) => u.zak_id === z.id);
      setUkoly(podleZaka);
    } catch { /* úkoly jsou navíc; seznam žáků se ukáže i bez nich */ }
  };

  useEffect(() => {
    (async () => {
      await nacti();
      try { setCviky(await cvikyUloziste.nacti()); } catch { /* nevadí */ }
    })();
  }, []);

  useEffect(() => { if (zaci.length) void nactiUkoly(zaci); }, [zaci.length]);

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

  const zadejUkol = async (zak: Zak) => {
    if (!novy2.zadani.trim() && !novy2.cil_id) {
      setChyba('Napiš, co má dítě dělat, nebo vyber cvik.');
      return;
    }
    try {
      await ukolyService.zadej({
        zak_id: zak.id,
        druh: novy2.druh as any,
        cil_id: novy2.cil_id || null,
        zadani: novy2.zadani.trim(),
        do_kdy: novy2.do_kdy || null,
        cilove_tempo: novy2.cilove_tempo ? Number(novy2.cilove_tempo) : null,
      });
      setNovy2({ druh: 'text', cil_id: '', zadani: '', do_kdy: '', cilove_tempo: '' });
      setZadava(null);
      await nactiUkoly(zaci);
    } catch (e: any) {
      setChyba(e?.message || 'Úkol se nepodařilo zadat.');
    }
  };

  const jmenoCile = (u: Ukol): string => {
    if (u.druh === 'cvik') return cviky.find((c) => c.id === u.cil_id)?.nazev || 'cvik';
    return '';
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
                  onClick={() => setOtevrenyPostup(otevrenyPostup === zak.id ? null : zak.id)}
                  className={`ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-prvek text-drobne font-bold cursor-pointer ${
                    otevrenyPostup === zak.id ? 'zlata-plocha' : 'bg-plocha-3 text-pismo-tlum hover:text-pismo'
                  }`}
                >
                  <GraduationCap className="w-3.5 h-3.5" />Postup
                </button>
                <button
                  onClick={() => setMeniPin({ id: zak.id, pin: '' })}
                  title="Nastavit nový PIN"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-prvek text-drobne font-bold bg-plocha-3 text-pismo-tlum hover:text-pismo cursor-pointer"
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

              {otevrenyPostup === zak.id && (
                <div className="pt-2 border-t border-kresba-jemna">
                  <PostupZaka zak={zak} onZmena={() => void nacti()} />
                </div>
              )}

              {/* Úkoly. Nahoře co čeká, dole hotové — stejné pořadí,
                  v jakém je vidí dítě, ať se o tom dá mluvit. */}
              <div className="space-y-1.5 pt-2 border-t border-kresba-jemna">
                <div className="flex items-center gap-2">
                  <span className="stitek-pole">Domácí úkoly</span>
                  <button
                    onClick={() => setZadava(zadava === zak.id ? null : zak.id)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-prvek text-drobne font-bold bg-plocha-3 text-pismo-tlum hover:text-pismo cursor-pointer"
                  >
                    <ClipboardList className="w-3.5 h-3.5" />Zadat úkol
                  </button>
                </div>

                {zadava === zak.id && (
                  <div className="bg-vhloubeni border border-kresba rounded-panel p-3 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {([['text', 'Vlastními slovy'], ['cvik', 'Cvik z hmatníku']] as const).map(([id, popis]) => (
                        <button
                          key={id}
                          onClick={() => setNovy2((p) => ({ ...p, druh: id, cil_id: '' }))}
                          className={`px-2.5 py-1 rounded-prvek text-drobne font-bold cursor-pointer ${
                            novy2.druh === id ? 'zlata-plocha' : 'bg-plocha-3 text-pismo-tlum'
                          }`}
                        >
                          {popis}
                        </button>
                      ))}
                    </div>

                    {novy2.druh === 'cvik' && (
                      <select
                        value={novy2.cil_id}
                        onChange={(e) => setNovy2((p) => ({ ...p, cil_id: e.target.value }))}
                        className="w-full bg-plocha-2 border border-kresba rounded-prvek px-2 py-1.5 text-drobne text-pismo outline-none focus:border-znacka-okraj"
                      >
                        <option value="">— vyber cvik —</option>
                        {cviky.map((c) => (
                          <option key={c.id} value={c.id}>{c.nazev} ({c.tony.length} tónů)</option>
                        ))}
                      </select>
                    )}

                    <textarea
                      value={novy2.zadani}
                      onChange={(e) => setNovy2((p) => ({ ...p, zadani: e.target.value }))}
                      rows={2}
                      placeholder="Projdi si přechod Em→Am pomalu, dvacetkrát."
                      className="w-full bg-plocha-2 border border-kresba rounded-prvek px-2 py-1.5 text-drobne text-pismo outline-none focus:border-znacka-okraj"
                    />

                    <div className="flex flex-wrap items-end gap-2">
                      <label className="space-y-1">
                        <span className="stitek-pole block">Do kdy</span>
                        <input
                          type="date"
                          value={novy2.do_kdy}
                          onChange={(e) => setNovy2((p) => ({ ...p, do_kdy: e.target.value }))}
                          className="bg-plocha-2 border border-kresba rounded-prvek px-2 py-1.5 text-drobne text-pismo outline-none focus:border-znacka-okraj"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="stitek-pole block">Cílové tempo</span>
                        <input
                          type="number"
                          value={novy2.cilove_tempo}
                          onChange={(e) => setNovy2((p) => ({ ...p, cilove_tempo: e.target.value }))}
                          placeholder="BPM"
                          className="w-24 bg-plocha-2 border border-kresba rounded-prvek px-2 py-1.5 text-drobne text-pismo outline-none focus:border-znacka-okraj"
                        />
                      </label>
                      <button
                        onClick={() => void zadejUkol(zak)}
                        className="px-3 py-1.5 rounded-prvek text-drobne zlata-plocha cursor-pointer"
                      >
                        Zadat
                      </button>
                    </div>
                  </div>
                )}

                {(ukoly[zak.id] || []).length === 0 ? (
                  <p className="text-stitek text-pismo-slaby">Zatím žádný úkol.</p>
                ) : (
                  <div className="space-y-1">
                    {seradProZaka(ukoly[zak.id] || []).map((u) => (
                      <div
                        key={u.id}
                        className={`flex flex-wrap items-center gap-2 px-2.5 py-1.5 rounded-prvek text-drobne ${
                          u.stav === 'hotovo' ? 'bg-uspech/10' : poTerminu(u) ? 'bg-chyba/10' : 'bg-plocha-3'
                        }`}
                      >
                        <span className="text-pismo truncate max-w-[36ch]">
                          {u.zadani || jmenoCile(u) || 'Úkol'}
                        </span>
                        {u.druh === 'cvik' && (
                          <span className="text-stitek text-znacka">{jmenoCile(u)}</span>
                        )}
                        {u.cilove_tempo && (
                          <span className="text-stitek text-pismo-slaby font-mono">{u.cilove_tempo} BPM</span>
                        )}
                        {u.do_kdy && (
                          <span className={`text-stitek font-mono ${poTerminu(u) ? 'text-chyba' : 'text-pismo-slaby'}`}>
                            do {u.do_kdy}
                          </span>
                        )}
                        <span className="text-stitek text-pismo-tlum ml-auto">{NAZVY_STAVU[u.stav]}</span>

                        {u.stav === 'odevzdano' && (
                          <button
                            onClick={async () => {
                              await ukolyService.ohodnot(u.id, 'Hotovo, jde to!', true);
                              await nactiUkoly(zaci);
                            }}
                            title="Uznat jako splněné"
                            className="p-1 rounded text-uspech hover:bg-uspech/15 cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            await ukolyService.smaz(u.id);
                            await nactiUkoly(zaci);
                          }}
                          aria-label="Smazat úkol"
                          className="p-1 rounded text-pismo-slaby hover:text-chyba cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

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
