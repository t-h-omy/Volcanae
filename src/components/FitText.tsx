import { useLayoutEffect, useRef } from 'react';
import { UI } from '../../config/ui';
import { computeFitFontSize, resolveMinFontSize } from '../fitText';
import './FitText.css';

type FitTextProps = {
  text: string;
  className?: string;
  as?: 'span' | 'div';
  maxLines?: number;
  title?: string;
};

export function FitText({
  text,
  className,
  as = 'span',
  maxLines = UI.FIT_TEXT_DEFAULT_MAX_LINES,
  title,
}: FitTextProps) {
  const elementRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const parent = element.parentElement;
    let disposed = false;
    let lastParentWidth: number | null = null;

    const getParentContentWidth = () => {
      if (!parent) return null;
      const parentStyle = window.getComputedStyle(parent);
      const rect = parent.getBoundingClientRect();
      const horizontalChrome =
        (Number.parseFloat(parentStyle.paddingLeft) || 0) +
        (Number.parseFloat(parentStyle.paddingRight) || 0) +
        (Number.parseFloat(parentStyle.borderLeftWidth) || 0) +
        (Number.parseFloat(parentStyle.borderRightWidth) || 0);
      return rect.width - horizontalChrome;
    };

    const fit = () => {
      if (disposed) return;
      element.style.fontSize = '';
      const basePx = Number.parseFloat(window.getComputedStyle(element).fontSize);
      if (!Number.isFinite(basePx) || basePx <= 0) {
        element.removeAttribute('data-fit-clipped');
        return;
      }

      const minPx = resolveMinFontSize(basePx);
      const result = computeFitFontSize({
        basePx,
        minPx,
        stepPx: UI.FIT_TEXT_STEP_PX,
        fits: (sizePx) => {
          element.style.fontSize = `${sizePx}px`;
          if (element.scrollWidth > element.clientWidth + UI.FIT_TEXT_TOLERANCE_PX) return false;
          if (maxLines <= UI.FIT_TEXT_DEFAULT_MAX_LINES) return true;

          const computed = window.getComputedStyle(element);
          const computedLineHeight = Number.parseFloat(computed.lineHeight);
          const lineHeightPx = Number.isFinite(computedLineHeight)
            ? computedLineHeight
            : sizePx * UI.FIT_TEXT_FALLBACK_LINE_HEIGHT;
          return element.scrollHeight <=
            lineHeightPx * maxLines + UI.FIT_TEXT_TOLERANCE_PX;
        },
      });

      element.style.fontSize = result.sizePx < basePx ? `${result.sizePx}px` : '';
      if (result.fitted) element.removeAttribute('data-fit-clipped');
      else element.setAttribute('data-fit-clipped', 'true');
      lastParentWidth = getParentContentWidth();
    };
    fit();

    let observer: ResizeObserver | undefined;
    if (parent && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width;
        if (width === undefined) return;
        if (lastParentWidth === null || Math.abs(width - lastParentWidth) > UI.FIT_TEXT_TOLERANCE_PX) {
          lastParentWidth = width;
          fit();
          lastParentWidth = width;
        }
      });
      observer.observe(parent);
    }

    if (typeof document !== 'undefined' && document.fonts?.ready) {
      void document.fonts.ready.then(() => fit());
    }

    return () => {
      disposed = true;
      observer?.disconnect();
    };
  }, [text, maxLines]);

  const classNames = [className, 'fit-text', maxLines > UI.FIT_TEXT_DEFAULT_MAX_LINES && 'fit-text--multiline']
    .filter(Boolean)
    .join(' ');
  const style = { '--fit-text-max-lines': String(maxLines) } as React.CSSProperties;
  const setElementRef = (node: HTMLElement | null) => {
    elementRef.current = node;
  };

  return as === 'div'
    ? <div ref={setElementRef} className={classNames} style={style} title={title}>{text}</div>
    : <span ref={setElementRef} className={classNames} style={style} title={title}>{text}</span>;
}
