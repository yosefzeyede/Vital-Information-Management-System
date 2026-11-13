import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Person from "./pages/Persons";
import Birth from "./pages/Birth";
import Death from "./pages/Death";
import Marriage from "./pages/Marriage";
import Divorce from "./pages/Divorce";
import Adoption from "./pages/Adoption";
import Certificate from "./pages/Certificate";
import Location from "./pages/Locations";

function App() {
  useEffect(() => {
    console.log("App component mounted!");
    console.log("Environment variables:", import.meta.env.VITE_API_URL);
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />

        {/* Dashboard - accessible to all authenticated users */}
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/persons" element={<Person />} />
        <Route path="/births" element={<Birth />} />
        <Route path="/marriages" element={<Marriage />} />
        <Route path="/locations" element={<Location />} />
        <Route path="/certificates" element={<Certificate />} />
        <Route path="/adoptions" element={<Adoption />} />
        <Route path="/divorces" element={<Divorce />} />
        <Route path="/deaths" element={<Death />} />
        {/* Catch-all route */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
