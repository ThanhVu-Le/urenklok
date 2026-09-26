# Urenklok

Urenregistratie voor **Le Thanh & Co**. Eén gebruiker, geen account, geen server: alle gegevens staan lokaal in de browser (IndexedDB). Installeerbaar als app (PWA) op laptop en telefoon en werkt volledig offline.

## Functies

- **Klok** (startscherm): in-/uitklokken met één grote knop of de **spatiebalk**, live timer (uu:mm:ss), pauzeknop (pauze telt niet mee), projectkeuze en een notitie die automatisch wordt opgeslagen.
- De timer rekent met de opgeslagen starttijd, dus hij blijft kloppen als je de app sluit, de browser herstart of de laptop in slaap valt.
- **Overzicht** per dag, ISO-week (maandag t/m zondag) en maand: totaal, verdeling per project en een staafdiagram per dag. Sessies toevoegen, bewerken en verwijderen (met bevestiging in de app).
- **Projecten**: toevoegen, hernoemen, kleur kiezen, volgorde wijzigen en archiveren.
- **Gegevens**: CSV-export voor Nederlandse Excel en een JSON-back-up die je kunt terugzetten.

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

- Alles staat in IndexedDB van de browser op dat ene apparaat. Laptop en telefoon delen dus **geen** gegevens.
- Maak regelmatig een back-up via **Gegevens → Back-up downloaden** en bewaar het JSON-bestand bijvoorbeeld in je cloudmap. Met **Back-up terugzetten** vervang je alle gegevens door die van het bestand (je krijgt eerst een bevestigingsvraag).
- Browsergegevens wissen verwijdert ook je uren. Doe dat dus pas na een back-up.

### CSV-formaat

Kolommen: `Datum;Start;Eind;Pauze (min);Netto uren;Project;Notitie`

- Puntkomma als scheidingsteken, decimale komma (`7,50`), datum `dd-mm-jjjj`, 24-uursnotatie, UTF-8 met BOM, zodat het bestand direct goed opent in Nederlandse Excel.
- Eén regel per afgeronde sessie; de datum is de startdatum. Loopt een sessie over middernacht, dan staat er bij de eindtijd `(+1)`. Lopende sessies worden overgeslagen.

## Rekenregels

- Netto tijd = eind − start − pauzes.
- In de overzichten wordt een sessie over middernacht (of over een week-/maandgrens) eerlijk verdeeld over beide dagen. In de CSV staat hij als één regel op de startdatum.
- Wijzig je bij een bestaande sessie de pauzeduur, dan wordt de pauze als één blok midden in de sessie opgeslagen.

## Techniek

Vite · React · TypeScript · Dexie (IndexedDB) · date-fns · vite-plugin-pwa · Vitest. Zie `CLAUDE.md` voor de projectafspraken.
