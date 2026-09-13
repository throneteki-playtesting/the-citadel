// Enforced both by the editor's input (rejects/truncates past the limit) and by Joi
export const PIVOT_POINT_MAX_LENGTH = 60;

// A flagged starting guess, not confirmed by data - feeds the `pivotPointBalance` checklist rule
// (see checklistRules.ts); fewer than this many recorded is a flag.
export const PIVOT_POINT_HEALTHY_MIN = 2;
