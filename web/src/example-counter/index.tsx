import { StrictMode, useState } from 'react'
import './index.css'
import { createRoot } from 'react-dom/client'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-[400px] rounded-3xl border border-black/10 bg-white p-8 text-slate-900 shadow">
        <div className="mb-8 border-b border-black/5 pb-6 text-center">
          <h1 className="mb-2 text-[2rem] font-semibold text-slate-900">Hello World</h1>
          <p className="text-sm text-slate-500">A simple React counter tutorial</p>
        </div>
        
        <div className="flex flex-col items-center gap-6">
          <div className="flex min-w-[200px] flex-col items-center gap-2 rounded-xl bg-black/5 p-4">
            <span className="text-sm font-medium text-slate-500">Current count:</span>
            <span className="text-[2.5rem] font-bold text-blue-600">{count}</span>
          </div>
          
          <button 
            className="min-w-[160px] transform rounded-xl bg-blue-600 px-6 py-3 text-base font-medium text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-blue-700 active:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            onClick={() => setCount(count + 1)}
          >
            Increment Counter
          </button>
          
          <button 
            className="rounded-xl border border-black/10 px-4 py-2 text-sm font-medium text-slate-500 transition-all duration-200 hover:bg-black/5 hover:text-slate-900"
            onClick={() => setCount(0)}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('example-root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
