import React from "react";
import ReactDOM from "react-dom/client";
import { MotionConfig } from "motion/react";
import AppRoutes from "./routes/AppRoutes";
import { ThemeProvider } from "./context/ThemeContext";

ReactDOM.createRoot(
  document.getElementById("root")!
).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <AppRoutes />
      </ThemeProvider>
    </MotionConfig>
  </React.StrictMode>
);