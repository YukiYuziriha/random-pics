import React from 'react'

function MyButton() {
  return (
    <button
      onClick={() => console.log('clicked')}
      disabled={false}
    >
      Click me
    </button>
  )
}
