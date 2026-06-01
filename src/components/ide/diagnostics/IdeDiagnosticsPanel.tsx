import React, { useState, useEffect } from 'react';
import { featureFlags } from '@/utils/featureFlags';
import { useIdeStore } from '../store/ideStore';
import { saveQueue } from '@/utils/saveQueue';
import { realtimeManager } from '@/lib/realtimeManager';
import { stabilityScorecard } from '@/utils/stabilityScorecard';
import { useIdeHealth } from '@/hooks/useIdeHealth';

export const IdeDiagnosticsPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [metrics, setMetrics] = useState({
    monacoModels: 0,
    queueDepth: 0,
    activeChannels: 0,
    offlineQueue: 0,
  });

  const { isOffline: offlineMode } = useIdeHealth();
  const activeFileId = useIdeStore((state) => state.activeFileId);

  useEffect(() => {
    if (!featureFlags.enableDevDiagnostics) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    // Passive polling interval for metrics to avoid heavy store subscriptions
    const interval = setInterval(() => {
      let monacoCount = 0;
      if (typeof window !== 'undefined' && (window as any).monaco) {
        monacoCount = (window as any).monaco.editor.getModels().length;
      }

      setMetrics({
        monacoModels: monacoCount,
        queueDepth: saveQueue.getQueueDepth(),
        activeChannels: realtimeManager.getActiveChannelCount(),
        offlineQueue: saveQueue.getOfflineQueueDepth(),
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen]);

  if (!featureFlags.enableDevDiagnostics || !isOpen) return null;

  const score = stabilityScorecard.getReport();

  return (
    <div className="fixed bottom-4 right-4 w-80 bg-black/90 border border-emerald-500/30 rounded-lg p-4 text-emerald-400 font-mono text-xs z-[9999] shadow-2xl backdrop-blur-sm select-none pointer-events-none">
      <div className="flex justify-between border-b border-emerald-500/30 pb-2 mb-2 font-bold">
        <span>IDE Diagnostics (Ctrl+Shift+D)</span>
        <span className={offlineMode ? "text-amber-500" : "text-emerald-500"}>
          {offlineMode ? "OFFLINE" : "ONLINE"}
        </span>
      </div>

      <div className="text-[9px] opacity-60 mb-2 border-b border-emerald-500/30 pb-2">
        <div>[CODETRACE BUILD]</div>
        <div>ID: {import.meta.env.VITE_BUILD_ID || 'dev-local'}</div>
        <div>ENV: {import.meta.env.MODE}</div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="opacity-70">Monaco Models:</span>
          <span>{metrics.monacoModels}</span>
        </div>
        <div className="flex justify-between">
          <span className="opacity-70">Save Queue Depth:</span>
          <span>{metrics.queueDepth}</span>
        </div>
        <div className="flex justify-between">
          <span className="opacity-70">Offline Queue:</span>
          <span>{metrics.offlineQueue}</span>
        </div>
        <div className="flex justify-between">
          <span className="opacity-70">Active Channels:</span>
          <span>{metrics.activeChannels}</span>
        </div>
        <div className="flex justify-between">
          <span className="opacity-70">Active File ID:</span>
          <span className="truncate max-w-[120px]" title={activeFileId || 'None'}>
            {activeFileId || 'None'}
          </span>
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-emerald-500/30">
        <div className="font-bold mb-1">Stability Scorecard</div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] opacity-80">
          <div>WS: {score.websocketStability}</div>
          <div>Monaco: {score.monacoStability}</div>
          <div>Save: {score.saveIntegrity}</div>
          <div>Exec: {score.executionIntegrity}</div>
          <div>Offline: {score.offlineRecoverySuccesses}</div>
          <div>Iframe: {score.iframeCleanupSuccesses}</div>
        </div>
      </div>
    </div>
  );
};
