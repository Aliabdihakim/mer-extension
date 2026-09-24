/** The canonical structured CV. Everything in the product works on this shape. */

export interface CvContact {
  fullName: string;
  email?: string;
  phone?: string;
  location?: string;
  links?: string[];
}

export interface CvExperience {
  id: string;
  title: string;
  company: string;
  location?: string;
  startDate: string; // YYYY-MM
  endDate?: string; // YYYY-MM, undefined = ongoing
  bullets: string[];
}

export interface CvEducation {
  id: string;
  degree: string;
  school: string;
  startDate: string;
  endDate?: string;
  notes?: string;
}

export interface Cv {
  contact: CvContact;
  summary: string;
  skills: string[];
  experience: CvExperience[];
  education: CvEducation[];
  languages?: string[];
}
