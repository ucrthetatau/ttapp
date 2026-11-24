import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "./index.css";
import { AuthProvider } from "./auth/AuthProvider.tsx";
import App from "./App.tsx";
import IntroScreen from "./components/IntroScreen.tsx";
import { watchForNewVersion } from "./updates.ts";

watchForNewVersion();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <IntroScreen />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
