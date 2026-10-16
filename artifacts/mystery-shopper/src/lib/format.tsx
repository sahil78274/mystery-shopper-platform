import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getPreferences } from '@workspace/api-client-react';
import { useAuth } from './auth';
import { DEFAULT_PREFERENCES, type Preferences } from '@/components/common';

/**
 * The signed-in account's display preferences are applied app-wide:
 * `formatDate`/`formatDateTime` read the active value, and saving preferences
 * in Settings re-renders the whole tree with the new formatting.
 */
let activePreferences: Preferences = DEFAULT_PREFERENCES;

export function setActivePreferences(preferences: Preferences): void {
  activePreferences = preferences;
}

export function getActivePreferences(): Preferences {
  return activePreferences;
}

function safeTimezone(value?: string | null): string {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value || 'UTC' });
    return value || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function formatDate(value?: string | null, preferences: Preferences = activePreferences): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const timeZone = safeTimezone(preferences.timezone);
  if (preferences.dateFormat === 'yyyy-MM-dd') {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date);
  }
  if (preferences.dateFormat === 'dd/MM/yyyy' || preferences.dateFormat === 'MM/dd/yyyy') {
    const parts = new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone,
    }).formatToParts(date);
    const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return preferences.dateFormat === 'dd/MM/yyyy'
      ? `${lookup.day}/${lookup.month}/${lookup.year}`
      : `${lookup.month}/${lookup.day}/${lookup.year}`;
  }
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone }).format(date);
}

export function formatDateTime(value?: string | null, preferences: Preferences = activePreferences): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: preferences.timeFormat === '12h',
    timeZone: safeTimezone(preferences.timezone),
  }).format(date);
}

export function formatMonthLabel(month: string): string {
  const [year, monthIndex] = month.split('-');
  const date = new Date(Date.UTC(Number(year), Number(monthIndex) - 1, 1));
  if (Number.isNaN(date.getTime())) return month;
  return new Intl.DateTimeFormat('en', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(date);
}

export function formatScore(value?: number | null): string {
  if (value == null) return 'Not scored';
  return `${Math.round(value * 10) / 10}%`;
}

export function formatTrend(value?: number | null): string {
  if (value == null) return '—';
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}

type PreferencesContextValue = {
  preferences: Preferences;
  apply: (next: Preferences) => void;
  loaded: boolean;
};

const PreferencesContext = createContext<PreferencesContextValue>({
  preferences: DEFAULT_PREFERENCES,
  apply: () => undefined,
  loaded: false,
});

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  const [preferences, setPreferences] = useState<Preferences>(activePreferences);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!token) {
      setPreferences(DEFAULT_PREFERENCES);
      setActivePreferences(DEFAULT_PREFERENCES);
      setLoaded(false);
      return;
    }
    let active = true;
    getPreferences()
      .then((saved) => {
        if (!active) return;
        setPreferences(saved);
        setActivePreferences(saved);
      })
      .catch(() => {
        // Keep the defaults when preferences cannot be loaded.
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [token, user?.id]);

  const apply = (next: Preferences) => {
    setPreferences(next);
    setActivePreferences(next);
  };

  return (
    <PreferencesContext.Provider value={{ preferences, apply, loaded }}>{children}</PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  return useContext(PreferencesContext);
}
