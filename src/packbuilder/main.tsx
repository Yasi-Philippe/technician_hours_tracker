import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import PackBuilder from './PackBuilder'
import '../styles.css'
import './packbuilder.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PackBuilder />
  </StrictMode>,
)
