import { describe, expect, it } from "vitest";

import { extractStructuredCandidateData } from "../src/modules/cv-ranker/cv-ranker.extract";

describe("cv ranker extraction", () => {
  it("extracts candidate identity and structured signals from CV text", () => {
    const extracted = extractStructuredCandidateData(`
Jane Doe
jane@example.com

Education
BS Computer Science, Addis Ababa University, 2025

Experience
ML intern at startup building model training pipelines.

Projects
End-to-end PyTorch image classifier project with deployment notes.

Skills
Python, PyTorch, SQL, Linear Algebra, Probability
`);

    expect(extracted.name).toBe("Jane Doe");
    expect(extracted.email).toBe("jane@example.com");
    expect(extracted.skills).toEqual(
      expect.arrayContaining(["Python", "PyTorch", "SQL", "Linear Algebra", "Probability"]),
    );
    expect(extracted.education).toContain("BS Computer Science");
    expect(extracted.experience.join(" ")).toContain("ML intern");
    expect(extracted.projects.join(" ")).toContain("PyTorch image classifier");
  });
});
