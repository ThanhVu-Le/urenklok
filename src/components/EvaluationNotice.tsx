import { useEvaluations } from '../hooks/useData';
import { formatDate, openEvaluation } from '../lib/dates';

/** Melding op het klokscherm: op vrijdag tijd voor de weekevaluatie, daarna t/m donderdag "staat nog open". */
export function EvaluationNotice({ now }: { now: number }) {
  const evaluations = useEvaluations();
  if (!evaluations) return null;
  const open = openEvaluation(now, evaluations);
  if (!open) return null;
  const concept = evaluations.some((e) => e.id === open.key && e.status === 'concept');

  return (
    <section className="card evaluation-notice" role="status" aria-label="Weekevaluatie">
      <div>
        <h2>{open.isToday ? 'Tijd voor je weekevaluatie' : `Evaluatie van vrijdag ${formatDate(open.friday)} staat nog open`}</h2>
        <p className="small">
          {concept ? 'Je hebt al een concept opgeslagen. ' : ''}
          Kijk terug op je week en kies je focus voor de komende week.
        </p>
      </div>
      <a className="btn btn-primary" href={`#/evaluatie/${open.key}`}>
        {concept ? 'Verder met evaluatie' : 'Evaluatie starten'}
      </a>
    </section>
  );
}
