import type { CvRankMetricDefinition } from "./cv-ranker.types.js";

export const defaultMlJobDescription =
  "Looking for an ML intern with experience in Python, PyTorch or TensorFlow, and strong fundamentals in linear algebra and calculus. Should have completed at least one end-to-end ML project.";

export const defaultMathJobDescription =
  "Looking for a math intern with strong background in linear algebra, real analysis, and probability. Programming experience in Python or MATLAB is a plus.";

export const defaultMlMetrics: CvRankMetricDefinition[] = [
  {
    id: "python_skills",
    name: "Python/Programming skills",
    description:
      "Ability to write clear Python code, use data structures, work with notebooks or scripts, and solve programming problems.",
    weight: 35,
  },
  {
    id: "ml_frameworks",
    name: "ML frameworks",
    description:
      "Hands-on experience with PyTorch, TensorFlow, scikit-learn, model training, evaluation, and common machine learning workflows.",
    weight: 25,
  },
  {
    id: "math_fundamentals",
    name: "Math fundamentals",
    description:
      "Strong understanding of linear algebra, calculus, probability, optimization, and mathematical concepts used in machine learning.",
    weight: 20,
  },
  {
    id: "project_relevance",
    name: "Project relevance",
    description:
      "Completed end-to-end machine learning projects involving data preparation, model building, experimentation, deployment, or reporting.",
    weight: 15,
  },
  {
    id: "communication",
    name: "Communication clarity",
    description:
      "Clear written communication, ability to explain technical decisions, document work, and present findings concisely.",
    weight: 5,
  },
];

export const defaultMathMetrics: CvRankMetricDefinition[] = [
  {
    id: "mathematical_maturity",
    name: "Mathematical maturity",
    description:
      "Strength in proofs, abstraction, linear algebra, real analysis, discrete mathematics, and rigorous mathematical reasoning.",
    weight: 40,
  },
  {
    id: "programming",
    name: "Programming",
    description:
      "Ability to use Python, MATLAB, R, or similar tools for computational problem solving, simulations, and data analysis.",
    weight: 25,
  },
  {
    id: "problem_solving",
    name: "Problem solving",
    description:
      "Evidence of solving complex problems through competitions, research, advanced coursework, projects, or independent work.",
    weight: 20,
  },
  {
    id: "statistical_knowledge",
    name: "Statistical knowledge",
    description:
      "Knowledge of probability, statistical inference, regression, experimentation, uncertainty, and data-driven reasoning.",
    weight: 10,
  },
  {
    id: "communication",
    name: "Communication",
    description:
      "Clear explanation of mathematical or technical ideas in writing, presentations, tutoring, reports, or documentation.",
    weight: 5,
  },
];
