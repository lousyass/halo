import React, { useEffect } from 'react';
import { getCalendarMonthImage, getDecorativeImage, preloadCalendarAround } from '../../lib/decorativeImages';

export interface CalendarBackdropProps {
  monthIndex: number;
  theme?: string;
  isCustomVisual?: boolean;
  opacity?: number;
  className?: string;
}

/**
 * Shared calendar decorative backdrop used across Academics, Memory Wall (Journal),
 * and Lifestyle Calendar. Ensures 100% visual parity, deterministic monthly mapping,
 * and idle preloading without duplicated implementations. Supports custom themes.
 */
export const CalendarBackdrop: React.FC<CalendarBackdropProps> = ({
  monthIndex,
  theme,
  isCustomVisual = false,
  opacity = 0.42,
  className = '',
}) => {
  const calBg = isCustomVisual
    ? theme?.startsWith('custom:')
      ? getDecorativeImage('calendar', theme)
      : getCalendarMonthImage(monthIndex)
    : null;

  useEffect(() => {
    if (isCustomVisual && !theme?.startsWith('custom:')) {
      preloadCalendarAround(monthIndex);
    }
  }, [monthIndex, isCustomVisual, theme]);

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
