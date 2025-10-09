const ENDPOINT = '/api/vitals';

type WebVitalMetric = {
  id: string;
  name: string;
  value: number;
  label?: string;
  navigationType?: string;
  rating?: string;
};

type WebVitalReporter = (metric: WebVitalMetric) => void;

export const reportWebVitals: WebVitalReporter = (metric) => {
  if (typeof window === 'undefined') return;

  const body = JSON.stringify({
    id: metric.id,
    name: metric.name,
    value: metric.value,
    label: metric.label,
    navigationType: metric.navigationType,
    rating: metric.rating
  });

  if (navigator.sendBeacon) {
    navigator.sendBeacon(ENDPOINT, body);
  } else {
    fetch(ENDPOINT, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(
      (error) => console.error('Failed to report web vitals', error)
    );
  }
};

export type VitalBudget = {
  metric: 'LCP' | 'INP' | 'CLS';
  budget: number;
};

export const budgets: VitalBudget[] = [
  { metric: 'LCP', budget: 2500 },
  { metric: 'INP', budget: 200 },
  { metric: 'CLS', budget: 0.1 }
];

export const budgetReporter: WebVitalReporter = (metric) => {
  const budget = budgets.find((entry) => entry.metric === metric.name);
  if (!budget) return;
  if (metric.value > budget.budget) {
    console.warn(`${metric.name} exceeded budget (${metric.value} > ${budget.budget})`);
  }
};
