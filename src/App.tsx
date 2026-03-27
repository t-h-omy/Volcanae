import { useEffect } from 'react'
import { useGameStore } from './gameStore'
import GridRenderer from './components/GridRenderer'
import './App.css'

function App() {
  const initGame = useGameStore((s) => s.initGame)
  const phase = useGameStore((s) => s.phase)

  useEffect(() => {
    initGame()
  }, [initGame])

  return (
    <div className="app-container">
      {phase ? <GridRenderer /> : <span className="loading-text">Volcanae - Loading...</span>}
    </div>
  )
}

export default App
