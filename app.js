const $ = id => document.getElementById(id);
const MAX_PARTS = 100000;
let lastMode = 'dp';
let lastResult = { cuts: [], undone: [], stocks: [], requested: 0 };

const fmt = n => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const pos = v => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const storageGet = (key, fallback = '') => {
  try { return localStorage.getItem(key) || fallback; }
  catch { return fallback; }
};
const storageSet = (key, value) => {
  try { localStorage.setItem(key, value); }
  catch { /* storage can be blocked in some local browser modes */ }
};

function toast(message, type = 'ok', timeout = 3200) {
  let box = $('toastBox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toastBox';
    document.body.append(box);
  }
  const item = document.createElement('div');
  item.className = `toast toast-${type}`;
  item.textContent = message;
  box.append(item);
  setTimeout(() => item.classList.add('hide'), Math.max(1200, timeout - 450));
  setTimeout(() => item.remove(), timeout);
}

function applyTheme(theme) {
  const isLight = theme === 'light';
  document.body.classList.toggle('light-theme', isLight);
  if ($('btnTheme')) $('btnTheme').textContent = isLight ? '🌙 Ночь' : '☀ День';
  storageSet('linraskrlp-theme', isLight ? 'light' : 'dark');
}

function toggleTheme() {
  applyTheme(document.body.classList.contains('light-theme') ? 'dark' : 'light');
  toast(document.body.classList.contains('light-theme') ? 'Дневной режим включён.' : 'Ночной режим включён.', 'ok');
}

function addRow(id, size = '', qty = '', focus = false) {
  const isStock = id === 'stockTable';
  const tr = document.createElement('tr');
  const cells = Array.from({ length: isStock ? 6 : 4 }, () => document.createElement('td'));
  const a = document.createElement('input');
  const b = document.createElement('input');
  const del = document.createElement('button');

  a.type = 'number';
  a.min = '1';
  a.step = '1';
  a.value = size;
  a.placeholder = 'мм';
  b.type = 'number';
  b.min = '1';
  b.step = '1';
  b.value = qty;
  b.placeholder = isStock ? '∞' : 'шт';
  del.type = 'button';
  del.className = 'delete';
  del.textContent = '×';

  cells[1].append(a);
  cells[2].append(b);
  if (isStock) {
    cells[3].className = 'stock-used';
    cells[4].className = 'stock-unused';
    cells[5].append(del);
  } else {
    cells[3].append(del);
  }
  tr.append(...cells);
  $(id).querySelector('tbody').append(tr);

  del.onclick = () => {
    tr.remove();
    renumber(id);
    clearResults();
  };
  renumber(id);
  if (focus) a.focus();
}

function renumber(id) {
  [...$(id).querySelectorAll('tbody tr')].forEach((tr, i) => tr.cells[0].textContent = i + 1);
}

function readRows(id) {
  return [...$(id).querySelectorAll('tbody tr')].flatMap(tr => {
    const inputs = tr.querySelectorAll('input');
    if (inputs.length < 2) return [];
    const size = pos(inputs[0].value);
    const qty = inputs[1].value.trim();
    return size && qty ? [{ size, qty }] : [];
  });
}

function readStockRows() {
  return [...$('stockTable').querySelectorAll('tbody tr')].flatMap((tr, index) => {
    const inputs = tr.querySelectorAll('input');
    if (inputs.length < 2) return [];
    const size = pos(inputs[0].value);
    const qty = inputs[1].value.trim();
    return size ? [{ size, qty, index }] : [];
  });
}

function readParts() {
  const rows = readRows('partsTable');
  const requested = rows.reduce((s, r) => s + pos(r.qty), 0);
  if (requested > MAX_PARTS) throw Error(`Максимум деталей: ${fmt(MAX_PARTS)}.`);
  const parts = [];
  rows.forEach(r => {
    for (let i = 0; i < pos(r.qty); i++) parts.push(r.size);
  });
  return { parts: parts.sort((a, b) => b - a), requested };
}

function readStocks() {
  return readStockRows()
    .map(r => {
      const unlimited = r.qty === '';
      const qty = unlimited ? Infinity : pos(r.qty);
      return { size: r.size, qty, left: qty, unlimited, index: r.index };
    })
    .filter(s => s.qty > 0);
}

