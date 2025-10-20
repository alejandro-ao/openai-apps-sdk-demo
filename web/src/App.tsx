import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="app-container">
      <div className="hello-card">
        <div className="header">
          <h1 className="title">Hello World</h1>
          <p className="subtitle">A simple React counter tutorial</p>
        </div>
        
        <div className="content">
          <div className="counter-display">
            <span className="counter-label">Current count:</span>
            <span className="counter-value">{count}</span>
          </div>
          
          <button 
            className="counter-button"
            onClick={() => setCount(count + 1)}
          >
            Increment Counter
          </button>
          
          <button 
            className="reset-button"
            onClick={() => setCount(0)}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
