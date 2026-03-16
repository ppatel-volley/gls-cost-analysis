# GLS Cost Analysis

A web dashboard for analysing AWS GameLift Streams session usage and capacity costs. Two pages: **Session Usage** (minutes, hours, estimated cost per stream class) and **Capacity** (allocated vs idle instance-hours, utilisation %, wasted spend).

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```
   Opens at [http://localhost:3000](http://localhost:3000).

That's it. The repo ships with a **cached data snapshot** (see below), so the dashboard renders immediately without AWS credentials.

### To refresh data from AWS

1. Copy and edit the credential template:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your AWS credentials. Supports both `KEY=value` and `export KEY=value` formats. If using temporary credentials (SSO/STS), include `AWS_SESSION_TOKEN`.

2. In the dashboard, click **"Fetch from AWS"** (session page) or **"Fetch from CloudWatch"** (capacity page). Progress is shown in real time — expect a few minutes for session data if there are tens of thousands of sessions.

## Cached Data (`data/`)

The `data/` directory contains a pre-fetched snapshot of session and capacity data, tracked via **Git LFS**. This allows anyone to clone the repo and immediately view the dashboard without needing AWS credentials.

| File | Contents | Source |
|------|----------|--------|
| `sessions.json` | 37,458 sessions from the last 90 days (Dec 2025 – Mar 2026). Each record has: ARN, stream group ID, stream class, status, timestamps, duration in minutes, location. | GLS `ListStreamSessionsByAccount` API |
| `capacity.json` | ~9,600 hourly capacity data points across 67 stream group + location combos. Each record has: timestamp, stream group ID, location, stream class, `alwaysOn`, `allocated`, and `idle` instance counts. | CloudWatch `AlwaysOnCapacity`, `AllocatedCapacity`, `IdleCapacity` metrics |
| `stream-groups.json` | 13 currently active stream groups with IDs, ARNs, descriptions, stream classes, and status. | GLS `ListStreamGroups` API |

**Important notes on cached data:**
- Session duration is only computed for terminal statuses (`TERMINATED`, `ERROR`, `TIMED_OUT`) and capped at 24 hours.
- ~35,000 sessions belong to stream groups that have since been deleted. These are labelled `DELETED_GROUP` — their actual stream class is unknown but assumed to be `gen4n_high` based on account history. This rate is editable in the dashboard's pricing panel.
- Capacity data comes from CloudWatch, which retains hourly data for ~63 days. Older data may be absent.
- To refresh, click the fetch buttons in the dashboard. New data overwrites these files.

## What It Shows

### Session Usage Page (`/`)
- **Summary cards** — total sessions, minutes, hours, estimated cost, with per-period averages that update when you toggle Day/Week/Month
- **Stacked bar chart** — session minutes over time, colour-coded by stream class
- **Period tables** — session counts, minutes, hours, and estimated cost by day/week/month
- **Stream class breakdown** — per-class totals with average session length and cost
- **Pricing editor** — editable per-stream-class hourly rates; costs recalculate automatically

### Capacity Page (`/capacity.html`)
- **Summary cards** — allocated instance-hours, allocated cost, idle instance-hours, wasted cost, utilisation %, with per-period averages
- **Used vs Idle chart** — stacked bar showing active (green) vs wasted (red) instance-hours
- **Allocated by group chart** — stacked bar of allocated instance-hours by stream group
- **Period tables** — allocated/idle hours, utilisation %, allocated/wasted cost by day/week/month
- **Stream group breakdown** — per-group idle hours, utilisation, and wasted cost, sorted by waste

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
│   └── server.js            # Express server + AWS SDK + CloudWatch integration
├── public/
│   ├── index.html            # Session usage page
│   ├── app.js                # Session page JS (charts, tables, filters, pricing)
│   ├── capacity.html         # Capacity costs page
│   ├── capacity.js           # Capacity page JS (waste analysis, charts)
│   └── styles.css            # Dark theme styling
├── data/                     # Cached data snapshot (Git LFS)
│   ├── sessions.json         # Session history
│   ├── capacity.json         # Hourly capacity metrics
│   └── stream-groups.json    # Stream group definitions
├── SDK/                      # GLS WebRTC client SDK (reference only)
├── .env.example              # Credential template
└── package.json
```

## How Duration Is Calculated

Each session's duration is computed as `LastUpdatedAt - CreatedAt` in minutes. The GLS API does not expose a dedicated `EndedAt` field, so `LastUpdatedAt` serves as the session end marker. Duration is only computed for sessions with a terminal status (`TERMINATED`, `ERROR`, `TIMED_OUT`) and capped at 24 hours (the GLS maximum session length).

## How Capacity Cost Is Calculated

Capacity cost uses hourly CloudWatch metrics. Each data point represents the average number of instances during that hour. `allocated` is the total provisioned capacity, `idle` is allocated but not serving any session. Wasted cost = `idle` instance-hours × per-stream-class hourly rate. The rate is editable in the dashboard's pricing panel.