function checkData() {
  const stocks = readStockRows();
  const parts = readRows('partsTable');
  const kerf = $('useKerf').checked ? pos($('kerf').value) : 0;
  const edge = $('useEdge').checked ? pos($('edge').value) : 0;
  const errors = [];
  const warn = [];

  if (!stocks.length) errors.push('Нет заготовок.');
  if (!parts.length) errors.push('Нет деталей.');
  if (!errors.length) {
    const maxStock = Math.max(...stocks.map(s => s.size));
    parts.forEach(p => {
      const need = p.size + kerf + edge;
      if (need > maxStock) warn.push(`Деталь ${fmt(p.size)} не входит: нужно ${fmt(need)} мм, максимум заготовки ${fmt(maxStock)} мм.`);
    });
    const finite = stocks.filter(s => s.qty !== '');
    if (finite.length === stocks.length) {
      const stockQty = stocks.reduce((s, r) => s + pos(r.qty), 0);
      const partQty = parts.reduce((s, r) => s + pos(r.qty), 0);
      if (stockQty < partQty) warn.push(`Заготовок ${fmt(stockQty)}, деталей ${fmt(partQty)}. Может не хватить.`);
    }
  }
  return { errors, warn };
}

function showCheck(messages, type = 'info') {
  const box = $('checkBox');
  if (!box) return;
  box.className = `checkBox ${type}`;
  box.replaceChildren();
  messages.forEach(text => {
    const div = document.createElement('div');
    div.textContent = text;
    box.append(div);
  });
}

function validateBeforeCalc() {
  const c = checkData();
  const messages = [...c.errors, ...c.warn];
  showCheck(messages.length ? messages : ['Проверка OK. Можно считать.'], c.errors.length ? 'bad' : c.warn.length ? 'warn' : 'ok');
  if (c.errors.length) toast(c.errors[0], 'err');
  else if (c.warn.length) toast(c.warn[0], 'warn');
  return !c.errors.length;
}

function packDP(parts, size, kerf, edge) {
  let used = edge;
  const items = [], indexes = [];
  parts.forEach((p, i) => {
    if (used + p + kerf <= size) {
      used += p + kerf;
      items.push(p);
      indexes.push(i);
    }
  });
  return { items, indexes, used, rest: size - used };
}

function packLP(parts, size, kerf, edge, speed) {
  const capacity = size - edge;
  if (capacity <= 0 || capacity > 200000) return packDP(parts, size, kerf, edge);
  const limit = speed === 'fast' ? 80 : speed === 'slow' ? 1000 : 300;
  const candidates = parts.slice(0, limit);
  const counts = new Int32Array(capacity + 1);
  const paths = new Array(capacity + 1);
  counts.fill(2147483647);
  counts[0] = 0;
  paths[0] = null;
  candidates.forEach((part, index) => {
    const weight = part + kerf;
    for (let value = capacity; value >= weight; value--) {
      if (counts[value - weight] !== 2147483647 && counts[value - weight] + 1 < counts[value]) {
        counts[value] = counts[value - weight] + 1;
        paths[value] = { index, previous: paths[value - weight] };
      }
    }
  });
  let best = capacity;
  while (best > 0 && counts[best] === 2147483647) best--;
  const indexes = [];
  for (let node = paths[best]; node; node = node.previous) indexes.push(node.index);
  indexes.sort((a, b) => a - b);
  const items = indexes.map(index => parts[index]);
  const used = edge + best;
  return { items, indexes, used, rest: size - used };
}

function pack(parts, size, kerf, edge, mode, speed) {
  return mode === 'lp' ? packLP(parts, size, kerf, edge, speed) : packDP(parts, size, kerf, edge);
}

