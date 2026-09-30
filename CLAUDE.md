# CLAUDE.md – projectafspraken Urenklok

Urenregistratie-PWA voor één gebruiker (Le Thanh & Co). Geen backend, geen account; alle data lokaal in IndexedDB.

## Commando's

- `npm run dev` – ontwikkelserver
- `npm test` – Vitest (draait in tijdzone Europe/Amsterdam, gezet in `vite.config.ts`)
- `npm run lint` – ESLint
- `npm run build` – `tsc --noEmit` + Vite-build (incl. service worker)

Voor elke commit moeten `npm test`, `npm run lint` en `npm run build` slagen.

## Stack

Vite + React 18 + TypeScript (strict, `noUncheckedIndexedAccess`), Dexie + `dexie-react-hooks`, date-fns (+ `nl` locale), vite-plugin-pwa, Vitest. Geen UI-, chart- of routerbibliotheek: eigen CSS (`src/styles/global.css`), eigen SVG-diagram, hash-routing. Voeg geen dependencies toe zonder goede reden.

## Structuur

```
src/types.ts          datamodel (Project, Session, Pause, Setting, Range, Evaluation)
src/lib/time.ts       ALLE rekenlogica voor gewerkte tijd (puur, getest)
src/lib/dates.ts      formatteren en periodegrenzen (dag / ISO-week / maand / evaluatieperiode za–vr)
src/lib/csv.ts        CSV-opbouw (puur); csvExport.ts = db-query + download
src/lib/backup.ts     JSON-back-up/sync-bestand maken en valideren (puur; schemaVersion 3, v1/v2 blijven leesbaar)
src/lib/merge.ts      samenvoegen van twee apparaten (puur, getest)
src/lib/invoice.ts    bedragen, euro-notatie en factuurregels (puur, getest)
src/lib/goals.ts      weekdoelen en "vergeten uit te klokken" (puur, getest)
src/lib/evaluation.ts weekevaluatie: cijfers, automatische punten, trends; drempels bovenin (puur, getest)
src/lib/preferences.ts  gesynchroniseerde voorkeuren + normaliseren van oudere projecten
src/db/db.ts          Dexie-schema (v3: + evaluations) + seed standaardprojecten
src/db/upgrade.test.ts  upgradetest: bestaande data blijft intact
src/db/actions.ts     alle schrijfacties (klokken, CRUD, back-up terugzetten)
src/hooks/            useData (live queries), useClock, useNow, useRoute, useSpacebar
src/components/       Modal/ConfirmDialog, SessionForm, SessionList, BarChart, ProjectSelect, Toast, Icons, EvaluationNotice
src/screens/          ClockScreen (startscherm), OverviewScreen, EvaluationScreen (#/evaluatie/jjjj-mm-dd), ProjectsScreen, DataScreen, InvoiceScreen (#/factuur/jjjj-mm)
```

## Datamodel en regels

- Tijden zijn epoch-ms. `Session.end === null` = lopende sessie (maximaal één). Een pauze met `end === null` = lopende pauze.
- De timer wordt altijd afgeleid van opgeslagen tijdstempels (`netMs(session, now)`), nooit van een optellende teller.
- Tijdberekeningen horen in `src/lib/time.ts` en krijgen tests. Schermen rekenen niet zelf.
- Dag-/week-/maandtotalen gebruiken `totalsInRange`, die sessies op lokale middernacht knipt (DST-veilig). CSV-regels horen bij de startdatum.
- Schemawijziging? Verhoog de Dexie-versie in `db.ts` met een upgrade-functie en verhoog `BACKUP_SCHEMA_VERSION` in `backup.ts` als het back-upformaat verandert. Oude back-ups moeten importeerbaar blijven.
- Database-schrijfacties gaan via `src/db/actions.ts`.
- **Synchroniseren hangt af van `updatedAt`**: elke wijziging aan een project of sessie moet `updatedAt` bijwerken, en elke verwijderde sessie moet een markering in `deletions` krijgen (`deleteSession` doet dit). Projecten worden nooit verwijderd, alleen gearchiveerd.
- Standaardprojecten hebben vaste id's (`default-1` … `default-5`); samenvoegen koppelt verder op projectnaam.
- Gedeelde voorkeuren (weekdoel, waarschuwingsduur, btw, bedrijfsnaam) staan in setting `preferences` en synchroniseren mee; `lastProjectId`, `lastBackupAt` en `lastSyncAt` zijn per apparaat.
- **Weekevaluatie**: periode = zaterdag 00:00 t/m vrijdag 23:59 (`evaluationRange`), sleutel/id = datum van de vrijdag (`jjjj-mm-dd`), maximaal één per vrijdag. Status `concept` of `afgerond`; afgerond blijft afgerond bij bewerken. Uren worden nooit opgeslagen maar uit sessies berekend; alleen `goalHours` is een momentopname. Klokscherm en Overzicht blijven ISO-week; alleen de evaluatie rekent za–vr. Evaluaties hebben `updatedAt`, gaan mee in back-up/sync en worden niet verwijderd. Schrijven via `saveEvaluation`.
- Bedragen: `amountFor` = afgeronde decimale uren × tarief, afgerond op centen. Niet elders zelf uitrekenen.

## UI-afspraken

- Alle tekst in het **Nederlands**. Datums `dd-mm-jjjj`, tijden 24-uurs `HH:mm`, timer `uu:mm:ss`, duur als `7u 05m`, decimale uren met komma (`7,50`). Gebruik de helpers in `lib/dates.ts`.
- Weken zijn ISO-weken (maandag–zondag), behalve de evaluatieperiode (zaterdag–vrijdag).
- Nooit `window.confirm/alert/prompt`: gebruik `ConfirmDialog`/`Modal` en `useToast`.
- Licht/donker volgt het systeem via CSS-variabelen in `global.css`; gebruik altijd de tokens (`var(--accent)` enz.), geen losse kleuren.
- Mobiel en desktop: navigatie onderin op mobiel, bovenin vanaf 760px. Test beide breedtes.
- Spatiebalk = in-/uitklokken, behalve in invoervelden en open dialogen (`useSpacebar`).

## Werkwijze

- Commit na elke afgeronde stap met een duidelijke Nederlandstalige commitmessage.
- Nieuwe rekenlogica → eerst/ook tests in `src/lib/*.test.ts`.
- Houd README.md bij als functies of commando's veranderen.
