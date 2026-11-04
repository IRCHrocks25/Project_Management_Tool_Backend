import { BadRequestException } from '@nestjs/common';
import {
  assertPublishable,
  normalizeItems,
  normalizeSettings,
  referencedFileIds,
  remapImageFiles,
  validateSubmission,
} from './forms.logic';
import { AnswerFile, DEFAULT_SETTINGS, FormItem, OTHER_OPTION, QuestionItem } from './forms.types';

const q = (over: Partial<QuestionItem> & Pick<QuestionItem, 'id' | 'kind'>): QuestionItem => ({
  type: 'question',
  title: `Question ${over.id}`,
  description: '',
  required: false,
  options: [],
  allowOther: false,
  ...over,
});

const message = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).message;
  }
  throw new Error('expected a BadRequestException');
};

describe('normalizeItems', () => {
  const files = new Map([['file-1', 'https://cdn.example.com/a/1']]);

  it('keeps known items and fills defaults', () => {
    const items = normalizeItems(
      [
        { id: 's1', type: 'section', title: 'Home page' },
        {
          id: 'q1',
          type: 'question',
          kind: 'multiple_choice',
          title: 'Pick',
          options: [' A ', 'B'],
          allowOther: true,
        },
        {
          id: 'q2',
          type: 'question',
          kind: 'short_text',
          title: 'Name',
          allowOther: true,
          required: true,
        },
      ],
      files,
    );
    expect(items[0]).toEqual({ id: 's1', type: 'section', title: 'Home page', description: '' });
    expect(items[1]).toMatchObject({
      kind: 'multiple_choice',
      options: ['A', 'B'],
      allowOther: true,
      required: false,
    });
    // allowOther only applies to multiple_choice and checkboxes; options only to choice kinds.
    expect(items[2]).toMatchObject({
      kind: 'short_text',
      options: [],
      allowOther: false,
      required: true,
    });
  });

  it('takes an image URL from the form files, never from the client', () => {
    const [image] = normalizeItems(
      [{ id: 'i1', type: 'image', fileId: 'file-1', url: 'https://evil.example.com/x.png' }],
      files,
    );
    expect(image).toMatchObject({ fileId: 'file-1', url: 'https://cdn.example.com/a/1' });
  });

  it('rejects images from another form, unknown types, duplicate ids and bad options', () => {
    expect(
      message(() => normalizeItems([{ id: 'i1', type: 'image', fileId: 'other' }], files)),
    ).toMatch(/not uploaded/);
    expect(message(() => normalizeItems([{ id: 'x', type: 'video' }], files))).toMatch(
      /unknown type/,
    );
    expect(
      message(() =>
        normalizeItems(
          [
            { id: 'a', type: 'text' },
            { id: 'a', type: 'text' },
          ],
          files,
        ),
      ),
    ).toMatch(/repeats/);
    expect(message(() => normalizeItems([{ id: 'bad id!', type: 'text' }], files))).toMatch(
      /invalid id/,
    );
    expect(
      message(() =>
        normalizeItems(
          [{ id: 'q', type: 'question', kind: 'dropdown', options: ['A', 'A'] }],
          files,
        ),
      ),
    ).toMatch(/same option twice/);
    expect(
      message(() =>
        normalizeItems(
          [{ id: 'q', type: 'question', kind: 'checkboxes', options: [OTHER_OPTION] }],
          files,
        ),
      ),
    ).toMatch(/reserved/);
  });
});

describe('normalizeSettings', () => {
  it('merges a partial update over the current settings', () => {
    expect(normalizeSettings({ collectEmail: true }, { collectName: false })).toEqual({
      ...DEFAULT_SETTINGS,
      collectName: false,
      collectEmail: true,
    });
  });
});

describe('assertPublishable', () => {
  it('needs at least one titled question, and options for choice questions', () => {
    expect(
      message(() => assertPublishable([{ id: 't', type: 'text', title: '', body: '' }])),
    ).toMatch(/at least one/);
    expect(
      message(() => assertPublishable([q({ id: 'a', kind: 'short_text', title: ' ' })])),
    ).toMatch(/no text/);
    expect(message(() => assertPublishable([q({ id: 'a', kind: 'dropdown' })]))).toMatch(
      /needs at least one option/,
    );
    expect(() => assertPublishable([q({ id: 'a', kind: 'long_text' })])).not.toThrow();
  });
});

