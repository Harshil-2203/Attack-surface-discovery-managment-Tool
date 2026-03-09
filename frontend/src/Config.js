// src/config.js
// Central API URL config — change this one place to point at any backend.
// Override at build time:  VITE_API_URL=http://192.168.1.10:8000 npm run build
const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
export default API;