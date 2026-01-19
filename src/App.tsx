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
      <div style={{
        width: '500px',
        height: '80vh',
        border: '5px solid #ccc',
        borderRadius: '15px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <MyButton />
      </div>
    </div>
  )
}
