import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from './ui';

/** Lets users pick up a new version of the PWA without losing what they are doing. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="fixed inset-x-0 bottom-20 z-50 mx-auto flex w-[calc(100%-2rem)] max-w-md items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xl sm:bottom-6">
      <p className="flex-1 text-sm text-slate-700">A new version of CourtSync is ready.</p>
      <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
        Later
      </Button>
      <Button size="sm" onClick={() => updateServiceWorker(true)}>
        Update
      </Button>
    </div>
  );
}
