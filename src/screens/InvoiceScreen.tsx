import { format, parse } from 'date-fns';
import { nl } from 'date-fns/locale';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, PrintIcon } from '../components/Icons';
import { NumberField } from '../components/NumberField';
import { savePreferences } from '../db/actions';
import { projectMap, usePreferences, useProjects } from '../hooks/useData';
import { sessionsStartingIn } from '../lib/csvExport';
import { formatDate, formatDecimalNl, formatNumberNl, periodRange, shiftPeriod } from '../lib/dates';
import { buildInvoice, formatEuro } from '../lib/invoice';

/** Maand uit de hash (#/factuur/2026-09), anders de huidige maand. */
function initialMonth(): number {
  const match = window.location.hash.match(/factuur\/(\d{4}-\d{2})/);
  const parsed = match ? parse(match[1]!, 'yyyy-MM', new Date()) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.getTime() : Date.now();
}

/** Printbare urenspecificatie per maand, met bedragen op basis van de uurtarieven. */
export function InvoiceScreen() {
  const [anchor, setAnchor] = useState(initialMonth);
  const [projectId, setProjectId] = useState('');
  const [groupByProject, setGroupByProject] = useState(false);
  const [withVat, setWithVat] = useState(true);

  const projects = useProjects();
  const prefs = usePreferences();
  const byId = useMemo(() => projectMap(projects), [projects]);
  const range = useMemo(() => periodRange('month', anchor), [anchor]);
  const sessions = useLiveQuery(() => sessionsStartingIn(range), [range.start, range.end]);

  const usedProjectIds = new Set((sessions ?? []).map((s) => s.projectId));
  const selectable = (projects ?? []).filter((p) => usedProjectIds.has(p.id) || !p.archived);
  const filtered = (sessions ?? []).filter((s) => !projectId || s.projectId === projectId);
  const invoice = buildInvoice(filtered, byId, {
    groupByProject,
    vatPercent: withVat ? (prefs?.vatPercent ?? 0) : 0,
  });

  const monthLabel = format(anchor, 'LLLL yyyy', { locale: nl });
  const setMonth = (t: number) => {
    setAnchor(t);
    history.replaceState(null, '', `#/factuur/${format(t, 'yyyy-MM')}`);
  };

  if (!projects || !prefs) return null;

  return (
    <div className="screen">
      <div className="screen-header no-print">
        <h1>Factuurweergave</h1>
        <a className="btn btn-sm btn-ghost" href="#/overzicht">
          Terug naar overzicht
        </a>
      </div>

      <section className="card screen no-print" style={{ gap: 12 }}>
        <div className="period-nav">
          <button type="button" className="btn btn-icon" onClick={() => setMonth(shiftPeriod('month', anchor, -1))} aria-label="Vorige maand">
            <ChevronLeftIcon />
          </button>
          <button type="button" className="btn btn-icon" onClick={() => setMonth(shiftPeriod('month', anchor, 1))} aria-label="Volgende maand">
            <ChevronRightIcon />
          </button>
          <span className="period-label" style={{ textTransform: 'capitalize' }}>
            {monthLabel}
          </span>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Project</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Alle projecten</option>
              {selectable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>Regels</span>
            <div className="segmented" role="group" aria-label="Regels">
              <button type="button" aria-pressed={!groupByProject} onClick={() => setGroupByProject(false)}>
                Per sessie
              </button>
              <button type="button" aria-pressed={groupByProject} onClick={() => setGroupByProject(true)}>
                Per project
              </button>
            </div>
          </div>
          <BusinessNameField key={prefs.businessName} value={prefs.businessName} />
          <NumberField
            key={`vat-${prefs.vatPercent}`}
            label="Btw-percentage"
            value={prefs.vatPercent}
            onSave={(v) => savePreferences({ vatPercent: v ?? 0 })}
          />
        </div>
        <label className="row small">
          <input type="checkbox" checked={withVat} onChange={(e) => setWithVat(e.target.checked)} style={{ width: 'auto', minHeight: 0 }} />
          Btw tonen
        </label>
        {invoice.missingRate.length > 0 && (
          <p className="warn-text">
            Geen uurtarief ingesteld voor: {invoice.missingRate.map((p) => p.name).join(', ')}. Stel dit in bij Projecten.
          </p>
        )}
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => window.print()} disabled={invoice.lines.length === 0}>
            <PrintIcon /> Afdrukken / PDF
          </button>
          <span className="muted small">Kies in het printvenster "Opslaan als PDF".</span>
        </div>
      </section>

      <article className="card invoice">
        <header className="invoice-header">
          <div>
            <div className="invoice-business">{prefs.businessName}</div>
            <div className="muted small">Urenspecificatie</div>
          </div>
          <dl className="invoice-meta">
            <dt>Periode</dt>
            <dd style={{ textTransform: 'capitalize' }}>{monthLabel}</dd>
            <dt>Project</dt>
            <dd>{projectId ? byId.get(projectId)?.name : 'Alle projecten'}</dd>
            <dt>Datum</dt>
            <dd>{formatDate(Date.now())}</dd>
          </dl>
        </header>

        {invoice.lines.length === 0 ? (
          <p className="empty">Geen afgeronde sessies in deze periode.</p>
        ) : (
          <div className="table-wrap">
            <table className="invoice-table">
              <thead>
                <tr>
                  {!groupByProject && <th>Datum</th>}
                  <th>Omschrijving</th>
                  <th className="num">Uren</th>
                  <th className="num">Tarief</th>
                  <th className="num">Bedrag</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((l) => (
                  <tr key={l.key}>
                    {!groupByProject && <td className="nowrap">{l.date !== null && formatDate(l.date)}</td>}
                    <td>{l.description}</td>
                    <td className="num">{formatDecimalNl(l.hours)}</td>
                    <td className="num">{l.rate ? formatEuro(l.rate) : '–'}</td>
                    <td className="num">{formatEuro(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={groupByProject ? 1 : 2}>Totaal</td>
                  <td className="num">{formatDecimalNl(invoice.hours)}</td>
                  <td />
                  <td className="num">{formatEuro(invoice.subtotal)}</td>
                </tr>
                {invoice.vatPercent > 0 && (
                  <tr className="muted">
                    <td colSpan={groupByProject ? 3 : 4}>Btw {formatNumberNl(invoice.vatPercent)}%</td>
                    <td className="num">{formatEuro(invoice.vat)}</td>
                  </tr>
                )}
                <tr className="invoice-total">
                  <td colSpan={groupByProject ? 3 : 4}>{invoice.vatPercent > 0 ? 'Totaal incl. btw' : 'Totaal'}</td>
                  <td className="num">{formatEuro(invoice.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </article>
    </div>
  );
}

function BusinessNameField({ value }: { value: string }) {
  const [text, setText] = useState(value);
  return (
    <label className="field">
      <span>Naam op factuur</span>
      <input
        value={text}
        maxLength={80}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text.trim() && text !== value) void savePreferences({ businessName: text.trim() });
          else setText(value);
        }}
      />
    </label>
  );
}
