import { Navigate, Route, Routes } from "react-router-dom";
import App from "./App";
import ExtractPage from "./pages/ExtractPage";

function AppRouter() {
  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<Navigate to="/parse" replace />} />
        <Route path="/parse" element={<App />} />
        <Route path="/extract" element={<ExtractPage />} />
      </Routes>
    </div>
  );
}

export default AppRouter;
