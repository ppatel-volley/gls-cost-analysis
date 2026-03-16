# GLS Cost Analysis

A web dashboard for analysing AWS GameLift Streams session usage and costs. Fetches session data from the GLS API, caches it locally, and provides interactive charts and tables to view session minutes broken down by day, week, or month — with stream class filtering.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure AWS credentials:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your AWS credentials. Supports both `KEY=value` and `export KEY=value` formats. If using temporary credentials (SSO/STS), include `AWS_SESSION_TOKEN`.

3. **Start the server:**
   ```bash
   npm start
   ```
   Opens at [http://localhost:3000](http://localhost:3000).

4. **Click "Fetch from AWS"** in the dashboard to pull the last 90 days of session data. Progress is shown in real time — expect a few minutes if you have thousands of sessions.

## What It Shows

- **Summary cards** — total sessions, total minutes, total hours, average session duration
- **Stacked bar chart** — session minutes over time, colour-coded by stream class
- **Time period tables** — session counts and minutes by day, week, or month
- **Stream class breakdown** — per-class totals with average session length
- **Filters** — toggle between day/week/month granularity; filter by stream class

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `AWS_ACCESS_KEY_ID` | — | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | — | AWS secret key |
| `AWS_SESSION_TOKEN` | — | Session token (for temporary creds) |
| `GLS_REGIONS` | `us-east-2` | Comma-separated GLS API regions to query |
| `PORT` | `3000` | Server port |

**Note:** GLS API endpoint regions are _not_ the same as streaming locations. Valid API regions are: `us-east-2`, `us-west-2`, `ap-northeast-1`, `eu-central-1`. Streaming locations (like `us-east-1`) are managed from these API regions.

## Project Structure

```
├── src/
│   └── server.js          # Express server + AWS SDK integration
├── public/
│   ├── index.html          # Dashboard HTML
│   ├── app.js              # Frontend JavaScript (charts, tables, filters)
│   └── styles.css          # Dark theme styling
├── data/                   # Cached session data (auto-created)
│   ├── sessions.json
│   └── stream-groups.json
├── SDK/                    # GLS WebRTC client SDK (reference only)
├── .env.example            # Credential template
└── package.json
```

## How Duration Is Calculated

Each session's duration is computed as `LastUpdatedAt - CreatedAt` in minutes. The GLS API does not expose a dedicated `EndedAt` field, so `LastUpdatedAt` serves as the session end marker for terminated sessions.
