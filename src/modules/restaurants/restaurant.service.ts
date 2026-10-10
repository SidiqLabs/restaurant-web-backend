import { findUserById } from "../auth/auth.repository.js";
import * as repository from "./restaurant.repository.js";
import type { MenuInput, Pagination, RestaurantInput } from "./restaurant.schema.js";

export class CatalogError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
async function writer(userId: unknown) {
  if (typeof userId !== "string") throw new CatalogError(401, "Authentication required");
  const user = await findUserById(userId);
  if (!user) throw new CatalogError(401, "Authentication required");
  if (user.role !== "ADMIN" && user.role !== "RESTAURANT_OWNER") throw new CatalogError(403, "Permission denied");
  return user;
}
export async function getRestaurant(id: number) {
  const restaurant = await repository.findRestaurant(id);
  if (!restaurant) throw new CatalogError(404, "Restaurant not found");
  return restaurant;
}
async function authorize(userId: unknown, id: number) {
  const user = await writer(userId);
  const restaurant = await getRestaurant(id);
  if (user.role !== "ADMIN" && restaurant.ownerId !== user.id) throw new CatalogError(403, "Permission denied");
  return restaurant;
}
export const listRestaurants = repository.listRestaurants;
export async function createRestaurant(userId: unknown, input: RestaurantInput) {
  const user = await writer(userId);
  return repository.insertRestaurant(user.id, input);
}
export async function editRestaurant(userId: unknown, id: number, input: { [K in keyof RestaurantInput]?: RestaurantInput[K] | undefined }) {
  await authorize(userId, id);
  return repository.updateRestaurant(id, input);
}
export async function listMenus(id: number, pagination: Pagination) {
  await getRestaurant(id);
  return repository.listMenus(id, pagination);
}
export async function getMenu(restaurantId: number, id: number) {
  await getRestaurant(restaurantId);
  const menu = await repository.findMenu(restaurantId, id);
  if (!menu) throw new CatalogError(404, "Menu not found");
  return menu;
}
export async function createMenu(userId: unknown, id: number, input: MenuInput) {
  await authorize(userId, id);
  return repository.insertMenu(id, input);
}
export async function editMenu(userId: unknown, restaurantId: number, id: number, input: { [K in keyof MenuInput]?: MenuInput[K] | undefined }) {
  await authorize(userId, restaurantId);
  await getMenu(restaurantId, id);
  return repository.updateMenu(restaurantId, id, input);
}

export const searchRestaurants = repository.searchRestaurants;

export async function recommendedRestaurants() {
  return {
    recommendations: await repository.recommendedRestaurants(),
    message: "Catalog suggestions ordered by restaurant ID; not personalized",
  };
}
