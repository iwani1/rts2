'use client';

import { useEffect, useRef, useState } from 'react';

const SLOT_COUNT = 6;
const SLOT_STEP_PX = 52; // 44px slot + 8px gap (+6 ring offset handled in CSS)

/**
 * DRV-03 (D-073) boarding-code entry, OTP-style (UI pilot, D-079): six
 * slots with a gliding focus ring over one real numeric input, so mobile
 * keyboards, paste and SMS autofill behave normally. Digits pop as they
 * land; the parent raises `invalidPulse` after a rejected verification
 * and the slots shake. Screen readers use the underlying labelled input;
 * the slots are presentation only.
 */
export function BoardingCodeInput({
  value,
  onChange,
  onComplete,
  invalidPulse = 0,
  disabled = false,
  ariaLabel = 'Boarding code from the passenger',
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  invalidPulse?: number;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [shaking, setShaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (invalidPulse <= 0) return;
    setShaking(true);
    const timer = window.setTimeout(() => setShaking(false), 450);
    return () => window.clearTimeout(timer);
  }, [invalidPulse]);

  const activeIndex = Math.min(value.length, SLOT_COUNT - 1);

  const handleChange = (raw: string) => {
    const next = raw.replace(/[^0-9]/g, '').slice(0, SLOT_COUNT);
    onChange(next);
    if (next.length === SLOT_COUNT) onComplete?.(next);
  };

  return (
    <div
      className={`rt-code${shaking ? ' rt-shake' : ''}`}
      onClick={() => inputRef.current?.focus()}
    >
      <div className="rt-code-slots" aria-hidden="true">
        {Array.from({ length: SLOT_COUNT }, (_, index) => {
          const digit = value[index];
          return (
            <span className={`rt-code-slot${digit ? ' is-filled' : ''}`} key={index}>
              {digit ? <span className="rt-code-digit" key={`${index}-${digit}`}>{digit}</span> : ''}
            </span>
          );
        })}
      </div>
      <span
        className="rt-code-ring"
        aria-hidden="true"
        style={{ transform: `translateX(${activeIndex * SLOT_STEP_PX}px)` }}
      />
      <input
        ref={inputRef}
        className="rt-code-input"
        aria-label={ariaLabel}
        autoComplete="one-time-code"
        disabled={disabled}
        inputMode="numeric"
        maxLength={SLOT_COUNT}
        onChange={(event) => handleChange(event.target.value)}
        type="text"
        value={value}
      />
    </div>
  );
}
