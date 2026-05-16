import { defaultMlMetrics } from "../src/modules/cv-ranker/cv-ranker.defaults.js";
import { normalizeMetricDefinitions, scoreMetrics, embedTextLocally, cosineSimilarity, combineMetricScores } from "../src/modules/cv-ranker/cv-ranker.scoring.js";
import { summarizeResumeExtractive, summarizeResumeForJob } from "../src/modules/cv-ranker/cv-ranker.summarizer.js";
import { extractStructuredCandidateData } from "../src/modules/cv-ranker/cv-ranker.extract.js";

const resumeText = `Abigail Fuad Hassen
+251 932153450 | hassenabigail@gmail.com | Linkedin | Github
Education
Addis Ababa Science and Technology University
Bachelor of science in Software engineering
• CGPA: 3.86/4.0
May 2022– Jun 2026
Addis Ababa, Ethiopia
• Relevant Coursework: Data Structure and Algorithms, Fundamental of Programming, Database Systems,
Object-oriented Programming, Computer Organization and Architecture, System Analysis and Modeling.
Technical Achievements
• Solved 800+ problems on LeetCode & Codeforces, strengthening DSA and problem-solving skills.
• Completed the 3-month Kifiya AI Mastery Program (’25), focusing on data engineering pipelines, machine
learning workflows, and FinTech applications.
Experience
AI Developer Intern
Icog Labs
Sep 2025– Present
Addis Ababa, Ethiopia
• Contributed to the development of data ingestion pipelines (chunking, embedding, indexing) for 3,000+ MeTTa
code chunks and documentation, enabling fast semantic retrieval for RAG workflows.
• Developed a structured logging system that separates errors, warnings, and ingestion logs, passing contextual
metadata to LLMs for improved monitoring and debugging.
• Reduced chat response time by over 65%, implementing concurrent retrieval from the vector database for code and
documentation, and optimizing the pipeline to avoid unnecessary database calls for repeated queries.
Lead Project Manager
Google Developer Student Clubs (AASTU)
Oct 2023– Jul 2024
Addis Ababa, Ethiopia
• Led project management for the 2023/2024 academic year, overseeing study groups of 300+ students focused on
Django, Flutter, Laravel, and React.js, while mentoring students on problem-solving and scalable software
design.
• Coordinated team workflows, ensuring timely progress, optimized resources, and maintained high engagement and
effective learning across all study groups.
Projects
RAG Chatbot for Complaint Analysis | Python, Streamlit, FAISS, Transformers
Jun 2025– Aug 2025
• Developed a Retrieval-Augmented Generation (RAG) chatbot capable of answering user queries based on real
customer complaint data.
• Integrated FAISS for fast semantic search and retrieval of relevant complaint text segments from a vector database.
• Built an interactive Streamlit interface for querying, viewing AI-generated responses, and inspecting retrieved data
sources.
• Implemented modular components for data preprocessing, chunking, and vector indexing to optimize performance
and scalability.
Academate | Python, Django, REST API, React, JWT
Jul 2024– Sep 2024
• Developed a student networking platform aimed at connecting students for collaboration on projects and
opportunities.
• Led a team of 3 backend developers to build secure user authentication, dynamic profile management, and recruiter
search functionalities, coordinating efforts to ensure high code quality.
• Integrated backend with the React frontend, enabling real-time project posts and seamless data flow using JWT for
secure login.
Technical Skills
Languages: Python, C++, Golang, Java, JavaScript, TypeScript, SQL
Frameworks: Django, React.js, Tailwind CSS, Next.js, FastAPI
Developer Tools: Docker, GitHub, Git, Jira, VS Code
Other Skills: Data-structures and algorithms, Communication, Team Work, Testing`;

const metrics = normalizeMetricDefinitions(defaultMlMetrics);
const extracted = extractStructuredCandidateData(resumeText);
const cvEmbedding = embedTextLocally(resumeText);

const metricScores = scoreMetrics(resumeText, metrics, extracted);
const finalScore = combineMetricScores(metricScores, metrics);

const toScore = (similarity: number) => {
  const nonNegativeSimilarity = Math.max(0, similarity);
  const scaledScore = Math.pow(nonNegativeSimilarity, 0.55) * 100;
  return Number(Math.min(100, scaledScore).toFixed(1));
};

console.log("Candidate:", extracted.name ?? "(unknown)", "<", extracted.email ?? "(no email)", ">");
console.log("Total final score:", finalScore);
console.log("Per-metric breakdown:");

for (const metric of metrics) {
  const metricEmbedding = embedTextLocally(`${metric.name}. ${metric.description}`);
  const semantic = toScore(cosineSimilarity(cvEmbedding, metricEmbedding));
  const blended = metricScores[metric.id] ?? 0;
  const structured = Math.max(0, Math.min(100, Number(((blended - 0.6 * semantic) / 0.4).toFixed(1))));

  console.log(`- ${metric.name} (${metric.id}): semantic=${semantic}, structured=${structured}, blended=${blended}`);
}

console.log("Extracted structured data:", JSON.stringify(extracted, null, 2));

console.log("\nTargeted extractive summary (AI Developer Intern):");
const targeted = summarizeResumeForJob(resumeText, "AI Developer Intern", 3, 90);
for (const b of targeted) console.log("-", b);
// One-sentence elevator summary (non-LLM): compose from extracted fields
const buildElevator = (extracted: any, text: string) => {
  const name = extracted.name ?? "Candidate";
  let role = "";
  if (Array.isArray(extracted.experience) && extracted.experience.length > 0) {
    const firstExp = extracted.experience[0];
    role = String(firstExp).split(/\n| at |,| - |\(|–/)[0].trim();
  }
  if (!role) role = "applicant";

  const topSkills = (extracted.skills ?? []).slice(0, 3);
  const skillsPart = topSkills.length > 0 ? `${topSkills.join(", ")}` : "relevant technical skills";

  const project = (extracted.projects ?? [])[0] ?? "project work";
  const projectShort = project.length > 80 ? project.slice(0, 77).trim() + "..." : project;

  const programMatch = text.match(/Kifiya[^.,\n]*/i)?.[0] ?? text.match(/Solved\s+\d+\+\s+problems[^.,\n]*/i)?.[0] ?? null;
  const programPart = programMatch ? ` Completed ${programMatch.replace(/[\u2019']/g, "'")}.` : '';

  const sentence = `${name} — ${role}; experienced in ${skillsPart} and notable for ${projectShort}.${programPart}`;
  return sentence.replace(/\s+/g, " ").trim();
};

console.log("\nElevator summary:");
console.log(buildElevator(extracted, resumeText));
