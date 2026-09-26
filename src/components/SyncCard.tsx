import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type ChangeEvent } from 'react';
import { exportAll, mergeFromBackup, previewMerge, setSetting, SETTING_LAST_BACKUP, SETTING_LAST_SYNC } from '../db/actions';
import { db } from '../db/db';
import { parseBackup, type Backup } from '../lib/backup';
import { formatDate, formatTime, toDateInput } from '../lib/dates';
import { downloadFile } from '../lib/download';
import { hasChanges, type MergeStats } from '../lib/merge';
import { DownloadIcon, SyncIcon, UploadIcon } from './Icons';
import { Modal } from './Modal';
import { useToast } from './Toast';

/**
 * Synchroniseren zonder server: maak op het ene apparaat een sync-bestand en voeg het
 * op het andere samen. Nieuwste wijziging wint; verwijderingen gaan mee.
 */
export function SyncCard() {
  const toast = useToast();
  const lastSync = useLiveQuery(async () => (await db.settings.get(SETTING_LAST_SYNC))?.value as number | undefined);
  const [pending, setPending] = useState<{ backup: Backup; stats: MergeStats } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const makeFile = async () => {
    const backup = await exportAll();
    const name = `urenklok-sync-${toDateInput(Date.now())}.json`;
    const content = JSON.stringify(backup);
    await setSetting(SETTING_LAST_BACKUP, Date.now());
    // Op de telefoon: via het deelmenu direct naar OneDrive, mail, WhatsApp…
    const file = new File([content], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Urenklok sync-bestand' });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    downloadFile(name, content, 'application/json');
    toast('Sync-bestand gedownload');
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    const result = parseBackup(await file.text());
    if (!result.ok) return setError(result.error);
    setPending({ backup: result.backup, stats: await previewMerge(result.backup) });
  };

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await mergeFromBackup(pending.backup);
      toast('Samengevoegd');
      setPending(null);
    } catch {
      setError('Samenvoegen is mislukt; je gegevens zijn ongewijzigd.');
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card screen" style={{ gap: 12 }}>
      <div>
        <h2>Synchroniseren tussen apparaten</h2>
        <p className="muted small">
          Zonder account of server. Maak op het ene apparaat een sync-bestand, zet het op het andere apparaat (bijv. via
          OneDrive, mail of AirDrop) en kies daar <em>Samenvoegen</em>. Doe daarna hetzelfde in omgekeerde richting. De
          nieuwste wijziging wint; verwijderde sessies worden ook op het andere apparaat verwijderd.
        </p>
      </div>
      <p className="small muted">
        {lastSync ? `Laatst samengevoegd op ${formatDate(lastSync)} om ${formatTime(lastSync)}` : 'Nog niet gesynchroniseerd op dit apparaat'}
      </p>
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={() => void makeFile()}>
          <DownloadIcon /> Sync-bestand maken
        </button>
        <label className="btn">
          <UploadIcon /> Samenvoegen uit bestand…
          <input type="file" accept="application/json,.json" onChange={onFile} hidden />
        </label>
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      <Modal open={pending !== null} onClose={() => setPending(null)} title="Samenvoegen?">
        {pending && (
          <>
            <p className="muted small">
              Bestand van {pending.backup.exportedAt ? formatDate(new Date(pending.backup.exportedAt)) : 'onbekende datum'}
              {pending.backup.exportedAt && ` om ${formatTime(new Date(pending.backup.exportedAt))}`}.
            </p>
            {hasChanges(pending.stats) ? (
              <ul className="merge-stats">
                {describe(pending.stats).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p>Er is niets nieuws: dit apparaat is al bijgewerkt.</p>
            )}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setPending(null)} autoFocus>
                Annuleren
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void confirm()} disabled={busy || !hasChanges(pending.stats)}>
                <SyncIcon /> Samenvoegen
              </button>
            </div>
          </>
        )}
      </Modal>
    </section>
  );
}

function describe(s: MergeStats): string[] {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  const lines: string[] = [];
  if (s.sessionsAdded) lines.push(`${n(s.sessionsAdded, 'nieuwe sessie', 'nieuwe sessies')} toevoegen`);
  if (s.sessionsUpdated) lines.push(`${n(s.sessionsUpdated, 'sessie', 'sessies')} bijwerken`);
  if (s.sessionsRemoved) lines.push(`${n(s.sessionsRemoved, 'sessie', 'sessies')} verwijderen (op het andere apparaat verwijderd)`);
  if (s.projectsAdded) lines.push(`${n(s.projectsAdded, 'nieuw project', 'nieuwe projecten')} toevoegen`);
  if (s.projectsUpdated) lines.push(`${n(s.projectsUpdated, 'project', 'projecten')} bijwerken`);
  if (s.preferencesUpdated) lines.push('Doelen en factuurinstellingen bijwerken');
  if (s.runningClosed) lines.push(`${n(s.runningClosed, 'lopende sessie', 'lopende sessies')} stoppen (er liep er op beide apparaten één)`);
  return lines;
}
