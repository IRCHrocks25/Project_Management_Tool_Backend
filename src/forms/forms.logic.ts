import { BadRequestException } from '@nestjs/common';
import {
  AnswerFile,
  CHOICE_KINDS,
  DEFAULT_SETTINGS,
  FormAnswer,
  FormItem,
  FormSettings,
  LIMITS,
  OTHER_OPTION,
  QUESTION_KINDS,
  QuestionItem,
  QuestionKind,
} from './forms.types';

/**
 * Pure validation for forms and submissions. Everything a client or the builder
 * sends goes through here, so the JSONB columns only ever hold known shapes.
 * Errors are BadRequestExceptions with messages written for the person filling
 * in the form or building it.
 */

type Raw = Record<string, unknown>;

const ITEM_ID = /^[A-Za-z0-9_-]+$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

function text(value: unknown, max: number, what: string): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new BadRequestException(`${what} must be text.`);
  if (value.length > max)
    throw new BadRequestException(`${what} can be at most ${max} characters.`);
  return value;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Where an item sits, for error messages: "Item 4" or "Question 2 (\"Your website\")". */
function label(index: number, raw: Raw): string {
  const title =
    typeof raw.title === 'string' && raw.title.trim()
      ? ` ("${raw.title.trim().slice(0, 60)}")`
      : '';
  return `Item ${index + 1}${title}`;
}

/**
 * Validates the builder's items. `builderFiles` maps this form's builder file ids
 * to their URL; an image's URL always comes from there, never from the client.
 */
export function normalizeItems(raw: unknown, builderFiles: Map<string, string>): FormItem[] {
  if (!Array.isArray(raw)) throw new BadRequestException('Items must be a list.');
  if (raw.length > LIMITS.items)
    throw new BadRequestException(`A form can have at most ${LIMITS.items} items.`);

  const seen = new Set<string>();
  return raw.map((entry, index): FormItem => {
    if (!isObject(entry)) throw new BadRequestException(`Item ${index + 1} is not valid.`);
    const where = label(index, entry);

    const id = entry.id;
    if (typeof id !== 'string' || !ITEM_ID.test(id) || id.length > LIMITS.itemId) {
      throw new BadRequestException(`${where} has an invalid id.`);
    }
    if (seen.has(id)) throw new BadRequestException(`${where} repeats the id "${id}".`);
    seen.add(id);

    switch (entry.type) {
      case 'section':
        return {
          id,
          type: 'section',
          title: text(entry.title, LIMITS.title, `${where}: the title`),
          description: text(entry.description, LIMITS.text, `${where}: the description`),
        };
      case 'text':
        return {
          id,
          type: 'text',
          title: text(entry.title, LIMITS.title, `${where}: the title`),
          body: text(entry.body, LIMITS.text, `${where}: the text`),
        };
      case 'image': {
        const raw = entry.fileId ?? null;
        if (raw !== null && (typeof raw !== 'string' || !builderFiles.has(raw))) {
          throw new BadRequestException(
            `${where}: the image was not uploaded to this form. Upload it again.`,
          );
        }
        const fileId = raw as string | null;
        return {
          id,
          type: 'image',
          fileId,
          url: fileId ? builderFiles.get(fileId)! : null,
          alt: text(entry.alt, LIMITS.title, `${where}: the image description`),
          caption: text(entry.caption, LIMITS.text, `${where}: the caption`),
        };
      }
      case 'question':
        return normalizeQuestion(entry, id, where);
      default:
        throw new BadRequestException(`${where} has an unknown type.`);
    }
  });
}

