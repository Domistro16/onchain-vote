import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import "./App.css";

const Root = lazy(() => import("./Root"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#090d0a] px-6 py-8 font-sans text-[#f4efe3]">
          <div className="mx-auto max-w-7xl text-sm font-bold text-[#aeb6a3]">
            Loading governance chamber...
          </div>
        </main>
      }
    >
      <Root />
    </Suspense>
  </React.StrictMode>
);
