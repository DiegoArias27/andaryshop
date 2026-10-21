import { useState, type UIEvent } from 'react'

interface MobileCarouselProps {
  images: string[]
  alt: string
}

export default function MobileCarousel({ images, alt }: MobileCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0)

  function handleScroll(e: UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    const index = Math.round(el.scrollLeft / el.clientWidth)
    setActiveIndex(index)
  }

  if (images.length === 0) {
    return <div className="detail-media detail-media__placeholder" />
  }

  return (
    <div className="mobile-carousel">
      <div className="mobile-carousel__track" onScroll={handleScroll}>
        {images.map((url, index) => (
          <div className="mobile-carousel__slide" key={url + index}>
            <img src={url} alt={index === 0 ? alt : ''} />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <div className="mobile-carousel__dots">
          {images.map((_, index) => (
            <span
              key={index}
              className={`mobile-carousel__dot ${index === activeIndex ? 'mobile-carousel__dot--active' : ''}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
