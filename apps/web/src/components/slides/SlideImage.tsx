import type { Slide } from '@pm/shared';
import { useEffect, useState } from 'react';
import classes from './SlideImage.module.css';

interface SlideImageProps {
  /** PNG, отрендеренный сервером. null — превью нет (например, без LibreOffice). */
  src: string | null;
  /** Высота / ширина слайда. */
  aspect: number;
  alt: string;
  /** Что показать, если картинки нет: текст слайда из Presentation IR. */
  fallback?: Slide;
  size?: 'full' | 'thumb';
}

export function SlideImage({ src, aspect, alt, fallback, size = 'full' }: SlideImageProps) {
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>(src ? 'loading' : 'missing');

  useEffect(() => setState(src ? 'loading' : 'missing'), [src]);

  return (
    <div
      className={classes.frame}
      data-size={size}
      data-state={state}
      style={{ aspectRatio: `${1 / aspect}` }}
    >
      {src && state !== 'missing' && (
        <img
          src={src}
          alt={alt}
          decoding="async"
          draggable={false}
          onLoad={() => setState('ready')}
          onError={() => setState('missing')}
        />
      )}
      {state === 'missing' &&
        (fallback ? (
          <TextSlide slide={fallback} compact={size === 'thumb'} />
        ) : (
          <span className={classes.none}>Нет превью</span>
        ))}
    </div>
  );
}

/** Текстовое превью: те же поля, что уйдут в .pptx, без дизайна шаблона. */
function TextSlide({ slide, compact }: { slide: Slide; compact: boolean }) {
  const body = slide.blocks.filter((b) => b.key !== 'title').flatMap((b) => b.paragraphs);
  return (
    <div className={classes.text} data-compact={compact || undefined}>
      <p className={classes.textTitle}>{slide.title}</p>
      {!compact && body.length > 0 && (
        <ul className={classes.textBody}>
          {body.slice(0, 8).map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
      {!compact && (
        <span className={classes.textNote}>Текстовое превью: картинка слайда недоступна</span>
      )}
    </div>
  );
}

/** Подгружаем соседний слайд заранее, чтобы стрелки переключали без задержки. */
export function usePrefetch(srcs: Array<string | null | undefined>) {
  const key = srcs.filter(Boolean).join('|');
  useEffect(() => {
    for (const src of key ? key.split('|') : []) {
      const image = new Image();
      image.src = src;
    }
  }, [key]);
}
