import { createRoot } from 'react-dom/client'
import { Box } from 'lucide-react'
import './styles.css'

const migration = location.pathname.endsWith('/migration.html')
createRoot(document.getElementById('root')!).render(
  <main
    className="auxiliary"
    data-testid={migration ? 'react-migration-window' : 'react-logger-window'}
  >
    <Box size={28} aria-hidden="true" />
    <h1>{migration ? 'Migración de datos' : 'Consola'}</h1>
    <p>Vista previa de Launcher MC</p>
    <p>
      {migration
        ? 'Este entorno de prueba no mueve ni modifica tus datos.'
        : 'Los registros del juego estarán disponibles al completar la integración.'}
    </p>
  </main>,
)
