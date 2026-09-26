import { useRegisterSW } from 'virtual:pwa-register/react';

/** Meldt een nieuwe versie; herladen gebeurt pas als jij dat wilt (geen verrassingen midden in invoer). */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;
  return (
    <div className="toast row" role="status" style={{ gap: 12 }}>
      <span>Er is een nieuwe versie van Urenklok.</span>
      <button type="button" className="btn btn-sm btn-primary" onClick={() => void updateServiceWorker(true)}>
        Vernieuwen
      </button>
      <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'inherit' }} onClick={() => setNeedRefresh(false)}>
        Later
      </button>
    </div>
  );
}
