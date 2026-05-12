import { extname } from "node:path";

import type { FullExtractedCandidateData, UploadedCvFile } from "./cv-ranker.types.js";

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const skillPatterns: Array<{ label: string; pattern: RegExp }> = [
  { label: "Python", pattern: /\bpython\b/i },
  { label: "PyTorch", pattern: /\b(pytorch|torch)\b/i },
  { label: "TensorFlow", pattern: /\b(tensorflow|keras)\b/i },
  { label: "scikit-learn", pattern: /\b(scikit[-\s]?learn|sklearn)\b/i },
  { label: "NumPy", pattern: /\bnumpy\b/i },
  { label: "Pandas", pattern: /\bpandas\b/i },
  { label: "SQL", pattern: /\bsql\b/i },
  { label: "R", pattern: /\br programming\b|\br language\b|\bR\b/ },
  { label: "MATLAB", pattern: /\bmatlab\b/i },
  { label: "JavaScript", pattern: /\bjavascript\b|\btypescript\b|\bnode\.?js\b/i },
  { label: "Linear Algebra", pattern: /\blinear algebra\b/i },
  { label: "Calculus", pattern: /\bcalculus\b/i },
  { label: "Probability", pattern: /\bprobability\b/i },
  { label: "Statistics", pattern: /\bstatistics?\b|\bstatistical\b/i },
  { label: "Real Analysis", pattern: /\breal analysis\b/i },
  { label: "Optimization", pattern: /\boptimization\b|\boptimisation\b/i },
  { label: "Machine Learning", pattern: /\bmachine learning\b|\bml\b/i },
  { label: "Deep Learning", pattern: /\bdeep learning\b|\bneural network/i },
  { label: "NLP", pattern: /\bnlp\b|\bnatural language processing\b/i },
  { label: "Computer Vision", pattern: /\bcomputer vision\b|\bopencv\b/i },
  { label: "Data Analysis", pattern: /\bdata analysis\b|\bdata analytics\b/i },
  { label: "Git", pattern: /\bgit\b|\bgithub\b|\bgitlab\b/i },
  { label: "Docker", pattern: /\bdocker\b|\bcontainer/i },
];

const cleanupText = (text: string) => {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const extractPdfTextFallback = (buffer: Buffer) => {
  const decoded = buffer.toString("latin1");
  const matches = Array.from(decoded.matchAll(/\(([^()]*)\)\s*Tj/g), (match) => {
    return match[1].replace(/\\([\\()])/g, "$1");
  });

  if (matches.length > 0) {
    return cleanupText(matches.join("\n"));
  }

  return cleanupText(decoded.replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, " "));
};

const getUsefulLines = (text: string) => {
  return cleanupText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.length <= 220);
};

const looksLikeName = (line: string) => {
  if (emailPattern.test(line)) {
    return false;
  }

  if (/\b(resume|curriculum vitae|cv|profile|portfolio|phone|email|linkedin)\b/i.test(line)) {
    return false;
  }

  const words = line.split(/\s+/);
  if (words.length < 2 || words.length > 4) {
    return false;
  }

  return words.every((word) => /^[A-Z][a-zA-Z.'-]+$/.test(word));
};

const extractName = (text: string, email: string | null) => {
  const lines = getUsefulLines(text).slice(0, 20);
  const lineName = lines.find(looksLikeName);

  if (lineName) {
    return lineName;
  }

  const emailLocalPart = email?.split("@")[0].replace(/[._-]+/g, " ");
  if (!emailLocalPart) {
    return null;
  }

  const words = emailLocalPart
    .split(/\s+/)
    .filter((word) => /^[a-z]+$/i.test(word))
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());

  return words.length >= 2 ? words.slice(0, 3).join(" ") : null;
};

const extractSkills = (text: string) => {
  return skillPatterns
    .filter((skill) => skill.pattern.test(text))
    .map((skill) => skill.label)
    .sort((left, right) => left.localeCompare(right));
};

const extractSectionLines = (text: string, keywords: RegExp, limit: number) => {
  const lines = getUsefulLines(text);
  const matches: string[] = [];

  for (const [index, line] of lines.entries()) {
    if (!keywords.test(line)) {
      continue;
    }

    const nearby = [line, lines[index + 1]]
      .filter((candidate): candidate is string => Boolean(candidate))
      .join(" ");

    if (!matches.includes(nearby)) {
      matches.push(nearby);
    }

    if (matches.length >= limit) {
      break;
    }
  }

  return matches;
};

const extractEducation = (text: string) => {
  const educationLines = extractSectionLines(
    text,
    /\b(education|university|college|bachelor|master|phd|degree|computer science|mathematics|engineering|statistics)\b/i,
    3,
  );

  return educationLines.length > 0 ? educationLines.join(" ") : null;
};

const extractExperience = (text: string) => {
  return extractSectionLines(
    text,
    /\b(experience|intern|engineer|developer|research assistant|teaching assistant|worked|built|implemented|company|startup)\b/i,
    5,
  );
};

const extractProjects = (text: string) => {
  return extractSectionLines(
    text,
    /\b(project|capstone|thesis|model|classifier|prediction|dashboard|simulation|analysis|pipeline|deployed)\b/i,
    5,
  );
};

export const extractStructuredCandidateData = (text: string): FullExtractedCandidateData => {
  const cleanedText = cleanupText(text);
  const email = cleanedText.match(emailPattern)?.[0].toLowerCase() ?? null;

  return {
    name: extractName(cleanedText, email),
    email,
    skills: extractSkills(cleanedText),
    education: extractEducation(cleanedText),
    experience: extractExperience(cleanedText),
    projects: extractProjects(cleanedText),
  };
};

export const extractTextFromCv = async (file: UploadedCvFile) => {
  const extension = extname(file.originalName).toLowerCase();

  if (file.mimeType === "application/pdf" || extension === ".pdf") {
    const pdfParseModule = await import("pdf-parse/lib/pdf-parse.js");
    const pdfParse = pdfParseModule.default ?? pdfParseModule;
    try {
      const result = await pdfParse(file.buffer);
      return cleanupText(result.text);
    } catch {
      return extractPdfTextFallback(file.buffer);
    }
  }

  if (
    file.mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === ".docx"
  ) {
    const mammothModule = await import("mammoth");
    const mammoth = "extractRawText" in mammothModule
      ? mammothModule
      : (mammothModule as { default: typeof mammothModule }).default;
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return cleanupText(result.value);
  }

  throw new Error("Unsupported CV file type.");
};
