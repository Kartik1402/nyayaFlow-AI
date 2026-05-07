import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import CasesPage from './pages/CasesPage'
import ReviewerDashboard from './pages/ReviewerDashboard'
import VerifiedCasesPage from './pages/VerifiedCasesPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/verified" element={<VerifiedCasesPage />} />
        <Route path="/cases" element={<CasesPage />} />
        <Route path="/cases/:id" element={<ReviewerDashboard />} />
        <Route path="/" element={<Navigate to="/verified" replace />} />
        <Route path="*" element={<Navigate to="/verified" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
