import { embedTextLocally, cosineSimilarity } from "./cv-ranker.scoring.js";

const splitIntoSentences = (text: string) => {
  // split by newlines and sentence enders, preserve bullets
  const rough = text
    .replace(/•/g, "\n")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const sentences: string[] = [];
  for (const part of rough) {
    const pieces = part.split(/(?<=[\.\?!])\s+/);
    for (const p of pieces) {
      const trimmed = p.replace(/[\r\n]+/g, " ").trim();
      if (trimmed.length >= 20 && trimmed.length <= 400) sentences.push(trimmed);
    }
  }

  return sentences;
};

export const summarizeResumeExtractive = (text: string, topN = 5) => {
  const sentences = splitIntoSentences(text);
  if (sentences.length === 0) return [];

  const embeddings = sentences.map((s) => embedTextLocally(s));

  // compute centroid
  const dim = embeddings[0].length;
  const centroid = new Float64Array(dim);
  for (const vec of embeddings) {
    for (let i = 0; i < dim; i += 1) centroid[i] += vec[i];
  }
  for (let i = 0; i < dim; i += 1) centroid[i] /= embeddings.length;

  // score sentences by cosine similarity to centroid
  const scored = sentences.map((s, idx) => ({ idx, s, score: cosineSimilarity(embeddings[idx], centroid) }));
  scored.sort((a, b) => b.score - a.score);

  const selected: string[] = [];
  const used = new Set<number>();
  for (const item of scored) {
    if (selected.length >= topN) break;
    // simple diversity: avoid sentences that are substrings of already selected
    const isRedundant = selected.some((sel) => sel.includes(item.s) || item.s.includes(sel));
    if (isRedundant) continue;
    selected.push(item.s);
    used.add(item.idx);
  }

  return selected;
};

export default summarizeResumeExtractive;

export const summarizeResumeForJob = (text: string, jobDescription: string, topN = 3, maxLen = 100) => {
  const sentences = splitIntoSentences(text);
  if (sentences.length === 0) return [];

  const jobEmbedding = embedTextLocally(jobDescription);
  const embeddings = sentences.map((s) => embedTextLocally(s));

  const scored = sentences.map((s, idx) => ({ idx, s, score: cosineSimilarity(embeddings[idx], jobEmbedding) }));
  scored.sort((a, b) => b.score - a.score);

  const selected: string[] = [];
  for (const item of scored) {
    if (selected.length >= topN) break;
    let out = item.s;
    if (out.length > maxLen) {
      const cut = out.slice(0, maxLen);
      const lastPunc = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf(','), cut.lastIndexOf(';'), cut.lastIndexOf(':'));
      if (lastPunc > Math.floor(maxLen * 0.5)) out = cut.slice(0, lastPunc + 1);
      else out = cut.trim() + '...';
    }
    const isRedundant = selected.some((sel) => sel.includes(out) || out.includes(sel));
    if (isRedundant) continue;
    selected.push(out);
  }

  return selected;
};
