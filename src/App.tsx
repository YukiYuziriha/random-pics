import React from 'react'

function MyButton() {
  return (
    <button onClick={() => console.log('clicked')}>
      Click me
    </button>
  )
}

export default function App() {
  return <MyButton />
}
