"use client";

import { createContext, useContext } from "react";

// Reuse the shell's existing verified session data without another auth request.
export const AccountEmailContext = createContext("");
export const useAccountEmail = () => useContext(AccountEmailContext);