function choose(parts, stocks, mode, method, speed, kerf, edge) {
  let a = stocks.filter(s => s.left > 0 && edge + parts[0] + kerf <= s.size);
  if (!a.length) return null;
  if (method === 'fast') return a.sort((x, y) => x.index - y.index)[0];
  const limit = speed === 'fast' ? 3 : speed === 'normal' ? 10 : a.length;
  a = a.slice(0, limit);
  if (mode === 'dp' && method !== 'waste') return a.sort((x, y) => x.size - y.size || x.index - y.index)[0];
  return a
    .map(stock => ({ stock, plan: pack(parts, stock.size, kerf, edge, mode, speed) }))
    .sort((x, y) => x.plan.rest - y.plan.rest || y.plan.items.length - x.plan.items.length || x.stock.size - y.stock.size)[0].stock;
}

function calculate(mode = lastMode, options = {}) {
  lastMode = mode;
  const started = performance.now();
  const kerf = $('useKerf').checked ? pos($('kerf').value) : 0;
  const edge = $('useEdge').checked ? pos($('edge').value) : 0;
  const method = $('method').value;
  const speed = $('speed').value;
  const packingMode = mode;
  const { parts: source, requested } = readParts();
  const parts = [...source];
  const stocks = readStocks();
  const cuts = [], undone = [];

  while (parts.length) {
    while (parts.length && !stocks.some(s => s.left > 0 && edge + parts[0] + kerf <= s.size)) undone.push(parts.shift());
    if (!parts.length) break;
    const stock = choose(parts, stocks, packingMode, method, speed, kerf, edge);
    if (!stock) {
      undone.push(...parts.splice(0));
      break;
    }
    const p = pack(parts, stock.size, kerf, edge, packingMode, speed);
    if (!p.items.length) {
      undone.push(parts.shift());
      continue;
    }
    for (let i = p.indexes.length - 1; i >= 0; i--) parts.splice(p.indexes[i], 1);
    if (!stock.unlimited) stock.left--;
    cuts.push({ stock: stock.size, stockIndex: stock.index, used: p.used, rest: p.rest, items: p.items });
  }

  const ms = Math.round(performance.now() - started);
  lastResult = { cuts, undone, stocks, requested, kerf, edge, mode, ms };
  render(lastResult);
  if (!options.silent) toast(`Расчет ${mode.toUpperCase()}: ${ms} мс`, 'ok');
  return lastResult;
}

function calc(mode = lastMode) {
  try {
    if (!validateBeforeCalc()) return;
    calculate(mode);
  } catch (e) {
    toast(e.message || 'Ошибка расчёта.', 'err');
  }
}

function groups(cuts) {
  const m = new Map();
  cuts.forEach(c => {
    const k = `${c.stock}|${c.items.join(',')}|${c.rest}`;
    if (!m.has(k)) m.set(k, { ...c, count: 0 });
    m.get(k).count++;
  });
  return [...m.values()];
}

function cells(tr, values, classes = []) {
  values.forEach((v, i) => {
    const td = document.createElement('td');
    td.textContent = v;
    if (classes[i]) td.className = classes[i];
    tr.append(td);
  });
}

function wasteLevel(percent) {
  return percent < 5 ? 'good' : percent > 20 ? 'bad' : 'warn';
}

function cutText(items, kerf, edge) {
  const m = new Map();
  items.forEach(x => m.set(x, (m.get(x) || 0) + 1));
  const a = [...m].sort((x, y) => y[0] - x[0]).map(([s, n]) => `${s}${n > 1 ? ` × ${n}` : ''}`);
  if (kerf) a.push(`резы: ${kerf} мм`);
  if (edge) a.push(`кромка: ${edge} мм`);
  return a.join(' + ');
}

function noSolutionText(r) {
  const stocks = readStockRows();
  const parts = readRows('partsTable').map(x => x.size).sort((a, b) => a - b);
  if (!r.requested) return '';
  if (!stocks.length) return 'Нет заготовок.';
  const maxStock = Math.max(...stocks.map(x => x.size));
  const part = parts.find(x => x <= maxStock) || parts[0];
  if (!part) return '';
  const need = part + r.kerf + r.edge;
  if (need > maxStock) return `Нет раскроя: деталь ${fmt(part)} с резом/кромкой требует ${fmt(need)} мм, заготовка ${fmt(maxStock)} мм.`;
  return 'Нет раскроя: не хватило подходящих заготовок.';
}

