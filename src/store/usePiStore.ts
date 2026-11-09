import { create } from 'zustand';
import type { AcpHandshakeResult } from '../types/acp';

export interface PiModel { provider: string; id: string; name: string }
export interface PiProbe extends AcpHandshakeResult { models?: PiModel[] }
interface PiState {
  models: PiModel[];
  isProbing: boolean;
  error: string | null;
  probe: () => Promise<PiProbe>;
}
let probeInFlight: Promise<PiProbe> | undefined;
export const usePiStore = create<PiState>((set) => ({
  models: [], isProbing: false, error: null,
  probe: () => {
    if (probeInFlight) return probeInFlight;
    set({ isProbing: true, error: null });
    probeInFlight = (async (): Promise<PiProbe> => {
      try {
        if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
          throw new Error('内置 Pi 需要 Tauri 桌面端和 Node.js 22.19+。');
        }
        const { invoke } = await import('@tauri-apps/api/core');
        const result = await invoke<PiProbe>('pi_probe');
        set({ models: result.models ?? [], error: result.ok ? null : result.message });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set({ models: [], error: message });
        return { ok: false, message };
      }
    })().finally(() => { probeInFlight = undefined; set({ isProbing: false }); });
    return probeInFlight;
  },
}));
