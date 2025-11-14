import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// -------------------------------
// Utilities
// -------------------------------
function deriveHrEmail(company) {
  if (!company || typeof company !== "string") return "hr@company.com";
  const domain = company.toLowerCase().replace(/\s+/g, "");
  return `hr@${domain}.com`;
}

function sanitizeText(s, fallback = "") {
  if (typeof s !== "string") return fallback;
  // Normalize whitespace and trim
  return s.replace(/\s+/g, " ").trim();
}

function toPlainMultiline(s) {
  // Normalize CRLF and trim
  return String(s || "").replace(/\r\n/g, "\n").trim();
}

// -------------------------------
// Schemas
// -------------------------------
const emailSchema = {
  type: SchemaType.OBJECT,
  properties: {
    subject: { type: SchemaType.STRING },
    body: { type: SchemaType.STRING },
  },
  required: ["subject", "body"],
};

const extractorOutputSchema = {
  type: SchemaType.OBJECT,
  properties: {
    name: { type: SchemaType.STRING },
    jobRole: { type: SchemaType.STRING },
    company: { type: SchemaType.STRING },
    location: { type: SchemaType.STRING },
  },
  required: ["name", "jobRole", "company", "location"],
};

// -------------------------------
/**
 * Generate a professional job application email.
 * Accepts either a structured object or raw text (string or { rawText }).
 * Returns { subject, body }.
 */
