import { createRoot } from 'react-dom/client'
import brandIcon from '../../branding/copper/app-64.png'
import './styles.css'

const migration = location.pathname.endsWith('/migration.html')
createRoot(document.getElementById('root')!).render(
  <main
    className="auxiliary"
    data-testid={migration ? 'react-migration-window' : 'react-logger-window'}
  >
    <img src={brandIcon} width="48" height="48" alt="" />
    <h1>{migration ? 'Migración de datos' : 'Consola'}</h1>
    <p>Vista previa de Grimo Launcher</p>
    <p>
      {migration
        ? 'Este entorno de prueba no mueve ni modifica tus datos.'
        : 'Los registros del juego estarán disponibles al completar la integración.'}
    </p>
  </main>,
)
