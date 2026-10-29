import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { ContratosPage } from './pages/ContratosPage';
import { ContratoFichaPage } from './pages/ContratoFichaPage';
import { ClientesPage } from './pages/ClientesPage';
import { ClienteDetallePage } from './pages/ClienteDetallePage';
import { NuevoContratoPage } from './pages/NuevoContratoPage';
import { FacturacionPage } from './pages/FacturacionPage';
import { PreLiquidadoPage } from './pages/PreLiquidadoPage';
import { ProductosPage } from './pages/ProductosPage';
import { ProductoDetallePage } from './pages/ProductoDetallePage';
import { ParametrosPage } from './pages/ParametrosPage';
import { AuditoriaPage } from './pages/AuditoriaPage';
import { UsuariosPage } from './pages/UsuariosPage';
import { ReconciliacionPage } from './pages/ReconciliacionPage';
import { AlertasPage } from './pages/AlertasPage';
import { EmpalmePage } from './pages/EmpalmePage';
import { ExpressPage } from './pages/ExpressPage';
import { CambiarClavePage } from './pages/CambiarClavePage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/cambiar-clave"
        element={
          <ProtectedRoute>
            <CambiarClavePage />
          </ProtectedRoute>
        }
      />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/contratos" replace />} />
        <Route path="/contratos" element={<ContratosPage />} />
        <Route path="/clientes" element={<ClientesPage />} />
        <Route path="/clientes/:id" element={<ClienteDetallePage />} />
        <Route path="/alertas" element={<AlertasPage />} />
        <Route path="/contratos/nuevo" element={<NuevoContratoPage />} />
        <Route path="/contratos/:id" element={<ContratoFichaPage />} />
        <Route path="/facturacion" element={<FacturacionPage />} />
        <Route path="/empalme" element={<EmpalmePage />} />
        <Route path="/express" element={<ExpressPage />} />
        <Route path="/pre-liquidado" element={<PreLiquidadoPage />} />
        <Route path="/productos" element={<ProductosPage />} />
        <Route path="/productos/:id" element={<ProductoDetallePage />} />
        <Route path="/parametros" element={<ParametrosPage />} />
        <Route path="/auditoria" element={<AuditoriaPage />} />
        <Route path="/usuarios" element={<UsuariosPage />} />
        <Route path="/reconciliacion" element={<ReconciliacionPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/contratos" replace />} />
    </Routes>
  );
}
