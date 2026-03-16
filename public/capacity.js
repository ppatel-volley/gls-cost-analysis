(() => {
  let allRecords = [];
  let chart = null;
  let wasteChart = null;
  let granularity = 'day';
  let groupFilter = 'all';

  const DEFAULT_RATES = {
    'gen4n_high': 0.4982,
    'gen5n_high': 0.56,
    'gen5n_ultra': 1.12,
    'gen6n_small': 0.16,
    'gen6n_medium': 0.32,
    'gen6n_medium_win2022': 0.41,
    'gen6n_high': 0.56,
    'gen6n_ultra': 1.12,
    'gen6n_ultra_win2022': 1.82,
    'DELETED_GROUP': 0.4982,
    'UNKNOWN': 0.4982,
  };
  let rates = { ...DEFAULT_RATES };

  const COLOURS = [
    '#58a6ff', '#3fb950', '#d29922', '#f85149', '#bc8cff',
    '#39d353', '#db6d28', '#f778ba', '#79c0ff', '#56d364',
  ];
  const colourMap = {};
  let colourIdx = 0;

  function getColour(key) {
    if (!colourMap[key]) {
      colourMap[key] = COLOURS[colourIdx % COLOURS.length];
      colourIdx++;
    }
    return colourMap[key];
  }

  function getRate(cls) {
    return rates[cls] ?? rates['UNKNOWN'] ?? 0;
  }

  function formatCost(dollars) {
    return '$' + dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function toWeekKey(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const day = d.getUTCDay();
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
    return monday.toISOString().slice(0, 10);
  }

  function toMonthKey(dateStr) {
    return dateStr ? dateStr.slice(0, 7) : null;
  }

  function periodKey(dateStr) {
    if (granularity === 'week') return toWeekKey(dateStr);
    if (granularity === 'month') return toMonthKey(dateStr);
    return dateStr;
  }

  function formatPeriod(key) {
    if (granularity === 'week') return `Week of ${key}`;
    if (granularity === 'month') {
      const [y, m] = key.split('-');
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${months[parseInt(m, 10) - 1]} ${y}`;
    }
    return key;
  }

  function getFiltered() {
    if (groupFilter === 'all') return allRecords;
    return allRecords.filter(r => r.streamGroupId === groupFilter);
  }

  function getUniqueGroups() {
    const groups = new Map();
    for (const r of allRecords) {
      const key = r.streamGroupId;
      if (!groups.has(key)) {
        groups.set(key, { id: key, description: r.description, streamClass: r.streamClass });
      }
    }
    return [...groups.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  // Each record = 1 hourly data point. Values are avg instance counts during that hour.
  // allocated = total instances provisioned, idle = allocated but not serving sessions
  // used = allocated - idle
  function aggregate(records) {
    const buckets = {};
    for (const r of records) {
      const key = periodKey(r.date);
      if (!key) continue;
      if (!buckets[key]) buckets[key] = {
        allocatedHrs: 0, idleHrs: 0, usedHrs: 0, alwaysOnHrs: 0,
        allocatedCost: 0, idleCost: 0, byGroup: {},
      };
      const rate = getRate(r.streamClass);
      buckets[key].allocatedHrs += r.allocated;
      buckets[key].alwaysOnHrs += r.alwaysOn;
      buckets[key].idleHrs += r.idle;
      buckets[key].usedHrs += (r.allocated - r.idle);
      buckets[key].allocatedCost += r.allocated * rate;
      buckets[key].idleCost += r.idle * rate;

      const gKey = `${r.streamGroupId} (${r.location})`;
      if (!buckets[key].byGroup[gKey]) buckets[key].byGroup[gKey] = 0;
      buckets[key].byGroup[gKey] += r.allocated;
    }
    return buckets;
  }

  function updateSummary(records) {
    let totalAllocHrs = 0, totalIdleHrs = 0, totalAllocCost = 0, totalIdleCost = 0;
    for (const r of records) {
      const rate = getRate(r.streamClass);
      totalAllocHrs += r.allocated;
      totalIdleHrs += r.idle;
      totalAllocCost += r.allocated * rate;
      totalIdleCost += r.idle * rate;
    }
    const usedHrs = totalAllocHrs - totalIdleHrs;
    const utilPct = totalAllocHrs > 0 ? (usedHrs / totalAllocHrs) * 100 : 0;

    // Count periods for per-period average
    const buckets = aggregate(records);
    const numPeriods = Object.keys(buckets).length || 1;
    const periodLabel = granularity === 'month' ? '/mo' : granularity === 'week' ? '/wk' : '/day';

    document.getElementById('total-instance-hours').textContent = Math.round(totalAllocHrs).toLocaleString();
    document.getElementById('total-always-on-cost').textContent = formatCost(totalAllocCost);
    document.getElementById('total-idle-hours').textContent = Math.round(totalIdleHrs).toLocaleString();
    document.getElementById('total-waste-cost').textContent = formatCost(totalIdleCost);
    document.getElementById('utilisation-pct').textContent = utilPct.toFixed(1) + '%';

    // Per-period averages
    document.getElementById('avg-instance-hours').textContent =
      `${Math.round(totalAllocHrs / numPeriods).toLocaleString()} avg${periodLabel}`;
    document.getElementById('avg-always-on-cost').textContent =
      `${formatCost(totalAllocCost / numPeriods)} avg${periodLabel}`;
    document.getElementById('avg-idle-hours').textContent =
      `${Math.round(totalIdleHrs / numPeriods).toLocaleString()} avg${periodLabel}`;
    document.getElementById('avg-waste-cost').textContent =
      `${formatCost(totalIdleCost / numPeriods)} avg${periodLabel}`;
  }

  // Stacked bar: used vs idle capacity over time
  function updateWasteChart(records) {
    const buckets = aggregate(records);
    const sortedKeys = Object.keys(buckets).sort();
    const labels = sortedKeys.map(formatPeriod);

    const usedData = sortedKeys.map(k => Math.round((buckets[k].allocatedHrs - buckets[k].idleHrs) * 100) / 100);
    const idleData = sortedKeys.map(k => Math.round(buckets[k].idleHrs * 100) / 100);

    if (wasteChart) wasteChart.destroy();
    const ctx = document.getElementById('waste-chart').getContext('2d');
    wasteChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Used (Active)',
            data: usedData,
            backgroundColor: '#3fb950',
            borderColor: '#3fb950',
            borderWidth: 1,
          },
          {
            label: 'Idle (Wasted)',
            data: idleData,
            backgroundColor: '#f8514966',
            borderColor: '#f85149',
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: '#8b949e', font: { size: 11 } },
          },
          tooltip: {
            callbacks: {
              label: (tip) => `${tip.dataset.label}: ${tip.parsed.y.toLocaleString()} inst-hrs`,
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            ticks: { color: '#8b949e', maxRotation: 45 },
            grid: { color: '#21262d' },
          },
          y: {
            stacked: true,
            title: { display: true, text: 'Instance-Hours', color: '#8b949e' },
            ticks: { color: '#8b949e' },
            grid: { color: '#21262d' },
          },
        },
      },
    });
  }

  // Breakdown by stream group chart (top-level chart)
  function updateChart(records) {
    const buckets = aggregate(records);
    const sortedKeys = Object.keys(buckets).sort();
    const groupKeys = new Set();
    for (const b of Object.values(buckets)) {
      for (const gk of Object.keys(b.byGroup)) groupKeys.add(gk);
    }
    const sortedGroups = [...groupKeys].sort();

    const datasets = sortedGroups.map(gk => ({
      label: gk,
      data: sortedKeys.map(k => Math.round((buckets[k].byGroup[gk] || 0) * 100) / 100),
      backgroundColor: getColour(gk),
      borderColor: getColour(gk),
      borderWidth: 1,
    }));

    if (chart) chart.destroy();
    const ctx = document.getElementById('chart').getContext('2d');
    chart = new Chart(ctx, {
      type: 'bar',
      data: { labels: sortedKeys.map(formatPeriod), datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#8b949e', font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (tip) => `${tip.dataset.label}: ${tip.parsed.y.toLocaleString()} inst-hrs`,
            },
          },
        },
        scales: {
          x: { stacked: true, ticks: { color: '#8b949e', maxRotation: 45 }, grid: { color: '#21262d' } },
          y: { stacked: true, title: { display: true, text: 'Allocated Instance-Hours', color: '#8b949e' }, ticks: { color: '#8b949e' }, grid: { color: '#21262d' } },
        },
      },
    });
  }

  function updateTable(records) {
    const buckets = aggregate(records);
    const sortedKeys = Object.keys(buckets).sort().reverse();
    const tbody = document.querySelector('#data-table tbody');
    tbody.innerHTML = '';

    for (const key of sortedKeys) {
      const b = buckets[key];
      const util = b.allocatedHrs > 0 ? ((b.allocatedHrs - b.idleHrs) / b.allocatedHrs * 100) : 0;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${formatPeriod(key)}</td>
        <td>${Math.round(b.allocatedHrs).toLocaleString()}</td>
        <td>${Math.round(b.idleHrs).toLocaleString()}</td>
        <td><span class="util-badge ${util >= 70 ? 'util-good' : util >= 40 ? 'util-ok' : 'util-bad'}">${util.toFixed(1)}%</span></td>
        <td>${formatCost(b.allocatedCost)}</td>
        <td class="waste-cell">${formatCost(b.idleCost)}</td>
      `;
      tbody.appendChild(tr);
    }

    document.getElementById('table-granularity').textContent =
      granularity.charAt(0).toUpperCase() + granularity.slice(1);
  }

  function updateGroupTable(records) {
    const byGroup = {};
    for (const r of records) {
      const key = `${r.streamGroupId}|${r.location}`;
      if (!byGroup[key]) {
        byGroup[key] = {
          streamGroupId: r.streamGroupId, description: r.description,
          streamClass: r.streamClass, location: r.location,
          allocatedHrs: 0, idleHrs: 0, allocatedCost: 0, idleCost: 0,
        };
      }
      const rate = getRate(r.streamClass);
      byGroup[key].allocatedHrs += r.allocated;
      byGroup[key].idleHrs += r.idle;
      byGroup[key].allocatedCost += r.allocated * rate;
      byGroup[key].idleCost += r.idle * rate;
    }

    const sorted = Object.values(byGroup).sort((a, b) => b.idleCost - a.idleCost);
    const tbody = document.querySelector('#group-table tbody');
    tbody.innerHTML = '';

    for (const g of sorted) {
      if (g.allocatedHrs < 0.01) continue;
      const util = g.allocatedHrs > 0 ? ((g.allocatedHrs - g.idleHrs) / g.allocatedHrs * 100) : 0;
      const label = g.description
        ? `${g.streamGroupId} <span class="meta">(${g.description})</span>`
        : g.streamGroupId;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${label}</td>
        <td>${g.streamClass}</td>
        <td>${g.location}</td>
        <td>${Math.round(g.allocatedHrs).toLocaleString()}</td>
        <td>${Math.round(g.idleHrs).toLocaleString()}</td>
        <td><span class="util-badge ${util >= 70 ? 'util-good' : util >= 40 ? 'util-ok' : 'util-bad'}">${util.toFixed(1)}%</span></td>
        <td>${formatCost(g.allocatedCost)}</td>
        <td class="waste-cell">${formatCost(g.idleCost)}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  function updatePricingEditor() {
    const container = document.getElementById('pricing-inputs');
    container.innerHTML = '';
    const classes = new Set(allRecords.map(r => r.streamClass));
    for (const cls of [...classes].sort()) {
      const div = document.createElement('div');
      div.className = 'pricing-row';
      div.innerHTML = `
        <label>${cls}</label>
        <div class="input-prefix">$</div>
        <input type="number" step="0.0001" min="0" value="${getRate(cls)}" data-class="${cls}">
        <span class="pricing-unit">/hr</span>
      `;
      container.appendChild(div);
    }
    container.querySelectorAll('input').forEach(input => {
      input.addEventListener('change', () => {
        rates[input.dataset.class] = parseFloat(input.value) || 0;
        render();
      });
    });
  }

  function render() {
    const records = getFiltered();
    updateSummary(records);
    updateWasteChart(records);
    updateChart(records);
    updateTable(records);
    updateGroupTable(allRecords);
  }

  function populateGroupFilter() {
    const select = document.getElementById('group-filter');
    const groups = getUniqueGroups();
    while (select.options.length > 1) select.remove(1);
    for (const g of groups) {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.description ? `${g.id} (${g.description})` : g.id;
      select.appendChild(opt);
    }
  }

  async function loadCached() {
    try {
      const res = await fetch('/api/capacity');
      const data = await res.json();
      if (data.records && data.records.length > 0) {
        allRecords = data.records;
        populateGroupFilter();
        updatePricingEditor();
        render();
        if (data.lastFetched) {
          document.getElementById('last-fetched').textContent =
            `Last fetched: ${new Date(data.lastFetched).toLocaleString()}`;
        }
      }
    } catch (err) {
      console.error('Failed to load cached capacity data:', err);
    }
  }

  async function fetchCapacity() {
    const overlay = document.getElementById('overlay');
    const overlayMsg = document.getElementById('overlay-msg');
    const btn = document.getElementById('btn-fetch');
    overlay.classList.remove('hidden');
    btn.disabled = true;
    overlayMsg.textContent = 'Fetching capacity data from CloudWatch...';

    try {
      const res = await fetch('/api/fetch-capacity', { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        alert('Fetch failed: ' + (data.error || 'Unknown error'));
        return;
      }
      overlayMsg.textContent = `Loaded ${data.recordCount.toLocaleString()} records`;
      await loadCached();
    } catch (err) {
      alert('Fetch failed: ' + err.message);
    } finally {
      overlay.classList.add('hidden');
      btn.disabled = false;
    }
  }

  document.getElementById('btn-fetch').addEventListener('click', fetchCapacity);

  document.getElementById('granularity').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-value]');
    if (!btn) return;
    granularity = btn.dataset.value;
    document.querySelectorAll('#granularity .btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    render();
  });

  document.getElementById('group-filter').addEventListener('change', (e) => {
    groupFilter = e.target.value;
    render();
  });

  loadCached();
})();
