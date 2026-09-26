import { addDays, endOfYear, startOfYear, subMonths } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { DownloadIcon, UploadIcon } from '../components/Icons';
import { ConfirmDialog } from '../components/Modal';
import { useToast } from '../components/Toast';
import { exportAll, replaceAll, setSetting, SETTING_LAST_BACKUP } from '../db/actions';
import { db } from '../db/db';
import { exportCsv, sessionsStartingIn } from '../lib/csvExport';
import { parseBackup, type Backup } from '../lib/backup';
import { combineDateTime, decimalHours, formatDate, formatDecimalNl, formatTime, periodRange, toDateInput } from '../lib/dates';
import { downloadFile } from '../lib/download';
import { netMs } from '../lib/time';

export function DataScreen() {
  const toast = useToast();
  const month = periodRange('month', Date.now());
  const [from, setFrom] = useState(toDateInput(month.start));
  const [to, setTo] = useState(toDateInput(addDays(month.end, -1)));

  const range = useMemo(() => {
    const start = combineDateTime(from, '00:00');
    const end = addDays(combineDateTime(to, '00:00'), 1).getTime();
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
  }, [from, to]);

  const preview = useLiveQuery(async () => {
    if (!range) return null;
    const list = (await sessionsStartingIn(range)).filter((s) => s.end !== null);
    return { count: list.length, ms: list.reduce((sum, s) => sum + netMs(s, s.end!), 0) };
  }, [range?.start, range?.end]);

  const counts = useLiveQuery(async () => ({ projects: await db.projects.count(), sessions: await db.sessions.count() }));
  const lastBackup = useLiveQuery(async () => (await db.settings.get(SETTING_LAST_BACKUP))?.value as number | undefined);

  const [pending, setPending] = useState<Backup | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(null));
  }, []);

  const setPreset = (start: Date | number, endInclusive: Date | number) => {
    setFrom(toDateInput(start));
    setTo(toDateInput(endInclusive));
  };

  const onExportCsv = async () => {
    if (!range) return;
    const n = await exportCsv(range);
    toast(n === 0 ? 'Geen afgeronde sessies in deze periode.' : `${n} sessies geëxporteerd`);
  };

  const onBackup = async () => {
    const backup = await exportAll();
    downloadFile(`urenklok-backup-${toDateInput(Date.now())}.json`, JSON.stringify(backup, null, 2), 'application/json');
    await setSetting(SETTING_LAST_BACKUP, Date.now());
    toast('Back-up gedownload');
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError(null);
    const result = parseBackup(await file.text());
    if (result.ok) setPending(result.backup);
    else setImportError(result.error);
  };

  const now = new Date();

  return (
    <div className="screen">
      <div className="screen-header">
        <h1>Gegevens</h1>
      </div>

      <section className="card screen" style={{ gap: 12 }}>
        <div>
          <h2>Exporteren naar CSV</h2>
          <p className="muted small">
            Voor Excel: puntkomma als scheidingsteken, uren als decimaal getal. Sessies tellen op hun startdatum; lopende
            sessies worden overgeslagen.
          </p>
        </div>
        <div className="row">
          <button type="button" className="btn btn-sm" onClick={() => setPreset(month.start, addDays(month.end, -1))}>
            Deze maand
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              const prev = periodRange('month', subMonths(now, 1));
              setPreset(prev.start, addDays(prev.end, -1));
            }}
          >
            Vorige maand
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setPreset(startOfYear(now), endOfYear(now))}>
            Dit jaar
          </button>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Van</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            <span>Tot en met</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        {!range && <p className="error-text">De einddatum moet op of na de begindatum liggen.</p>}
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={onExportCsv} disabled={!range || !preview?.count}>
            <DownloadIcon /> CSV downloaden
          </button>
          {preview && (
            <span className="muted small tabular">
              {preview.count} sessies · {formatDecimalNl(decimalHours(preview.ms))} uur
            </span>
          )}
        </div>
      </section>

      <section className="card screen" style={{ gap: 12 }}>
        <div>
          <h2>Back-up</h2>
          <p className="muted small">
            Je gegevens staan alleen in deze browser op dit apparaat. Maak regelmatig een back-up (JSON) en bewaar die
            bijvoorbeeld in je cloudmap.
          </p>
        </div>
        <p className="small">
          {counts && (
            <>
              {counts.projects} projecten · {counts.sessions} sessies ·{' '}
            </>
          )}
          <span className="muted">
            {lastBackup
              ? `laatste back-up ${formatDate(lastBackup)} om ${formatTime(lastBackup)}`
              : 'nog geen back-up gemaakt op dit apparaat'}
          </span>
        </p>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={onBackup}>
            <DownloadIcon /> Back-up downloaden
          </button>
          <label className="btn">
            <UploadIcon /> Back-up terugzetten…
            <input type="file" accept="application/json,.json" onChange={onFile} hidden />
          </label>
        </div>
        {importError && (
          <p className="error-text" role="alert">
            {importError}
          </p>
        )}
        {persisted === false && (
          <p className="muted small">
            Tip: installeer Urenklok als app; de browser bewaart je gegevens dan betrouwbaarder.
          </p>
        )}
      </section>

      <ConfirmDialog
        open={pending !== null}
        title="Back-up terugzetten?"
        message={
          pending && (
            <>
              De back-up{pending.exportedAt && <> van {formatDate(new Date(pending.exportedAt))}</>} bevat{' '}
              {pending.projects.length} projecten en {pending.sessions.length} sessies.
              <br />
              <strong>Alle huidige gegevens</strong>
              {counts && (
                <>
                  {' '}
                  ({counts.projects} projecten, {counts.sessions} sessies)
                </>
              )}{' '}
              worden vervangen. Dit kan niet ongedaan worden gemaakt.
            </>
          )
        }
        confirmLabel="Vervangen"
        danger
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          if (!pending) return;
          try {
            await replaceAll(pending);
            toast('Back-up teruggezet');
          } catch {
            setImportError('Terugzetten is mislukt; je bestaande gegevens zijn ongewijzigd.');
          }
          setPending(null);
        }}
      />
    </div>
  );
}
