import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { centsToNumber, parseAmountToCents, toCents } from "../../utils/money";

interface AmountInputProps {
  /** Amount in rupees (0 = empty). */
  value: number;
  onChange: (rupees: number) => void;
  style?: CSSProperties;
  placeholder?: string;
  "aria-label"?: string;
}

/**
 * Text amount field that keeps what the user typed ("1000.", "1,000.5") while still reporting a decimal-safe
 * number. A plain number input bound to a number drops the trailing "." so decimals could not be typed.
 */
export default function AmountInput({ value, onChange, style, placeholder, "aria-label": ariaLabel }: AmountInputProps) {
  const [text, setText] = useState(value ? String(value) : "");

  // Follow outside changes (Quick Split, regenerate) but never overwrite text that already means the same amount.
  useEffect(() => {
    const parsed = parseAmountToCents(text);
    if ((parsed ?? 0) !== toCents(value)) setText(value ? String(value) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      aria-label={ariaLabel}
      style={style}
      onChange={(e) => {
        const next = e.target.value;
        if (next !== "" && !/^[\d,]*\.?\d{0,2}$/.test(next)) return;
        setText(next);
        const cents = parseAmountToCents(next);
        onChange(cents === null ? 0 : centsToNumber(cents));
      }}
    />
  );
}
