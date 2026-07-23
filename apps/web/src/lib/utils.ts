import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format match clock ms as mm:ss (or m' for football-style minute display). */
export function formatClock(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatMinute(ms: number): string {
  return `${Math.floor(ms / 60000)}'`;
}

/** A UUID that works offline (crypto.randomUUID is available in all modern browsers). */
export function uuid(): string {
  return crypto.randomUUID();
}
