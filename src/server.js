const express = require('express');
const path = require('path');
const fs = require('fs');
const {
  GameLiftStreams,
  ListStreamGroupsCommand,
  ListStreamSessionsByAccountCommand,
  paginateListStreamGroups,
} = require('@aws-sdk/client-gameliftstreams');
const {
  CloudWatch,
  ListMetricsCommand,
  GetMetricDataCommand,
} = require('@aws-sdk/client-cloudwatch');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, '..', 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const GROUPS_FILE = path.join(DATA_DIR, 'stream-groups.json');
const CAPACITY_FILE = path.join(DATA_DIR, 'capacity.json');

// Load .env file if present (supports "export KEY=val", "KEY=val", quoted values)
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const cleaned = trimmed.startsWith('export ') ? trimmed.slice(7) : trimmed;
      const eqIdx = cleaned.indexOf('=');
      if (eqIdx === -1) continue;
      const key = cleaned.slice(0, eqIdx).trim();
      let val = cleaned.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
} catch { /* ignore */ }

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());

// GLS API endpoint regions (NOT the same as streaming locations)
// Valid: us-east-2, us-west-2, ap-northeast-1, eu-central-1
const GLS_REGIONS = (process.env.GLS_REGIONS || 'us-east-2').split(',').map(r => r.trim());

function createClient(regionOverride) {
  const config = {};
  config.region = regionOverride || process.env.AWS_REGION || 'us-east-2';
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      ...(process.env.AWS_SESSION_TOKEN && { sessionToken: process.env.AWS_SESSION_TOKEN }),
    };
  }
  return new GameLiftStreams(config);
}

// Fetch all stream groups
async function fetchStreamGroups(client) {
  const groups = [];
  const paginator = paginateListStreamGroups({ client }, {});
  for await (const page of paginator) {
    if (page.Items) groups.push(...page.Items);
  }
  return groups;
}

// Fetch all sessions with manual pagination and progress logging
async function fetchAllSessions(client, days = 90, onProgress) {
  const sessions = [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  let nextToken;
  do {
    const res = await client.send(new ListStreamSessionsByAccountCommand({
      CreatedAfter: cutoff,
      MaxResults: 50,
      ...(nextToken && { NextToken: nextToken }),
    }));
    if (res.Items) sessions.push(...res.Items);
    nextToken = res.NextToken;
    if (onProgress) onProgress(sessions.length, !!nextToken);
  } while (nextToken);

  return sessions;
}

// Extract stream group ID from session ARN
// e.g. "arn:aws:gameliftstreams:us-east-2:123456:streamsession/sg-t2zyDhz3e/WBdRXRXiFUfIr"
function extractStreamGroupId(sessionArn) {
  const match = sessionArn?.match(/streamsession\/(sg-[^/]+)\//);
  return match ? match[1] : null;
}

// Track fetch progress for SSE
let fetchProgress = { active: false, sessionsLoaded: 0, hasMore: false, phase: 'idle' };

// API: Server-sent events for fetch progress
app.get('/api/fetch-progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const interval = setInterval(() => {
    res.write(`data: ${JSON.stringify(fetchProgress)}\n\n`);
    if (!fetchProgress.active && fetchProgress.phase === 'done') {
      clearInterval(interval);
      res.end();
    }
  }, 500);

  req.on('close', () => clearInterval(interval));
});

