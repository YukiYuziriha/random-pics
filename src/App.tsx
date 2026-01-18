import React from 'react'

function MyButton() {
  return (
    <button onClick={() => console.log('clicked')}>
      Click me
    </button>
  )
}

export default function App() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
    }}>
      <MyButton />
    </div>
  )
}