function render(r) {
  document.querySelector('.solution h2 span').textContent = `(раскройный план — ${r.mode.toUpperCase()}${Number.isFinite(r.ms) ? `, ${r.ms} мс` : ''})`;
  const g = groups(r.cuts);
  const tb = $('solutionTable').querySelector('tbody');
  const tf = $('solutionTable').querySelector('tfoot');
  tb.replaceChildren();
  tf.replaceChildren();

  g.forEach((x, i) => {
    const pct = x.stock ? x.rest / x.stock * 100 : 0;
    const level = wasteLevel(pct);
    const tr = document.createElement('tr');
    tr.dataset.level = level;
    cells(tr, [
      i + 1,
      fmt(x.stock),
      fmt(x.used),
      `${x.count} шт.`,
      cutText(x.items, r.kerf, r.edge),
      `${fmt(x.rest)} (${pct.toFixed(2).replace('.', ',')}%)`
    ], ['', '', '', '', '', `waste-cell ${level}`]);
    tb.append(tr);
  });

  const rest = r.cuts.reduce((s, c) => s + c.rest, 0);
  const totalStock = r.cuts.reduce((s, c) => s + c.stock, 0);
  const totalUsed = r.cuts.reduce((s, c) => s + c.used, 0);
  const tr = document.createElement('tr');
  cells(tr, ['Итого', fmt(totalStock), fmt(totalUsed), `${r.cuts.length} шт.`, '', fmt(rest)]);
  tf.append(tr);

  $('solutionNote').textContent = !r.cuts.length && r.undone.length ? noSolutionText(r) : '';
  summary(r.cuts, r.requested, rest);
  stockUsage(r.cuts, r.stocks);
  remaining(r.cuts, r.stocks);
  diagram(g, r.kerf);
  undone(r.undone);
}

function stockUsage(cuts, stocks) {
  const rows = [...$('stockTable').querySelectorAll('tbody tr')];
  rows.forEach((row, index) => {
    const stock = stocks.find(item => item.index === index);
    const used = cuts.filter(cut => cut.stockIndex === index).length;
    const usedCell = row.querySelector('.stock-used');
    const unusedCell = row.querySelector('.stock-unused');
    if (!usedCell || !unusedCell) return;
    usedCell.textContent = stock ? fmt(used) : '';
    unusedCell.textContent = stock && !stock.unlimited ? fmt(stock.left) : '';
  });
}

function summary(cuts, requested, rest) {
  const used = cuts.reduce((s, c) => s + c.used, 0);
  const total = cuts.reduce((s, c) => s + c.stock, 0);
  const limit = pos($('usefulRest').value);
  const useful = cuts.reduce((s, c) => s + (c.rest >= limit ? c.rest : 0), 0);
  const waste = rest - useful;
  const pct = total ? waste / total * 100 : 0;
  $('totalParts').textContent = fmt(requested);
  $('usedStocks').textContent = fmt(cuts.length);
  $('totalUsed').textContent = fmt(used);
  $('totalRest').textContent = fmt(rest);
  $('usefulRestTotal').textContent = fmt(useful);
  $('cleanWaste').textContent = fmt(waste);
  $('wastePct').textContent = `${pct.toFixed(2).replace('.', ',')}%`;
  const card = $('wastePct').closest('div');
  if (card) card.dataset.level = wasteLevel(pct);
}

function resetSummary() {
  ['totalParts', 'usedStocks', 'totalUsed', 'totalRest', 'usefulRestTotal', 'cleanWaste'].forEach(id => $(id).textContent = '0');
  $('wastePct').textContent = '0%';
  const card = $('wastePct').closest('div');
  if (card) delete card.dataset.level;
}

function remaining(cuts, stocks) {
  const tb = $('remainingTable').querySelector('tbody');
  const useful = pos($('usefulRest').value);
  const stockRows = [], restMap = new Map();
  tb.replaceChildren();
  stocks.forEach(s => {
    if (s.unlimited) stockRows.push([s.size, '']);
    else if (s.left) restMap.set(s.size, (restMap.get(s.size) || 0) + s.left);
  });
  cuts.filter(c => c.rest >= useful).forEach(c => restMap.set(c.rest, (restMap.get(c.rest) || 0) + 1));
  const rows = [...stockRows, ...[...restMap].sort((a, b) => b[0] - a[0])];
  rows.forEach(v => {
    const tr = document.createElement('tr');
    cells(tr, [fmt(v[0]), v[1] === '' ? '' : fmt(v[1])]);
    tb.append(tr);
  });
}

