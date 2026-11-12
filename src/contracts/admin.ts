import { z } from "zod";
import { ADMIN_ROLES } from "./enums";
import { emailSchema } from "./primitives";

export const adminRoleSchema = z.enum(ADMIN_ROLES);

export const adminLoginSchema = z.object({
  email: emailSchema.transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(1024),
});
