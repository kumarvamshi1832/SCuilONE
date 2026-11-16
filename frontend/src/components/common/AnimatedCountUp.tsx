import { useEffect, useState, useRef } from "react";
import { useReducedMotion } from "motion/react";

interface AnimatedCountUpProps {
  value: number | string | null | undefined;
  duration?: number; // duration in milliseconds, default 900ms
  className?: string;
}

/**
 * Extracts numeric value, prefix (e.g. "₹" or "$"), suffix (e.g. "%"), and comma format.
 */
function parseValue(val: number | string): {
  isNumeric: boolean;
  targetNum: number;
  prefix: string;
  suffix: string;
  hasCommas: boolean;
  decimals: number;
} {
  if (typeof val === "number") {
    const decStr = String(val).split(".")[1];
    return {
      isNumeric: !isNaN(val) && isFinite(val),
      targetNum: val,
      prefix: "",
      suffix: "",
      hasCommas: false,
      decimals: decStr ? decStr.length : 0,
    };
  }

  const str = String(val).trim();
  if (!str || str === "—" || str === "-") {
    return {
      isNumeric: false,
      targetNum: 0,
      prefix: "",
      suffix: "",
      hasCommas: false,
      decimals: 0,
    };
  }

  // Regex to match prefix, digits/commas/period, and suffix
  const match = str.match(/^([^\d.-]*)([\d,]+(?:\.\d+)?)(.*)$/);
  if (!match || !match[2]) {
    return {
      isNumeric: false,
      targetNum: 0,
      prefix: "",
      suffix: "",
      hasCommas: false,
      decimals: 0,
    };
  }

  const prefix = match[1] || "";
  const numPart = match[2];
  const suffix = match[3] || "";
  const rawNumStr = numPart.replace(/,/g, "");
  const targetNum = parseFloat(rawNumStr);

  if (isNaN(targetNum)) {
    return {
      isNumeric: false,
      targetNum: 0,
      prefix: "",
      suffix: "",
      hasCommas: false,
      decimals: 0,
    };
  }

  const decStr = rawNumStr.split(".")[1];

  return {
    isNumeric: true,
    targetNum,
    prefix,
    suffix,
    hasCommas: numPart.includes(","),
    decimals: decStr ? decStr.length : 0,
  };
}

function formatWithIndianCommas(x: number, decimals: number): string {
  const parts = x.toFixed(decimals).split(".");
  let intPart = parts[0] ?? "0";
  const decPart = parts.length > 1 && parts[1] !== undefined ? "." + parts[1] : "";
  const isNegative = intPart.startsWith("-");
  if (isNegative) intPart = intPart.substring(1);

  // Indian number formatting: last 3 digits, then groups of 2
  const lastThree = intPart.length > 3 ? intPart.substring(intPart.length - 3) : intPart;
  const otherNumbers = intPart.length > 3 ? intPart.substring(0, intPart.length - 3) : "";
  const formattedInt =
    otherNumbers !== ""
      ? otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree
      : lastThree;

  return (isNegative ? "-" : "") + formattedInt + decPart;
}

export default function AnimatedCountUp({
  value,
  duration = 900,
  className,
}: AnimatedCountUpProps) {
  const prefersReduced = useReducedMotion();
  const parsed = parseValue(value ?? "");

  const [displayValue, setDisplayValue] = useState<string>(() => {
    if (!parsed.isNumeric || prefersReduced) {
      return value == null ? "—" : String(value);
    }
    // Start from 0 with prefix/suffix
    const formattedZero = parsed.hasCommas
      ? formatWithIndianCommas(0, parsed.decimals)
      : (0).toFixed(parsed.decimals);
    return `${parsed.prefix}${formattedZero}${parsed.suffix}`;
  });

  const prevTargetRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!parsed.isNumeric || prefersReduced) {
      setDisplayValue(value == null ? "—" : String(value));
      return;
    }

    const startVal = prevTargetRef.current;
    const endVal = parsed.targetNum;
    prevTargetRef.current = endVal;

    // If starting and ending at same value, render directly
    if (startVal === endVal) {
      const formatted = parsed.hasCommas
        ? formatWithIndianCommas(endVal, parsed.decimals)
        : endVal.toFixed(parsed.decimals);
      setDisplayValue(`${parsed.prefix}${formatted}${parsed.suffix}`);
      return;
    }

    const startTime = performance.now();

    const updateCounter = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic curve
      const ease = 1 - Math.pow(1 - progress, 3);
      const currentNum = startVal + (endVal - startVal) * ease;

      const formattedNum = parsed.hasCommas
        ? formatWithIndianCommas(currentNum, parsed.decimals)
        : currentNum.toFixed(parsed.decimals);

      setDisplayValue(`${parsed.prefix}${formattedNum}${parsed.suffix}`);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(updateCounter);
      } else {
        const finalFormatted = parsed.hasCommas
          ? formatWithIndianCommas(endVal, parsed.decimals)
          : endVal.toFixed(parsed.decimals);
        setDisplayValue(`${parsed.prefix}${finalFormatted}${parsed.suffix}`);
      }
    };

    animationFrameRef.current = requestAnimationFrame(updateCounter);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [value, duration, prefersReduced, parsed.isNumeric, parsed.targetNum, parsed.prefix, parsed.suffix, parsed.hasCommas, parsed.decimals]);

  return <span className={className}>{displayValue}</span>;
}
