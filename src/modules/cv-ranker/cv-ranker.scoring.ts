import { ValidationError } from "../../shared/http/errors.js";
import type { ExtractedCandidateData } from "./cv-ranker.types.js";
import type {
  CvRankMetricDefinition,
  CvRankMetricWeightOverrides,
} from "./cv-ranker.types.js";

const VECTOR_SIZE = 768;

const stopWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "have",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "should",
  "that",
  "the",
  "to",
  "with",
]);

const phraseAliases: Array<[RegExp, string]> = [
  [/\bpy\s?torch\b|\btorch\b/gi, "pytorch ml_framework deep_learning"],
  [/\btensor\s?flow\b|\bkeras\b/gi, "tensorflow ml_framework deep_learning"],
  [/\bscikit[-\s]?learn\b|\bsklearn\b/gi, "scikit_learn ml_framework machine_learning"],
  [/\bmachine learning\b|\bml\b/gi, "machine_learning modeling"],
  [/\bdeep learning\b|\bneural networks?\b/gi, "deep_learning neural_networks"],
  [/\blinear algebra\b/gi, "linear_algebra mathematics vectors matrices"],
  [/\breal analysis\b/gi, "real_analysis proofs mathematics rigor"],
  [/\bprobability\b/gi, "probability statistics uncertainty"],
  [/\bstatistical inference\b|\binference\b/gi, "statistical_inference statistics"],
  [/\bregression\b/gi, "regression statistics modeling"],
  [/\bcalculus\b/gi, "calculus derivatives gradients optimization"],
  [/\bmatlab\b/gi, "matlab programming numerical_computing"],
  [/\br programming\b|\br language\b/gi, "r programming statistics"],
  [/\bpython\b/gi, "python programming scripting"],
  [/\bend[-\s]?to[-\s]?end\b/gi, "end_to_end project delivery"],
  [/\bproject(s)?\b/gi, "project portfolio implementation"],
  [/\bcommunication\b|\bpresent(ed|ation)?\b|\bwrite|writing|documentation\b/gi, "communication clarity writing"],
  [/\bproofs?\b/gi, "proofs mathematical_reasoning rigor"],
  [/\bcompetition(s)?\b|\bolympiad\b|\bcontest\b/gi, "problem_solving competition"],
];

export const slugifyMetricId = (value: string) => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
};

const hashToken = (token: string) => {
  let hash = 2166136261;

  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash);
};

const normalizeTextForEmbedding = (text: string) => {
  return phraseAliases.reduce(
    (currentText, [pattern, replacement]) => currentText.replace(pattern, ` ${replacement} `),
    text.toLowerCase(),
  );
};

const simpleStem = (token: string) => {
  if (token.length > 6 && token.endsWith("ing")) {
    return token.slice(0, -3);
  }

  if (token.length > 5 && token.endsWith("ed")) {
    return token.slice(0, -2);
  }

  if (token.length > 4 && token.endsWith("s")) {
    return token.slice(0, -1);
  }

  return token;
};

