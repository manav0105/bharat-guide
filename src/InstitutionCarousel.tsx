import { useEffect, useState } from 'react';

const slides = [
  { image: 'parliament.png', title: 'Parliament House', caption: 'A familiar landmark of Indian democracy.' },
  { image: 'supreme-court.png', title: 'Supreme Court of India', caption: 'The country’s highest court, in New Delhi.' },
  { image: 'rashtrapati-bhavan.png', title: 'Rashtrapati Bhavan', caption: 'The President’s residence in New Delhi.' },
  { image: 'panchayat.png', title: 'Village panchayat', caption: 'Public service, closer to home.' },
];

export function InstitutionCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 900px)').matches);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const width = window.matchMedia('(min-width: 900px)');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { setWide(width.matches); setReduced(motion.matches); };
    width.addEventListener('change', update); motion.addEventListener('change', update);
    return () => { width.removeEventListener('change', update); motion.removeEventListener('change', update); };
  }, []);
  useEffect(() => {
    if (!wide || paused || interacting || reduced) return;
    const timer = window.setInterval(() => { if (!document.hidden) setIndex(i => (i + 1) % slides.length); }, 9000);
    return () => window.clearInterval(timer);
  }, [wide, paused, interacting, reduced]);
  if (!wide) return null;
  const slide = slides[index];
  const move = (step: number) => { setPaused(true); setIndex(i => (i + step + slides.length) % slides.length); };
  return <aside className="institution-carousel" aria-label="Illustrations of Indian public institutions" aria-roledescription="carousel"
    onMouseEnter={() => setInteracting(true)} onMouseLeave={() => setInteracting(false)}
    onFocus={() => setInteracting(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setInteracting(false); }}>
    <figure aria-live={paused || reduced ? 'polite' : 'off'}>
      <div className="institution-art"><img key={slide.image} src={`/images/${slide.image}`} alt={`Illustration of ${slide.title}`} width="1024" height="768" /></div>
      <figcaption><span className="institution-title">{slide.title}</span><p>{slide.caption}</p></figcaption>
    </figure>
    <div className="carousel-controls"><span className="slide-count">{index + 1} / {slides.length}</span>
      <div className="carousel-buttons">
        <button type="button" aria-label="Previous illustration" onClick={() => move(-1)}><Chevron left /></button>
        {!reduced && <button type="button" aria-label={paused ? 'Play slideshow' : 'Pause slideshow'} onClick={() => setPaused(p => !p)}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">{paused ? <path d="m7 4 9 6-9 6V4Z" fill="currentColor" /> : <path d="M7 4v12M13 4v12" stroke="currentColor" strokeWidth="2" />}</svg>
        </button>}
        <button type="button" aria-label="Next illustration" onClick={() => move(1)}><Chevron /></button>
      </div>
    </div>
  </aside>;
}

function Chevron({ left = false }: { left?: boolean }) {
  return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d={left ? 'm12 5-5 5 5 5' : 'm8 5 5 5-5 5'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