function partColor(size) {
  const s = String(size);
  const fixed = {
    '980': '#f7c5f5', '9800': '#f7c5f5',
    '750': '#c9f7ca', '7500': '#c9f7ca',
    '630': '#c2f5f8', '6300': '#c2f5f8',
    '550': '#b9d9ff', '5500': '#b9d9ff',
    '510': '#ffc8c2', '5100': '#ffc8c2',
    '500': '#fff89a', '5000': '#fff89a'
  };
  if (fixed[s]) return fixed[s];
  const colors = ['#f7c5f5', '#c9f7ca', '#c2f5f8', '#b9d9ff', '#ffc8c2', '#fff89a', '#ffd6a5', '#d9f99d', '#c4b5fd', '#fecdd3'];
  let n = 0;
  s.split('').forEach(ch => n += ch.charCodeAt(0));
  return colors[n % colors.length];
}

function diagram(g, kerf = 0) {
  const box = $('diagramBox');
  box.replaceChildren();
  const totalRest = g.reduce((s, x) => s + x.rest * x.count, 0);
  const maxRest = g.length ? Math.max(...g.map(x => x.rest)) : 0;

  g.forEach((x, i) => {
    const row = document.createElement('div');
    const label = document.createElement('div');
    const bar = document.createElement('div');
    row.className = 'cutrow diagram-row';
    label.className = 'cut-label';
    label.textContent = `№${i + 1} • ${fmt(x.stock)} • ×${x.count}`;
    bar.className = 'bar diagram-bar';
    bar.title = `Заготовка ${fmt(x.stock)} мм, используется ${fmt(x.used)} мм, остаток ${fmt(x.rest)} мм, количество ${x.count}`;

    x.items.forEach((p, idx) => {
      const d = document.createElement('div');
      d.className = `seg cut-seg s${p}`;
      d.style.backgroundColor = partColor(p);
      d.style.flexGrow = p;
      d.style.flexBasis = `${Math.max(26, p / x.stock * 520)}px`;
      d.textContent = p;
      d.title = `Деталь ${fmt(p)} мм`;
      bar.append(d);
      if (kerf && idx < x.items.length - 1) {
        const k = document.createElement('div');
        k.className = 'seg kerfSeg';
        k.style.flexBasis = '18px';
        k.textContent = kerf;
        k.title = `Рез ${fmt(kerf)} мм`;
        bar.append(k);
      }
    });

    const rest = document.createElement('div');
    rest.className = 'seg rest';
    rest.style.flexGrow = Math.max(1, x.rest);
    rest.style.flexBasis = `${Math.max(72, x.rest / x.stock * 520)}px`;
    rest.textContent = fmt(x.rest);
    rest.title = `Остаток ${fmt(x.rest)} мм`;
    bar.append(rest);
    row.append(label, bar);
    box.append(row);
  });
  $('diagramFooter').textContent = g.length ? `Макс. остаток: ${fmt(maxRest)} мм • Суммарный остаток: ${fmt(totalRest)} мм` : '';
}

function undoneReason(size) {
  const kerf = $('useKerf').checked ? pos($('kerf').value) : 0;
  const edge = $('useEdge').checked ? pos($('edge').value) : 0;
  const need = size + kerf + edge;
  const stocks = readStockRows();
  if (stocks.some(s => s.size >= need)) return 'не хватило заготовок';
  if (stocks.some(s => s.size >= size)) return `нужно ${fmt(need)} мм`;
  return 'нет подходящей заготовки';
}

