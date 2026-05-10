export type ResumeSignals = {
  candidate_name: string | null;
  candidate_email: string | null;
  candidate_phone: string | null;
};

export function extractResumeSignals(resumeText: string): ResumeSignals {
  if (!resumeText) {
    return { candidate_name: null, candidate_email: null, candidate_phone: null };
  }

  const emailMatch = resumeText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  const candidate_email = emailMatch ? emailMatch[0].toLowerCase() : null;

  const phoneMatch = resumeText.match(
    /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,
  );
  const candidate_phone = phoneMatch ? phoneMatch[0].trim() : null;

  // Name: first non-empty line in the top 10 that is 2-4 title-cased words,
  // no digits, no URLs, no email chars, no common section keywords.
  const SECTION_KEYWORDS = /^(summary|objective|experience|education|skills|projects|certifications|contact|profile|about|work)/i;
  let candidate_name: string | null = null;
  const lines = resumeText.split(/\r?\n/);
  for (const line of lines.slice(0, 10)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/@|http|www|linkedin|github|\.com|\.io|\.net|\.org/.test(trimmed)) continue;
    if (/\d/.test(trimmed)) continue;
    if (SECTION_KEYWORDS.test(trimmed)) continue;
    const words = trimmed.split(/\s+/);
    if (words.length < 2 || words.length > 4) continue;
    if (words.every((w) => /^[A-Z][a-zA-Z''\-]{0,30}$/.test(w))) {
      candidate_name = trimmed;
      break;
    }
  }

  return { candidate_name, candidate_email, candidate_phone };
}
