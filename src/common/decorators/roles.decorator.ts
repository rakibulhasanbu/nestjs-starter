import { SetMetadata } from "@nestjs/common";
import { Role } from "@/database/generated/prisma/enums.js";

export const ROLES_KEY = "roles";

/** Restricts a route to the given roles; enforced by RolesGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
