import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Persons from "./pages/Persons";
import Birth from "./pages/Birth";
import Death from "./pages/Death";
function ProtectedRoute({ children }) {
  const token = localStorage.getItem("token");

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />

        <Route path="/login" element={<Login />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/persons"
          element={
            <ProtectedRoute>
              <Persons />
            </ProtectedRoute>
          }
        />
        <Route
          path="/births"
          element={
            <ProtectedRoute>
              <Birth />
            </ProtectedRoute>
          }
        />

        <Route
          path="/deaths"
          element={
            <ProtectedRoute>
              <Death />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
