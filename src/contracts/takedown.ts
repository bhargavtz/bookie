import { z } from "zod";
import { emailSchema, externalUrlSchema, optionalText, text } from "./primitives";

/** Public takedown / rights-complaint form. `website` is a honeypot and must be empty. */
export const takedownRequestSchema = z.object({
  bookUrl: externalUrlSchema.optional(),
  bookSlug: optionalText(96),
  claimantName: text(200),
  claimantEmail: emailSchema,
  organisation: optionalText(200),
  relationship: text(200),
  description: text(5000, 20),
  goodFaithConfirmed: z.literal(true, { error: "You must confirm the statement is made in good faith" }),
  signature: text(200),
  website: z.literal("").optional(),
});
export type TakedownRequestInput = z.output<typeof takedownRequestSchema>;
