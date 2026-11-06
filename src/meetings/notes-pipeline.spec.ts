import {
  CAPTURE_LEASE_MS,
  buildTranscript,
  decideCapture,
  nameSpeakers,
  parseDeepgram,
  readSummary,
  transcriptText,
} from './notes-pipeline';

const now = new Date('2026-11-06T10:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);
const base = { capturerId: 'a', leaseAt: ago(1000), currentSegment: 2, me: 'a', mySegment: 2, now };

describe('decideCapture', () => {
  it('keeps capturing with the current segment', () => {
    expect(decideCapture(base)).toBe('keep');
  });

  it('keeps it even after a slow heartbeat, if nobody took over', () => {
    expect(decideCapture({ ...base, leaseAt: ago(CAPTURE_LEASE_MS * 2) })).toBe('keep');
  });

  it('takes over when nobody is capturing', () => {
    expect(decideCapture({ ...base, capturerId: null, leaseAt: null, currentSegment: null, mySegment: null })).toBe('take');
  });

  it('waits while someone else holds a live lease', () => {
    expect(decideCapture({ ...base, capturerId: 'b', mySegment: null })).toBe('wait');
  });

  it('takes over from someone whose lease lapsed', () => {
    expect(decideCapture({ ...base, capturerId: 'b', leaseAt: ago(CAPTURE_LEASE_MS + 1), mySegment: null })).toBe('take');
  });

  it("doesn't let a second tab of the same person fight the first", () => {
    expect(decideCapture({ ...base, mySegment: null })).toBe('wait');
  });

  it('tells an old tab to stop once a newer segment took over', () => {
    expect(decideCapture({ ...base, mySegment: 1 })).toBe('wait');
  });
});

describe('nameSpeakers', () => {
  const span = (name: string, startMs: number, endMs: number) => ({ segment: 0, name, startMs, endMs });

  it('uses who the call says was speaking', () => {
    const [line] = nameSpeakers([{ start: 1, end: 3, speaker: 0, text: 'Hi' }], [span('Julia', 1000, 3000)]);
    expect(line.name).toBe('Julia');
  });

  it('trusts the call over the voice when one voice was two people', () => {
    const lines = nameSpeakers(
      [
        { start: 0, end: 2, speaker: 0, text: 'One' },
        { start: 2, end: 4, speaker: 0, text: 'Two' },
      ],
      [span('Julia', 0, 2000), span('Elliot', 2000, 4000)],
    );
    expect(lines.map((l) => l.name)).toEqual(['Julia', 'Elliot']);
  });

  it("gives a line with no clear speaker its voice's most common name", () => {
    const lines = nameSpeakers(
      [
        { start: 0, end: 2, speaker: 1, text: 'One' },
        { start: 10, end: 12, speaker: 1, text: 'Two' },
      ],
      [span('Nico', 0, 2000)],
    );
    expect(lines[1].name).toBe('Nico');
  });

  it('falls back to a numbered speaker, counting from 1', () => {
    const [line] = nameSpeakers([{ start: 0, end: 1, speaker: 1, text: 'Hi' }], []);
    expect(line.name).toBe('Speaker 2');
  });
});

describe('buildTranscript', () => {
  it('puts a later segment after the first, on one timeline', () => {
    const lines = buildTranscript(
      [
        { segment: { n: 0, ownerId: 'a', contentType: 'audio/webm', startedAt: '2026-11-06T10:00:00Z' }, utterances: [{ start: 1, end: 2, speaker: 0, text: 'First' }] },
        { segment: { n: 1, ownerId: 'b', contentType: 'audio/webm', startedAt: '2026-11-06T10:01:00Z' }, utterances: [{ start: 1, end: 2, speaker: 0, text: 'Second' }] },
      ],
      [{ segment: 1, name: 'Elliot', startMs: 1000, endMs: 2000 }],
    );
    expect(lines.map((l) => [l.start, l.speaker, l.text])).toEqual([
      [1, 'Speaker 1', 'First'],
      [61, 'Elliot', 'Second'],
    ]);
  });

  it('drops audio a dropped browser kept recording after someone else took over', () => {
    const lines = buildTranscript(
      [
        {
          segment: { n: 0, ownerId: 'a', contentType: 'audio/webm', startedAt: '2026-11-06T10:00:00Z' },
          utterances: [
            { start: 50, end: 55, speaker: 0, text: 'Kept' },
            { start: 65, end: 70, speaker: 0, text: 'Overlap' },
          ],
        },
        { segment: { n: 1, ownerId: 'b', contentType: 'audio/webm', startedAt: '2026-11-06T10:01:00Z' }, utterances: [{ start: 5, end: 10, speaker: 0, text: 'Second' }] },
      ],
      [],
    );
    expect(lines.map((l) => [l.start, l.text])).toEqual([
      [50, 'Kept'],
      [65, 'Second'],
    ]);
  });

  it('leaves out lines with no words', () => {
    const lines = buildTranscript(
      [{ segment: { n: 0, ownerId: 'a', contentType: 'audio/webm', startedAt: '2026-11-06T10:00:00Z' }, utterances: [{ start: 0, end: 1, speaker: 0, text: '  ' }] }],
      [],
    );
    expect(lines).toEqual([]);
  });
});

describe('parseDeepgram', () => {
  it('reads utterances and the language', () => {
    const parsed = parseDeepgram({
      results: { channels: [{ detected_language: 'de' }], utterances: [{ start: 1.5, end: 2, speaker: 3, transcript: 'Hallo' }] },
    });
    expect(parsed).toEqual({ language: 'de', utterances: [{ start: 1.5, end: 2, speaker: 3, text: 'Hallo' }] });
  });

  it('copes with an answer that has no speech', () => {
    expect(parseDeepgram({ results: { channels: [{}] } })).toEqual({ language: null, utterances: [] });
  });
});

describe('transcriptText', () => {
  it('writes a clock time and speaker on each line', () => {
    expect(transcriptText([{ start: 3725, end: 3730, speaker: 'Julia', text: 'Done.' }])).toBe('[01:02:05] Julia: Done.');
  });
});

describe('readSummary', () => {
  const good = { overview: 'x', topics: [], actionItems: [] };
  const message = (text: string, stop_reason = 'end_turn') => ({ stop_reason, content: [{ type: 'text', text }] });

  it('reads a complete answer', () => {
    expect(readSummary(message(JSON.stringify(good)))).toEqual(good);
  });

  it.each(['refusal', 'max_tokens'])('rejects an answer that stopped with %s', (reason) => {
    expect(() => readSummary(message(JSON.stringify(good), reason))).toThrow('stopped early');
  });

  it('rejects the wrong shape', () => {
    expect(() => readSummary(message('{"overview":1}'))).toThrow('wrong shape');
  });
});
