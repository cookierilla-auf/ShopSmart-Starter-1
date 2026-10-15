# Laboratory 3 explanation

`ProductsPage.jsx` manages the search input, requests catalog results in an effect, and renders the products with the selected category and sort order.
`services/api.js` encodes the search term in a GET request to `/api/products` and converts the HTTP response into data or an error for the page.
`backend/src/routes/products.js` receives and trims the term, asks Prisma to query PostgreSQL, and sends JSON back to React without exposing a database connection to the browser.
The server requires `active: true` and uses an `OR` condition for case-insensitive matches in the name or description, while retaining ascending ID order and numeric prices.
Each search effect has a cleanup flag that prevents older successes, failures, and loading updates from replacing the latest request, and the page clearly shows loading, no matches, or a server error.
Category choices remain available through a separate full-catalog snapshot, while category filtering and sorting operate on the current server results and keep the shopper's selections when search changes.
