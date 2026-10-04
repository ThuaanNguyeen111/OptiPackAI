/**
 * ===================================================================
 * BRKGA — Biased Random-Key Genetic Algorithm (Gonçalves & Resende, 2011;
 * áp dụng cho 2D/3D bin packing: Gonçalves & Resende, 2013)
 * ===================================================================
 * - Mỗi cá thể là một vector khóa ngẫu nhiên ∈ [0,1); bộ giải mã biến khóa
 *   thành phương án (xem decoder.ts) nên mọi cá thể đều là lời giải hợp lệ.
 * - Mỗi thế hệ: giữ nguyên nhóm ELITE (tốt nhất), thêm cá thể ĐỘT BIẾN
 *   ngẫu nhiên hoàn toàn, phần còn lại lai giữa 1 cha elite + 1 mẹ thường,
 *   mỗi khóa lấy của cha với xác suất rhoE (> 0,5 → "thiên lệch" về elite).
 * - Dừng: hết thế hệ, quá nhiều thế hệ không cải thiện, hết ngân sách đánh
 *   giá (đếm số lần giải mã — xác định, không dùng đồng hồ), hoặc stopWhen.
 * ===================================================================
 */

export interface BrkgaParams {
  populationSize: number;
  eliteFraction: number;
  mutantFraction: number;
  rhoE: number;
  maxGenerations: number;
  stallGenerations: number;
  maxEvaluations: number;
}

export const DEFAULT_BRKGA: Omit<BrkgaParams, 'populationSize' | 'maxEvaluations'> = {
  eliteFraction: 0.15,
  mutantFraction: 0.15,
  rhoE: 0.7,
  maxGenerations: 200,
  stallGenerations: 30,
};

export interface BrkgaResult<E> {
  keys: Float64Array;
  value: E;
  evaluations: number;
  generations: number;
}

interface Individual<E> {
  keys: Float64Array;
  value: E;
}

export function runBrkga<E>(
  nKeys: number,
  evaluate: (keys: Float64Array) => E,
  compare: (a: E, b: E) => number,
  params: BrkgaParams,
  rand: () => number,
  seeds: Float64Array[] = [],
  stopWhen?: (best: E) => boolean,
): BrkgaResult<E> {
  const p = Math.max(4, params.populationSize);
  const eliteCount = Math.max(1, Math.round(p * params.eliteFraction));
  const mutantCount = Math.max(1, Math.round(p * params.mutantFraction));
  let evaluations = 0;

  const randomKeys = (): Float64Array => {
    const k = new Float64Array(nKeys);
    for (let i = 0; i < nKeys; i += 1) k[i] = rand();
    return k;
  };
  const make = (keys: Float64Array): Individual<E> => {
    evaluations += 1;
    return { keys, value: evaluate(keys) };
  };
  const sortPop = (pop: Individual<E>[]): void => {
    pop.sort((a, b) => compare(a.value, b.value));
  };

  let population: Individual<E>[] = [];
  for (const s of seeds.slice(0, p)) {
    if (evaluations >= params.maxEvaluations) break;
    population.push(make(s));
  }
  while (population.length < p && evaluations < params.maxEvaluations)
    population.push(make(randomKeys()));
  sortPop(population);

  let best = population[0];
  if (!best) throw new Error('BRKGA: quần thể rỗng');
  let generations = 0;
  let stall = 0;

  while (
    generations < params.maxGenerations &&
    stall < params.stallGenerations &&
    evaluations < params.maxEvaluations &&
    !(stopWhen?.(best.value) ?? false)
  ) {
    const next: Individual<E>[] = population.slice(0, eliteCount);
    for (let m = 0; m < mutantCount && evaluations < params.maxEvaluations; m += 1)
      next.push(make(randomKeys()));
    const nonElite = population.slice(eliteCount);
    while (next.length < p && evaluations < params.maxEvaluations) {
      const elite = population[Math.floor(rand() * eliteCount)];
      const other =
        nonElite.length > 0
          ? nonElite[Math.floor(rand() * nonElite.length)]
          : population[Math.floor(rand() * population.length)];
      if (!elite || !other) break;
      const child = new Float64Array(nKeys);
      for (let i = 0; i < nKeys; i += 1)
        child[i] = rand() < params.rhoE ? (elite.keys[i] ?? 0) : (other.keys[i] ?? 0);
      next.push(make(child));
    }
    sortPop(next);
    population = next;
    generations += 1;
    const top = population[0];
    if (top && compare(top.value, best.value) < 0) {
      best = top;
      stall = 0;
    } else {
      stall += 1;
    }
  }

  return { keys: best.keys, value: best.value, evaluations, generations };
}