// -------------------------------
export async function generateEmail(input) {
  // Defaults and destructuring for structured input
  let {
    name,
    userEmail,
    userPhone,
    hrName = "HR Manager",
    hrEmail,
    jobRole,
    company,
    companyPhone,
    education = "B.Tech in Computer Science",
    skills = "Java, Python, JavaScript, React, and Node.js",
    location = "Bangalore, India",
  } = typeof input === "object" && !input.rawText ? input : (input || {});

  // -------------------------------
  // Step 1: Handle raw input (string or { rawText })
  // -------------------------------
  if (typeof input === "string" || (input && input.rawText)) {
    const rawText = typeof input === "string" ? input : input.rawText;

    const extractorSystem = `You are an AI data extractor that outputs strict JSON only.`;
    const extractorPrompt = `
From the following text, extract a concise JSON object with the keys:
{
  "name": "<candidate name or 'Candidate'>",
  "jobRole": "<role if mentioned or 'Software Engineer'>",
  "company": "<company if mentioned or 'the company'>",
  "location": "<location if mentioned or 'India'>"
}

Text:
"""${rawText}"""
`;

    try {
      const extractor = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: extractorOutputSchema,
          temperature: 0.2,
        },
        systemInstruction: extractorSystem,
      });

      const extraction = await extractor.generateContent(extractorPrompt);
      const text = extraction?.response?.text?.() || "";
      let parsedExtract = extraction?.response?.parsed;
      if (!parsedExtract) {
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        parsedExtract =
          start !== -1 && end !== -1
            ? JSON.parse(text.slice(start, end + 1))
            : {};
      }

      name = sanitizeText(parsedExtract.name, "Candidate");
      jobRole = sanitizeText(parsedExtract.jobRole, "Software Engineer");
      company = sanitizeText(parsedExtract.company, "the company");
      location = sanitizeText(parsedExtract.location, "India");
    } catch (err) {
      name ||= "Candidate";
      jobRole ||= "Software Engineer";
      company ||= "the company";
      location ||= "India";
    }
  }

  // -------------------------------
  // Step 2: Prepare safe variables
  // -------------------------------
  const safeHrEmail = sanitizeText(hrEmail || deriveHrEmail(company), "hr@company.com");
  const safeUserEmail = sanitizeText(userEmail, "example@email.com");
  const safeUserPhone = sanitizeText(userPhone, "+91-XXXXXXXXXX");
  const safeCompany = sanitizeText(company, "the company");
  const safeHrName = sanitizeText(hrName, "HR Manager");
  const safeName = sanitizeText(name, "Candidate");
  const safeJobRole = sanitizeText(jobRole, "Software Engineer");
  const safeLocation = sanitizeText(location, "India");
  const safeEducation = sanitizeText(education, "B.Tech in Computer Science");
  const safeSkills = sanitizeText(skills, "Java, Python, JavaScript, React, and Node.js");
  const safeCompanyPhone = sanitizeText(companyPhone, "N/A");

  // Extract primary skill keyword: first skill or last word of jobRole
  const mainSkillKeyword = (() => {
    const skillList = safeSkills.split(",").map((s) => s.trim()).filter(Boolean);
    if (skillList.length > 0) return skillList[0];
    const words = safeJobRole.split(" ").filter(Boolean);
    return words.length > 0 ? words[words.length - 1] : safeJobRole;
  })();

  // -------------------------------
  // Step 3: Build main prompt for fully AI-generated email with skill emphasis
  // -------------------------------
  const systemInstruction = `You are a professional corporate HR communication assistant. Use formal, concise business English, no contractions, and return only valid JSON that conforms to the given schema.`;

  const prompt = `
Return only JSON with:
{
  "subject": "Application for [Job Role] – [Name]",
  "body": "Full professional email content using \\n as new lines, including the key skill or technology prominently."
}

Context:
- Applicant Name: ${safeName}
- Applicant Email: ${safeUserEmail}
- Applicant Phone: ${safeUserPhone}
- Applicant Location: ${safeLocation}
- Applicant Education: ${safeEducation}
- Applicant Skills: ${safeSkills}
- Primary Skill or Technology: ${mainSkillKeyword}
- Job Role: ${safeJobRole}
- Company: ${safeCompany}
- HR Name: ${safeHrName}
- HR Email: ${safeHrEmail}
- Company Phone: ${safeCompanyPhone}

Guidelines:
- Start with a formal greeting: "Dear ${safeHrName},"
- Compose 2–3 paragraphs covering introduction/purpose, relevant skills focusing on the primary skill "${mainSkillKeyword}", and courteous closing.
- Keep the subject under 90 characters, including role and applicant name.
- Maintain a respectful, confident tone without exaggeration.
- Close with "Sincerely," followed by name, location, email, and phone.
`;

  // -------------------------------
  // Step 4: Model call with schema enforcement - Fully AI-driven email generation
  // -------------------------------
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: emailSchema,
      temperature: 0.3,
    },
    systemInstruction,
  });

  try {
    const result = await model.generateContent(prompt);
    const text = result?.response?.text?.() || "";

    let parsed = result?.response?.parsed;
    if (!parsed) {
      try {
        parsed = JSON.parse(text);
      } catch {
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        parsed = JSON.parse(text.slice(start, end + 1));
      }
    }

    if (!parsed || typeof parsed.subject !== "string" || typeof parsed.body !== "string") {
      throw new Error("Invalid response JSON.");
    }

    const subject = sanitizeText(parsed.subject, `Application for ${safeJobRole} – ${safeName}`);
    const body = toPlainMultiline(parsed.body);

    const finalSubject =
      subject.length > 90 ? `${subject.slice(0, 87).trim()}...` : subject;

    return {
      subject: finalSubject,
      body,
    };
  } catch (err) {
    // If AI call fails, provide a simple fallback message
    const fallbackSubject = `Application for ${safeJobRole} – ${safeName}`;
    const fallbackBody =
      `Dear ${safeHrName},\n\n` +
      `I am writing to formally express my interest in the ${safeJobRole} position at ${safeCompany}. ` +
      `I possess a strong academic background in ${safeEducation} and skills in ${safeSkills}, including ${mainSkillKeyword}. ` +
      `I am eager to contribute to your organization and grow professionally.\n\n` +
      `Thank you for considering my application.\n\n` +
      `Sincerely,\n${safeName}\n${safeLocation}\nEmail: ${safeUserEmail}\nPhone: ${safeUserPhone}`;

    return { subject: fallbackSubject, body: fallbackBody };
  }
}
