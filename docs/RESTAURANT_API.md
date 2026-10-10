# Restaurant and Menu API — Session 5B

Implemented endpoints use numeric positive 32-bit IDs and the existing
`{ success, message, data }` envelope. Interactive documentation is at
`/api-docs`; the machine-readable contract is at `/api-docs.json`.

| Method | Path | Access |
|---|---|---|
| GET | `/api/resto` | Public paginated restaurants |
| POST | `/api/resto` | Owner/admin; ownership derives from caller |
| GET | `/api/resto/:restaurantId` | Public restaurant |
| PATCH | `/api/resto/:restaurantId` | Owning restaurant owner or admin |
| GET | `/api/resto/:restaurantId/menu` | Public paginated menus |
| POST | `/api/resto/:restaurantId/menu` | Owning restaurant owner or admin |
| GET | `/api/resto/:restaurantId/menu/:menuId` | Public menu |
| PATCH | `/api/resto/:restaurantId/menu/:menuId` | Owning restaurant owner or admin |

Restaurant creation requires `name` and `address`; `description` defaults to
an empty string. Menu creation requires `name` and `price`; `description`
defaults to an empty string and `available` to true. Names are trimmed and
limited to 100 characters, addresses to 500, and descriptions to 2000.
Prices are integer rupiah from 0 through 2147483647. PATCH accepts a nonempty
subset of these fields. Unknown fields, including owner and parent IDs, are
rejected. Ownership and menu parentage cannot be transferred by this API.

Lists accept only `page` (default 1, maximum 10000) and `limit` (default 20,
maximum 100), ordered by ascending ID. Data is an array; no total count is
provided. Menu lists include unavailable items with their availability flag.
Creation returns 201; other successful operations return 200. Errors use
`{ success: false, message }`: 400 invalid input, 401 missing/invalid/deleted
identity, 403 insufficient role or wrong owner, 404 missing restaurant or
menu. A menu must belong to the restaurant named in the URL.

Roles are read from the database on each write; tokens do not supply
permissions. Customer and staff accounts cannot write. Admin-created
restaurants belong to that admin; admins may manage all restaurants.
Registration continues to create customers; this session adds no role-grant
endpoint. POST is not idempotent. PATCH changes supplied fields and timestamps.

This session provides no deletion endpoints, recommendations, rankings,
reviews, distance calculations, image uploads, or invented rating fields.
Those features require additional authoritative data and separate work.

Migration `0001` adds tables, indexes, foreign keys with restricted deletion,
and a nonnegative-price constraint. It does not remove or alter existing user
data. Apply through the normal migration runner. Recovery should favor a
forward corrective migration; do not drop populated catalog tables.

## Restaurant search — Session 5C.1

`GET /api/resto/search` is public and registered before the dynamic ID route.
Accepts only `q`, `page`, and `limit`, each once. `q` is required, trimmed,
and must contain 1–200 characters after trimming; missing, empty or whitespace
input returns 400. Pagination uses the catalog defaults/bounds: page 1–10000
(default 1), limit 1–100 (default 20), positive decimal integers only.
Unknown, repeated, malformed and out-of-range parameters return
`{ "success": false, "message": "Invalid request" }` with HTTP 400.

Search matches literal case-insensitive substrings of persisted name OR
description using parameterized Drizzle ILIKE queries. `%`, `_`, and `\`
are escaped as literal characters, not user-controlled wildcards. Results
are ordered by ascending ID. Count and results use one repeatable-read,
read-only snapshot. No schema change or migration is required.

HTTP 200 response shape:

```json
{
  "success": true,
  "message": "Catalog request successful",
  "data": {
    "restaurants": [],
    "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 },
    "searchQuery": "trimmed query"
  }
}
```

Restaurants use the existing persisted DTO: id, ownerId, name, description,
address, createdAt, updatedAt. No matches yields total/totalPages zero;
a page beyond the last returns an empty array with the actual total retained.

Contract source: locally inspected `restaurant-web-frontend-sidiqlabs` (also
present in `restaurant-web-frontend`), `src/services/queries/restaurants.ts`,
`src/types/restaurant.ts`, and `src/app/search/SearchClient.tsx`. The request,
envelope, searchQuery and pagination/container shape match that consumer,
including its infinite-query totalPages usage. The nested wrapper is a
search-specific compatibility choice; existing catalog lists stay arrays.
Full frontend compatibility is NOT established: RestaurantListItem requires
star, place, logo, images, category and reviewCount absent from our DTO/schema.
The frontend needs to adapt cards to persisted fields (address instead of
place) and optional metadata, or wait for separately implemented domains.
This endpoint does not fabricate those fields or alter frontend files.
