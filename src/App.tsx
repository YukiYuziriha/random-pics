import { useState } from 'react';
import { RANDOM_ENDPOINT, NEXT_ENDPOINT, PREV_ENDPOINT } from "./constants/endpoints.ts";


function RandomButton({ onLoadImage }: { onLoadImage: () => void }) {
  return (
    <button onClick={onLoadImage}>
      random
    </button>
  )
}

function NextButton({ onLoadImage }: { onLoadImage: () => void }) {
  return (
    <button onClick={onLoadImage}>
      next img
    </button>
  )
}

function PrevButton({ onLoadImage }: { onLoadImage: () => void }) {
  return (
    <button onClick={onLoadImage}>
      prev img
    </button>
  )
}

export default function App() {
  const [imageSrc, setImageSrc] = useState('')

  const handleLoadImage = async (endpoint: string) => {
    const res = await fetch(`/api/${endpoint}`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    setImageSrc(url)
  } 

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '10px',
      height: '100vh',
      background: '#0f111a',
    }}>

      <div style={{
        width: '80vw',
        height: '80vh',
        border: '5px solid #615532',
        gap: '10px',
        background: '#21294a',
        flexDirection: 'column',
        borderRadius: '15px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
      }}>
      {imageSrc && <img
        src={imageSrc}
        style={{ maxWidth: '100%', maxHeight: '90%', objectFit: 'contain' }}
        alt="loaded image"
      />}
        <PrevButton onLoadImage={() => handleLoadImage(PREV_ENDPOINT)} />
        <RandomButton onLoadImage={() => handleLoadImage(RANDOM_ENDPOINT)} />
        <NextButton onLoadImage={() => handleLoadImage(NEXT_ENDPOINT)} />
      </div>
    </div>
  )
}
