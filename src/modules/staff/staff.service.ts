import { withStaffScope } from "./staff.repository.js";
import type { AssignmentInput } from "./staff.schema.js";

export class StaffError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
function identity(actorId: unknown): asserts actorId is string {
  if (typeof actorId !== "string") throw new StaffError(401, "Authentication required");
}
function manager(actor: { role: string } | undefined) {
  if (!actor) throw new StaffError(401, "Authentication required");
  if (actor.role !== "ADMIN" && actor.role !== "RESTAURANT_OWNER") throw new StaffError(403, "Permission denied");
}
function owned(actor: { role: string }, restaurant: { ownerId: string } | undefined, actorId: string) {
  if (!restaurant || (actor.role !== "ADMIN" && restaurant.ownerId !== actorId)) throw new StaffError(404, "Resource not found");
}
export async function setMembership(actorId: unknown, restaurantId: number, staffId: string, status: "active" | "revoked") {
  identity(actorId);
  return withStaffScope(actorId, staffId, { restaurantId }, false, async c => {
    manager(c.actor); owned(c.actor!, c.restaurant, actorId);
    // Revocation remains possible after a staff role changes.
    if (!c.staff || (status === "active" && c.staff.role !== "RESTAURANT_STAFF")) throw new StaffError(409, "Staff is not eligible");
    if (status === "revoked" && !c.membership) throw new StaffError(404, "Membership not found");
    return { membership: c.membership?.status === status ? c.membership : await c.saveMembership(status) };
  });
}
export async function assignStaff(actorId: unknown, orderId: string, input: AssignmentInput) {
  identity(actorId);
  return withStaffScope(actorId, input.staffId, { orderId }, false, async c => {
    manager(c.actor); owned(c.actor!, c.restaurant, actorId);
    if (!c.order) throw new StaffError(404, "Order not found");
    if (c.staff?.role !== "RESTAURANT_STAFF" || c.membership?.status !== "active") throw new StaffError(409, "Staff is not eligible");
    // Exact retries recheck live eligibility but do not change timestamps.
    if (c.assignment?.staffId === input.staffId) return { assignment: c.assignment, repeated: true };
    if ((c.assignment?.staffId ?? null) !== input.expectedStaffId) throw new StaffError(409, "Assignment has changed");
    return { assignment: await c.saveAssignment(), repeated: false };
  });
}
export async function getAssignment(actorId: unknown, orderId: string) {
  identity(actorId);
  return withStaffScope(actorId, undefined, { orderId }, true, c => {
    if (!c.actor) throw new StaffError(401, "Authentication required");
    if (c.actor.role === "ADMIN" || c.actor.role === "RESTAURANT_OWNER") owned(c.actor, c.restaurant, actorId);
    else if (c.actor.role !== "RESTAURANT_STAFF") throw new StaffError(403, "Permission denied");
    else if (!c.restaurant || c.membership?.status !== "active" || c.assignment?.staffId !== actorId) throw new StaffError(404, "Order not found");
    if (!c.order) throw new StaffError(404, "Order not found");
    return { assignment: c.assignment ?? null };
  });
}
