import i18n from 'i18next';
import { nextPhase, phaseKey, type PomodoroSession } from '../domain/pomodoro.ts';

/**
 * Avisos al terminar una fase del pomodoro (plan 14.7): un sonido sintetizado con Web Audio (sin
 * archivos ni red, así que la CSP no cambia) y, si el usuario lo pidió y dio permiso, un aviso del
 * sistema. Con varias pestañas abiertas avisa solo una: la primera que reclama la fase.
 */
const CLAIM_KEY = 'mindnote.pomodoro.notified';

let audio: AudioContext | null = null;

/**
 * Prepara el audio dentro de un gesto del usuario (empezar, reanudar…): los navegadores no dejan
 * sonar un `AudioContext` creado sin gesto.
 */
export function primeAudio(): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}

/** Dos notas suaves, ascendentes. */
function playChime(): void {
  if (!audio) return;
  const start = audio.currentTime + 0.02;
  [659.25, 880].forEach((frequency, i) => {
    const osc = audio!.createOscillator();
    const gain = audio!.createGain();
    const at = start + i * 0.22;
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.18, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.9);
    osc.connect(gain).connect(audio!.destination);
    osc.start(at);
    osc.stop(at + 0.95);
  });
}

export function notificationsSupported(): boolean {
  return typeof Notification !== 'undefined';
}

/** Pide permiso para los avisos (solo desde un gesto: la casilla del modal). */
export async function requestNotifyPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === 'default') await Notification.requestPermission();
  return Notification.permission === 'granted';
}

/**
 * Reclama el aviso de una fase: solo la primera pestaña que lo hace avisa. Con Web Locks la
 * comprobación y la marca van juntas; sin ellos queda una carrera mínima entre pestañas.
 */
async function claim(key: string): Promise<boolean> {
  const check = () => {
    try {
      if (localStorage.getItem(CLAIM_KEY) === key) return false;
      localStorage.setItem(CLAIM_KEY, key);
    } catch {
      // Sin almacenamiento, cada pestaña avisa por su cuenta.
    }
    return true;
  };
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(CLAIM_KEY, () => check());
  }
  return check();
}

async function notify(title: string, body: string, tag: string, onClick: () => void) {
  try {
    const shown = new Notification(title, { body, tag, icon: '/aline-icon-192.png' });
    shown.onclick = () => {
      window.focus();
      onClick();
      shown.close();
    };
  } catch {
    // El iPad (PWA instalada) solo admite avisos desde el service worker.
    const registration = await navigator.serviceWorker?.getRegistration();
    await registration?.showNotification(title, { body, tag, icon: '/aline-icon-192.png' });
  }
}

/** La fase de `session` acaba de terminar: suena y avisa, una sola vez entre pestañas. */
export async function announcePhaseEnd(
  session: PomodoroSession,
  onOpen: () => void,
): Promise<void> {
  const key = phaseKey(session);
  if (!(await claim(key))) return;
  const { sound, notify: wantsNotice } = session.config;
  if (sound) playChime();
  if (!wantsNotice || !notificationsSupported() || Notification.permission !== 'granted') return;
  const t = i18n.t.bind(i18n);
  const phase = t(`pomodoro.phases.${session.phase}`);
  const next = nextPhase(session);
  const body = !next
    ? t('pomodoro.sessionDone')
    : next.phase === 'focus'
      ? t('pomodoro.notifyNextFocus')
      : t('pomodoro.notifyNextBreak');
  await notify(t('pomodoro.phaseDone', { phase }), body, key, onOpen).catch(() => undefined);
}
