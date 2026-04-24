# TradeLog

A personal trade journal web app that runs entirely in your browser. No backend, no database — all data is stored locally in your browser's localStorage.

## Features

- **Calendar view** — monthly calendar with daily PnL, trade count, and color coding
- **Day view** — click any day to see all trades, journal entry, and daily stats
- **Trade logging** — symbol, direction, entry/exit, size, tick value, setup quality grade, execution grade, mistake type, rationale, emotions, and what you'd do differently
- **Daily journal** — mood, sleep quality, morning thesis, key levels, market observations, EOD reflection, day rating
- **Stats dashboard** — equity curve, monthly/weekly breakdown, setup performance, mistake frequency
- **Backup/restore** — export and import your full data as JSON; export trades as CSV

## Deploy to GitHub Pages

1. Create a new GitHub repository (e.g. `tradelog`)
2. Push the three files to the `main` branch:
   ```
   index.html
   style.css
   app.js
   ```
3. Go to **Settings → Pages**
4. Under **Source**, select `Deploy from a branch`
5. Choose `main` branch, `/ (root)` folder
6. Click **Save**
7. Your site will be live at `https://yourusername.github.io/tradelog`

## Iterating with Claude Code

Once deployed, give Claude Code access to this repo and ask it to:
- Add new fields to the trade form
- Change the visual style
- Add new stats or charts
- Add new journal sections
- Change the calendar layout

All data lives in `localStorage` under the key `tradelog_v1`. The JSON structure is:

```json
{
  "trades": [
    {
      "id": "tr_...",
      "date": "2025-04-24",
      "time": "09:35",
      "symbol": "MNQ",
      "direction": "long",
      "entry": 27218.75,
      "exit": 27248.25,
      "size": 3,
      "tickValue": 2,
      "pnl": 177.00,
      "setup": "ICT 1hr FVG",
      "timeframe": "1h",
      "setupGrade": "A+",
      "execGrade": "A",
      "mistake": "none",
      "notes": "...",
      "emotions": "...",
      "diff": "..."
    }
  ],
  "journals": [
    {
      "date": "2025-04-24",
      "mood": "good",
      "sleep": "poor",
      "dayrating": "3",
      "personal": "...",
      "bias": "bullish",
      "morning": "...",
      "levels": "...",
      "well": "...",
      "improve": "...",
      "lessons": "..."
    }
  ]
}
```

## Backing up your data

Use the **Backup** button in the top right to download a `tradelog-backup.json` file.
Use the **Import** button to restore from a backup.

> ⚠️ localStorage is tied to your browser. If you clear browser data or switch browsers, your trades will be lost unless you use the backup/import feature regularly.
