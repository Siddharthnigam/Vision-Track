import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "./context/AuthContext.jsx";
import { canViewRoute } from "./consts/roles.jsx";
import Sidebar from "./components/Sidebar.jsx";
import ChatDrawer from "./components/ChatDrawer.jsx";
import Login from "./pages/Login.jsx";
import Executive from "./pages/Executive.jsx";
import SalesCRM from "./pages/SalesCRM.jsx";
import Operations from "./pages/Operations.jsx";
import Marketing from "./pages/Marketing.jsx";
import TeamAdmin from "./pages/TeamAdmin.jsx";
import TeamVault from "./pages/TeamVault.jsx";

function Shell() {
  return (
    <div className="flex">
      <Sidebar />
      <main className="min-h-screen min-w-0 flex-1 px-5 py-6 pb-28 sm:px-8">
        <Outlet />
      </main>
    </div>
  );
}

function Guard({ code, children }) {
  const { user } = useAuth();
  if (!canViewRoute(user, code)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-neon" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/*" element={<Shell />}>
          <Route index element={<Executive />} />
          <Route
            path="sales"
            element={
              <Guard code="sales">
                <SalesCRM />
              </Guard>
            }
          />
          <Route
            path="operations"
            element={
              <Guard code="operations">
                <Operations />
              </Guard>
            }
          />
          <Route
            path="marketing"
            element={
              <Guard code="marketing">
                <Marketing />
              </Guard>
            }
          />
          <Route
            path="team"
            element={
              <Guard code="team">
                <TeamAdmin />
              </Guard>
            }
          />
          <Route
            path="vault"
            element={
              <Guard code="vault">
                <TeamVault />
              </Guard>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <ChatDrawer />
    </>
  );
}
