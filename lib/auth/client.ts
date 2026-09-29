"use client";
import { createAuthClient } from "better-auth/react";

// No explicit baseURL: the client talks to the origin that served the page, so it works
// behind any host/port (dev servers, previews, reverse proxies) without extra configuration.
export const authClient = createAuthClient();

export const { signIn, signOut, useSession } = authClient;