describe('validateSubmission', () => {
  const items: FormItem[] = [
    { id: 's', type: 'section', title: 'Home', description: '' },
    q({ id: 'name', kind: 'short_text', title: 'Business name', required: true }),
    q({ id: 'mc', kind: 'multiple_choice', options: ['Yes', 'No'], allowOther: true }),
    q({ id: 'cb', kind: 'checkboxes', options: ['A', 'B', 'C'] }),
    q({ id: 'dd', kind: 'dropdown', options: ['One', 'Two'] }),
    q({ id: 'up', kind: 'file_upload' }),
  ];
  const settings = { ...DEFAULT_SETTINGS, collectName: false, collectEmail: true };
  const file: AnswerFile = {
    id: 'f1',
    name: 'logo.png',
    url: 'https://cdn/a/f1',
    contentType: 'image/png',
    sizeBytes: 10,
  };
  const files = new Map([[file.id, file]]);
  const valid = { questionId: 'name', value: '  Acme  ' };

  it('builds answers for every question with title snapshots, in form order', () => {
    const result = validateSubmission(
      items,
      settings,
      {
        respondentEmail: 'kim@example.com',
        answers: [
          { questionId: 'cb', value: ['C', 'A', 'A'] },
          valid,
          { questionId: 'mc', value: OTHER_OPTION, other: 'Maybe' },
          { questionId: 'up', fileIds: ['f1'] },
        ],
      },
      files,
    );
    expect(result.answers.map((a) => a.questionId)).toEqual(['name', 'mc', 'cb', 'dd', 'up']);
    expect(result.answers[0]).toEqual({
      questionId: 'name',
      title: 'Business name',
      kind: 'short_text',
      value: 'Acme',
      other: null,
      files: [],
    });
    expect(result.answers[1]).toMatchObject({ value: OTHER_OPTION, other: 'Maybe' });
    expect(result.answers[2].value).toEqual(['A', 'C']);
    expect(result.answers[3].value).toBeNull();
    expect(result.answers[4].files).toEqual([file]);
    expect(result.fileIds).toEqual(['f1']);
    expect(result.respondentEmail).toBe('kim@example.com');
    expect(result.respondentName).toBeNull();
  });

  it('enforces required questions and the respondent fields', () => {
    expect(
      message(() =>
        validateSubmission(items, settings, { respondentEmail: 'a@b.co', answers: [] }, files),
      ),
    ).toMatch(/Please answer "Business name"/);
    expect(message(() => validateSubmission(items, settings, { answers: [valid] }, files))).toMatch(
      /enter your email/,
    );
    expect(
      message(() =>
        validateSubmission(items, settings, { respondentEmail: 'nope', answers: [valid] }, files),
      ),
    ).toMatch(/valid email/);
  });

  it('rejects options that are not on the form', () => {
    const base = { respondentEmail: 'a@b.co' };
    expect(
      message(() =>
        validateSubmission(
          items,
          settings,
          { ...base, answers: [valid, { questionId: 'dd', value: 'Three' }] },
          files,
        ),
      ),
    ).toMatch(/listed options/);
    expect(
      message(() =>
        validateSubmission(
          items,
          settings,
          { ...base, answers: [valid, { questionId: 'cb', value: ['A', 'Z'] }] },
          files,
        ),
      ),
    ).toMatch(/only the listed/);
    // "Other" is only allowed where the question offers it.
    expect(
      message(() =>
        validateSubmission(
          items,
          settings,
          { ...base, answers: [valid, { questionId: 'dd', value: OTHER_OPTION, other: 'x' }] },
          files,
        ),
      ),
    ).toMatch(/listed options/);
  });

  it('rejects unknown questions, files from elsewhere and reused files', () => {
    const base = { respondentEmail: 'a@b.co' };
    expect(
      message(() =>
        validateSubmission(
          items,
          settings,
          { ...base, answers: [valid, { questionId: 'gone' }] },
          files,
        ),
      ),
    ).toMatch(/changed while you were filling/);
    expect(
      message(() =>
        validateSubmission(
          items,
          settings,
          { ...base, answers: [valid, { questionId: 'up', fileIds: ['f9'] }] },
          files,
        ),
      ),
    ).toMatch(/Upload it again/);
    expect(
      message(() =>
        validateSubmission(
          items,
          settings,
          { ...base, answers: [valid, { questionId: 'up', fileIds: ['f1', 'f1'] }] },
          files,
        ),
      ),
    ).toMatch(/Upload it again/);
  });

  it('caps answer length', () => {
    expect(
      message(() =>
        validateSubmission(
          items,
          settings,
          { respondentEmail: 'a@b.co', answers: [{ questionId: 'name', value: 'x'.repeat(1001) }] },
          files,
        ),
      ),
    ).toMatch(/at most 1000/);
  });
});

describe('copying images', () => {
  it('remaps copied files and drops images whose file was not copied', () => {
    const items: FormItem[] = [
      { id: 'i1', type: 'image', fileId: 'old-1', url: 'u1', alt: '', caption: '' },
      { id: 'i2', type: 'image', fileId: 'old-2', url: 'u2', alt: '', caption: '' },
      { id: 'i3', type: 'image', fileId: null, url: null, alt: '', caption: '' },
    ];
    expect(referencedFileIds(items)).toEqual(['old-1', 'old-2']);
    const out = remapImageFiles(items, new Map([['old-1', { id: 'new-1', url: 'n1' }]]));
    expect(out.map((i) => (i.type === 'image' ? [i.fileId, i.url] : null))).toEqual([
      ['new-1', 'n1'],
      [null, null],
      [null, null],
    ]);
  });
});
