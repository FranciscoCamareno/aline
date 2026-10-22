import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { usePopoverPosition } from './DateField.tsx';

/** «HH:MM» a partir de lo escrito: «9», «930», «9.30», «09:30»… o null si no es una hora. */
export function parseTime(text: string): string | null {
  const clean = text.trim().replace(/[.,h ]/g, ':');
  const match = /^(\d{1,2})(?::?(\d{2}))?$/.exec(clean);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Horas que se ofrecen en la lista: cada media hora. */
const TIMES = Array.from(
  { length: 48 },
  (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
);

const LIST_WIDTH = 120;
const LIST_HEIGHT = 240;

/**
 * Campo de hora propio (plan 9.10): se escribe libremente y, al enfocarlo, ofrece una lista de
 * horas cada media hora (flechas para recorrerla, Intro para elegir). La hora solo cambia cuando
 * lo escrito es válido; al salir, el campo vuelve a mostrar la hora vigente.
 */
export function TimeField({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  onChange: (time: string) => void;
  testId: string;
}) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const style = usePopoverPosition(input, open, LIST_WIDTH, LIST_HEIGHT, () => setOpen(false));

  // Lo que cambia desde fuera (al marcar «todo el día» y volver, p. ej.) se refleja aquí, pero
  // no mientras se escribe: «1» no debe convertirse en «01:00» a mitad de escribir «10:30».
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    if (!editing) setText(value);
  }

  // La lista se abre en la hora vigente (o la más cercana).
  useEffect(() => {
    if (!open || !list.current) return;
    const index = Math.max(
      0,
      TIMES.findIndex((time) => time >= value),
    );
    list.current.children[index]?.scrollIntoView({ block: 'center' });
  }, [open, value]);

  const pick = (time: string) => {
    setText(time);
    onChange(time);
    setOpen(false);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      const from =
        active >= 0
          ? active
          : Math.max(
              0,
              TIMES.findIndex((time) => time >= value),
            );
      const next = Math.min(
        TIMES.length - 1,
        Math.max(0, from + (event.key === 'ArrowDown' ? 1 : -1)),
      );
      setActive(next);
      list.current?.children[next]?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && open && active >= 0) {
      event.preventDefault();
      pick(TIMES[active]!);
    } else if (event.key === 'Escape' && open) {
      // Que no llegue al diálogo del evento (lo cerraría).
      event.stopPropagation();
      setOpen(false);
    }
  };
  return (
    <label className="field time-field">
      <span>{label}</span>
      <input
        name="time"
        ref={input}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
        required
        value={text}
        placeholder="09:00"
        data-testid={testId}
        onFocus={() => {
          setEditing(true);
          setOpen(true);
        }}
        onBlur={() => {
          setEditing(false);
          setOpen(false);
          setActive(-1);
          setText(value);
        }}
        onKeyDown={onKeyDown}
        onChange={(e) => {
          setText(e.target.value);
          const time = parseTime(e.target.value);
          if (time) onChange(time);
          // Con la hora completa escrita, la lista ya no hace falta (y no tapa «Guardar»).
          setOpen(!/^\d{1,2}\D\d{2}$/.test(e.target.value.trim()));
        }}
      />
      {open &&
        createPortal(
          <ul ref={list} id={`${id}-list`} role="listbox" className="time-list" style={style}>
            {TIMES.map((time, index) => (
              <li
                key={time}
                id={`${id}-${index}`}
                role="option"
                aria-selected={time === value}
                className={index === active ? 'active' : ''}
                // Sin quitar el foco al campo: el clic elige y el campo sigue enfocado.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(time);
                }}
              >
                {time}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </label>
  );
}
