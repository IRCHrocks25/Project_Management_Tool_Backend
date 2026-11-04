/**
 * Shapes stored in the `forms.items`, `forms.settings` and `form_responses.answers`
 * JSONB columns. The frontend mirrors these in src/services/forms.service.ts.
 */

export const QUESTION_KINDS = [
  'short_text',
  'long_text',
  'multiple_choice',
  'checkboxes',
  'dropdown',
  'file_upload',
] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

/** Kinds whose answers are picked from `options`. */
export const CHOICE_KINDS: readonly QuestionKind[] = ['multiple_choice', 'checkboxes', 'dropdown'];

/** Value a multiple-choice or checkbox answer uses for the "Other" option; its text goes in `other`. */
export const OTHER_OPTION = '__other__';

/** A page break: everything after it, up to the next section, is one page of the public form. */
export interface SectionItem {
  id: string;
  type: 'section';
  title: string;
  description: string;
}

/** Display-only text. */
export interface TextItem {
  id: string;
  type: 'text';
  title: string;
  body: string;
}

/** A screenshot or picture placed by the team. `fileId` is a builder FormFile of the same form. */
export interface ImageItem {
  id: string;
  type: 'image';
  fileId: string | null;
  url: string | null;
  alt: string;
  caption: string;
}

export interface QuestionItem {
  id: string;
  type: 'question';
  kind: QuestionKind;
  title: string;
  description: string;
  required: boolean;
  /** Used by multiple_choice, checkboxes and dropdown; empty for other kinds. */
  options: string[];
  /** multiple_choice and checkboxes only: adds an "Other" option with a text box. */
  allowOther: boolean;
}

export type FormItem = SectionItem | TextItem | ImageItem | QuestionItem;

export interface FormSettings {
  /** Ask for the respondent's name (required when on). */
  collectName: boolean;
  /** Ask for the respondent's email (required when on). */
  collectEmail: boolean;
  /** Shown on the thank-you screen. */
  confirmationMessage: string;
}

export const DEFAULT_SETTINGS: FormSettings = {
  collectName: true,
  collectEmail: false,
  confirmationMessage: 'Thank you! Your response has been recorded.',
};

/** A file attached to an answer, as stored on the response. */
export interface AnswerFile {
  id: string;
  name: string;
  url: string;
  contentType: string | null;
  sizeBytes: number | null;
}

/**
 * One answer. `title` and `kind` are copied from the question at submit time, so
 * editing or removing a question later never breaks old responses.
 * `value` is a string for text, multiple_choice and dropdown, a string[] for
 * checkboxes, and null for file_upload or an unanswered optional question.
 */
export interface FormAnswer {
  questionId: string;
  title: string;
  kind: QuestionKind;
  value: string | string[] | null;
  other: string | null;
  files: AnswerFile[];
}

/** Limits enforced on the server; the frontend uses the same numbers. */
export const LIMITS = {
  items: 200,
  itemId: 64,
  title: 500,
  text: 5000,
  options: 50,
  option: 200,
  shortAnswer: 1000,
  longAnswer: 10000,
  other: 500,
  filesPerQuestion: 10,
  confirmationMessage: 1000,
};
