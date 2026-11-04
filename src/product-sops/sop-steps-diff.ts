import { SopStepLink } from './entities/product-sop-step.entity';

export interface IncomingStep {
  id?: string | null;
  text: string;
  links?: SopStepLink[] | null;
}

export interface PlannedStep {
  position: number;
  text: string;
  links: SopStepLink[];
}

export interface StepReplacePlan {
  /** Existing steps that stay (same id, progress kept), with their new position/text/links. */
  update: (PlannedStep & { id: string })[];
  /** New steps to insert. */
  create: PlannedStep[];
  /** Existing step ids no longer in the list (their progress goes with them). */
  delete: string[];
}

/**
 * Works out how to turn the stored steps into the incoming list. Positions are
 * 1-based in list order. An incoming id that is unknown, or repeated, becomes a new step.
 */
export function planStepReplace(
  existingIds: string[],
  incoming: IncomingStep[],
): StepReplacePlan {
  const known = new Set(existingIds);
  const kept = new Set<string>();
  const plan: StepReplacePlan = { update: [], create: [], delete: [] };

  incoming.forEach((step, index) => {
    const planned: PlannedStep = {
      position: index + 1,
      text: step.text.trim(),
      links: step.links ?? [],
    };
    if (step.id && known.has(step.id) && !kept.has(step.id)) {
      kept.add(step.id);
      plan.update.push({ id: step.id, ...planned });
    } else {
      plan.create.push(planned);
    }
  });

  plan.delete = existingIds.filter((id) => !kept.has(id));
  return plan;
}
