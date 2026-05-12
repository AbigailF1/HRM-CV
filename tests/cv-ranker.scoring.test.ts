import { describe, expect, it } from "vitest";

import {
  combineMetricScores,
  generateHeuristicCustomMetrics,
  normalizeMetricDefinitions,
  scoreMetrics,
} from "../src/modules/cv-ranker/cv-ranker.scoring";

describe("cv ranker scoring", () => {
  it("scores relevant CV text higher for matching metrics", () => {
    const metrics = normalizeMetricDefinitions([
      {
        id: "ml_frameworks",
        name: "ML frameworks",
        description: "Experience with PyTorch, TensorFlow, scikit-learn, and model training.",
        weight: 70,
      },
      {
        id: "communication",
        name: "Communication",
        description: "Clear writing, presentations, documentation, and concise explanation.",
        weight: 30,
      },
    ]);
    const scores = scoreMetrics(
      "Built PyTorch and scikit-learn models in Python for an end-to-end machine learning project.",
      metrics,
    );

    expect(scores.ml_frameworks).toBeGreaterThan(scores.communication);
  });

  it("combines metric scores using normalized weights", () => {
    const finalScore = combineMetricScores(
      {
        python: 80,
        math: 40,
      },
      [
        {
          id: "python",
          name: "Python",
          description: "Python programming",
          weight: 75,
        },
        {
          id: "math",
          name: "Math",
          description: "Mathematics",
          weight: 25,
        },
      ],
    );

    expect(finalScore).toBe(70);
  });

  it("generates four equal-weight metrics for custom job descriptions", () => {
    const metrics = generateHeuristicCustomMetrics(
      "Need an intern with Python, SQL, statistics, and strong project delivery.",
    );

    expect(metrics).toHaveLength(4);
    expect(metrics.every((metric) => metric.weight === 25)).toBe(true);
    expect(metrics.map((metric) => metric.id)).toEqual([
      "role_core_fit",
      "technical_tools",
      "domain_knowledge",
      "project_evidence",
    ]);
  });
});
