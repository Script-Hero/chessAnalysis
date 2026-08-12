import { Navigate, Route, Routes } from 'react-router-dom'
import AnalysisLayout from './pages/AnalysisLayout'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/analysis" replace />} />
      <Route path="/analysis" element={<AnalysisLayout />} />
    </Routes>
  )
}

export default App
