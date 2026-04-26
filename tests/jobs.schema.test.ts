import { describe, expect, it } from "vitest";

import { ValidationError } from "../src/shared/http/errors";
import {
  parseAdminApplicationsListQuery,
  parseAdminJobsListQuery,
  parseApplyToJobInput,
  parseCreateJobInput,
  parseJobsListQuery,
  parsePatchApplicationInput,
  parseUpdateJobInput,
} from "../src/modules/jobs/jobs.schema";

describe("jobs schema", () => {
  it("parses public jobs list filters with pagination defaults", () => {
    expect(parseJobsListQuery({ type: "full_time", search: "backend" })).toEqual({
      page: 1,
      pageSize: 20,
      skip: 0,
      take: 20,
      type: "full_time",
      search: "backend",
    });
  });

  it("parses admin jobs list filters", () => {
    expect(parseAdminJobsListQuery({ status: "draft", page: 2, pageSize: 10 })).toEqual({
      page: 2,
      pageSize: 10,
      skip: 10,
      take: 10,
      status: "draft",
    });
  });

  it("parses admin application list filters", () => {
    expect(
      parseAdminApplicationsListQuery({ status: "screening", search: "ada", page: 1, pageSize: 5 }),
    ).toEqual({
      page: 1,
      pageSize: 5,
      skip: 0,
      take: 5,
      status: "screening",
      search: "ada",
    });
  });

  it("normalizes candidate email on apply payloads", () => {
    expect(
      parseApplyToJobInput({
        firstName: "Ada",
        lastName: "Lovelace",
        email: " ADA@Example.com ",
      }),
    ).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      questionResponses: [],
    });
  });

  it("rejects select questions without options", () => {
    expect(() =>
      parseCreateJobInput({
        title: "Backend Engineer",
        slug: "backend-engineer",
        questions: [
          {
            type: "single_select",
            label: "Primary language",
          },
        ],
      }),
    ).toThrow(ValidationError);
  });

  it("rejects update payloads with no fields", () => {
    expect(() => parseUpdateJobInput({})).toThrow(ValidationError);
  });

  it("parses valid create and patch payloads", () => {
    expect(
      parseCreateJobInput({
        title: "Backend Engineer",
        slug: "backend-engineer",
        status: "draft",
        autoScoreOnApply: true,
        questions: [
          {
            type: "single_select",
            label: "Primary language",
            options: [
              { label: "TypeScript", value: "typescript" },
              { label: "Go", value: "go" },
            ],
          },
        ],
      }),
    ).toMatchObject({
      title: "Backend Engineer",
      slug: "backend-engineer",
      status: "draft",
    });

    expect(parsePatchApplicationInput({ status: "screening" })).toEqual({
      status: "screening",
    });
  });
});
