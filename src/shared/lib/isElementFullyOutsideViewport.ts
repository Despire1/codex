export const isElementFullyOutsideViewport = (element: HTMLElement) => {
  if (!element.isConnected) {
    return true;
  }

  const rect = element.getBoundingClientRect();

  return (
    rect.bottom <= 0 ||
    rect.top >= window.innerHeight ||
    rect.right <= 0 ||
    rect.left >= window.innerWidth
  );
};
