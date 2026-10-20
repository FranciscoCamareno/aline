import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../app/ui/Icon.tsx';
import {
  addDays,
  addMonths,
  firstOfMonth,
  localDate,
  monthGrid,
  monthOf,
  startOfWeek,
  type IsoDate,
} from '../../domain/calendar.ts';
import { useWeekStart } from './calendarPrefs.ts';

const asDate = (date: IsoDate) => new Date(`${date}T12:00:00`);
const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/** El mismo día `n` meses después; si ese mes no lo tiene (31 → 30), su último día. */
function shiftMonth(date: IsoDate, n: number): IsoDate {
  const first = addMonths(date, n);
  const { year, month } = monthOf(first);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${first.slice(0, 8)}${String(Math.min(Number(date.slice(8)), last)).padStart(2, '0')}`;
}

/**
 * Coloca un popover fijo bajo su botón (o encima si no cabe), como los menús: así no lo recorta
 * el diálogo con desplazamiento. Se cierra si la ventana cambia de tamaño o se desplaza fuera.
 */
export function usePopoverPosition(
  anchor: RefObject<HTMLElement | null>,
  open: boolean,
  width: number,
  height: number,
  onClose: () => void,
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({});
  // `onClose` cambia en cada render: se lee de una referencia para no recolocar sin parar.
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });
  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const place = () => {
      const rect = anchor.current!.getBoundingClientRect();
      const below = rect.bottom + 4 + height <= window.innerHeight;
      setStyle({
        position: 'fixed',
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: below ? rect.bottom + 4 : Math.max(8, rect.top - height - 4),
        width,
      });
    };
    place();
    const close = () => closeRef.current();
    window.addEventListener('resize', close);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, open, width, height]);
  return style;
}

interface DateFieldProps {
  label: string;
  value: IsoDate;
  onChange: (date: IsoDate) => void;
  min?: IsoDate;
  testId: string;
  /** Rango del evento: se marca la banda entre inicio y fin (DESIGN.md §8.4). */
  range?: { start: IsoDate; end: IsoDate };
  /** Días con eventos: un punto bajo el número. */
  hasEvents?: (date: IsoDate) => boolean;
}

/**
 * Campo de fecha con el selector propio (DESIGN.md §8.4, plan 9.10): popover de 296 px con el
 * mes, hoy con un anillo, el rango del evento y los días con eventos. Se maneja con el teclado:
 * flechas (día y semana), Re Pág/Av Pág (mes), Inicio/Fin (semana), Intro para elegir, Escape
 * para cerrar sin cambiar.
 */
export function DateField({
  label,
  value,
  onChange,
  min,
  testId,
  range,
  hasEvents,
}: DateFieldProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('en') ? 'en' : 'es';
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const labelId = useId();
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const display = value
    ? new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(asDate(value))
    : t('calendar.pickDate');
  return (
    <div className="field date-field">
      <span id={labelId}>{label}</span>
      <button
        ref={button}
        type="button"
        className="date-field-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={`${labelId} ${labelId}-value`}
        data-testid={testId}
        data-value={value}
        onClick={() => setOpen((o) => !o)}
      >
        <span id={`${labelId}-value`}>{display}</span>
        <Icon name="calendario" size={16} />
      </button>
      {open &&
        createPortal(
          <DatePicker
            anchor={button}
            value={value}
            label={label}
            {...(min ? { min } : {})}
            {...(range ? { range } : {})}
            {...(hasEvents ? { hasEvents } : {})}
            testId={`${testId}-picker`}
            onPick={(date) => {
              onChange(date);
              close();
            }}
            onClose={close}
          />,
          document.body,
        )}
    </div>
  );
}

const PICKER_WIDTH = 296;
const PICKER_HEIGHT = 340;

function DatePicker({
  anchor,
  value,
  label,
  min,
  range,
  hasEvents,
  testId,
  onPick,
  onClose,
}: {
  anchor: RefObject<HTMLElement | null>;
  value: IsoDate;
  label: string;
  min?: IsoDate;
  range?: { start: IsoDate; end: IsoDate };
  hasEvents?: (date: IsoDate) => boolean;
  testId: string;
  onPick: (date: IsoDate) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('en') ? 'en' : 'es';
  const weekStart = useWeekStart();
  const today = localDate(new Date());
  const [focused, setFocused] = useState<IsoDate>(value || today);
  const { year, month } = monthOf(focused);
  const grid = monthGrid(year, month, weekStart);
  const root = useRef<HTMLDivElement>(null);
  const style = usePopoverPosition(anchor, true, PICKER_WIDTH, PICKER_HEIGHT, onClose);

  // El foco sigue al día enfocado (también al cambiar de mes con el teclado).
  useEffect(() => {
    root.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
  }, [focused]);

  // Un clic fuera cierra sin cambiar nada.
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !anchor.current?.contains(target)) onClose();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [anchor, onClose]);

  const allowed = (date: IsoDate) => !min || date >= min;
  const onKeyDown = (event: KeyboardEvent) => {
    const moves: Record<string, () => IsoDate> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      PageUp: () => shiftMonth(focused, -1),
      PageDown: () => shiftMonth(focused, 1),
      Home: () => startOfWeek(focused, weekStart),
      End: () => addDays(startOfWeek(focused, weekStart), 6),
    };
    if (event.key === 'Escape') {
      // Que no llegue al diálogo del evento (lo cerraría).
      event.stopPropagation();
      event.preventDefault();
      onClose();
      return;
    }
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setFocused(move());
  };

  const weekdays = Array.from({ length: 7 }, (_, i) => (i + (weekStart === 1 ? 0 : 6)) % 7);
  const title = capitalize(
    new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
      asDate(firstOfMonth(year, month)),
    ),
  );
  return (
    <div
      ref={root}
      className="date-picker"
      role="dialog"
      aria-label={label}
      style={style}
      data-testid={testId}
      onKeyDown={onKeyDown}
    >
      <div className="date-picker-head">
        <span className="date-picker-title" aria-live="polite">
          {title}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label={t('calendar.prevMonth')}
          data-testid="date-picker-prev"
          onClick={() => setFocused(addMonths(focused, -1))}
        >
          <Icon name="chevron-izq" size={16} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={t('calendar.nextMonth')}
          data-testid="date-picker-next"
          onClick={() => setFocused(addMonths(focused, 1))}
        >
          <Icon name="chevron-der" size={16} />
        </button>
      </div>
      <div className="date-picker-grid" role="grid" aria-label={title}>
        <div role="row" className="date-picker-row">
          {weekdays.map((day) => (
            <span
              key={day}
              role="columnheader"
              className="date-picker-weekday"
              title={t(`calendar.weekdayNames.${day}`)}
            >
              {t(`calendar.weekdayInitials.${day}`)}
            </span>
          ))}
        </div>
        {Array.from({ length: 6 }, (_, w) => (
          <div role="row" className="date-picker-row" key={grid[w * 7]}>
            {grid.slice(w * 7, w * 7 + 7).map((date) => {
              const inRange = range && date > range.start && date < range.end;
              const edge = range ? date === range.start || date === range.end : date === value;
              const classes = [
                'date-picker-day',
                monthOf(date).month === month ? '' : 'other-month',
                date === today ? 'today' : '',
                edge ? 'selected' : '',
                inRange ? 'in-range' : '',
                range && date === range.start && range.end > range.start ? 'range-start' : '',
                range && date === range.end && range.end > range.start ? 'range-end' : '',
              ].filter(Boolean);
              return (
                <span role="gridcell" key={date} className={classes.join(' ')}>
                  <button
                    type="button"
                    data-date={date}
                    tabIndex={date === focused ? 0 : -1}
                    disabled={!allowed(date)}
                    aria-pressed={date === value}
                    aria-current={date === today ? 'date' : undefined}
                    aria-label={new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(
                      asDate(date),
                    )}
                    onClick={() => onPick(date)}
                    onKeyDown={(event) => {
                      if ((event.key === 'Enter' || event.key === ' ') && allowed(date)) {
                        event.preventDefault();
                        onPick(date);
                      }
                    }}
                  >
                    {Number(date.slice(8))}
                    {hasEvents?.(date) && <span className="date-picker-dot" aria-hidden="true" />}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className="date-picker-foot">
        <button
          type="button"
          className="link-button"
          disabled={!allowed(today)}
          onClick={() => onPick(today)}
        >
          {t('calendar.today')}
        </button>
      </div>
    </div>
  );
}
