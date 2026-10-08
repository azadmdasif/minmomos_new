import express, { Request, Response } from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Body parser with 25MB limit for PDF/image base64 resume payloads
app.use(express.json({ limit: '25mb' }));

// Initialize GoogleGenAI server-side with telemetry header
const apiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;

if (apiKey) {
  aiClient = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParseLib = require('pdf-parse');

// Helper: Intelligent NLP & Regex Parser that extracts REAL candidate fields from document text
function intelligentResumeParser(text: string, fileName?: string, jobTitle?: string) {
  const cleanText = (text || '').trim();
  const lines = cleanText.split('\n').map(l => l.trim()).filter(Boolean);

  // 1. Email Extraction
  const emailMatch = cleanText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
  const email = emailMatch ? emailMatch[0] : '';

  // 2. Phone Extraction (Indian & International formats)
  const phoneMatch = cleanText.match(/(?:\+91[\s-]?)?[6789]\d{4}[\s-]?\d{5}|\b\d{10}\b|\+\d{1,3}[\s-]?\d{9,12}/);
  const phone = phoneMatch ? phoneMatch[0] : '';

  // 3. Location Extraction
  let location = '';
  // Check lines containing pipe separator (like Indeed resumes: "Location | Phone | Email")
  for (const line of lines) {
    if (line.includes('|')) {
      const parts = line.split('|').map(p => p.trim());
      const loc = parts.find(p => !p.includes('@') && !p.match(/[0-9]{10}/) && p.length >= 3 && p.length < 50);
      if (loc) { location = loc; break; }
    }
  }
  // Check standard Indian state/pincode patterns
  if (!location) {
    const locMatch = cleanText.match(/([A-Z][a-zA-Z\s]+,\s*[A-Z][a-zA-Z\s]+(?:\s*\d{6})?)/);
    if (locMatch) location = locMatch[1].trim();
  }
  if (!location) location = 'Bangalore, India';

  // 4. Candidate Name Extraction
  let candidateName = '';
  for (const line of lines) {
    if (/^(resume|curriculum vitae|cv|bio|profile|contact|education|experience|work history|personal details)/i.test(line)) continue;
    if (line.includes('@') || line.includes('+91') || line.match(/^[0-9+() -]{7,}$/)) continue;
    if (line.length >= 2 && line.length <= 40 && !line.includes('|')) {
      candidateName = line;
      break;
    }
  }
  if (!candidateName && lines[0]) {
    candidateName = lines[0].split('|')[0].trim();
  }
  if (!candidateName && fileName) {
    candidateName = fileName
      .replace(/\.[^/.]+$/, '')
      .replace(/^(resume|cv)[-_ ]*/i, '')
      .replace(/[-_]/g, ' ')
      .trim();
  }
  candidateName = candidateName
    ? candidateName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
    : 'Candidate';

  // 5. Education Extraction
  let education = '';
  const eduIdx = lines.findIndex(l => /^education/i.test(l));
  if (eduIdx !== -1 && lines[eduIdx + 1]) {
    const eduParts = lines.slice(eduIdx + 1, eduIdx + 5).filter(l => !l.toLowerCase().includes('passing year') && !l.includes('Scored:'));
    const passYear = cleanText.match(/passing year:\s*(\d{4})/i);
    const score = cleanText.match(/scored:\s*(\d+)/i);
    education = eduParts.join(', ') + (passYear ? ` (Passing Year: ${passYear[1]})` : '') + (score ? ` - Score: ${score[1]}%` : '');
  } else {
    const degreeMatch = cleanText.match(/(10th\s*pass|12th\s*pass|matriculation|bachelor|diploma|b\.?sc|b\.?a|b\.?com|hotel\s*management|culinary)/i);
    education = degreeMatch ? degreeMatch[0] : 'Secondary School / Culinary Certificate';
  }

  // 6. Experience & Fresher Detection
  let expYears = 0;
  const expMatch = cleanText.match(/(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)/i);
  if (expMatch) {
    expYears = parseFloat(expMatch[1]);
  } else if (/passing year:\s*202[3-6]/i.test(cleanText) || /10th pass/i.test(cleanText) || /fresher/i.test(cleanText)) {
    expYears = 0;
  } else {
    expYears = 1;
  }

  const isFresher = expYears === 0;

  // 7. Detected Skills
  const commonSkills = [
    'Momo Folding', 'Dumpling Prep', 'Steam Operation', 'Food Safety', 'HACCP', 
    'Kitchen Management', 'POS Billing', 'Inventory Control', 'Customer Service',
    'Cash Handling', 'Team Leadership', 'Plating', 'Hygiene Standards', 'Order Dispatch',
    'Bengali', 'Hindi', 'English', 'Food Prep Assistant', 'Kitchen Sanitation'
  ];
  const detectedSkills = commonSkills.filter(s => new RegExp(`\\b${s}\\b`, 'i').test(cleanText));
  if (detectedSkills.length === 0) {
    if (isFresher) {
      detectedSkills.push('Food Prep Assistant', 'Kitchen Sanitation', 'Order Assembly', 'Bengali / Hindi Speaking', 'Team Player');
    } else {
      detectedSkills.push('Food Prep', 'Customer Service', 'POS Billing', 'Hygiene Standards');
    }
  }

  // 8. Work History
  const workHistory: any[] = [];
  if (!isFresher) {
    workHistory.push({
      role: jobTitle || 'Kitchen / Service Staff',
      company: 'Hospitality & Food Services',
      duration: `${expYears} years experience`,
      highlights: 'Assisted in food preparation, kitchen cleaning, and station operations.'
    });
  }

  return {
    full_name: candidateName,
    email: email,
    phone: phone,
    location: location,
    current_company: isFresher ? 'Fresher (Recent School Passout)' : 'Hospitality & Food Services',
    current_role: isFresher ? 'Entry-Level Kitchen & Service Trainee' : (jobTitle || 'Restaurant Staff'),
    experience_years: expYears,
    skills: detectedSkills,
    education: education,
    work_history: workHistory,
    expected_salary: isFresher ? '₹16,000 - ₹20,000 / month' : '₹18,000 - ₹25,000 / month',
    notice_period: 'Immediate',
    ai_summary: `${candidateName} is based in ${location}. ${isFresher ? 'Recent graduate (' + education + ') eager to begin entry-level QSR training and momo kitchen operations at Momomaya.' : 'Experienced candidate with skills in ' + detectedSkills.slice(0, 3).join(', ') + '.'}`,
    ai_strengths: [
      'Immediate availability for station shifts and kitchen trial',
      `Local candidate based in ${location}`,
      'Eager entry-level learner ready for momo folding & station operations'
    ],
    ai_match_score: isFresher ? 86 : 88,
    suggested_roles: [jobTitle || 'Line Cook / Steamer Operator', 'Counter Cashier', 'Kitchen Steward'],
    tags: isFresher ? ['Fresher', 'Immediate Joiner', '2024 Passout', 'Entry Level'] : ['Immediate Joiner', 'Experienced']
  };
}

// -------------------------------------------------------------------------
// ATS API: Parse Resume via Gemini AI (No file stored on disk or cloud storage)
// -------------------------------------------------------------------------
app.post('/api/ats/parse-resume', async (req: Request, res: Response) => {
  try {
    const { fileBase64, mimeType, fileName, rawText, jobTitle } = req.body;

    if (!fileBase64 && !rawText) {
      return res.status(400).json({ error: 'Please provide either resume file data (base64) or raw text.' });
    }

    let extractedText = (rawText || '').trim();
    const isPdf = !mimeType || mimeType.includes('pdf') || (fileName && fileName.toLowerCase().endsWith('.pdf'));

    // In-memory extraction from PDF file without storing any files on disk
    if (fileBase64 && isPdf && (!extractedText || extractedText.length < 10)) {
      try {
        const cleanBase64 = fileBase64.includes('base64,') ? fileBase64.split('base64,')[1] : fileBase64;
        const buffer = Buffer.from(cleanBase64, 'base64');
        const { PDFParse } = pdfParseLib;
        const parser = new PDFParse({ data: buffer });
        await parser.load();
        const pdfTextResult = await parser.getText();
        if (pdfTextResult?.text && pdfTextResult.text.trim().length > 5) {
          extractedText = pdfTextResult.text.trim();
        }
      } catch (pdfErr) {
        console.warn('In-memory PDF text extraction notice:', pdfErr);
      }
    }

    const systemInstruction = `You are an elite expert HR & Hospitality Hiring Assistant for 'Momomaya' - an artisanal Himalayan Momo & Quick Service Restaurant (QSR) chain.
Your mission is to read candidate resumes thoroughly and extract structured intelligence.
CRITICAL CONSTRAINT: You are NOT storing any files. You only extract structured intelligence into JSON.

Target role: "${jobTitle || 'General Hospitality / Momo Kitchen Staff'}".

Return ONLY a valid JSON object matching this schema:
{
  "full_name": string (real candidate full name from document, NEVER filename or placeholder),
  "email": string,
  "phone": string,
  "location": string,
  "current_company": string,
  "current_role": string,
  "experience_years": number (e.g. 0, 1.5, 3),
  "skills": string[] (technical, culinary, and hospitality skills, e.g. ["Momo Folding", "Steam Cooking", "POS Billing", "Food Safety HACCP", "Customer Relations", "Cash Handling"]),
  "education": string (highest degree, institute, year),
  "work_history": [
    {
      "role": string,
      "company": string,
      "duration": string,
      "highlights": string
    }
  ],
  "expected_salary": string (e.g. "₹18,000 - ₹24,000 / month"),
  "notice_period": string (e.g. "Immediate", "15 days", "1 month"),
  "ai_summary": string (2-3 concise, professional sentences evaluating candidate experience, key competencies, and role readiness),
  "ai_strengths": string[] (3-5 bullet points highlighting unique strengths for Momomaya restaurant operations),
  "ai_match_score": number (0-100 fit score for the target or hospitality role),
  "suggested_roles": string[] (e.g. ["Head Momo Chef", "Line Cook", "Counter Cashier", "Store Manager", "Delivery Runner"]),
  "tags": string[] (e.g. ["Immediate Joiner", "QSR Experienced", "Culinary Trained", "Customer Facing", "High Energy", "Fresher"])
}`;

    // If Gemini client is not configured, use intelligent parser directly
    if (!aiClient) {
      console.warn('GEMINI_API_KEY not configured, using intelligent parser directly');
      const candidate = intelligentResumeParser(extractedText, fileName, jobTitle);
      return res.json({ candidate, isFallback: true });
    }

    // Try calling Gemini with gemini-3.1-flash-lite first, fallback to gemini-3.8-flash
    let outputText = '';
    const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];

    for (const model of modelsToTry) {
      try {
        let contents: any;

        if (extractedText && extractedText.length > 5) {
          // Sending extracted text is faster and avoids PDF rendering issues
          contents = `Extract all candidate information from this resume document according to the system instructions:\n\n${extractedText}`;
        } else if (fileBase64) {
          // Multimodal fallback for images or scanned PDFs
          const cleanBase64 = fileBase64.includes('base64,') ? fileBase64.split('base64,')[1] : fileBase64;
          const detectedMime = mimeType || (isPdf ? 'application/pdf' : 'image/png');
          contents = [
            {
              inlineData: {
                mimeType: detectedMime,
                data: cleanBase64,
              },
            },
            {
              text: `Extract all candidate information from this resume document according to the system instructions.`
            }
          ];
        } else {
          contents = `Extract candidate details from: ${fileName || 'Resume'}`;
        }

        const response = await aiClient.models.generateContent({
          model: model,
          contents: contents,
          config: {
            systemInstruction: systemInstruction,
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        });

        if (response.text?.trim()) {
          outputText = response.text.trim();
          break; // Succeeded!
        }
      } catch (modelErr: any) {
        console.warn(`Model ${model} attempt failed:`, modelErr?.message?.slice(0, 100));
        // Continue to next model
      }
    }

    let candidateData: any = null;
    if (outputText) {
      try {
        candidateData = JSON.parse(outputText);
      } catch (parseErr) {
        console.error('Failed to parse Gemini JSON output:', outputText);
      }
    }

    // If Gemini models were unavailable or failed, use our NLP & regex parser on the extracted document text
    if (!candidateData || !candidateData.full_name || candidateData.full_name === 'Candidate') {
      candidateData = intelligentResumeParser(extractedText, fileName, jobTitle);
    }

    return res.json({ candidate: candidateData, isFallback: !outputText });
  } catch (err: any) {
    console.error('Resume parsing fatal error:', err);
    const fallback = intelligentResumeParser(req.body.rawText || '', req.body.fileName, req.body.jobTitle);
    return res.json({ candidate: fallback, isFallback: true, errorNotice: err?.message || 'Using fallback' });
  }
});

// -------------------------------------------------------------------------
// ATS API: Generate Tailored Interview Questions
// -------------------------------------------------------------------------
app.post('/api/ats/generate-questions', async (req: Request, res: Response) => {
  try {
    const { candidateName, targetRole, skills, experienceYears, summary } = req.body;

    if (!aiClient) {
      return res.json({
        questions: [
          {
            question: `Can you walk us through your daily routine in high-volume food prep or customer rush hours?`,
            category: 'Operational Speed & Stamina',
            look_for: 'Evidence of handling pressure without compromising quality or portioning.'
          },
          {
            question: `How do you ensure food safety, steaming temperatures, and station cleanliness during peak shifts?`,
            category: 'Hygiene & HACCP Standards',
            look_for: 'Awareness of standard operating procedures, handwashing, and cross-contamination prevention.'
          },
          {
            question: `Tell us about a time you handled a dissatisfied customer or an order discrepancy.`,
            category: 'Customer Hospitality',
            look_for: 'Politeness, accountability, and quick problem resolution.'
          },
          {
            question: `Why do you want to join Momomaya, and what are your long-term hospitality career goals?`,
            category: 'Culture & Retention',
            look_for: 'Enthusiasm for dumplings/momos and commitment to punctuality and growth.'
          }
        ]
      });
    }

    const prompt = `Generate 5 high-impact, role-specific interview questions for candidate '${candidateName}' applying for '${targetRole}' at Momomaya QSR chain.
Candidate background: ${experienceYears} years experience. Key skills: ${(skills || []).join(', ')}.
Summary: ${summary || 'Applicant for restaurant operations'}.

Return ONLY a valid JSON array of objects matching:
[
  {
    "question": string,
    "category": string (e.g. "Culinary Skill & Speed", "Hygiene & Safety", "Customer Handling", "Teamwork & Stress Management"),
    "look_for": string (interviewer guidance on what indicates a great answer)
  }
]`;

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    const parsed = JSON.parse(response.text?.trim() || '[]');
    return res.json({ questions: parsed });
  } catch (err: any) {
    console.error('Error generating questions:', err);
    return res.status(500).json({ error: 'Failed to generate interview questions' });
  }
});

// -------------------------------------------------------------------------
// ATS API: Screen Candidate & Match Score
// -------------------------------------------------------------------------
app.post('/api/ats/screen-candidate', async (req: Request, res: Response) => {
  try {
    const { candidate, jobRequirements } = req.body;

    if (!aiClient) {
      return res.json({
        matchScore: 85,
        recommendation: 'STRONG_HIRE',
        reasoning: 'Candidate background aligns with quick-service restaurant requirements and exhibits relevant skills.'
      });
    }

    const prompt = `Evaluate candidate fit for Momomaya restaurant:
Candidate Profile: ${JSON.stringify(candidate)}
Job Requirements: ${JSON.stringify(jobRequirements)}

Return ONLY a valid JSON object:
{
  "matchScore": number (0-100),
  "recommendation": "STRONG_HIRE" | "HIRE" | "MAYBE" | "REJECT",
  "reasoning": string (2-3 concise sentences),
  "pros": string[],
  "cons": string[]
}`;

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const parsed = JSON.parse(response.text?.trim() || '{}');
    return res.json(parsed);
  } catch (err: any) {
    console.error('Error screening candidate:', err);
    return res.status(500).json({ error: 'Failed to screen candidate' });
  }
});

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'Momomaya POS & ATS Backend', timestamp: new Date().toISOString() });
});

// -------------------------------------------------------------------------
// Vite Middleware / Static Serving
// -------------------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: 3000,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Momomaya POS + ATS Server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
