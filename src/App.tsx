import { useState } from 'react'

function ForwardButton({ onLoadImage }: { onLoadImage: () => void }) {
  return (
    <button onClick={onLoadImage}>
      load img
    </button>
  )
}

export default function App() {
  const [imageSrc, setImageSrc] = useState('')

  const handleLoadImage = async () => {
    const res = await fetch('/api/random')
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
        <ForwardButton onLoadImage={handleLoadImage} />
      </div>
    </div>
  )
}
