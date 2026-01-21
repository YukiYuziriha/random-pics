import { useState } from 'react';
import { NEXT_RANDOM_ENDPOINT, PREV_RANDOM_ENDPOINT, FORCE_RANDOM_ENDPOINT, NEXT_ENDPOINT, PREV_ENDPOINT } from "./constants/endpoints.ts";


function ForceRandomButton({ onLoadImage }: { onLoadImage: () => void }) {
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

function NextRandomButton({ onLoadImage }: { onLoadImage: () => void }) {
  return (
    <button onClick={onLoadImage}>
      next random img
    </button>
  )
}

function PrevRandomButton({ onLoadImage }: { onLoadImage: () => void }) {
  return (
    <button onClick={onLoadImage}>
      prev random img
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
      <div style={{
        flexDirection: 'row',
        display: 'flex',
      }}>
        <PrevButton onLoadImage={() => handleLoadImage(PREV_ENDPOINT)} />
        <NextButton onLoadImage={() => handleLoadImage(NEXT_ENDPOINT)} />
        <NextRandomButton onLoadImage={() => handleLoadImage(NEXT_RANDOM_ENDPOINT)} />
        <ForceRandomButton onLoadImage={() => handleLoadImage(FORCE_RANDOM_ENDPOINT)} />
        <PrevRandomButton onLoadImage={() => handleLoadImage(PREV_RANDOM_ENDPOINT)} />
      </div>
      </div>
    </div>
  )
}
