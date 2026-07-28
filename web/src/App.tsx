import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { HomePage }    from './pages/HomePage';
import { LibraryPage } from './pages/LibraryPage';
import { UploadPage }  from './pages/UploadPage';
import { PlayerPage }  from './pages/PlayerPage';
import { PlaylistPage } from './pages/PlaylistPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"              element={<HomePage />}    />
        <Route path="/library"       element={<LibraryPage />} />
        <Route path="/upload"        element={<UploadPage />}  />
        <Route path="/playlist"      element={<PlaylistPage />} />
        <Route path="/player/:songId" element={<PlayerPage />} />
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
