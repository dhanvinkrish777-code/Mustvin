import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWA';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-[#121212] dark:hover:bg-neutral-800 border border-neutral-300 dark:border-neutral-800 text-xs font-medium text-black dark:text-white transition whitespace-nowrap cursor-pointer"
        title="Install Jarvis for standalone offline access"
      >
        <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
        <span>Install</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-[#121212] dark:hover:bg-neutral-800 border border-neutral-300 dark:border-neutral-800 text-xs font-medium text-black dark:text-white transition whitespace-nowrap cursor-pointer"
        >
          <Share className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>Install</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#0a0a0a] border border-neutral-300 dark:border-neutral-800 p-6 text-black dark:text-neutral-200">
              <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
                <h3 className="text-sm font-display font-bold text-black dark:text-white">
                  Install Jarvis on iOS
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-4 space-y-2.5 text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">
                <p>
                  1. Tap the <strong className="text-black dark:text-white">Share</strong> button in Safari.
                </p>
                <p>
                  2. Select <strong className="text-black dark:text-white">Add to Home Screen</strong>.
                </p>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-black text-white dark:bg-white dark:text-black hover:opacity-90 py-2 text-xs font-semibold transition cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