function undone(items) {
  const tb = $('undoneTable').querySelector('tbody');
  const done = $('doneText');
  const left = new Map();
  const need = new Map();
  tb.replaceChildren();
  items.forEach(x => left.set(x, (left.get(x) || 0) + 1));
  readRows('partsTable').forEach(r => need.set(r.size, (need.get(r.size) || 0) + pos(r.qty)));
  [...left].sort((a, b) => b[0] - a[0]).forEach(([s, n], i) => {
    const total = need.get(s) || n;
    const tr = document.createElement('tr');
    cells(tr, [i + 1, fmt(s), fmt(total), fmt(total - n), fmt(n), undoneReason(s)]);
    tb.append(tr);
  });
  done.style.display = items.length ? 'none' : 'block';
}

function data() {
  return {
    settings: ['kerf', 'edge', 'usefulRest', 'useKerf', 'useEdge', 'method', 'speed'].reduce((o, id) => {
      const e = $(id);
      o[id] = e.type === 'checkbox' ? e.checked : e.value;
      return o;
    }, {}),
    stock: readStockRows().map(({ size, qty }) => ({ size, qty })),
    parts: readRows('partsTable')
  };
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 0);
}

function save() {
  download('LinRaskrLP-project.json', JSON.stringify(data(), null, 2), 'application/json');
  toast('Проект сохранён.', 'ok');
}

function loadData(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.stock) || !Array.isArray(d.parts)) throw Error('Неверный формат файла проекта.');
  Object.entries(d.settings || {}).forEach(([id, v]) => {
    const e = $(id);
    if (e) e.type === 'checkbox' ? e.checked = Boolean(v) : e.value = v;
  });
  $('stockTable').querySelector('tbody').replaceChildren();
  d.stock.forEach(r => addRow('stockTable', r.size, r.qty));
  $('partsTable').querySelector('tbody').replaceChildren();
  d.parts.forEach(r => addRow('partsTable', r.size, r.qty));
  clearResults();
  toast('Проект загружен.', 'ok');
}

function report() {
  if (!lastResult.cuts.length && !lastResult.undone.length) {
    toast('Отчёт пустой: сначала выполните расчёт.', 'warn');
    return;
  }
  const lines = [
    'LinRaskrLP — отчёт раскроя',
    `Метод: ${(lastResult.mode || lastMode).toUpperCase()}`,
    `Время расчёта: ${lastResult.ms || 0} мс`,
    `Деталей: ${lastResult.requested || 0}`,
    `Использовано заготовок: ${lastResult.cuts.length}`,
    `Не изготовлено: ${lastResult.undone.length}`,
    '',
    ...lastResult.cuts.map((c, i) => `${i + 1}. Заготовка ${c.stock} мм: ${c.items.join(' + ')}; остаток ${c.rest} мм`)
  ];
  download('LinRaskrLP-report.txt', lines.join('\r\n'), 'text/plain;charset=utf-8');
  toast('Отчёт создан.', 'ok');
}

function clearResults() {
  $('solutionTable').querySelector('tbody').replaceChildren();
  $('solutionTable').querySelector('tfoot').replaceChildren();
  $('remainingTable').querySelector('tbody').replaceChildren();
  $('undoneTable').querySelector('tbody').replaceChildren();
  $('diagramBox').replaceChildren();
  $('diagramFooter').textContent = '';
  $('solutionNote').textContent = '';
  if ($('checkBox')) {
    $('checkBox').replaceChildren();
    $('checkBox').className = 'checkBox';
  }
  document.querySelector('.solution h2 span').textContent = '(раскройный план)';
  document.querySelectorAll('.stock-used,.stock-unused').forEach(cell => cell.textContent = '');
  $('doneText').style.display = 'none';
  lastResult = { cuts: [], undone: [], stocks: [], requested: 0 };
  resetSummary();
}

function resultScore(mode) {
  const r = calculate(mode, { silent: true });
  const rest = r.cuts.reduce((s, c) => s + c.rest, 0);
  const limit = pos($('usefulRest').value);
  const useful = r.cuts.reduce((s, c) => s + (c.rest >= limit ? c.rest : 0), 0);
  const waste = rest - useful;
  const done = r.requested - r.undone.length;
  return { mode, done, waste, stocks: r.cuts.length, rest, ms: r.ms };
}

