import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePomodoro } from '../../app/pomodoro.ts';
import { notificationsSupported, requestNotifyPermission } from '../../app/pomodoroAlerts.ts';
import {
  FOCUS_MINUTES,
  MASCOTS,
  MAX_CYCLES,
  plannedMinutes,
  type PomodoroConfig,
} from '../../domain/pomodoro.ts';
import { MASCOT_NAMES, mascotUrl } from './mascots.ts';
import { clockTime, durationLabel } from './format.ts';

const FOCUS_PRESETS = [25, 50, 90] as const;
const BREAK_PRESETS = [5, 10, 15, 0] as const;

/**
 * Perfil → Pomodoro (plan 14.4, DESIGN.md §6): enfoque, descanso, ciclos, mascota y avisos, con
 * el total y la hora de fin. Parte de la última configuración usada.
 */
export function PomodoroDialog() {
  const { t, i18n } = useTranslation();
  const initial = usePomodoro((s) => s.config);
  const { begin, closeDialog } = usePomodoro.getState();
  const [config, setConfig] = useState<PomodoroConfig>(initial);
  /** La hora de fin aproximada se calcula desde que se abrió el modal. */
  const [openedAt] = useState(() => Date.now());
  const [canNotify] = useState(notificationsSupported);
  const [notifyDenied, setNotifyDenied] = useState(false);
  const [custom, setCustom] = useState(
    !FOCUS_PRESETS.includes(initial.focusMinutes as (typeof FOCUS_PRESETS)[number]),
  );
  const patch = (p: Partial<PomodoroConfig>) => setConfig((c) => ({ ...c, ...p }));
  const setFocus = (hours: number, minutes: number) =>
    patch({
      focusMinutes: Math.min(FOCUS_MINUTES.max, Math.max(FOCUS_MINUTES.min, hours * 60 + minutes)),
    });
  const hours = Math.floor(config.focusMinutes / 60);
  const minutes = config.focusMinutes % 60;
  const total = plannedMinutes(config);
  const lang = i18n.language;

  return (
    <div className="dialog-backdrop" role="presentation" onClick={closeDialog}>
      <form
        className="dialog pomodoro-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pomodoro-title"
        data-testid="pomodoro-dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && closeDialog()}
        onSubmit={(e) => {
          e.preventDefault();
          begin(config);
        }}
      >
        <h2 id="pomodoro-title">{t('pomodoro.title')}</h2>
        <p className="pomodoro-lead">{t('pomodoro.lead')}</p>
        <div className="pomodoro-dialog-body">
          <div className="pomodoro-dialog-options">
            <fieldset>
              <legend>{t('pomodoro.focus')}</legend>
              <div className="pomodoro-pills">
                {FOCUS_PRESETS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="pomodoro-pill"
                    aria-pressed={!custom && config.focusMinutes === m}
                    data-testid={`pomodoro-focus-${m}`}
                    onClick={() => {
                      setCustom(false);
                      patch({ focusMinutes: m });
                    }}
                  >
                    {durationLabel(m, t)}
                  </button>
                ))}
                <button
                  type="button"
                  className="pomodoro-pill"
                  aria-pressed={custom}
                  data-testid="pomodoro-focus-custom"
                  onClick={() => setCustom(true)}
                >
                  {t('pomodoro.custom')}
                </button>
              </div>
              {custom && (
                <div className="pomodoro-custom">
                  <label>
                    {t('pomodoro.hours')}
                    <input
                      type="number"
                      min={0}
                      max={4}
                      value={hours}
                      data-testid="pomodoro-hours"
                      onChange={(e) => setFocus(Number(e.target.value) || 0, minutes)}
                    />
                  </label>
                  <label>
                    {t('pomodoro.minutes')}
                    <input
                      type="number"
                      min={0}
                      max={59}
                      step={5}
                      value={minutes}
                      data-testid="pomodoro-minutes"
                      onChange={(e) => setFocus(hours, Number(e.target.value) || 0)}
                    />
                  </label>
                  <span className="pomodoro-hint">{t('pomodoro.range')}</span>
                </div>
              )}
            </fieldset>

            <fieldset>
              <legend>{t('pomodoro.break')}</legend>
              <div className="pomodoro-pills">
                {BREAK_PRESETS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="pomodoro-pill"
                    aria-pressed={config.breakMinutes === m}
                    data-testid={`pomodoro-break-${m}`}
                    onClick={() => patch({ breakMinutes: m })}
                  >
                    {m === 0 ? t('pomodoro.noBreak') : durationLabel(m, t)}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="pomodoro-cycles">
              <span>{t('pomodoro.cycles')}</span>
              <input
                type="number"
                min={1}
                max={MAX_CYCLES}
                value={config.cycles}
                data-testid="pomodoro-cycles"
                onChange={(e) =>
                  patch({
                    cycles: Math.min(MAX_CYCLES, Math.max(1, Number(e.target.value) || 1)),
                  })
                }
              />
              <span className="pomodoro-hint">
                {config.cycles > 1 && config.longBreakMinutes > 0
                  ? t('pomodoro.longBreakHint', { minutes: config.longBreakMinutes })
                  : t('pomodoro.singleHint')}
              </span>
            </label>

            <div className="pomodoro-checks">
              <label className="inline-option">
                <input
                  type="checkbox"
                  checked={config.sound}
                  onChange={(e) => patch({ sound: e.target.checked })}
                />
                {t('pomodoro.sound')}
              </label>
              <label className="inline-option">
                <input
                  type="checkbox"
                  checked={config.notify}
                  disabled={!canNotify}
                  data-testid="pomodoro-notify"
                  onChange={(e) => {
                    if (!e.target.checked) return patch({ notify: false });
                    // El permiso se pide aquí, dentro del gesto, y solo si se marca (plan 14.7).
                    void requestNotifyPermission().then((granted) => {
                      setNotifyDenied(!granted);
                      patch({ notify: granted });
                    });
                  }}
                />
                {t('pomodoro.notify')}
              </label>
              {(!canNotify || notifyDenied) && (
                <p className="pomodoro-hint" role="status">
                  {canNotify ? t('pomodoro.notifyDenied') : t('pomodoro.notifyUnsupported')}
                </p>
              )}
            </div>
          </div>

          <fieldset className="pomodoro-mascots">
            <legend>{t('pomodoro.mascot')}</legend>
            <div className="pomodoro-mascot-grid">
              {MASCOTS.map((m) => (
                <label key={m} className="pomodoro-mascot-option">
                  <input
                    type="radio"
                    name="pomodoro-mascot"
                    checked={config.mascot === m}
                    data-testid={`pomodoro-mascot-${m}`}
                    onChange={() => patch({ mascot: m })}
                  />
                  <img src={mascotUrl(m, 'enfoque')} alt="" />
                  <span>{MASCOT_NAMES[m]}</span>
                </label>
              ))}
            </div>
            <p className="pomodoro-hint">{t(`pomodoro.mascotBlurb.${config.mascot}`)}</p>
          </fieldset>
        </div>

        <div className="dialog-actions">
          <span className="pomodoro-total" data-testid="pomodoro-total">
            <strong>{t('pomodoro.total', { duration: durationLabel(total, t) })}</strong>{' '}
            {t('pomodoro.endsAround', { time: clockTime(openedAt + total * 60_000, lang) })}
          </span>
          <span className="topbar-spacer" />
          <button type="button" onClick={closeDialog}>
            {t('title.cancel')}
          </button>
          <button type="submit" className="primary" data-testid="pomodoro-start" autoFocus>
            {t('pomodoro.start')}
          </button>
        </div>
      </form>
    </div>
  );
}
