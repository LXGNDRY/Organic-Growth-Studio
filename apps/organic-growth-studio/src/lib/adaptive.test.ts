import { expect, test } from 'vitest';
import { rankActions, makeFeatures } from './adaptive.ts';
import type { Experiment } from './store.ts';

const page = {
  url: 'https://shop.example/collections/fleece',
  title: 'Fleece Collection',
  description: 'Heavyweight fleece',
  findings: [],
  imageCount: 4,
  imagesWithoutAlt: 1,
  wordCount: 260,
};

test('cold start uses transparent priors and does not claim a trained model', () => {
  const recommendations = rankActions([], page);
  expect(recommendations).toHaveLength(5);
  expect(recommendations.every((item) => item.model === 'cold_start' && item.prediction === null)).toBe(true);
  expect(recommendations[0].action).toBe('visual_content');
});

test('neural ranker activates only after five outcomes across two actions and returns all three objectives', () => {
  const experiments: Experiment[] = Array.from({ length: 5 }, (_, index) => {
    const action = index < 3 ? 'visual_content' : 'educational_content';
    return {
      id: String(index),
      projectId: 'p',
      action,
      title: 'test ' + index,
      hypothesis: 'test a useful format',
      features: makeFeatures(action, page),
      status: 'completed',
      outcomes: { sales: index > 2 ? 5 : 2, engagement: index > 2 ? 4 : 3, search: index > 2 ? 4 : 2 },
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02',
    };
  });

  const recommendations = rankActions(experiments, page);
  expect(recommendations.every((item) => item.model === 'trained' && item.prediction?.length === 3)).toBe(true);
  expect(recommendations.every((item) => item.prediction!.every((value) => value >= 1 && value <= 5))).toBe(true);
});

test('single-action history cannot activate the neural ranker', () => {
  const experiments: Experiment[] = Array.from({ length: 8 }, (_, index) => ({
    id: String(index),
    projectId: 'p',
    action: 'visual_content',
    title: 'test ' + index,
    hypothesis: 'test a useful format',
    features: makeFeatures('visual_content', page),
    status: 'completed',
    outcomes: { sales: 4, engagement: 4, search: 3 },
    createdAt: '2026-01-01',
    updatedAt: '2026-01-02',
  }));

  expect(rankActions(experiments, page).every((item) => item.model === 'cold_start')).toBe(true);
});
