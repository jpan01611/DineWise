import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Linking from 'expo-linking';

function extractHost(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const schemeMatch = trimmed.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^/:?#]+)/);
  if (schemeMatch?.[1]) return schemeMatch[1];

  if (trimmed.includes(':')) return trimmed.split(':')[0] || null;
  return null;
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

export function getBackendBaseUrl(): string | null {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && envUrl.trim()) {
    const trimmed = envUrl.replace(/\/$/, '');
    const envHost = extractHost(trimmed);
    if (envHost && Device.isDevice && isLoopbackHost(envHost)) {
      return null;
    }
    return trimmed;
  }

  const hostCandidates = [
    Constants.expoConfig?.hostUri,
    (Constants as any).manifest?.debuggerHost,
    (Constants as any).expoGoConfig?.debuggerHost,
    (Constants as any).expoConfig?.extra?.expoClient?.hostUri,
    (Constants as any).manifest2?.extra?.expoClient?.hostUri,
    (Constants as any).linkingUri,
    Linking.createURL('/'),
  ];

  for (const candidate of hostCandidates) {
    const host = extractHost(candidate as string | undefined);
    if (!host) continue;
    if (Device.isDevice && isLoopbackHost(host)) continue;
    return `http://${host}:8000`;
  }

  return null;
}