// API: Fetch fresh data from AWS
app.post('/api/fetch', async (req, res) => {
  if (fetchProgress.active) {
    return res.status(409).json({ success: false, error: 'Fetch already in progress' });
  }

  fetchProgress = { active: true, sessionsLoaded: 0, hasMore: true, phase: 'groups' };

  try {
    const allGroups = [];
    const allRawSessions = [];

    for (const region of GLS_REGIONS) {
      const client = createClient(region);

      fetchProgress.phase = `groups (${region})`;
      console.log(`[${region}] Fetching stream groups...`);
      const groups = await fetchStreamGroups(client);
      console.log(`[${region}] Found ${groups.length} stream groups`);
      allGroups.push(...groups);

      fetchProgress.phase = `sessions (${region})`;
      console.log(`[${region}] Fetching sessions (last 90 days)...`);
      const sessions = await fetchAllSessions(client, 90, (count, hasMore) => {
        fetchProgress.sessionsLoaded = allRawSessions.length + count;
        fetchProgress.hasMore = hasMore;
        if (count % 500 === 0) console.log(`[${region}] ...${count} sessions loaded`);
      });
      console.log(`[${region}] Found ${sessions.length} sessions`);
      allRawSessions.push(...sessions);
    }

    // Build group map (keyed by both ARN and ID)
    const groupMap = {};
    for (const g of allGroups) {
      const info = {
        id: g.Id,
        arn: g.Arn,
        description: g.Description || '',
        streamClass: g.StreamClass || 'UNKNOWN',
        status: g.Status,
      };
      groupMap[g.Arn] = info;
      if (g.Id) groupMap[g.Id] = info;
    }

    console.log(`Total: ${allGroups.length} groups, ${allRawSessions.length} sessions`);
    fetchProgress.phase = 'processing';

    // Identify unknown stream group IDs and try to resolve them
    const unknownSgIds = new Set();
    for (const s of allRawSessions) {
      const sgId = extractStreamGroupId(s.Arn);
      if (sgId && !groupMap[sgId]) unknownSgIds.add(sgId);
    }
    if (unknownSgIds.size > 0) {
      console.log(`Resolving ${unknownSgIds.size} unknown stream group IDs...`);
      const { GetStreamGroupCommand } = require('@aws-sdk/client-gameliftstreams');
      for (const sgId of unknownSgIds) {
        for (const region of GLS_REGIONS) {
          try {
            const client = createClient(region);
            const res = await client.send(new GetStreamGroupCommand({ Identifier: sgId }));
            groupMap[sgId] = {
              id: res.Id || sgId,
              arn: res.Arn || '',
              description: res.Description || '(deleted)',
              streamClass: res.StreamClass || 'UNKNOWN',
              status: res.Status || 'DELETED',
            };
            break;
          } catch {
            // Group doesn't exist in this region or is deleted
          }
        }
        // If still not found, mark as deleted with unknown class
        if (!groupMap[sgId]) {
          groupMap[sgId] = {
            id: sgId,
            arn: '',
            description: '(deleted group)',
            streamClass: 'DELETED_GROUP',
            status: 'DELETED',
          };
        }
      }
    }

    // Process sessions
    const sessions = allRawSessions.map(s => {
      // Extract stream group ID from session ARN
      const sgId = extractStreamGroupId(s.Arn);
      const groupInfo = (sgId && groupMap[sgId]) || {};

      const createdAt = s.CreatedAt ? new Date(s.CreatedAt).toISOString() : null;
      const lastUpdatedAt = s.LastUpdatedAt ? new Date(s.LastUpdatedAt).toISOString() : null;

      // Duration: CreatedAt to LastUpdatedAt (no EndedAt in the API)
      // Only compute for terminal statuses; cap at 24h (GLS max session length)
      const TERMINAL_STATUSES = ['TERMINATED', 'ERROR', 'TIMED_OUT'];
      const MAX_DURATION_MINUTES = 24 * 60;
      let durationMinutes = null;
      const start = s.CreatedAt ? new Date(s.CreatedAt) : null;
      const end = s.LastUpdatedAt ? new Date(s.LastUpdatedAt) : null;
      if (start && end && end > start && TERMINAL_STATUSES.includes(s.Status)) {
        const raw = (end - start) / 60000;
        durationMinutes = Math.min(raw, MAX_DURATION_MINUTES);
      }

      return {
        arn: s.Arn || '',
        streamGroupId: sgId || '',
        streamGroupDescription: groupInfo.description || '',
        streamClass: groupInfo.streamClass || 'UNKNOWN',
        status: s.Status || '',
        statusReason: s.StatusReason || '',
        userId: s.UserId || '',
        createdAt,
        lastUpdatedAt,
        durationMinutes,
        location: s.Location || '',
        protocol: s.Protocol || '',
        applicationArn: s.ApplicationArn || '',
      };
    });

    // Save to disk
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(GROUPS_FILE, JSON.stringify(allGroups, null, 2));
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));

    fetchProgress = { active: false, sessionsLoaded: sessions.length, hasMore: false, phase: 'done' };

    res.json({
      success: true,
      sessionCount: sessions.length,
      groupCount: allGroups.length,
    });
  } catch (err) {
    console.error('Fetch error:', err);
    fetchProgress = { active: false, sessionsLoaded: 0, hasMore: false, phase: 'error' };
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Get cached session data
app.get('/api/sessions', (req, res) => {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) {
      return res.json({ sessions: [], cached: false });
    }
    const sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    const stat = fs.statSync(SESSIONS_FILE);
    res.json({ sessions, cached: true, lastFetched: stat.mtime.toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get cached stream groups
app.get('/api/groups', (req, res) => {
  try {
    if (!fs.existsSync(GROUPS_FILE)) {
      return res.json({ groups: [], cached: false });
    }
    const groups = JSON.parse(fs.readFileSync(GROUPS_FILE, 'utf8'));
    res.json({ groups, cached: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Capacity (Always-On) via CloudWatch ─────────────────────────────────────

function createCloudWatchClient(region) {
  const config = { region };
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      ...(process.env.AWS_SESSION_TOKEN && { sessionToken: process.env.AWS_SESSION_TOKEN }),
    };
  }
  return new CloudWatch(config);
}

// Discover all StreamGroupId+Location combos that have AlwaysOnCapacity metrics
async function discoverCapacityCombos(cw) {
  const combos = [];
  let token;
  do {
    const res = await cw.send(new ListMetricsCommand({
      Namespace: 'AWS/GameLiftStreams',
      MetricName: 'AlwaysOnCapacity',
      ...(token && { NextToken: token }),
    }));
    for (const m of res.Metrics || []) {
      const dims = {};
      for (const d of m.Dimensions) dims[d.Name] = d.Value;
      if (dims.StreamGroupId) combos.push(dims);
    }
    token = res.NextToken;
  } while (token);
  return combos;
}

// Fetch hourly capacity data for a batch of combos
// CloudWatch GetMetricData supports up to 500 queries per call
async function fetchCapacityBatch(cw, combos, startTime, endTime) {
  const queries = [];
  for (let i = 0; i < combos.length; i++) {
    const c = combos[i];
    const dims = [{ Name: 'StreamGroupId', Value: c.StreamGroupId }];
    if (c.Location) dims.push({ Name: 'Location', Value: c.Location });
    queries.push({
      Id: `ao_${i}`,
      MetricStat: {
        Metric: {
          Namespace: 'AWS/GameLiftStreams',
          MetricName: 'AlwaysOnCapacity',
          Dimensions: dims,
        },
        Period: 3600,
        Stat: 'Average',
      },
    });
    queries.push({
      Id: `alloc_${i}`,
      MetricStat: {
        Metric: {
          Namespace: 'AWS/GameLiftStreams',
          MetricName: 'AllocatedCapacity',
          Dimensions: dims,
        },
        Period: 3600,
        Stat: 'Average',
      },
    });
    queries.push({
      Id: `idle_${i}`,
      MetricStat: {
        Metric: {
          Namespace: 'AWS/GameLiftStreams',
          MetricName: 'IdleCapacity',
          Dimensions: dims,
        },
        Period: 3600,
        Stat: 'Average',
      },
    });
  }

  // CloudWatch limit: 500 queries per request; batch if needed
  // Results are merged across pagination pages (same Id can appear on multiple pages)
  const mergedResults = {}; // Id -> { Timestamps: [], Values: [] }
  for (let offset = 0; offset < queries.length; offset += 500) {
    const batch = queries.slice(offset, offset + 500);
    let nextToken;
    do {
      const res = await cw.send(new GetMetricDataCommand({
        StartTime: startTime,
        EndTime: endTime,
        MetricDataQueries: batch,
        ...(nextToken && { NextToken: nextToken }),
      }));
      for (const r of res.MetricDataResults || []) {
        if (!mergedResults[r.Id]) {
          mergedResults[r.Id] = { Id: r.Id, Timestamps: [], Values: [] };
        }
        if (r.Timestamps) {
          mergedResults[r.Id].Timestamps.push(...r.Timestamps);
          mergedResults[r.Id].Values.push(...r.Values);
        }
      }
      nextToken = res.NextToken;
    } while (nextToken);
  }
  return Object.values(mergedResults);
}

// API: Fetch capacity data from CloudWatch
app.post('/api/fetch-capacity', async (req, res) => {
  try {
    // Load group map for stream class lookup
    let groupMap = {};
    if (fs.existsSync(GROUPS_FILE)) {
      const groups = JSON.parse(fs.readFileSync(GROUPS_FILE, 'utf8'));
      for (const g of groups) {
        groupMap[g.Id] = { streamClass: g.StreamClass || 'UNKNOWN', description: g.Description || '' };
      }
    }

    const now = new Date();
    const ninetyDaysAgo = new Date(now - 90 * 86400000);
    const capacityRecords = [];

    for (const region of GLS_REGIONS) {
      const cw = createCloudWatchClient(region);

      console.log(`[${region}] Discovering capacity metric combos...`);
      const combos = await discoverCapacityCombos(cw);
      console.log(`[${region}] Found ${combos.length} stream group + location combos`);

      console.log(`[${region}] Fetching hourly capacity data for ${combos.length} combos...`);

      // Process in batches of 166 combos (166 * 3 queries = 498 max)
      const BATCH_SIZE = 166;

      for (let i = 0; i < combos.length; i += BATCH_SIZE) {
        const batch = combos.slice(i, i + BATCH_SIZE);
        console.log(`  [${region}] Batch ${Math.floor(i / BATCH_SIZE) + 1}: combos ${i}-${i + batch.length - 1}`);
        const results = await fetchCapacityBatch(cw, batch, ninetyDaysAgo, now);

        const resultMap = {};
        for (const r of results) {
          resultMap[r.Id] = r;
        }

        for (let j = 0; j < batch.length; j++) {
          const combo = batch[j];
          const aoResult = resultMap[`ao_${j}`];
          const allocResult = resultMap[`alloc_${j}`];
          const idleResult = resultMap[`idle_${j}`];
          if (!aoResult?.Timestamps?.length) continue;

          const groupInfo = groupMap[combo.StreamGroupId] || {};

          // Build timestamp index for allocated and idle for fast lookup
          const allocByTs = {};
          if (allocResult?.Timestamps) {
            for (let x = 0; x < allocResult.Timestamps.length; x++) {
              allocByTs[allocResult.Timestamps[x].getTime()] = allocResult.Values[x];
            }
          }
          const idleByTs = {};
          if (idleResult?.Timestamps) {
            for (let x = 0; x < idleResult.Timestamps.length; x++) {
              idleByTs[idleResult.Timestamps[x].getTime()] = idleResult.Values[x];
            }
          }

          for (let k = 0; k < aoResult.Timestamps.length; k++) {
            const ts = aoResult.Timestamps[k];
            const tsMs = ts.getTime();
            const alwaysOn = aoResult.Values[k] || 0;
            const allocated = allocByTs[tsMs] ?? 0;
            const idle = idleByTs[tsMs] ?? 0;

            capacityRecords.push({
              timestamp: ts.toISOString(),
              date: ts.toISOString().slice(0, 10),
              hour: ts.getUTCHours(),
              streamGroupId: combo.StreamGroupId,
              location: combo.Location || '',
              streamClass: groupInfo.streamClass || 'DELETED_GROUP',
              description: groupInfo.description || '',
              alwaysOn: Math.round(alwaysOn * 100) / 100,
              allocated: Math.round(allocated * 100) / 100,
              idle: Math.round(idle * 100) / 100,
            });
          }
        }
      }
    }

    console.log(`Total capacity records: ${capacityRecords.length}`);

    // Save to disk
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CAPACITY_FILE, JSON.stringify(capacityRecords, null, 2));

    res.json({
      success: true,
      recordCount: capacityRecords.length,
      comboCount: combos.length,
    });
  } catch (err) {
    console.error('Capacity fetch error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Get cached capacity data
app.get('/api/capacity', (req, res) => {
  try {
    if (!fs.existsSync(CAPACITY_FILE)) {
      return res.json({ records: [], cached: false });
    }
    const records = JSON.parse(fs.readFileSync(CAPACITY_FILE, 'utf8'));
    const stat = fs.statSync(CAPACITY_FILE);
    res.json({ records, cached: true, lastFetched: stat.mtime.toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`GLS Cost Analysis running at http://localhost:${PORT}`);
});
