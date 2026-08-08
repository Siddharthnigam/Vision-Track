const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";
const TOKEN_KEY = "visiontrack.token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

async function request(path, { method = "GET", body, params } = {}) {
  const apiPath = path === "/health" || path.startsWith("/api") ? path : `/api${path}`;
  const url = new URL(`${API_BASE}${apiPath}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
    });
  }
  const headers = { "Content-Type": "application/json" };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    tokenStore.clear();
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    throw new Error("Session expired. Please log in again.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || `Request failed (HTTP ${res.status})`);
  }
  return data;
}

export const api = {
  base: API_BASE,
  tokenStore,

  health: () => request("/health"),

  login: (email, password) =>
    request("/auth/login", { method: "POST", body: { email, password } }),
  me: () => request("/auth/me"),

  departments: () => request("/departments"),
  users: () => request("/users"),
  teamUsers: () => request("/team"),
  createUser: (body) => request("/users", { method: "POST", body }),
  updateUser: (id, body) => request(`/users/${id}`, { method: "PATCH", body }),

  tasks: (params) => request("/tasks", { params }),
  createTask: (body) => request("/tasks", { method: "POST", body }),
  updateTask: (id, body) => request(`/tasks/${id}`, { method: "PATCH", body }),
  completeTask: (id, autoCommit = true) =>
    request(`/tasks/${id}/complete`, {
      method: "POST",
      params: { auto_commit: autoCommit },
    }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: "DELETE" }),

  projects: (params) => request("/projects", { params }),
  createProject: (body) => request("/projects", { method: "POST", body }),
  aiSuggestForProject: (id) => request(`/projects/${id}/ai/suggest`),

  leads: (params) => request("/leads", { params }),
  createLead: (body) => request("/leads", { method: "POST", body }),
  updateLead: (id, body) => request(`/leads/${id}`, { method: "PATCH", body }),
  signLead: (id) => request(`/leads/${id}/sign`, { method: "POST" }),

  marketingSummary: () => request("/marketing/summary"),
  posts: () => request("/posts"),
  createPost: (body) => request("/posts", { method: "POST", body }),
  updatePost: (id, body) => request(`/posts/${id}`, { method: "PATCH", body }),

  financeSummary: () => request("/finance/summary"),
  vaultDocs: () => request("/vault/docs"),
  createDoc: (body) => request("/vault/docs", { method: "POST", body }),

  chat: (departmentId) => request("/chat", { params: { department_id: departmentId } }),
  sendChat: (body) => request("/chat", { method: "POST", body }),
};

export function wsUrl(departmentId) {
  const base = API_BASE.replace(/^http/, "ws");
  const token = tokenStore.get();
  return `${base}/ws/chat?token=${encodeURIComponent(token || "")}&dept_id=${departmentId}`;
}