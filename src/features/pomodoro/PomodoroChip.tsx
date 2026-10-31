import { useEffect, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { usePomodoro } from '../../app/pomodoro.ts';
import { Icon } from '../../app/ui/Icon.tsx';
import {
  derive,
  formatClock,
  nextPhase,
  phaseMinutes,
  remainingMinutes,
  type PomodoroView,
} from '../../domain/pomodoro.ts';
import { clockTime, durationLabel } from './format.ts';
import { MASCOT_NAMES, mascotUrl } from './mascots.ts';

/** Frases de la mascota al pulsarla (se eligen en orden). */
const PET_LINES = 5;
const PET_MS = 1800;

/**
 * Pomodoro en la cabecera (plan 14.5, DESIGN.md §6): un chip con la mascota y lo que queda, y
 * al pulsarlo la muesca, que cuelga del borde inferior de la cabecera. En modo Zen (`floating`)
 * el chip flota arriba, centrado, sin cabecera.
 */
export function PomodoroChip({ floating = false }: { floating?: boolean }) {
  const { t } = useTranslation();
  const session = usePomodoro((s) => s.session);
  const now = usePomodoro((s) => s.now);
  const open = usePomodoro((s) => s.notchOpen);
  const { setNotchOpen } = usePomodoro.getState();
  const anchor = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLButtonElement>(null);
  const view = session ? derive(session, now) : null;

  // La muesca se cierra con Escape o con un clic fuera; el foco vuelve al chip.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!anchor.current?.contains(e.target as Node)) setNotchOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setNotchOpen(false);
      chip.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setNotchOpen]);

  if (!session || !view) return null;
  const done = view.status === 'done';
  const clock = formatClock(view.remainingMs);
  const label = done
    ? t('pomodoro.chipDone')
    : t('pomodoro.chipLabel', { phase: phaseName(view, t), clock });

  return (
    <div
      ref={anchor}
      className={`pomo-anchor${floating ? ' is-floating' : ''}`}
      data-testid="pomodoro-anchor"
    >
      <button
        ref={chip}
        type="button"
        className={`pomo-chip is-${view.status}`}
        aria-expanded={open}
        aria-label={label}
        title={label}
        data-testid="pomodoro-chip"
        onClick={() => setNotchOpen(!open)}
      >
        <span className="pomo-chip-mascot" aria-hidden="true">
          <img
            src={mascotUrl(session.config.mascot, view.mood)}
            alt=""
            className={view.status === 'running' ? 'pomo-bob' : undefined}
          />
        </span>
        <span className="pomo-chip-time" role="timer">
          <span
            className="pomo-highlight"
            aria-hidden="true"
            style={{ width: done ? 0 : `${Math.round(view.progress * 100)}%` }}
          />
          <span className="pomo-chip-full">{done ? t('pomodoro.done') : clock}</span>
          <span className="pomo-chip-short">
            {done ? t('pomodoro.done') : `${remainingMinutes(view.remainingMs)}′`}
          </span>
        </span>
        {view.status === 'paused' && <Icon name="pausa" size={14} className="pomo-chip-paused" />}
      </button>
      <span className="visually-hidden" role="status" aria-live="polite">
        {announcement(view, t)}
      </span>
      {open && <PomodoroNotch view={view} />}
    </div>
  );
}

