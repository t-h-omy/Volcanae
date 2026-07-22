import { describe, expect, it } from 'vitest';
import { selectPortalUsedCameraEndpoint } from '../portalAnimation';

describe('selectPortalUsedCameraEndpoint', () => {
  const fromPos = { x: 2, y: 3 };
  const toPos = { x: 8, y: 9 };

  it('returns fromPos when entrance is revealed and exit is fogged', () => {
    expect(selectPortalUsedCameraEndpoint(fromPos, toPos, true, false)).toEqual(fromPos);
  });

  it('returns toPos when entrance is fogged and exit is revealed', () => {
    expect(selectPortalUsedCameraEndpoint(fromPos, toPos, false, true)).toEqual(toPos);
  });

  it('returns fromPos when both endpoints are revealed', () => {
    expect(selectPortalUsedCameraEndpoint(fromPos, toPos, true, true)).toEqual(fromPos);
  });

  it('returns toPos when both endpoints are fogged', () => {
    expect(selectPortalUsedCameraEndpoint(fromPos, toPos, false, false)).toEqual(toPos);
  });
});
