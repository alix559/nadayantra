// The shabdayantra frontend. It talks to the FastHTML server (nbs/04_main.ipynb, exported to nadayantra/main.py) through its /api routes.
//   npm run dev     http://localhost:3000, calls the server on 127.0.0.1:5001 (CORS is enabled there)
//   npm run build   writes dist/, which the server then serves at http://localhost:5001/app/
export default {
  title: "shabdayantra",
  root: "src",
  // Built for /app/ on the server; the dev server sets GNN_BASE=/ so it runs at the root.
  base: process.env.GNN_BASE ?? "/app/",
  style: "style.css",
  globalStylesheets: [], // no web fonts: the system typeface, nothing fetched
  sidebar: false,
  toc: false,
  pager: false,
  footer: "",
  search: false,
  preserveExtension: true, // names.html, so a plain static server can serve the build
  head: '<link rel="icon" href="./icon.png" type="image/png"><meta name="color-scheme" content="light dark">'
};
