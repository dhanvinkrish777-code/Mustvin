import React from 'react';
import { Cpu, Wifi } from 'lucide-react';
import { useOnlineStatus } from '../hooks/usePWA';

export const OfflineIndicator: React.FC = () => {
  const { isOnline, browserOnline, forceOffline, setForceOffline } = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2.5 rounded-xl bg-white dark:bg-[#0c0c0c] border border-amber-500 dark:border-amber-700/60 px-3.5 py-2 text-xs text-black dark:text-amber-200 shadow-2xl">
      <Cpu className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
      <span>
        {!browserOnline
          ? 'Offline Mode — Local Neural Core & Voice Active'
          : 'Local Offline Core Active'}
      </span>
      {browserOnline && forceOffline && (
        <button
          onClick={() => setForceOffline(false)}
          className="ml-1 inline-flex items-center gap-1 rounded-md bg-black text-white dark:bg-white dark:text-black hover:opacity-90 px-2 py-0.5 text-[11px] font-semibold transition cursor-pointer"
        >
          <Wifi className="w-3 h-3" />
          <span>Go Online</span>
        </button>
      )}
    </div>
  );
};