function isBetter(a, b) {
  return a.done !== b.done ? a.done > b.done : a.waste !== b.waste ? a.waste < b.waste : a.stocks !== b.stocks ? a.stocks < b.stocks : a.rest < b.rest;
}

function scoreLine(x) {
  return `${x.mode.toUpperCase()}: сделано ${fmt(x.done)}, заготовок ${fmt(x.stocks)}, чистый отход ${fmt(x.waste)} мм, остаток ${fmt(x.rest)} мм, ${x.ms} мс`;
}

function compareModes() {
  if (!validateBeforeCalc()) return;
  const dp = resultScore('dp');
  const lp = resultScore('lp');
  const best = isBetter(dp, lp) ? dp : lp;
  showCheck([scoreLine(dp), scoreLine(lp), `Лучше: ${best.mode.toUpperCase()}`], 'ok');
  toast(`Лучше: ${best.mode.toUpperCase()}`, 'ok');
}

function bestMode() {
  if (!validateBeforeCalc()) return;
  const dp = resultScore('dp');
  const lp = resultScore('lp');
  const best = isBetter(dp, lp) ? dp : lp;
  calculate(best.mode);
  showCheck([`Выбран лучший расчёт: ${best.mode.toUpperCase()}`, scoreLine(best)], 'ok');
}

function displayResult() {
  if (lastResult.cuts.length || lastResult.undone.length) {
    render(lastResult);
    toast('Результат отображён.', 'ok');
    return;
  }
  calc(lastMode);
}

function init() {
  applyTheme(storageGet('linraskrlp-theme', 'dark'));
  addRow('stockTable');
  addRow('partsTable');
  clearResults();
}

$('addStock').onclick = () => { addRow('stockTable', '', '', true); clearResults(); };
$('addPart').onclick = () => { addRow('partsTable', '', '', true); clearResults(); };
$('calcDP').onclick = () => calc('dp');
$('calcLP').onclick = () => calc('lp');
$('display').onclick = displayResult;
$('btnReset').onclick = () => {
  if (confirm('Сбросить страницу и очистить текущие данные?')) location.reload();
};
$('checkInput').onclick = validateBeforeCalc;
$('compareModes').onclick = compareModes;
$('bestMode').onclick = bestMode;
$('clearAll').onclick = () => {
  if (!confirm('Очистить все введённые данные и результат?')) return;
  $('stockTable').querySelector('tbody').replaceChildren();
  $('partsTable').querySelector('tbody').replaceChildren();
  addRow('stockTable');
  addRow('partsTable');
  clearResults();
  toast('Данные очищены.', 'warn');
};
$('clearSolution').onclick = clearResults;
$('clearDiagram').onclick = () => {
  $('diagramBox').replaceChildren();
  $('diagramFooter').textContent = '';
  toast('Графика убрана.', 'warn');
};
$('btnPrint').onclick = $('exportPdf').onclick = () => window.print();
$('createReport').onclick = report;
$('btnSave').onclick = save;
$('btnOpen').onclick = () => $('fileOpen').click();
$('btnTheme').onclick = toggleTheme;
$('fileOpen').onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try { loadData(JSON.parse(r.result)); }
    catch (x) { toast(x.message || 'Не удалось открыть файл.', 'err'); }
    finally { e.target.value = ''; }
  };
  r.onerror = () => toast('Не удалось прочитать файл.', 'err');
  r.readAsText(f);
};
$('btnAbout').onclick = () => toast('LinRaskrLP Local: автономный расчёт раскроя без Excel и макросов.', 'ok', 4200);

document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault();
    calc('dp');
  }
  if (e.ctrlKey && (e.key.toLowerCase() === 's' || e.key.toLowerCase() === 'ы')) {
    e.preventDefault();
    save();
  }
  if (e.ctrlKey && (e.key.toLowerCase() === 'o' || e.key.toLowerCase() === 'щ')) {
    e.preventDefault();
    $('fileOpen').click();
  }
});

document.addEventListener('input', e => {
  if (e.target.matches('input,select')) clearResults();
});
document.addEventListener('change', e => {
  if (e.target.matches('input,select') && e.target.id !== 'fileOpen') clearResults();
});
init();
