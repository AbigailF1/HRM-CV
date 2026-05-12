import { describe, expect, it } from "vitest";

import {
  parseCreateCvRankJobInput,
  parseGenerateCustomMetricsInput,
} from "../src/modules/cv-ranker/cv-ranker.schema";
import { ValidationError } from "../src/shared/http/errors";

describe("cv ranker schema", () => {
  it("parses multipart JSON fields for rank jobs", () => {
    const input = parseCreateCvRankJobInput({
      roleType: "ML",
      metrics: JSON.stringify([
        {
          id: "python_skills",
          name: "Python",
          description: "Python programming",
          weight: 60,
        },
      ]),
      weights: JSON.stringify({
        python_skills: 80,
      }),
    });

    expect(input).toEqual({
      roleType: "ML",
      metrics: [
        {
          id: "python_skills",
          name: "Python",
          description: "Python programming",
          weight: 60,
        },
      ],
      weights: {
        python_skills: 80,
      },
    });
  });

  it("rejects empty custom metric job descriptions", () => {
    expect(() => parseGenerateCustomMetricsInput({ jobDescription: "" })).toThrow(
      ValidationError,
    );
  });
});
