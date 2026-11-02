// The FastHTML server. Served by it (port 5001) these calls are same-origin;
// from the dev server on :3000 they cross origins, which the server allows.
export const base = location.port === "5001" ? "" : "http://127.0.0.1:5001";

async function check(r) {
  if (!r.ok) throw Error(`The server reported an error (${r.status}).`);
  return r.json();
}

export const get = (path) => fetch(base + path).then(check);
export const post = (path, values = {}) => fetch(base + path, {method: "POST", body: new URLSearchParams(values)}).then(check);