function PomodoroNotch({ view }: { view: PomodoroView }) {
  const { t, i18n } = useTranslation();
  const session = usePomodoro((s) => s.session)!;
  const store = usePomodoro.getState();
  const [pet, setPet] = useState<{ line: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const petCount = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const done = view.status === 'done';
  const next = nextPhase(session);
  const mood = pet && !done ? 'descanso' : view.mood;
  const petMascot = () => {
    clearTimeout(timer.current);
    setPet({ line: petCount.current++ % PET_LINES });
    timer.current = setTimeout(() => setPet(null), PET_MS);
  };

  let title: string;
  if (done) {
    title = view.last
      ? t('pomodoro.sessionDone')
      : t('pomodoro.phaseDone', { phase: phaseName(view, t) });
  } else {
    title = t('pomodoro.phaseCycle', {
      phase: phaseName(view, t),
      cycle: view.cycle,
      cycles: view.cycles,
    });
    if (view.status === 'paused') title = t('pomodoro.pausedPrefix', { label: title });
  }
  let caption: string;
  if (done) caption = view.last ? t('pomodoro.sessionDoneHint') : t('pomodoro.restHint');
  else if (view.status === 'paused') caption = t('pomodoro.pausedHint');
  else caption = t('pomodoro.endsAt', { time: clockTime(view.endsAt ?? 0, i18n.language) });

  return (
    <section className="pomo-notch" aria-label={t('pomodoro.title')} data-testid="pomodoro-notch">
      <div className="pomo-notch-main">
        <button
          type="button"
          className="pomo-notch-mascot"
          aria-label={t('pomodoro.pet', { name: MASCOT_NAMES[session.config.mascot] })}
          data-testid="pomodoro-mascot"
          onClick={petMascot}
        >
          <img
            src={mascotUrl(session.config.mascot, mood)}
            alt=""
            className={view.status === 'running' ? 'pomo-bob' : done ? 'pomo-hop' : undefined}
          />
        </button>
        {pet && (
          <span className="pomo-bubble" role="status" data-testid="pomodoro-bubble">
            {t(`pomodoro.petLines.${pet.line}`)}
          </span>
        )}
        <div className="pomo-notch-info">
          <span className="pomo-notch-phase">{title}</span>
          <span className="pomo-notch-time">{formatClock(view.remainingMs)}</span>
          <span className="pomo-progress" aria-hidden="true">
            <span style={{ width: `${Math.round(view.progress * 100)}%` }} />
          </span>
          <span className="pomo-notch-caption">{caption}</span>
        </div>
      </div>

      <div className="pomo-notch-actions">
        {done ? (
          <>
            {next ? (
              <button
                type="button"
                className="primary"
                data-testid="pomodoro-next"
                onClick={store.advance}
              >
                {next.phase === 'focus'
                  ? t('pomodoro.nextFocus')
                  : t('pomodoro.startBreak', {
                      duration: durationLabel(phaseMinutes(session.config, next.phase), t),
                    })}
              </button>
            ) : null}
            <button type="button" data-testid="pomodoro-finish" onClick={store.stop}>
              {t('pomodoro.finish')}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              data-testid="pomodoro-toggle"
              onClick={view.status === 'paused' ? store.resume : store.pause}
            >
              <Icon name={view.status === 'paused' ? 'reproducir' : 'pausa'} size={16} />
              {view.status === 'paused' ? t('pomodoro.resume') : t('pomodoro.pause')}
            </button>
            <button type="button" data-testid="pomodoro-plus" onClick={() => store.addMinutes(5)}>
              {t('pomodoro.plusFive')}
            </button>
            <button type="button" data-testid="pomodoro-skip" onClick={store.skip}>
              <Icon name="saltar" size={16} />
              {t('pomodoro.skip')}
            </button>
            <span className="topbar-spacer" />
            <button
              type="button"
              className="icon-button pomo-stop"
              aria-label={t('pomodoro.stop')}
              title={t('pomodoro.stop')}
              data-testid="pomodoro-stop"
              onClick={store.stop}
            >
              <Icon name="detener" size={18} />
            </button>
          </>
        )}
      </div>

      <div
        className="pomo-cycles"
        aria-label={t('pomodoro.cycleOf', { cycle: view.cycle, cycles: view.cycles })}
      >
        {Array.from({ length: view.cycles }, (_, i) => (
          <span
            key={i}
            className={
              i + 1 < view.cycle || (i + 1 === view.cycle && done && view.phase === 'focus')
                ? 'is-done'
                : i + 1 === view.cycle
                  ? 'is-current'
                  : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}

function phaseName(view: PomodoroView, t: TFunction): string {
  return t(`pomodoro.phases.${view.phase}`);
}

/**
 * Texto de la región `polite`: depende solo de la fase y su estado, así que cambia (y se
 * anuncia) al cambiar de fase, pausar o terminar, nunca cada segundo.
 */
function announcement(view: PomodoroView, t: TFunction): string {
  const phase = phaseName(view, t);
  if (view.status === 'done') return t('pomodoro.phaseDone', { phase });
  if (view.status === 'paused') return t('pomodoro.announcePaused');
  return t('pomodoro.announceRunning', { phase });
}
