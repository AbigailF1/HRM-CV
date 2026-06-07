import type { EmailEventType } from "@prisma/client";

import { ValidationError } from "../../shared/http/errors.js";

export type TemplatePayload = Record<string, unknown>;

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
};

type EmailTemplate = {
  key: string;
  subject: string;
  text: string;
  html: string;
  requiredVariables: readonly string[];
};

const templates = {
  application_received: {
    key: "application_received",
    subject: "We received your application for {{job_title}}",
    text:
      "Hi {{applicant_name}},\n\nWe received your application for {{job_title}} at {{company_name}}. Our team will review it and follow up with next steps.\n\nThank you.",
    html:
      "<p>Hi {{applicant_name}},</p><p>We received your application for <strong>{{job_title}}</strong> at {{company_name}}. Our team will review it and follow up with next steps.</p><p>Thank you.</p>",
    requiredVariables: ["applicant_name", "job_title", "company_name"],
  },
  application_shortlisted: {
    key: "application_shortlisted",
    subject: "Update on your application for {{job_title}}",
    text:
      "Hi {{applicant_name}},\n\nGood news: your application for {{job_title}} at {{company_name}} has been shortlisted. We will contact you with next steps.\n\nThank you.",
    html:
      "<p>Hi {{applicant_name}},</p><p>Good news: your application for <strong>{{job_title}}</strong> at {{company_name}} has been shortlisted. We will contact you with next steps.</p><p>Thank you.</p>",
    requiredVariables: ["applicant_name", "job_title", "company_name"],
  },
  application_offer: {
    key: "application_offer",
    subject: "Offer update for {{job_title}}",
    text:
      "Hi {{applicant_name}},\n\nYour application for {{job_title}} at {{company_name}} has moved to the offer stage. Our team will follow up with details.\n\nThank you.",
    html:
      "<p>Hi {{applicant_name}},</p><p>Your application for <strong>{{job_title}}</strong> at {{company_name}} has moved to the offer stage. Our team will follow up with details.</p><p>Thank you.</p>",
    requiredVariables: ["applicant_name", "job_title", "company_name"],
  },
  application_hired: {
    key: "application_hired",
    subject: "Congratulations from {{company_name}}",
    text:
      "Hi {{applicant_name}},\n\nCongratulations. Your application for {{job_title}} at {{company_name}} has been accepted. Our team will follow up with onboarding details.\n\nThank you.",
    html:
      "<p>Hi {{applicant_name}},</p><p>Congratulations. Your application for <strong>{{job_title}}</strong> at {{company_name}} has been accepted. Our team will follow up with onboarding details.</p><p>Thank you.</p>",
    requiredVariables: ["applicant_name", "job_title", "company_name"],
  },
  application_rejected: {
    key: "application_rejected",
    subject: "Update on your application for {{job_title}}",
    text:
      "Hi {{applicant_name}},\n\nThank you for applying for {{job_title}} at {{company_name}}. We are not moving forward with your application at this time, but we appreciate your interest.\n\nThank you.",
    html:
      "<p>Hi {{applicant_name}},</p><p>Thank you for applying for <strong>{{job_title}}</strong> at {{company_name}}. We are not moving forward with your application at this time, but we appreciate your interest.</p><p>Thank you.</p>",
    requiredVariables: ["applicant_name", "job_title", "company_name"],
  },
  interview_scheduled: {
    key: "interview_scheduled",
    subject: "Interview scheduled for {{job_title}}",
    text:
      "Hi {{applicant_name}},\n\nYour interview for {{job_title}} at {{company_name}} is scheduled for {{interview_date}}. Interview link: {{interview_link}}\n\nThank you.",
    html:
      "<p>Hi {{applicant_name}},</p><p>Your interview for <strong>{{job_title}}</strong> at {{company_name}} is scheduled for {{interview_date}}.</p><p>Interview link: {{interview_link}}</p><p>Thank you.</p>",
    requiredVariables: ["applicant_name", "job_title", "company_name", "interview_date"],
  },
  interview_rescheduled: {
    key: "interview_rescheduled",
    subject: "Interview rescheduled for {{job_title}}",
    text:
      "Hi {{applicant_name}},\n\nYour interview for {{job_title}} at {{company_name}} has been rescheduled to {{interview_date}}. Interview link: {{interview_link}}\n\nThank you.",
    html:
      "<p>Hi {{applicant_name}},</p><p>Your interview for <strong>{{job_title}}</strong> at {{company_name}} has been rescheduled to {{interview_date}}.</p><p>Interview link: {{interview_link}}</p><p>Thank you.</p>",
    requiredVariables: ["applicant_name", "job_title", "company_name", "interview_date"],
  },
  interview_reminder: {
    key: "interview_reminder",
    subject: "Interview reminder for {{job_title}}",
    text:
      "Hi {{applicant_name}},\n\nThis is a reminder for your {{job_title}} interview with {{company_name}} on {{interview_date}}. Interview link: {{interview_link}}\n\nThank you.",
    html:
      "<p>Hi {{applicant_name}},</p><p>This is a reminder for your <strong>{{job_title}}</strong> interview with {{company_name}} on {{interview_date}}.</p><p>Interview link: {{interview_link}}</p><p>Thank you.</p>",
    requiredVariables: ["applicant_name", "job_title", "company_name", "interview_date"],
  },
} satisfies Record<EmailEventType, EmailTemplate>;

export const emailTemplateKeys = Object.keys(templates) as EmailEventType[];

export const getTemplateForEvent = (eventType: EmailEventType) => templates[eventType];

const stringifyTemplateValue = (value: unknown) => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const renderString = (template: string, payload: TemplatePayload, escape: (value: string) => string) =>
  template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) =>
    escape(stringifyTemplateValue(payload[key])),
  );

export const renderEmailTemplate = (
  templateKey: EmailEventType,
  payload: TemplatePayload,
): RenderedEmail => {
  const template = getTemplateForEvent(templateKey);
  const missingVariables = template.requiredVariables.filter(
    (key) => stringifyTemplateValue(payload[key]).trim().length === 0,
  );

  if (missingVariables.length > 0) {
    throw new ValidationError(
      `Missing email template variables: ${missingVariables.join(", ")}.`,
      "INVALID_EMAIL_TEMPLATE_DATA",
    );
  }

  return {
    subject: renderString(template.subject, payload, (value) => value),
    text: renderString(template.text, payload, (value) => value),
    html: renderString(template.html, payload, escapeHtml),
  };
};
