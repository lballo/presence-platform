import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "./index.css";
import { TRPCProvider } from "@/providers/trpc";
import { AuthProvider } from "@/providers/auth";
import { loadConfig } from "@/lib/supabase";
import App from "./App";
import { applyTheme, readTheme } from "@/lib/theme";

// L'apparence choisie s'applique dès le chargement, sur toutes les pages
applyTheme(readTheme());
const root = createRoot(document.getElementById("root")!);

loadConfig().then((ready) => {
  root.render(
    <StrictMode>
      {ready ? (
        <BrowserRouter>
          <TRPCProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </TRPCProvider>
        </BrowserRouter>
      ) : (
        <div className="min-h-screen flex items-center justify-center px-6 text-center p-muted text-[16px]">Présence est momentanément indisponible. Réessayez dans quelques instants.</div>
      )}
    </StrictMode>
  );
});
