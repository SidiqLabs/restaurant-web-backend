import { rankedRestaurants } from "./best-seller.repository.js";
import type { Pagination } from "../restaurants/restaurant.schema.js";
export async function bestSellerRestaurants(pagination: Pagination) {
  return rankedRestaurants(pagination);
}
