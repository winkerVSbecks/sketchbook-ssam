/**
 * The one Choice question: which sketch rendered this output? Asked over a shortlist of
 * candidates, batched when the list is long.
 */
import {
  choice,
  image,
  type ChoiceResponse,
  type SystemOneRequest,
  type TypeSafeClient,
} from '@typesafe-ai/sdk';
import type { JevAnswer } from '../../archive-app/src/review/attribution.ts';
import type { Candidate } from './shortlist.ts';

export const MODEL = 'jev-1.14.0';
export const IMAGE_HEADER = { 'TypeSafe-Danger-Zone-Images': 'true' };
export const BATCH_SIZE = 12;

export type AskFn = (req: SystemOneRequest) => Promise<{
  answers: Record<string, ChoiceResponse>;
  usage: { input_tokens: number | null };
}>;

export type SketchOption = { key: string; candidate: Candidate; reference: Buffer | null };

const INSTRUCTIONS =
  'Which sketch rendered the image in `output`? Each option is a sketch file with a recent render of it. Earlier exports of the same sketch can differ in colour, density or parameters but share its structure and drawing method.';
const NONE = 'None of these sketches made this image.';

export function makeAsk(client: TypeSafeClient): AskFn {
  return async (req) => {
    const res = await client.systemOne({ ...req, model: MODEL }, { headers: IMAGE_HEADER });
    return { answers: res.answers, usage: res.usage };
  };
}

export function buildRequest(
  output: Buffer,
  exportedAt: string,
  options: SketchOption[],
): SystemOneRequest {
  const criteria: Record<
    string,
    { path: string; render: ReturnType<typeof image> | string } | string
  > = {};
  for (const o of options) {
    criteria[o.key] = {
      path: o.candidate.path,
      render: o.reference ? image(o.reference) : 'no picture available',
    };
  }
  criteria.none = NONE;
  return {
    state: { output: image(output), exported_at: exportedAt },
    questions: { sketch: choice(INSTRUCTIONS, criteria) },
  };
}

type Round = { answer: JevAnswer; inputTokens: number };

/** One request over `options`, with `cNN` keys renumbered from zero and mapped back to ids. */
async function askOnce(
  ask: AskFn,
  output: Buffer,
  exportedAt: string,
  options: Omit<SketchOption, 'key'>[],
): Promise<Round> {
  const keyed = options.map((o, i) => ({ ...o, key: `c${String(i).padStart(2, '0')}` }));
  const res = await ask(buildRequest(output, exportedAt, keyed));
  const r = res.answers.sketch;
  if (!r) throw new Error('response has no `sketch` answer');
  const idOf = new Map(keyed.map((o) => [o.key, o.candidate.id]));
  const probabilities: Record<string, number> = {};
  for (const [k, p] of Object.entries(r.probabilities)) probabilities[idOf.get(k) ?? k] = p;
  return {
    answer: {
      choice: r.choice === 'none' ? null : (idOf.get(r.choice) ?? null),
      confidence: r.confidence,
      probabilities,
    },
    inputTokens: res.usage.input_tokens ?? 0,
  };
}

export async function askSketch(
  ask: AskFn,
  output: Buffer,
  exportedAt: string,
  options: SketchOption[],
): Promise<Round> {
  if (options.length <= BATCH_SIZE) return askOnce(ask, output, exportedAt, options);

  let inputTokens = 0;
  const winners: SketchOption[] = [];
  for (let i = 0; i < options.length; i += BATCH_SIZE) {
    const batch = options.slice(i, i + BATCH_SIZE);
    const round = await askOnce(ask, output, exportedAt, batch);
    inputTokens += round.inputTokens;
    const won = batch.find((o) => o.candidate.id === round.answer.choice);
    if (won) winners.push(won);
  }
  if (winners.length === 0) {
    return { answer: { choice: null, confidence: 0, probabilities: { none: 1 } }, inputTokens };
  }
  const final = await askOnce(ask, output, exportedAt, winners);
  return { answer: final.answer, inputTokens: inputTokens + final.inputTokens };
}
