import axios from "axios";

export const http = axios.create({
  baseURL: typeof window === "undefined" ? "" : "",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});
