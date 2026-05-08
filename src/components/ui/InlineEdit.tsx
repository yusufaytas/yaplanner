'use client';

import { useState, useRef, useEffect } from 'react';

interface InlineEditTextProps {
  value: string;
  onSave: (val: string) => void;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
  emptyLabel?: string;
}

/** Click-to-edit text field. Saves on blur or Enter (Escape cancels). */
export function InlineEditText({
  value,
  onSave,
  placeholder = 'Click to edit…',
  className = '',
  multiline = false,
  emptyLabel,
}: InlineEditTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);

  function startEditing() {
    setDraft(value);
    setEditing(true);
  }

  function commit() {
    const trimmed = draft.trim();
    if (trimmed !== value) onSave(trimmed);
    setEditing(false);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={startEditing}
        onKeyDown={(e) => e.key === 'Enter' && startEditing()}
        title="Click to edit"
        className={`cursor-text rounded px-0.5 -mx-0.5 hover:bg-white/8 focus:outline-none focus:ring-1 focus:ring-sky-400/40 transition-colors ${
          !value && emptyLabel ? 'text-zinc-600 italic' : ''
        } ${className}`}
      >
        {value || emptyLabel || <span className="text-zinc-600 italic">{placeholder}</span>}
      </span>
    );
  }

  const sharedProps = {
    ref,
    value: draft,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
      if (!multiline && e.key === 'Enter') { e.preventDefault(); commit(); }
    },
    className: `w-full rounded border border-sky-400/40 bg-zinc-900 px-1.5 py-0.5 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-sky-400/60 ${className}`,
  };

  return multiline ? (
    <textarea {...sharedProps} rows={3} style={{ resize: 'vertical' }} />
  ) : (
    <input {...sharedProps} type="text" />
  );
}

interface InlineEditSelectProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onSave: (val: T) => void;
  className?: string;
}

/** Click-to-edit select dropdown. */
export function InlineEditSelect<T extends string>({
  value,
  options,
  onSave,
  className = '',
}: InlineEditSelectProps<T>) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  if (!editing) {
    const label = options.find((o) => o.value === value)?.label ?? (value ? '(unknown)' : '—');
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={() => setEditing(true)}
        onKeyDown={(e) => e.key === 'Enter' && setEditing(true)}
        title="Click to edit"
        className={`cursor-pointer rounded px-0.5 -mx-0.5 hover:bg-white/8 focus:outline-none focus:ring-1 focus:ring-sky-400/40 transition-colors ${className}`}
      >
        {label}
      </span>
    );
  }

  return (
    <select
      ref={ref}
      defaultValue={value}
      onChange={(e) => { onSave(e.target.value as T); setEditing(false); }}
      onBlur={() => setEditing(false)}
      className={`rounded border border-sky-400/40 bg-zinc-900 px-1.5 py-0.5 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-sky-400/60 ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

interface InlineEditNumberProps {
  value: number;
  onSave: (val: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
  className?: string;
}

/** Click-to-edit number field. */
export function InlineEditNumber({
  value,
  onSave,
  min,
  max,
  suffix = '',
  className = '',
}: InlineEditNumberProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) { ref.current?.focus(); ref.current?.select(); }
  }, [editing]);

  function startEditing() {
    setDraft(String(value));
    setEditing(true);
  }

  function commit() {
    const n = parseFloat(draft);
    if (!isNaN(n)) {
      const clamped = min !== undefined && max !== undefined
        ? Math.min(max, Math.max(min, n))
        : min !== undefined ? Math.max(min, n)
        : max !== undefined ? Math.min(max, n)
        : n;
      if (clamped !== value) onSave(clamped);
    }
    setEditing(false);
  }

  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={startEditing}
        onKeyDown={(e) => e.key === 'Enter' && startEditing()}
        title="Click to edit"
        className={`cursor-text rounded px-0.5 -mx-0.5 hover:bg-white/8 focus:outline-none focus:ring-1 focus:ring-sky-400/40 transition-colors ${className}`}
      >
        {value}{suffix}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-0.5">
      <input
        ref={ref}
        type="number"
        value={draft}
        min={min}
        max={max}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') setEditing(false);
        }}
        className={`w-20 rounded border border-sky-400/40 bg-zinc-900 px-1.5 py-0.5 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-sky-400/60 ${className}`}
      />
      {suffix && <span className="text-zinc-400 text-sm">{suffix}</span>}
    </span>
  );
}
