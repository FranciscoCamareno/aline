import { useTranslation } from 'react-i18next';
import {
  MAX_RECURRENCE_COUNT,
  RECURRENCE_FREQS,
  weekdayIndex,
  type CalendarEvent,
  type Recurrence,
  type RecurrenceFreq,
} from '../../domain/calendar.ts';
import { DateField } from './DateField.tsx';

/** «Repetir» del diálogo de evento (plan 9.11): frecuencia, cada cuántos, días y final. */
export function RepeatFields({
  event,
  onChange,
}: {
  event: CalendarEvent;
  onChange: (recurrence: Recurrence | undefined) => void;
}) {
  const { t } = useTranslation();
  const rule = event.recurrence;
  const set = (patch: Partial<Recurrence>) => {
    if (!rule) return;
    const next: Recurrence = { ...rule, ...patch };
    for (const key of ['until', 'count', 'weekdays'] as const) {
      if (next[key] === undefined) delete next[key];
    }
    onChange(next);
  };
  const ends = rule?.until !== undefined ? 'until' : rule?.count !== undefined ? 'count' : 'never';
  const weekdays = rule?.weekdays ?? [weekdayIndex(event.date)];
  return (
    <div className="repeat-fields" data-testid="event-repeat-fields">
      <label className="field">
        <span>{t('calendar.repeat')}</span>
        <select
          name="event-repeat"
          value={rule?.freq ?? 'none'}
          data-testid="event-repeat"
          onChange={(e) => {
            const freq = e.target.value as RecurrenceFreq | 'none';
            if (freq === 'none') onChange(undefined);
            else onChange({ ...rule, freq, interval: rule?.interval ?? 1 });
          }}
        >
          <option value="none">{t('calendar.repeatNone')}</option>
          {RECURRENCE_FREQS.map((freq) => (
            <option key={freq} value={freq}>
              {t(`calendar.repeatFreq.${freq}`)}
            </option>
          ))}
        </select>
      </label>
      {rule && (
        <>
          <label className="field repeat-interval">
            <span>{t('calendar.repeatEvery')}</span>
            <span className="repeat-interval-row">
              <input
                name="event-repeat-interval"
                type="number"
                min={1}
                max={99}
                value={rule.interval}
                data-testid="event-repeat-interval"
                onChange={(e) =>
                  set({ interval: Math.min(99, Math.max(1, Number(e.target.value) || 1)) })
                }
              />
              <span>{t(`calendar.repeatUnit.${rule.freq}`, { count: rule.interval })}</span>
            </span>
          </label>
          {rule.freq === 'weekly' && (
            <fieldset className="repeat-weekdays">
              <legend>{t('calendar.repeatOn')}</legend>
              {Array.from({ length: 7 }, (_, day) => (
                <label
                  key={day}
                  className={`repeat-day${weekdays.includes(day) ? ' is-active' : ''}`}
                  title={t(`calendar.weekdayNames.${day}`)}
                >
                  <input
                    name="event-repeat-day"
                    type="checkbox"
                    className="visually-hidden"
                    checked={weekdays.includes(day)}
                    aria-label={t(`calendar.weekdayNames.${day}`)}
                    data-testid={`event-repeat-day-${day}`}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...weekdays, day]
                        : weekdays.filter((d) => d !== day);
                      // Siempre queda al menos un día.
                      if (next.length) set({ weekdays: [...new Set(next)].sort((a, b) => a - b) });
                    }}
                  />
                  <span aria-hidden="true">{t(`calendar.weekdayInitials.${day}`)}</span>
                </label>
              ))}
            </fieldset>
          )}
          <div className="field-pair">
            <label className="field">
              <span>{t('calendar.repeatEnds')}</span>
              <select
                name="event-repeat-ends"
                value={ends}
                data-testid="event-repeat-ends"
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === 'never') set({ until: undefined, count: undefined });
                  else if (value === 'until') set({ until: event.endDate, count: undefined });
                  else set({ count: 10, until: undefined });
                }}
              >
                <option value="never">{t('calendar.repeatNever')}</option>
                <option value="until">{t('calendar.repeatUntil')}</option>
                <option value="count">{t('calendar.repeatCount')}</option>
              </select>
            </label>
            {ends === 'until' && (
              <DateField
                label={t('calendar.repeatUntilDate')}
                value={rule.until ?? event.date}
                min={event.date}
                testId="event-repeat-until"
                onChange={(until) => set({ until })}
              />
            )}
            {ends === 'count' && (
              <label className="field">
                <span>{t('calendar.repeatTimes')}</span>
                <input
                  name="event-repeat-count"
                  type="number"
                  min={1}
                  max={MAX_RECURRENCE_COUNT}
                  value={rule.count ?? 1}
                  data-testid="event-repeat-count"
                  onChange={(e) =>
                    set({
                      count: Math.min(
                        MAX_RECURRENCE_COUNT,
                        Math.max(1, Number(e.target.value) || 1),
                      ),
                    })
                  }
                />
              </label>
            )}
          </div>
        </>
      )}
    </div>
  );
}
