import { useEffect, useRef, useState } from 'react';
import { Text, type TextProps } from './text';

export type CountUpProps = Omit<TextProps, 'children'> & {
  value: number;
  /** Format the (interpolated) number into the displayed string. */
  format?: (n: number) => string;
  /** Animation length in ms. */
  duration?: number;
};

/** Number that eases from its previous value to the next on change. */
export function CountUp({ value, format, duration = 700, ...textProps }: CountUpProps) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = Date.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setDisplay(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <Text {...textProps}>{format ? format(display) : String(Math.round(display))}</Text>;
}