const tokenize = (text: string) => {
  const normalizedText = normalizeTextForEmbedding(text);
  const baseTokens = normalizedText
    .split(/[^a-z0-9_+#.]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !stopWords.has(token));
  const tokens: string[] = [];

  for (const token of baseTokens) {
    tokens.push(token);

    const stemmedToken = simpleStem(token);
    if (stemmedToken !== token) {
      tokens.push(stemmedToken);
    }
  }

  for (let index = 0; index < baseTokens.length - 1; index += 1) {
    tokens.push(`${baseTokens[index]}_${baseTokens[index + 1]}`);
  }

  return tokens;
};

export const embedTextLocally = (text: string) => {
  const vector = new Float64Array(VECTOR_SIZE);
  const termCounts = new Map<string, number>();

  for (const token of tokenize(text)) {
    termCounts.set(token, (termCounts.get(token) ?? 0) + 1);
  }

  for (const [token, count] of termCounts.entries()) {
    const index = hashToken(token) % VECTOR_SIZE;
    const sign = hashToken(`sign:${token}`) % 2 === 0 ? 1 : -1;
    const phraseBoost = token.includes("_") ? 1.35 : 1;

    vector[index] += sign * Math.log1p(count) * phraseBoost;
  }

  return vector;
};

export const cosineSimilarity = (left: Float64Array, right: Float64Array) => {
  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    dotProduct += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
};

const toScore = (similarity: number) => {
  const nonNegativeSimilarity = Math.max(0, similarity);
  // intern-friendly: exponent 0.4 makes scoring more forgiving for modest matches
  const scaledScore = Math.pow(nonNegativeSimilarity, 0.4) * 100;
  return Number(Math.min(100, scaledScore).toFixed(1));
};

export const scoreMetrics = (
  cvText: string,
  metrics: CvRankMetricDefinition[],
  extracted?: ExtractedCandidateData,
) => {
  const cvEmbedding = embedTextLocally(cvText);
  const scores: Record<string, number> = {};

  const normalize = (s: string) => s.toLowerCase();

  const structuredMatchScore = (metric: CvRankMetricDefinition) => {
    if (!extracted) return 0;

    const metricText = `${metric.name} ${metric.description}`.toLowerCase();
    const metricLower = metricText;

    // Direct skill match: give credit if extracted skills align with metric
    const skillMatches = extracted.skills.filter((skill) => {
      const skillLower = skill.toLowerCase();
      // Match if skill is mentioned in metric name/description, or metric is broad enough
      return (
        metricText.includes(skillLower) ||
        metricLower.includes(skillLower) ||
        skillLower.includes(metricLower.split(/\s+/)[0]) // first word of metric
      );
    });

    const hasDirectSkillMatch = skillMatches.length > 0;
    const directSkillBoost = hasDirectSkillMatch ? 0.6 : 0; // 60% base from explicit skills

    // Framework/language boosts for programming/ML metrics
    const isProgrammingMetric = /python|programming|javascript|java|c\+\+|golang|typescript|coding/.test(metricLower);
    const isDataMetric = /machine learning|ml framework|data|statistics|probability|linear algebra/.test(metricLower);

    const concatenated = [
      extracted.education ?? "",
      ...(extracted.experience ?? []),
      ...(extracted.projects ?? []),
    ]
      .join(" ")
      .toLowerCase();

    // Coding evidence (projects, contributions, coursework)
    const codingEvidenceTerms = [
      "leetcode",
      "codeforces",
      "github",
      "repository",
      "project",
      "hackathon",
      "algorithm",
      "data structure",
      "built",
      "developed",
      "implemented",
      "contributed",
      "solved",
      "learning",
    ];
    let codingEvidenceCount = 0;
    for (const term of codingEvidenceTerms) {
      if (concatenated.includes(term)) codingEvidenceCount += 1;
    }
    // conservative intern boost: up to 45% from coding/learning evidence
    const codingEvidenceBoost = isProgrammingMetric ? Math.min(0.45, codingEvidenceCount * 0.08) : 0;

    // ML/data framework mentions and learning programs
    const mlFrameworkTerms = [
      "pytorch",
      "tensorflow",
      "sklearn",
      "scikit",
      "pandas",
      "numpy",
      "faiss",
      "transformer",
      "deep learning",
      "neural",
      "program",
      "course",
      "training",
      "mastery",
    ];
    let mlFrameworkCount = 0;
    for (const term of mlFrameworkTerms) {
      if (concatenated.includes(term)) mlFrameworkCount += 1;
    }
    // more generous boost for data/ML: up to 45% for interns with learning programs
    const mlFrameworkBoost = isDataMetric ? Math.min(0.45, mlFrameworkCount * 0.1) : 0;

    // Token-based fallback for partial matches
    const metricTokens = tokenize(metricText);
    let tokenMatches = 0;
    for (const token of metricTokens) {
      if (concatenated.includes(token)) tokenMatches += 1;
    }
    const tokenFraction = metricTokens.length > 0 ? tokenMatches / metricTokens.length : 0;
    const contextualBoost = Math.min(0.15, tokenFraction * 0.15);

    // Combine boosts with a conservative cap
    const combinedScore = Math.min(1, directSkillBoost + codingEvidenceBoost + mlFrameworkBoost + contextualBoost);

    return Number((combinedScore * 100).toFixed(1));
  };

  for (const metric of metrics) {
    const metricEmbedding = embedTextLocally(`${metric.name}. ${metric.description}`);
    const semantic = toScore(cosineSimilarity(cvEmbedding, metricEmbedding));
    const structured = structuredMatchScore(metric);

    // conservative intern floor: 40% of semantic
    // this ensures interns get baseline credit even when structured matches are low
    const structuredFloor = Number((semantic * 0.4).toFixed(1));
    const structuredAdjusted = Math.max(structured, structuredFloor);

    // blend semantic and structured signals: 70% semantic, 30% structured
    const blended = Number((semantic * 0.7 + structuredAdjusted * 0.3).toFixed(1));


    scores[metric.id] = blended;
  }

  return scores;
};

export const combineMetricScores = (
  metricScores: Record<string, number>,
  metrics: CvRankMetricDefinition[],
) => {
  const totalWeight = metrics.reduce((sum, metric) => sum + metric.weight, 0);

  if (totalWeight <= 0) {
    return 0;
  }

  const weightedScore = metrics.reduce((sum, metric) => {
    return sum + (metricScores[metric.id] ?? 0) * metric.weight;
  }, 0);

  return Number((weightedScore / totalWeight).toFixed(1));
};

export const normalizeMetricDefinitions = (
  metrics: CvRankMetricDefinition[],
  weights?: CvRankMetricWeightOverrides,
) => {
  const seenMetricIds = new Set<string>();

  const normalizedMetrics = metrics.map((metric) => {
    const metricId = slugifyMetricId(metric.id || metric.name);

    if (!metricId) {
      throw new ValidationError("Metric id or name must produce a valid id.", "INVALID_METRIC");
    }

    if (seenMetricIds.has(metricId)) {
      throw new ValidationError("Duplicate metric ids are not allowed.", "DUPLICATE_METRIC_ID");
    }

    seenMetricIds.add(metricId);

    return {
      ...metric,
      id: metricId,
      name: metric.name.trim(),
      description: metric.description.trim(),
      weight: weights?.[metricId] ?? metric.weight,
    };
  });

  const invalidMetric = normalizedMetrics.find(
    (metric) => !Number.isFinite(metric.weight) || metric.weight <= 0,
  );

  if (invalidMetric) {
    throw new ValidationError(
      `Metric "${invalidMetric.name}" must have a positive weight.`,
      "INVALID_METRIC_WEIGHT",
    );
  }

  return normalizedMetrics;
};

export const generateHeuristicCustomMetrics = (jobDescription: string): CvRankMetricDefinition[] => {
  const normalizedDescription = jobDescription.trim();
  const lowerDescription = normalizedDescription.toLowerCase();
  const toolTerms = [
    "python",
    "matlab",
    "r",
    "sql",
    "pytorch",
    "tensorflow",
    "sklearn",
    "docker",
    "javascript",
    "typescript",
  ].filter((term) => lowerDescription.includes(term));
  const domainTerms = [
    "machine learning",
    "statistics",
    "linear algebra",
    "probability",
    "optimization",
    "analysis",
    "research",
    "data",
  ].filter((term) => lowerDescription.includes(term));

  return [
    {
      id: "role_core_fit",
      name: "Role core fit",
      description: `Alignment with the central responsibilities and domain described in this job description: ${normalizedDescription}`,
      weight: 25,
    },
    {
      id: "technical_tools",
      name: "Technical tools",
      description:
        toolTerms.length > 0
          ? `Experience with relevant tools from the role, especially ${toolTerms.join(", ")}.`
          : "Experience with the technical tools, programming languages, platforms, or methods needed for the role.",
      weight: 25,
    },
    {
      id: "domain_knowledge",
      name: "Domain knowledge",
      description:
        domainTerms.length > 0
          ? `Knowledge of relevant domain concepts, especially ${domainTerms.join(", ")}.`
          : "Relevant academic, research, or practical domain knowledge connected to the role.",
      weight: 25,
    },
    {
      id: "project_evidence",
      name: "Project evidence",
      description:
        "Concrete projects, internships, coursework, research, or portfolio work showing the candidate can apply the role requirements.",
      weight: 25,
    },
  ];
};
