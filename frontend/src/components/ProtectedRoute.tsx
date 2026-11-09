import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-slate-500">Se încarcă...</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}