import { useRef, useEffect } from 'react';

interface SwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  maxVerticalMovement?: number;
  enabled?: boolean;
}

export const useSwipeGesture = ({
  onSwipeLeft,
  onSwipeRight,
  threshold = 60,
  maxVerticalMovement = 40,
  enabled = true
}: SwipeGestureOptions) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      // Only trigger swipe if horizontal movement is significant and greater than vertical
      if (absDeltaX >= threshold && absDeltaX > absDeltaY * 1.5 && absDeltaY <= maxVerticalMovement) {
        if (deltaX > 0 && onSwipeRight) {
          e.preventDefault();
          onSwipeRight();
        } else if (deltaX < 0 && onSwipeLeft) {
          e.preventDefault();
          onSwipeLeft();
        }
      }

      touchStartRef.current = null;
    };

    const handleTouchMove = (e: TouchEvent) => {
      // Prevent default only for horizontal swipes to allow vertical scrolling
      if (!touchStartRef.current) return;
      
      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      // If it's clearly a horizontal gesture, prevent default
      if (absDeltaX > absDeltaY * 1.5 && absDeltaX > 20) {
        e.preventDefault();
      }
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchend', handleTouchEnd, { passive: false });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchmove', handleTouchMove);
    };
  }, [onSwipeLeft, onSwipeRight, threshold, maxVerticalMovement, enabled]);

  return elementRef;
};