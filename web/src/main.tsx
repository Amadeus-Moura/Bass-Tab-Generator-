import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const root = createRoot(document.getElementById('root')!)
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Remove o splash screen com fade após o React montar
const splash = document.getElementById('splash')
if (splash) {
  splash.classList.add('hidden')
  splash.addEventListener('transitionend', () => splash.remove(), { once: true })
}
