import type { DependencyList, RefObject } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion';

gsap.registerPlugin(useGSAP);

export function usePageIntro(
  scope: RefObject<HTMLElement | null>,
  dependencies: DependencyList = [],
): void {
  const reducedMotion = usePrefersReducedMotion();

  useGSAP(
    () => {
      if (reducedMotion) return;

      const media = gsap.matchMedia();
      media.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo(
          '[data-intro]',
          { autoAlpha: 0.01, y: 18, filter: 'blur(8px)' },
          {
            autoAlpha: 1,
            y: 0,
            filter: 'blur(0px)',
            duration: 0.72,
            stagger: 0.08,
            ease: 'power3.out',
            clearProps: 'transform,filter,opacity,visibility',
          },
        );
      });

      return () => media.revert();
    },
    {
      scope,
      dependencies: [reducedMotion, ...dependencies],
      revertOnUpdate: true,
    },
  );
}
