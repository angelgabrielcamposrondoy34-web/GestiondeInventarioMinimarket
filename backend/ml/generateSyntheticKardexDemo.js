const fs = require('node:fs');
const path = require('node:path');

// Generates a clearly labeled development fixture. These values are not real sales.
const products = [
  [1, 'BEB001'], [2, 'BEB002'], [3, 'BEB003'], [4, 'BEB004'], [5, 'BEB005'],
  [6, 'LAC001'], [7, 'LAC002'], [8, 'LAC003'], [9, 'SNK001'], [10, 'SNK002'],
  [11, 'SNK003'], [12, 'SNK004'], [13, 'ABA001'], [14, 'ABA002'], [15, 'ABA003'],
  [16, 'ABA004'], [17, 'LIM001'], [18, 'LIM002'], [19, 'LIM003'], [20, 'CUI001'],
  [21, 'CUI002'], [22, 'CUI003'], [23, 'GOL001'], [24, 'GOL002']
];
const start = new Date('2025-01-01T00:00:00Z');
let seed = 20251111;
const random = () => {
  seed = (seed * 48271) % 2147483647;
  return (seed - 1) / 2147483646;
};
const csv = ['id_producto,codigo,fecha,stock_inicial,entradas,salidas,stock_final'];

for (const [id, code] of products) {
  const baseDemand = 2 + ((id * 11) % 8);
  let stock = 75 + ((id * 17) % 55);

  for (let day = 0; day < 365; day += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + day);
    const dateKey = date.toISOString().slice(0, 10);
    const weekdayFactor = [0.72, 0.82, 0.9, 1, 1.08, 1.3, 1.2][date.getUTCDay()];
    const seasonalFactor = 1 + 0.12 * Math.sin((day / 365) * Math.PI * 2);
    const randomFactor = 0.7 + random() * 0.6;
    const specialDayBoost = day % (29 + (id % 7)) === 0 ? 1.35 : 1;
    const wanted = Math.max(0, Math.round(baseDemand * weekdayFactor * seasonalFactor * randomFactor * specialDayBoost));
    const stockInitial = stock;
    const threshold = baseDemand * 9;
    const entries = stock < threshold ? baseDemand * 18 : 0;
    const available = stockInitial + entries;
    const outflow = Math.min(wanted, available);
    stock = available - outflow;

    csv.push([id, code, dateKey, stockInitial, entries, outflow, stock].join(','));
  }
}

const outputDirectory = path.join(__dirname, '..', 'data');
fs.mkdirSync(outputDirectory, { recursive: true });
const outputPath = path.join(outputDirectory, 'DEMO_kardex_sintetico_NO_REAL_NO_USAR_EN_TESIS.csv');
fs.writeFileSync(outputPath, `${csv.join('\n')}\n`, 'utf8');
console.log(`Generated ${csv.length - 1} synthetic demonstration rows at ${outputPath}`);
