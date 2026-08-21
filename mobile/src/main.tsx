import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../app/globals.css";
import "./mobile.css";
import App from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { initializeMobileRuntime } from "./lib/runtime";
import { MobileNavigationProvider } from "./navigation/MobileNavigationProvider";

initializeMobileRuntime();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <MobileNavigationProvider>
        <App />
      </MobileNavigationProvider>
    </AuthProvider>
  </StrictMode>,
);
