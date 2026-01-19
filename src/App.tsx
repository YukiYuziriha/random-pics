import { useState } from 'react'

function MyButton({ onLoadImage }: { onLoadImage: () => void }) {
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
    }}>
      {imageSrc && <img
        src={imageSrc}
        style={{ maxWidth: '100%', maxHeight: '90%' }}
        alt="loaded image"
      />}

      <div style={{
        width: '500px',
        height: '80vh',
        border: '5px solid #ccc',
        borderRadius: '15px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <MyButton onLoadImage={handleLoadImage} />
      </div>
    </div>
  )
}
