# Urenklok

Urenregistratie voor **Le Thanh & Co**. Eén gebruiker, geen account, geen server: alle gegevens staan lokaal in de browser (IndexedDB). Installeerbaar als app (PWA) op laptop en telefoon en werkt volledig offline.

## Functies

- **Klok** (startscherm): in-/uitklokken met één grote knop of de **spatiebalk**, live timer (uu:mm:ss), pauzeknop (pauze telt niet mee), projectkeuze en een notitie die automatisch wordt opgeslagen.
- De timer rekent met de opgeslagen starttijd, dus hij blijft kloppen als je de app sluit, de browser herstart of de laptop in slaap valt.
- **Overzicht** per dag, ISO-week (maandag t/m zondag) en maand: totaal, verdeling per project en een staafdiagram per dag. Sessies toevoegen, bewerken en verwijderen (met bevestiging in de app).
- **Projecten**: toevoegen, hernoemen, kleur kiezen, volgorde wijzigen en archiveren. Per project een **uurtarief** en een **weekdoel** (klik op het kleurbolletje).
- **Weekdoelen**: een doel voor de hele week en/of per project, met voortgang op het klokscherm. Loopt een sessie langer dan ingesteld (standaard 10 uur), dan krijg je een waarschuwing en kun je met terugwerkende kracht uitklokken.
- **Factuurweergave** (Overzicht → *Factuur*): printbare urenspecificatie per maand, per sessie of per project, met bedragen, btw en je bedrijfsnaam. Via *Afdrukken → Opslaan als PDF* heb je een bijlage voor je factuur.
- **Gegevens**: CSV-export voor Nederlandse Excel, **synchroniseren** tussen apparaten en een JSON-back-up die je kunt terugzetten.

## Starten

Vereist: [Node.js](https://nodejs.org) 20 of nieuwer.

```bash
npm install
npm run dev
```

Open daarna http://localhost:5173.

## Overige commando's

| Commando          | Wat het doet                                                      |
| ----------------- | ----------------------------------------------------------------- |
| `npm test`        | Tests (Vitest) voor tijdberekeningen, export en database          |
| `npm run lint`    | ESLint                                                            |
| `npm run build`   | Typecheck + productiebuild in `dist/`                             |
| `npm run preview` | De productiebuild lokaal serveren op http://localhost:4173        |
| `npm run icons`   | App-iconen opnieuw genereren uit `public/icon.svg`                |

## Installeren als app (PWA)

Installeren kan alleen vanaf `localhost` of een **HTTPS**-adres.

### Op je laptop

```bash
npm run build
npm run preview
```

Open http://localhost:4173 in Chrome of Edge en klik op het **installatie-icoon** in de adresbalk (of menu → *Apps* → *Urenklok installeren*). De app opent daarna in een eigen venster en werkt ook offline.

> Let op: gegevens horen bij het adres. De versie op `localhost:5173` (dev) en `localhost:4173` (preview) hebben elk hun eigen opslag. Gebruik voor dagelijks gebruik steeds dezelfde (geïnstalleerde) versie.

### Op je telefoon

Een telefoon heeft een HTTPS-adres nodig. De eenvoudigste manier is de map `dist/` gratis online te zetten, bijvoorbeeld:

- **Netlify Drop**: sleep de map `dist/` naar https://app.netlify.com/drop.
- **GitHub Pages**: publiceer de inhoud van `dist/` (de build gebruikt relatieve paden, dus een submap werkt ook).

Open het adres daarna op je telefoon:

- **Android (Chrome)**: menu ⋮ → *App installeren* / *Toevoegen aan startscherm*.
- **iPhone (Safari)**: deelknop → *Zet op beginscherm*.

Je gegevens blijven ook dan alleen op het apparaat zelf; er wordt niets naar de server gestuurd.

### Updates

Na een nieuwe build/deploy meldt de app *"Er is een nieuwe versie"*; klik op **Vernieuwen**.

## Gegevens en back-up

- Alles staat in IndexedDB van de browser op dat ene apparaat. Laptop en telefoon delen niet automatisch gegevens; gebruik daarvoor *Synchroniseren* (zie hieronder).
- Maak regelmatig een back-up via **Gegevens → Back-up downloaden** en bewaar het JSON-bestand bijvoorbeeld in je cloudmap. Met **Back-up terugzetten** vervang je alle gegevens door die van het bestand (je krijgt eerst een bevestigingsvraag).
- Browsergegevens wissen verwijdert ook je uren. Doe dat dus pas na een back-up.

### Synchroniseren tussen laptop en telefoon

Zonder account of server, via een bestand:

1. Op apparaat A: **Gegevens → Sync-bestand maken**. Op de telefoon opent het deelmenu, zodat je het bestand direct naar OneDrive, mail of WhatsApp kunt sturen; op de laptop wordt het gedownload.
2. Op apparaat B: **Gegevens → Samenvoegen uit bestand…** en kies dat bestand. Je ziet eerst wat er verandert.
3. Doe daarna hetzelfde in omgekeerde richting, zodat beide apparaten alles hebben.

Regels bij samenvoegen:

- Per sessie en per project wint de **laatst gewijzigde** versie.
- Een sessie die je op het ene apparaat verwijdert, wordt bij samenvoegen ook op het andere verwijderd (tenzij hij daar later nog is aangepast).
- Projecten met dezelfde naam worden als hetzelfde project gezien.
- Liep er op beide apparaten een sessie, dan wordt de oudste gestopt op het moment dat de nieuwste begon.
- Samenvoegen is veilig om vaker te doen; een tweede keer met hetzelfde bestand verandert niets.

### CSV-formaat

Kolommen: `Datum;Start;Eind;Pauze (min);Netto uren;Project;Notitie`

- Puntkomma als scheidingsteken, decimale komma (`7,50`), datum `dd-mm-jjjj`, 24-uursnotatie, UTF-8 met BOM, zodat het bestand direct goed opent in Nederlandse Excel.
- Eén regel per afgeronde sessie; de datum is de startdatum. Loopt een sessie over middernacht, dan staat er bij de eindtijd `(+1)`. Lopende sessies worden overgeslagen.

## Rekenregels

- Netto tijd = eind − start − pauzes.
- In de overzichten wordt een sessie over middernacht (of over een week-/maandgrens) eerlijk verdeeld over beide dagen. In de CSV staat hij als één regel op de startdatum.
- Wijzig je bij een bestaande sessie de pauzeduur, dan wordt de pauze als één blok midden in de sessie opgeslagen.
- Bedragen = netto uren (afgerond op 2 decimalen) × uurtarief, afgerond op centen. Tarieven zijn exclusief btw; het btw-percentage (standaard 21%) stel je in op de factuurweergave.
- Weekdoelen gebruiken dezelfde ISO-week (maandag–zondag) als het overzicht.

## Techniek

Vite · React · TypeScript · Dexie (IndexedDB) · date-fns · vite-plugin-pwa · Vitest. Zie `CLAUDE.md` voor de projectafspraken.
