(() => {
  let allSessions = [];
  let chart = null;
  let granularity = 'day';
  let classFilter = 'all';

  // Editable pricing rates ($/hour per stream class)
  // Source: https://aws.amazon.com/gamelift/streams/pricing/
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
    'DELETED_GROUP': 0.4982, // assume gen4n_high for deleted groups
    'UNKNOWN': 0.4982,
  };
  let rates = { ...DEFAULT_RATES };

  // Colour palette for stream classes
  const COLOURS = [
    '#58a6ff', '#3fb950', '#d29922', '#f85149', '#bc8cff',
    '#39d353', '#db6d28', '#f778ba', '#79c0ff', '#56d364',
  ];
  const classColourMap = {};
  let colourIdx = 0;

  function getClassColour(cls) {
    if (!classColourMap[cls]) {
      classColourMap[cls] = COLOURS[colourIdx % COLOURS.length];
      colourIdx++;
    }
    return classColourMap[cls];
  }

  function getRate(cls) {
    return rates[cls] ?? rates['UNKNOWN'] ?? 0;
  }

  function formatCost(dollars) {
    return '$' + dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Date helpers
  function toDateKey(dateStr) {
    return dateStr ? dateStr.slice(0, 10) : null;
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
    return toDateKey(dateStr);
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

  function getFilteredSessions() {
    if (classFilter === 'all') return allSessions;
    return allSessions.filter(s => s.streamClass === classFilter);
  }

  // Aggregate sessions — sums raw float minutes (no per-session rounding)
  function aggregate(sessions) {
    const buckets = {};
    for (const s of sessions) {
      if (!s.createdAt || s.durationMinutes == null) continue;
      const key = periodKey(s.createdAt);
      if (!key) continue;
      if (!buckets[key]) buckets[key] = { sessions: 0, minutes: 0, cost: 0, byClass: {}, costByClass: {} };
      buckets[key].sessions++;
      buckets[key].minutes += s.durationMinutes;
      const cls = s.streamClass || 'UNKNOWN';
      const sessionCost = (s.durationMinutes / 60) * getRate(cls);
      buckets[key].cost += sessionCost;
      if (!buckets[key].byClass[cls]) buckets[key].byClass[cls] = 0;
      buckets[key].byClass[cls] += s.durationMinutes;
      if (!buckets[key].costByClass[cls]) buckets[key].costByClass[cls] = 0;
      buckets[key].costByClass[cls] += sessionCost;
    }
    return buckets;
  }

  function getStreamClasses(sessions) {
    const classes = new Set();
    for (const s of sessions) {
      if (s.streamClass) classes.add(s.streamClass);
    }
    return [...classes].sort();
  }

  // Update summary cards
  function updateSummary(sessions) {
    const filtered = sessions.filter(s => s.durationMinutes != null);
    const totalMin = filtered.reduce((sum, s) => sum + s.durationMinutes, 0);
    const totalCost = filtered.reduce((sum, s) => {
      const cls = s.streamClass || 'UNKNOWN';
      return sum + (s.durationMinutes / 60) * getRate(cls);
    }, 0);

    const buckets = aggregate(sessions);
    const numPeriods = Object.keys(buckets).length || 1;
    const periodLabel = granularity === 'month' ? '/mo' : granularity === 'week' ? '/wk' : '/day';

    document.getElementById('total-sessions').textContent = filtered.length.toLocaleString();
    document.getElementById('total-minutes').textContent = Math.round(totalMin).toLocaleString();
    document.getElementById('total-hours').textContent = (totalMin / 60).toFixed(1);
    document.getElementById('avg-session').textContent = filtered.length
      ? (totalMin / filtered.length).toFixed(1) : '—';
    document.getElementById('total-cost').textContent = formatCost(totalCost);

    document.getElementById('avg-sessions-period').textContent =
      `${Math.round(filtered.length / numPeriods).toLocaleString()} avg${periodLabel}`;
    document.getElementById('avg-minutes-period').textContent =
      `${Math.round(totalMin / numPeriods).toLocaleString()} avg${periodLabel}`;
    document.getElementById('avg-hours-period').textContent =
      `${(totalMin / 60 / numPeriods).toFixed(1)} avg${periodLabel}`;
    document.getElementById('avg-cost-period').textContent =
      `${formatCost(totalCost / numPeriods)} avg${periodLabel}`;
  }

  // Update chart
  function updateChart(sessions) {
    const buckets = aggregate(sessions);
    const sortedKeys = Object.keys(buckets).sort();
    const classes = getStreamClasses(sessions);

    const datasets = classes.map(cls => ({
      label: cls,
      data: sortedKeys.map(k => {
        const mins = buckets[k].byClass[cls] || 0;
        return Math.round(mins * 100) / 100;
      }),
      backgroundColor: getClassColour(cls),
      borderColor: getClassColour(cls),
      borderWidth: 1,
    }));

    const labels = sortedKeys.map(formatPeriod);

    if (chart) chart.destroy();
    const ctx = document.getElementById('chart').getContext('2d');
    chart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: '#8b949e', font: { size: 11 } },
          },
          tooltip: {
            callbacks: {
              label: (tip) => {
                const cls = tip.dataset.label;
                const mins = tip.parsed.y;
                const cost = (mins / 60) * getRate(cls);
                return `${cls}: ${mins.toLocaleString()} min (${formatCost(cost)})`;
              },
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
            title: { display: true, text: 'Minutes', color: '#8b949e' },
            ticks: { color: '#8b949e' },
            grid: { color: '#21262d' },
          },
        },
      },
    });
  }

  // Update data table
  function updateTable(sessions) {
    const buckets = aggregate(sessions);
    const sortedKeys = Object.keys(buckets).sort().reverse();
    const tbody = document.querySelector('#data-table tbody');
    tbody.innerHTML = '';

    for (const key of sortedKeys) {
      const b = buckets[key];
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${formatPeriod(key)}</td>
        <td>${b.sessions.toLocaleString()}</td>
        <td>${Math.round(b.minutes).toLocaleString()}</td>
        <td>${(b.minutes / 60).toFixed(1)}</td>
        <td>${formatCost(b.cost)}</td>
      `;
      tbody.appendChild(tr);
    }

    document.getElementById('table-granularity').textContent =
      granularity.charAt(0).toUpperCase() + granularity.slice(1);
  }

  // Update class breakdown table
  function updateClassTable(sessions) {
    const byClass = {};
    for (const s of sessions) {
      if (s.durationMinutes == null) continue;
      const cls = s.streamClass || 'UNKNOWN';
      if (!byClass[cls]) byClass[cls] = { sessions: 0, minutes: 0, cost: 0 };
      byClass[cls].sessions++;
      byClass[cls].minutes += s.durationMinutes;
      byClass[cls].cost += (s.durationMinutes / 60) * getRate(cls);
    }

    const sorted = Object.entries(byClass).sort((a, b) => b[1].cost - a[1].cost);
    const tbody = document.querySelector('#class-table tbody');
    tbody.innerHTML = '';

    for (const [cls, data] of sorted) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span style="color:${getClassColour(cls)}">&#9679;</span> ${cls}</td>
        <td>${data.sessions.toLocaleString()}</td>
        <td>${Math.round(data.minutes).toLocaleString()}</td>
        <td>${(data.minutes / 60).toFixed(1)}</td>
        <td>${formatCost(data.cost)}</td>
        <td>${formatCost(getRate(cls))}/hr</td>
      `;
      tbody.appendChild(tr);
    }
  }

  // Update pricing editor
  function updatePricingEditor() {
    const container = document.getElementById('pricing-inputs');
    container.innerHTML = '';
    const classes = getStreamClasses(allSessions);
    for (const cls of classes) {
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

  // Render everything
  function render() {
    const sessions = getFilteredSessions();
    updateSummary(sessions);
    updateChart(sessions);
    updateTable(sessions);
    updateClassTable(allSessions);
  }

  // Populate stream class filter
  function populateClassFilter() {
    const select = document.getElementById('stream-class-filter');
    const classes = getStreamClasses(allSessions);
    while (select.options.length > 1) select.remove(1);
    for (const cls of classes) {
      const opt = document.createElement('option');
      opt.value = cls;
      opt.textContent = cls;
      select.appendChild(opt);
    }
  }

  // Load cached data
  async function loadCached() {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      if (data.sessions && data.sessions.length > 0) {
        allSessions = data.sessions;
        populateClassFilter();
        updatePricingEditor();
        render();
        if (data.lastFetched) {
          document.getElementById('last-fetched').textContent =
            `Last fetched: ${new Date(data.lastFetched).toLocaleString()}`;
        }
      }
    } catch (err) {
      console.error('Failed to load cached data:', err);
    }
  }

  // Fetch from AWS with progress tracking
  async function fetchFromAWS() {
    const overlay = document.getElementById('overlay');
    const overlayMsg = document.getElementById('overlay-msg');
    const btn = document.getElementById('btn-fetch');
    overlay.classList.remove('hidden');
    btn.disabled = true;
    overlayMsg.textContent = 'Connecting to AWS...';

    let progressSource;
    try {
      progressSource = new EventSource('/api/fetch-progress');
      progressSource.onmessage = (e) => {
        const p = JSON.parse(e.data);
        if (p.phase === 'groups') {
          overlayMsg.textContent = 'Fetching stream groups...';
        } else if (p.phase.startsWith('sessions')) {
          overlayMsg.textContent = `Loading sessions... ${p.sessionsLoaded.toLocaleString()} so far`;
        } else if (p.phase === 'processing') {
          overlayMsg.textContent = `Processing ${p.sessionsLoaded.toLocaleString()} sessions...`;
        }
      };
    } catch { /* SSE not critical */ }

    try {
      const res = await fetch('/api/fetch', { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        alert('Fetch failed: ' + (data.error || 'Unknown error'));
        return;
      }
      await loadCached();
    } catch (err) {
      alert('Fetch failed: ' + err.message);
    } finally {
      if (progressSource) progressSource.close();
      overlay.classList.add('hidden');
      btn.disabled = false;
    }
  }

  // Event listeners
  document.getElementById('btn-fetch').addEventListener('click', fetchFromAWS);

  document.getElementById('granularity').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-value]');
    if (!btn) return;
    granularity = btn.dataset.value;
    document.querySelectorAll('#granularity .btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    render();
  });

  document.getElementById('stream-class-filter').addEventListener('change', (e) => {
    classFilter = e.target.value;
    render();
  });

  // Init
  loadCached();
})();
