import React, { useEffect } from 'react';
import { getCalendarMonthImage, preloadCalendarAround } from '../../lib/decorativeImages';

export interface CalendarBackdropProps {
  monthIndex: number;
  isCustomVisual?: boolean;
  opacity?: number;
  className?: string;
}

/**
 * Shared calendar decorative backdrop used across Academics, Memory Wall (Journal),
 * and Lifestyle Calendar. Ensures 100% visual parity, deterministic monthly mapping,
 * and idle preloading without duplicated implementations.
 */
export const CalendarBackdrop: React.FC<CalendarBackdropProps> = ({
  monthIndex,
  isCustomVisual = false,
  opacity = 0.42,
  className = '',
}) => {
  const calBg = isCustomVisual ? getCalendarMonthImage(monthIndex) : null;

  useEffect(() => {
    if (isCustomVisual) {
      preloadCalendarAround(monthIndex);
    }
  }, [monthIndex, isCustomVisual]);

  if (!calBg) return null;

  return (
    <div
      className={`absolute inset-0 pointer-events-none z-0 bg-cover bg-center rounded-3xl transition-opacity duration-300 ${className}`}
      style={{
        backgroundImage: `url("${calBg}")`,
        opacity,
      }}
    />
  );
};
