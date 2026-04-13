import { Injectable, signal } from '@angular/core';

export type DebugLogLevel = 'info' | 'warn' | 'error';

export interface DebugLogEntry {
  tsIso: string;
  level: DebugLogLevel;
  message: string;
  details?: Record<string, unknown>;
}

const STORAGE_KEY = 'ideas_restaurant_debug_log_v1';
const MAX_ENTRIES = 300;

@Injectable({ providedIn: 'root' })
export class DebugLogService {
  readonly entries = signal<DebugLogEntry[]>(this.load());

  info(message: string, details?: Record<string, unknown>): void {
    this.add('info', message, details);
  }

  warn(message: string, details?: Record<string, unknown>): void {
    this.add('warn', message, details);
  }

  error(message: string, details?: Record<string, unknown>): void {
    this.add('error', message, details);
  }

  clear(): void {
    this.entries.set([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  exportText(): string {
    const lines = this.entries().map((e) => {
      const base = `[${e.tsIso}] ${e.level.toUpperCase()} ${e.message}`;
      if (!e.details) return base;
      return `${base} | ${safeJson(e.details)}`;
    });
    return lines.join('\n');
  }

  private add(level: DebugLogLevel, message: string, details?: Record<string, unknown>): void {
    const entry: DebugLogEntry = {
      tsIso: new Date().toISOString(),
      level,
      message: String(message ?? ''),
      details,
    };

    this.entries.update((cur) => {
      const next = [...cur, entry].slice(-MAX_ENTRIES);
      this.persist(next);
      return next;
    });
  }

  private load(): DebugLogEntry[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((e) => e as Partial<DebugLogEntry>)
        .filter((e) => typeof e.tsIso === 'string' && typeof e.level === 'string' && typeof e.message === 'string')
        .map((e) => ({
          tsIso: e.tsIso as string,
          level: (e.level as DebugLogLevel) ?? 'info',
          message: e.message as string,
          details: (e.details as Record<string, unknown>) ?? undefined,
        }));
    } catch {
      return [];
    }
  }

  private persist(value: DebugLogEntry[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // ignore
    }
  }
}

function safeJson(input: unknown): string {
  try {
    return JSON.stringify(input);
  } catch {
    return '"[unserializable]"';
  }
}

