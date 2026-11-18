const MODEL_NAME = 'Regresion lineal diaria por tendencia y dia de semana';
const MIN_TRAIN_DAYS = 28;
const MIN_VALIDATION_DAYS = 7;

function dateKey(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function addDays(key, amount) {
  const date = new Date(`${key}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function weekday(key) {
  return new Date(`${key}T00:00:00.000Z`).getUTCDay();
}

function features(index, key) {
  const result = [1, index / 7];
  for (let day = 1; day < 7; day += 1) result.push(weekday(key) === day ? 1 : 0);
  return result;
}

function solve(matrix, values) {
  const size = values.length;
  const augmented = matrix.map((row, index) => [...row, values[index]]);

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-10) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];

    const divisor = augmented[column][column];
    for (let item = column; item <= size; item += 1) augmented[column][item] /= divisor;

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let item = column; item <= size; item += 1) {
        augmented[row][item] -= factor * augmented[column][item];
      }
    }
  }

  return augmented.map((row) => row[size]);
}

function fitLinearModel(series) {
  const featureCount = 8;
  const matrix = Array.from({ length: featureCount }, () => Array(featureCount).fill(0));
  const values = Array(featureCount).fill(0);

  series.forEach((demand, index) => {
    const x = features(index, demand.fecha);
    x.forEach((left, row) => {
      values[row] += left * demand.salidas;
      x.forEach((right, column) => { matrix[row][column] += left * right; });
    });
  });

  for (let index = 1; index < featureCount; index += 1) matrix[index][index] += 1e-8;
  return solve(matrix, values);
}

function predict(coefficients, index, key) {
  return Math.max(0, features(index, key).reduce((sum, value, position) => sum + value * coefficients[position], 0));
}

function modelProduct(productId, rows, horizon, requestedStart) {
  const totals = new Map();
  rows.forEach((row) => {
    const key = dateKey(row.fecha);
    totals.set(key, (totals.get(key) || 0) + Math.max(0, Number(row.salidas) || 0));
  });

  const observedDates = [...totals.keys()].sort();
  if (observedDates.length < MIN_TRAIN_DAYS + MIN_VALIDATION_DAYS) {
    return { productId, reason: 'insufficient_days', observedDays: observedDates.length };
  }

  const start = observedDates[0];
  const end = observedDates[observedDates.length - 1];
  const dayCount = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
  const series = Array.from({ length: dayCount }, (_, index) => {
    const fecha = addDays(start, index);
    return { fecha, salidas: totals.get(fecha) || 0 };
  });

  if (series.filter((day) => day.salidas > 0).length < 3) {
    return { productId, reason: 'insufficient_demand_variation', observedDays: series.length };
  }

  const validationDays = Math.max(MIN_VALIDATION_DAYS, Math.floor(series.length * 0.2));
  const split = series.length - validationDays;
  if (split < MIN_TRAIN_DAYS) return { productId, reason: 'insufficient_days', observedDays: series.length };

  const validationModel = fitLinearModel(series.slice(0, split));
  if (!validationModel) return { productId, reason: 'model_fit_failed', observedDays: series.length };

  const errors = series.slice(split).map((day, offset) =>
    predict(validationModel, split + offset, day.fecha) - day.salidas
  );
  const mae = errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length;
  const rmse = Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / errors.length);

  const coefficients = fitLinearModel(series);
  if (!coefficients) return { productId, reason: 'model_fit_failed', observedDays: series.length };

  const firstFutureDate = requestedStart && requestedStart > addDays(end, 1)
    ? requestedStart
    : addDays(end, 1);
  const gapDays = Math.round((Date.parse(`${firstFutureDate}T00:00:00Z`) - Date.parse(`${addDays(end, 1)}T00:00:00Z`)) / 86400000);
  const predictions = Array.from({ length: horizon }, (_, offset) => {
    const fecha = addDays(firstFutureDate, offset);
    const index = series.length + gapDays + offset;
    return { fecha, demanda: Number(predict(coefficients, index, fecha).toFixed(2)) };
  });

  return { productId, mae: Number(mae.toFixed(4)), rmse: Number(rmse.toFixed(4)), predictions, observedDays: series.length };
}

function trainDemandForecast(rows, horizon = 7, forecastStart) {
  const byProduct = new Map();
  rows.forEach((row) => {
    if (!byProduct.has(row.id_producto)) byProduct.set(row.id_producto, []);
    byProduct.get(row.id_producto).push(row);
  });

  const trained = [];
  const skipped = [];
  for (const [productId, productRows] of byProduct) {
    const result = modelProduct(productId, productRows, horizon, forecastStart);
    if (result.predictions) trained.push(result);
    else skipped.push(result);
  }

  return { model: MODEL_NAME, horizon, trained, skipped };
}

module.exports = { MODEL_NAME, MIN_TRAIN_DAYS, MIN_VALIDATION_DAYS, trainDemandForecast };
