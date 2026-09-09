import React, { useEffect, useRef } from 'react';
import { PasmoEq, typPasma } from '../../services/presetyKytary';
import { kytaraVMixu } from '../../services/kytaraVMixu';
import { popisHz } from '../../services/pasmaSpektra';

/**
 * Parametrický ekvalizér s křivkou.
 *
 * Křivka se nekreslí z hodnot jezdců, ale z toho, co filtry doopravdy
 * dělají: `getFrequencyResponse` vrátí odezvu každého pásma a ty se
 * sečtou. Zásah je tak vidět i tam, kde se dvě pásma překrývají — a to
 * je zrovna místo, kde odhad podle jezdců klame.
 *
 * Bez běžící kytary žádné filtry nejsou, takže se křivka spočítá
 * náhradně ze vzorců — plocha pak nevypadá rozbitě, jen se nehýbe.
 */

interface Props {
  eq: PasmoEq[];
  bypass: boolean;
  bezi: boolean;
  vyska?: number;
}

const OD_HZ = 20;
const DO_HZ = 20000;
const ROZSAH_DB = 18;

/** Odezva jednoho pásma, když filtry ještě nejsou. Zjednodušený tvar. */
function nahradniOdezva(p: PasmoEq, typ: BiquadFilterType, hz: number): number {
  if (typ === 'lowshelf') return p.db / (1 + (hz / p.hz) ** 2);
  if (typ === 'highshelf') return p.db / (1 + (p.hz / hz) ** 2);
  const oktav = Math.log2(hz / p.hz);
  return p.db * Math.exp(-((oktav * p.q * 1.4) ** 2));
}

export const EkvalizerKytary: React.FC<Props> = ({ eq, bypass, bezi, vyska = 84 }) => {
  const platno = useRef<HTMLCanvasElement>(null);
  const obal = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const c = platno.current;
    const box = obal.current;
    if (!c || !box) return;
    const hustota = window.devicePixelRatio || 1;
    const sirka = Math.max(80, Math.floor(box.getBoundingClientRect().width));
    c.width = Math.floor(sirka * hustota);
    c.height = Math.floor(vyska * hustota);
    c.style.width = `${sirka}px`;
    c.style.height = `${vyska}px`;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(hustota, 0, 0, hustota, 0, 0);
    ctx.clearRect(0, 0, sirka, vyska);

    // Frekvence logaritmicky, jak je slyšíme.
    const hz = new Float32Array(sirka);
    for (let x = 0; x < sirka; x++) hz[x] = OD_HZ * (DO_HZ / OD_HZ) ** (x / (sirka - 1));

    // Vodorovná nula a pár orientačních frekvencí.
    const naY = (db: number) => vyska / 2 - (db / ROZSAH_DB) * (vyska / 2 - 4);
    ctx.strokeStyle = 'rgba(148,163,184,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, naY(0));
    ctx.lineTo(sirka, naY(0));
    ctx.stroke();
    ctx.fillStyle = 'rgba(148,163,184,0.45)';
    ctx.font = '9px ui-monospace, monospace';
    for (const f of [100, 1000, 10000]) {
      const x = ((Math.log(f / OD_HZ) / Math.log(DO_HZ / OD_HZ)) * (sirka - 1));
      ctx.strokeStyle = 'rgba(148,163,184,0.12)';
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, vyska);
      ctx.stroke();
      ctx.fillText(popisHz(f), x + 2, vyska - 2);
    }

    if (bypass) {
      ctx.fillStyle = 'rgba(148,163,184,0.5)';
      ctx.fillText('vypnuto', 4, 11);
      return;
    }

    // Skutečná odezva filtrů; bez běžící kytary náhradní výpočet.
    let db = kytaraVMixu.krivkaEq(hz);
    if (!db) {
      db = new Float32Array(sirka);
      eq.forEach((p, i) => {
        const typ = typPasma(i, eq.length);
        for (let x = 0; x < sirka; x++) db![x] += nahradniOdezva(p, typ, hz[x]);
      });
    }

    ctx.beginPath();
    for (let x = 0; x < sirka; x++) {
      const y = naY(Math.max(-ROZSAH_DB, Math.min(ROZSAH_DB, db[x])));
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = bezi ? '#FF9F0A' : 'rgba(255,209,102,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Plocha pod křivkou, ať je zásah čitelný i koutkem oka.
    ctx.lineTo(sirka, naY(0));
    ctx.lineTo(0, naY(0));
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,209,102,0.12)';
    ctx.fill();
  }, [eq, bypass, bezi, vyska]);

  return (
    <div ref={obal} className="rounded-prvek bg-vhloubeni border border-kresba overflow-hidden">
      <canvas ref={platno} className="block" />
    </div>
  );
};
