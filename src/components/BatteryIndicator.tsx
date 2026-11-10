import React, { useState, useEffect } from 'react';
import { Battery, BatteryCharging, BatteryLow, BatteryMedium, BatteryWarning } from 'lucide-react';

interface BatteryManager extends EventTarget {
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
  level: number;
  onchargingchange: ((this: BatteryManager, ev: Event) => any) | null;
  onlevelchange: ((this: BatteryManager, ev: Event) => any) | null;
}

export const BatteryIndicator: React.FC = () => {
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState<boolean>(false);
  const [isSupported, setIsSupported] = useState<boolean>(true);

  useEffect(() => {
    let batteryInstance: BatteryManager | null = null;
    let isMounted = true;

    const updateBatteryInfo = (bm: BatteryManager) => {
      if (!isMounted) return;
      setBatteryLevel(Math.round(bm.level * 100));
      setIsCharging(bm.charging);
    };

    const handleLevelChange = () => {
      if (batteryInstance) updateBatteryInfo(batteryInstance);
    };

    const handleChargingChange = () => {
      if (batteryInstance) updateBatteryInfo(batteryInstance);
    };

    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      (navigator as any)
        .getBattery()
        .then((bm: BatteryManager) => {
          if (!isMounted) return;
          batteryInstance = bm;
          updateBatteryInfo(bm);

          bm.addEventListener('levelchange', handleLevelChange);
          bm.addEventListener('chargingchange', handleChargingChange);
        })
        .catch(() => {
          if (isMounted) setIsSupported(false);
        });
    } else {
      setIsSupported(false);
    }

    // Periodic check every 30 seconds as safeguard
    const interval = setInterval(() => {
      if (batteryInstance && isMounted) {
        updateBatteryInfo(batteryInstance);
      }
    }, 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
      if (batteryInstance) {
        batteryInstance.removeEventListener('levelchange', handleLevelChange);
        batteryInstance.removeEventListener('chargingchange', handleChargingChange);
      }
    };
  }, []);

  if (!isSupported || batteryLevel === null) {
    return null;
  }

  // Choose icon and color based on level & charging
  const getBatteryIcon = () => {
    if (isCharging) {
      return <BatteryCharging className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />;
    }
    if (batteryLevel <= 15) {
      return <BatteryLow className="w-3.5 h-3.5 text-red-500" />;
    }
    if (batteryLevel <= 35) {
      return <BatteryWarning className="w-3.5 h-3.5 text-amber-500" />;
    }
    if (batteryLevel <= 70) {
      return <BatteryMedium className="w-3.5 h-3.5 text-black dark:text-white" />;
    }
    return <Battery className="w-3.5 h-3.5 text-emerald-500" />;
  };

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-[#0d0d0d] dark:hover:bg-neutral-900 border border-neutral-300 dark:border-neutral-800 text-xs font-mono transition cursor-default select-none"
      title={`Device Battery: ${batteryLevel}%${isCharging ? ' (Charging)' : ''}`}
    >
      {getBatteryIcon()}
      <span className="text-[11px] font-semibold text-black dark:text-neutral-200">
        {batteryLevel}%
      </span>
      {isCharging && (
        <span className="text-[9px] uppercase px-1 py-0.2 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-sans font-bold rounded">
          AC
        </span>
      )}
    </div>
  );
};