function normalizeQuestion(entry: Raw, id: string, where: string): QuestionItem {
  const kind = entry.kind as QuestionKind;
  if (!QUESTION_KINDS.includes(kind))
    throw new BadRequestException(`${where} has an unknown question type.`);

  let options: string[] = [];
  if (CHOICE_KINDS.includes(kind)) {
    if (!Array.isArray(entry.options))
      throw new BadRequestException(`${where} needs a list of options.`);
    if (entry.options.length > LIMITS.options) {
      throw new BadRequestException(`${where} can have at most ${LIMITS.options} options.`);
    }
    options = entry.options.map((o, i) =>
      text(o, LIMITS.option, `${where}: option ${i + 1}`).trim(),
    );
    if (options.some((o) => o === ''))
      throw new BadRequestException(`${where} has an empty option.`);
    if (new Set(options).size !== options.length)
      throw new BadRequestException(`${where} has the same option twice.`);
    if (options.includes(OTHER_OPTION))
      throw new BadRequestException(`${where} uses a reserved option name.`);
  }

  const allowsOther = kind === 'multiple_choice' || kind === 'checkboxes';
  return {
    id,
    type: 'question',
    kind,
    title: text(entry.title, LIMITS.title, `${where}: the question`),
    description: text(entry.description, LIMITS.text, `${where}: the description`),
    required: bool(entry.required, false),
    options,
    allowOther: allowsOther && bool(entry.allowOther, false),
  };
}

/** Merges a partial settings update over the current settings (or the defaults). */
export function normalizeSettings(raw: unknown, current?: Partial<FormSettings>): FormSettings {
  const base: FormSettings = { ...DEFAULT_SETTINGS, ...(current || {}) };
  if (raw === undefined || raw === null) return base;
  if (!isObject(raw)) throw new BadRequestException('Settings are not valid.');
  return {
    collectName: bool(raw.collectName, base.collectName),
    collectEmail: bool(raw.collectEmail, base.collectEmail),
    confirmationMessage:
      raw.confirmationMessage === undefined
        ? base.confirmationMessage
        : text(raw.confirmationMessage, LIMITS.confirmationMessage, 'The confirmation message'),
  };
}

/** The questions a form can be published with: at least one, all titled, choices with options. */
export function assertPublishable(items: FormItem[]): void {
  const questions = items.filter((i): i is QuestionItem => i.type === 'question');
  if (questions.length === 0)
    throw new BadRequestException('Add at least one question before publishing.');
  questions.forEach((q, i) => {
    if (!q.title.trim()) throw new BadRequestException(`Question ${i + 1} has no text yet.`);
    if (CHOICE_KINDS.includes(q.kind) && q.options.length === 0) {
      throw new BadRequestException(`"${q.title.slice(0, 60)}" needs at least one option.`);
    }
  });
}

export interface SubmissionInput {
  answers?: unknown;
  respondentName?: unknown;
  respondentEmail?: unknown;
}

export interface ValidatedSubmission {
  answers: FormAnswer[];
  respondentName: string | null;
  respondentEmail: string | null;
  /** Respondent file ids to attach to the new response. */
  fileIds: string[];
}

/**
 * Checks a public submission against the form. `availableFiles` holds this form's
 * respondent uploads that are not yet attached to a response; any other file id is rejected.
 */
export function validateSubmission(
  items: FormItem[],
  settings: FormSettings,
  input: SubmissionInput,
  availableFiles: Map<string, AnswerFile>,
): ValidatedSubmission {
  const questions = items.filter((i): i is QuestionItem => i.type === 'question');
  const byId = new Map(questions.map((q) => [q.id, q]));

  const rawAnswers = input.answers ?? [];
  if (!Array.isArray(rawAnswers)) throw new BadRequestException('Answers must be a list.');
  const given = new Map<string, Raw>();
  for (const a of rawAnswers) {
    if (!isObject(a) || typeof a.questionId !== 'string')
      throw new BadRequestException('An answer is not valid.');
    if (!byId.has(a.questionId)) {
      throw new BadRequestException(
        'This form was changed while you were filling it in. Reload the page and try again.',
      );
    }
    if (given.has(a.questionId)) throw new BadRequestException('A question was answered twice.');
    given.set(a.questionId, a);
  }

  const usedFiles = new Set<string>();
  const answers = questions.map((q) => {
    const answer = answerFor(q, given.get(q.id), availableFiles, usedFiles);
    const empty =
      answer.value === null ||
      (Array.isArray(answer.value) && answer.value.length === 0) ||
      answer.value === '';
    if (q.required && empty && answer.files.length === 0) {
      throw new BadRequestException(`Please answer "${q.title.slice(0, 80)}".`);
    }
    return answer;
  });

  const name = text(input.respondentName, 200, 'Your name').trim();
  const email = text(input.respondentEmail, 320, 'Your email').trim();
  if (settings.collectName && !name) throw new BadRequestException('Please enter your name.');
  if (settings.collectEmail && !email) throw new BadRequestException('Please enter your email.');
  if (email && !EMAIL.test(email))
    throw new BadRequestException('Please enter a valid email address.');

  return {
    answers,
    respondentName: settings.collectName ? name : null,
    respondentEmail: settings.collectEmail ? email : null,
    fileIds: [...usedFiles],
  };
}

