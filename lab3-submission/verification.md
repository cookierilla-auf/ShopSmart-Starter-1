# Laboratory 3 verification

Verified on October 15, 2026 (Asia/Manila), using the existing PostgreSQL catalog, Node.js 24.21.0, and npm 11.19.0.

## Automated checks

The final `npm run check` output is saved in `check-output.txt`: frontend and backend lint, 14 frontend tests, 14 backend tests, and the Vite production build pass. Backend route tests replace Prisma's query method and do not write to the database; frontend tests use controlled promises to check responses arriving out of order.

The DOM test environment is a root development dependency so the workspace's shared Vitest installation can resolve it. jsdom 26 supports the project's declared Node.js baseline; execution was verified on the installed Node.js 24 runtime.

## Live API checks

| Request | Observed result |
| --- | --- |
| `/api/health` | HTTP 200, `status: ok` |
| `/api/products?search=keyboard` | HTTP 200, Compact Mechanical Keyboard |
| `/api/products?search=privacy` | HTTP 200, 1080p Webcam with privacy in its description |
| `/api/products?search=notfoundword` | HTTP 200, empty products array |
| `/api/products` | HTTP 200, all six active products in ascending ID order |
| `/api/products?search=%20PrIvAcY%20` | HTTP 200, 1080p Webcam |
| `/api/products?search=%20%20` | HTTP 200, all six active products |

Full responses are saved in `api-verification.json`. No schema changes, seeding, product updates, or order writes were performed. Active-only filtering is asserted in the route tests; the existing live catalog contains no inactive sample product.

## Live browser checks

| Action | Observed result |
| --- | --- |
| Search keyboard | Only the keyboard appears |
| Search privacy | Only the webcam appears; all category choices remain |
| Select Study and search lamp | Study Lamp appears |
| Keep Study and search webcam | No-matches message; Study remains selected, with All, Accessories, Study, Video, and Audio available |
| Clear search, keep Study, choose descending price | Laptop Stand (PHP 1,200) precedes Study Lamp (PHP 900) |
| Choose All and ascending price | Mouse, lamp, stand, headset, webcam, keyboard |
| Enter privacy then clear immediately | All six product cards return |
| Stop both services, run only `npm run dev --workspace frontend`, then search | Backend-off error appears and no stale product cards are shown |
| Stop frontend-only process and restart `npm run dev`, then search and clear | Webcam search and full catalog recover; six cards, all categories, and no error alerts |

The browser client did not expose its Network panel. Actual browser search GETs were verified in the Express access log, including keyboard, privacy, lamp, webcam, and the unfiltered request; the component tests additionally verify the request helper receives the trimmed term. Browser caching sometimes revalidated unchanged responses with HTTP 304.

Direct top-level navigation to the JSON API URL was blocked by the browser client (`ERR_BLOCKED_BY_CLIENT`). The API screenshot therefore uses a clearly labelled saved-response viewer containing the actual HTTP 200 privacy response; the original JSON and viewer HTML are included for inspection. The other screenshots show the live application.

The development services were restarted after the outage check and left running at http://localhost:5173 and http://localhost:3000.
