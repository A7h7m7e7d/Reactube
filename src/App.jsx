import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './AuthContext'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Watch from './pages/Watch'
import Auth from './pages/Auth'
import Friends from './pages/Friends'

export default function App() {
  return (
    <AuthProvider>
      <div className="app-bg min-h-screen">
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/watch/:youtubeId" element={<Watch />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/auth" element={<Auth />} />
        </Routes>
      </div>
    </AuthProvider>
  )
}
