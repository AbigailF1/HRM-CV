import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import type {
  CvRankMetricDefinition,
  FullExtractedCandidateData,
} from "./cv-ranker.types.js";
import { cvRankMetricSchema } from "./cv-ranker.schema.js";

type CandidateSummaryInput = {
  roleType: string;
  jobDescription: string;
  metrics: CvRankMetricDefinition[];
  metricScores: Record<string, number>;
  finalScore: number;
  extracted: FullExtractedCandidateData;
};

const summarizeMetricsForPrompt = (
  metrics: CvRankMetricDefinition[],
  scores: Record<string, number>,
) => {
  return metrics
    .map((metric) => `${metric.name}: ${scores[metric.id] ?? 0}/100`)
    .join("; ");
};

const buildSummaryPrompt = ({
  roleType,
  jobDescription,
  metrics,
  metricScores,
  finalScore,
  extracted,
}: CandidateSummaryInput) => {
  return [
    "Write exactly one concise sentence for a recruiter.",
    "Describe the candidate's main strengths and weaknesses relative to the role.",
    `Role type: ${roleType}`,
    `Job description: ${jobDescription}`,
    `Final score: ${finalScore}/100`,
    `Metric scores: ${summarizeMetricsForPrompt(metrics, metricScores)}`,
    `Candidate name: ${extracted.name ?? "Unknown"}`,
    `Skills: ${extracted.skills.join(", ") || "None detected"}`,
    `Education: ${extracted.education ?? "Not detected"}`,
    `Experience: ${extracted.experience.join(" | ") || "Not detected"}`,
    `Projects: ${extracted.projects.join(" | ") || "Not detected"}`,
  ].join("\n");
};

const cleanOneSentence = (value: string | undefined) => {
  const cleanedValue = value?.replace(/\s+/g, " ").trim();

  if (!cleanedValue) {
    return null;
  }

  const sentenceMatch = cleanedValue.match(/^.*?[.!?](?:\s|$)/);
  return (sentenceMatch?.[0] ?? cleanedValue).slice(0, 320).trim();
};

const readOpenAiContent = (payload: unknown) => {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "choices" in payload &&
    Array.isArray(payload.choices)
  ) {
    const firstChoice = payload.choices[0];

    if (
      typeof firstChoice === "object" &&
      firstChoice !== null &&
      "message" in firstChoice &&
      typeof firstChoice.message === "object" &&
      firstChoice.message !== null &&
      "content" in firstChoice.message &&
      typeof firstChoice.message.content === "string"
    ) {
      return firstChoice.message.content;
    }
  }

  return undefined;
};

const readGeminiContent = (payload: unknown) => {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "candidates" in payload &&
    Array.isArray(payload.candidates)
  ) {
    const firstCandidate = payload.candidates[0];

    if (
      typeof firstCandidate === "object" &&
      firstCandidate !== null &&
      "content" in firstCandidate &&
      typeof firstCandidate.content === "object" &&
      firstCandidate.content !== null &&
      "parts" in firstCandidate.content &&
      Array.isArray(firstCandidate.content.parts)
    ) {
      const firstPart = firstCandidate.content.parts[0];

      if (
        typeof firstPart === "object" &&
        firstPart !== null &&
        "text" in firstPart &&
        typeof firstPart.text === "string"
      ) {
        return firstPart.text;
      }
    }
  }

  return undefined;
};

const generateOpenAiSummary = async (prompt: string) => {
  const apiKey = env.cvRanker.llm.openAiApiKey;

  if (!apiKey) {
    return null;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.cvRanker.llm.model ?? "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 80,
      messages: [
        {
          role: "system",
          content: "You write concise, fair candidate screening summaries.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`OpenAI summary request failed with status ${response.status}.`);
  }

  return cleanOneSentence(readOpenAiContent(await response.json()));
};

const generateGeminiSummary = async (prompt: string) => {
  const apiKey = env.cvRanker.llm.geminiApiKey;

  if (!apiKey) {
    return null;
  }

  const model = env.cvRanker.llm.model ?? "gemini-1.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 80,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini summary request failed with status ${response.status}.`);
  }

  return cleanOneSentence(readGeminiContent(await response.json()));
};

const buildCustomMetricsPrompt = (jobDescription: string) => {
  return [
    "Generate exactly 4 screening metrics for this internship role.",
    "Return only JSON: an array of objects with id, name, description, and weight.",
    "Use lowercase snake_case ids. Set every weight to 25.",
    "Descriptions should explain what evidence to look for in a CV.",
    `Job description: ${jobDescription}`,
  ].join("\n");
};

const parseMetricJson = (text: string | null) => {
  if (!text) {
    return null;
  }

  const startIndex = text.indexOf("[");
  const endIndex = text.lastIndexOf("]");

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return null;
  }

  try {
    const parsedJson = JSON.parse(text.slice(startIndex, endIndex + 1));
    const parsedMetrics = cvRankMetricSchema.array().length(4).safeParse(parsedJson);

    return parsedMetrics.success ? parsedMetrics.data : null;
  } catch {
    return null;
  }
};

const generateOpenAiCustomMetrics = async (jobDescription: string) => {
  const apiKey = env.cvRanker.llm.openAiApiKey;

  if (!apiKey) {
    return null;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.cvRanker.llm.model ?? "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content: "You generate concise JSON configuration for candidate screening.",
        },
        {
          role: "user",
          content: buildCustomMetricsPrompt(jobDescription),
        },
      ],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`OpenAI custom metric request failed with status ${response.status}.`);
  }

  return parseMetricJson(readOpenAiContent(await response.json()) ?? null);
};

const generateGeminiCustomMetrics = async (jobDescription: string) => {
  const apiKey = env.cvRanker.llm.geminiApiKey;

  if (!apiKey) {
    return null;
  }

  const model = env.cvRanker.llm.model ?? "gemini-1.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: buildCustomMetricsPrompt(jobDescription) }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 500,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini custom metric request failed with status ${response.status}.`);
  }

  return parseMetricJson(readGeminiContent(await response.json()) ?? null);
};

export const generateCustomMetricsWithLlm = async (jobDescription: string) => {
  const { provider } = env.cvRanker.llm;

  if (provider === "none") {
    return null;
  }

  try {
    if (provider === "openai") {
      return await generateOpenAiCustomMetrics(jobDescription);
    }

    return await generateGeminiCustomMetrics(jobDescription);
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error : undefined },
      "cv ranker custom metric generation failed",
    );
    return null;
  }
};

export const generateCandidateSummary = async (input: CandidateSummaryInput) => {
  const { provider } = env.cvRanker.llm;

  if (provider === "none") {
    return null;
  }

  try {
    const prompt = buildSummaryPrompt(input);

    if (provider === "openai") {
      return await generateOpenAiSummary(prompt);
    }

    return await generateGeminiSummary(prompt);
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error : undefined },
      "cv ranker summary generation failed",
    );
    return null;
  }
};