function answerFor(
  q: QuestionItem,
  raw: Raw | undefined,
  availableFiles: Map<string, AnswerFile>,
  usedFiles: Set<string>,
): FormAnswer {
  const base: FormAnswer = {
    questionId: q.id,
    title: q.title,
    kind: q.kind,
    value: null,
    other: null,
    files: [],
  };
  if (!raw) return base;
  const where = `"${q.title.slice(0, 60)}"`;

  switch (q.kind) {
    case 'short_text':
    case 'long_text': {
      const max = q.kind === 'short_text' ? LIMITS.shortAnswer : LIMITS.longAnswer;
      const value = text(raw.value, max, `Your answer to ${where}`).trim();
      return { ...base, value: value || null };
    }
    case 'multiple_choice':
    case 'dropdown': {
      if (raw.value === undefined || raw.value === null || raw.value === '') return base;
      if (typeof raw.value !== 'string')
        throw new BadRequestException(`Pick one option for ${where}.`);
      if (raw.value === OTHER_OPTION && q.allowOther) {
        const other = text(raw.other, LIMITS.other, `"Other" for ${where}`).trim();
        if (!other) throw new BadRequestException(`Fill in "Other" for ${where}.`);
        return { ...base, value: OTHER_OPTION, other };
      }
      if (!q.options.includes(raw.value))
        throw new BadRequestException(`Pick one of the listed options for ${where}.`);
      return { ...base, value: raw.value };
    }
    case 'checkboxes': {
      const values = raw.value ?? [];
      if (!Array.isArray(values) || values.some((v) => typeof v !== 'string')) {
        throw new BadRequestException(`Choose options for ${where}.`);
      }
      const unique = [...new Set(values as string[])];
      let other: string | null = null;
      for (const v of unique) {
        if (v === OTHER_OPTION && q.allowOther) {
          other = text(raw.other, LIMITS.other, `"Other" for ${where}`).trim();
          if (!other) throw new BadRequestException(`Fill in "Other" for ${where}.`);
        } else if (!q.options.includes(v)) {
          throw new BadRequestException(`Pick only the listed options for ${where}.`);
        }
      }
      // Keep the form's option order, with "Other" last.
      const ordered = q.options.filter((o) => unique.includes(o));
      if (other !== null) ordered.push(OTHER_OPTION);
      return { ...base, value: ordered, other };
    }
    case 'file_upload': {
      const ids = raw.fileIds ?? [];
      if (!Array.isArray(ids) || ids.some((v) => typeof v !== 'string')) {
        throw new BadRequestException(`The files for ${where} are not valid.`);
      }
      if (ids.length > LIMITS.filesPerQuestion) {
        throw new BadRequestException(
          `You can attach at most ${LIMITS.filesPerQuestion} files to ${where}.`,
        );
      }
      const files = (ids as string[]).map((id) => {
        const file = availableFiles.get(id);
        if (!file || usedFiles.has(id)) {
          throw new BadRequestException(`A file for ${where} is missing. Upload it again.`);
        }
        usedFiles.add(id);
        return file;
      });
      return { ...base, files };
    }
  }
}

/** Rewrites image file ids (and URLs) after a form's builder files were copied to a new form. */
export function remapImageFiles(
  items: FormItem[],
  copied: Map<string, { id: string; url: string }>,
): FormItem[] {
  return items.map((item) => {
    if (item.type !== 'image' || !item.fileId) return item;
    const next = copied.get(item.fileId);
    return next
      ? { ...item, fileId: next.id, url: next.url }
      : { ...item, fileId: null, url: null };
  });
}

/** Image file ids an item list references. */
export function referencedFileIds(items: FormItem[]): string[] {
  return items.flatMap((i) => (i.type === 'image' && i.fileId ? [i.fileId] : []));
}
