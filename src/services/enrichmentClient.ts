import { authService } from './authService';

/**
 * Spustí dohledání materiálů k písni.
 *
 * Nečeká se na výsledek. Hledání trvá sekundy — sahá se na tři služby a
 * mezi dotazy se dělá pauza — a držet kvůli tomu člověka u formuláře nemá
 * smysl. Píseň je uložená hned, materiály k ní přibudou samy.
 */
export function spustDoplneni(songId: string): void {
  const token = authService.getCurrentSession()?.token;
  void fetch(`/api/songs/${songId}/enrich`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  }).catch(() => {
    // Neúspěch se schválně nehlásí. Doplňování je bonus, ne podmínka —
    // píseň je uložená tak jako tak a chybová hláška u úspěšného uložení
    // by mátla víc, než by pomohla. Doplnit jde kdykoli znovu.
  });
}
