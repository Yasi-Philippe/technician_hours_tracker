# Technician Hours Tracker

An offline-first web app for field technicians to record the hours they have worked and
produce the weekly spreadsheet their office expects.

Built for people who are not comfortable with technology and do not want to spend their
evening filling in a spreadsheet. A standard day should take a couple of taps.

## What it does

- Record a day: start time, end time, project, section, intervention type, status and a
  short description. Overtime is worked out automatically, never typed.
- Add colleagues who were on the same job — each one becomes their own row in the report.
- Review a whole week at a glance, with the days you have not filled in shown as missing.
- See totals and charts: hours per day, per project, per intervention type, with overtime
  broken out.
- Export a finished `.xlsx` for any week, using your organisation's own template.
- Back up everything to a single file, and restore or merge it on another device.
- Works with no signal at all, and installs to the home screen like a normal app.
- Available in Italian and Spanish.

## No organisation data lives in this repository

The app in this repository is empty. It knows the *shape* of a report — a date, a project,
a section, a type, a status, a description, hours — and nothing about any real organisation.

Everything specific to an organisation lives in a **Company Pack**: a single file containing
the spreadsheet template, the fixed values, the project and section lists, and the working
day defaults. A technician imports it once from a file picker. It is stored only on their
device, distributed through internal channels, and never committed here.

That is a hard rule, not a convention. No names, no logos, no templates, no client details,
not even in tests or example data.

## Privacy

- No server, no account, no database, no analytics, no telemetry.
- No network requests of any kind. A Content-Security-Policy enforces it in the browser.
- Everything stays in local storage on the technician's own device.
- Data leaves only when someone deliberately exports a file.

## Getting started

```bash
npm install
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Type check and build to `dist/` |
| `npm run preview` | Serve the built output |
| `npm test` | Run the test suite |

### Building a Company Pack

The pack builder is a separate page in the same project, at `/pack-builder.html`. Load an
`.xlsx` template, map each field to a column, fill in the lists, and it produces the file
technicians import. Everything runs in the browser; nothing is uploaded.

Tests that need a real template skip themselves when none is present, so a clean checkout
passes with no organisation data on the machine.

## Deployment

The build has no fixed base path. It runs from a project sub-path, a domain root, an
intranet folder, or straight off a USB stick with no rebuild.

Pushing to `main` publishes to GitHub Pages. Since the site is only static files and the app
never sends anything anywhere, hosting it publicly exposes nothing.

## Licence

Not yet decided.
