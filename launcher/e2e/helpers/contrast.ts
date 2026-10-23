export function readTextContrast(selector: string) {
  const context = document.createElement('canvas').getContext('2d')!
  const color = (value: string) => {
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = value
    context.fillRect(0, 0, 1, 1)
    return Array.from(context.getImageData(0, 0, 1, 1).data, (n, i) => i === 3 ? n / 255 : n)
  }
  const over = (front: number[], back: number[]) => front.slice(0, 3).map((c, i) => c * front[3] + back[i] * (1 - front[3])).concat(1)
  const luminance = (rgb: number[]) => rgb.slice(0, 3).map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0)
  const ratio = (a: number[], b: number[]) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05)
  if (Math.abs(ratio([0, 0, 0], [255, 255, 255]) - 21) > .001) throw new Error('Invalid contrast calculation')
  const elements = Array.from(document.querySelectorAll(selector))
  if (!elements.length) throw new Error('No text matched the contrast check')
  // Ancestor colors only; review sibling overlays, images, gradients and animated backgrounds separately.
  return elements.map(element => {
    const ancestors: Element[] = []
    for (let parent: Element | null = element; parent; parent = parent.parentElement) ancestors.unshift(parent)
    const background = ancestors.reduce((back, parent) => over(color(getComputedStyle(parent).backgroundColor), back), [255, 255, 255, 1])
    const foreground = over(color(getComputedStyle(element).color), background)
    return { text: element.textContent?.trim(), foreground, background, ratio: ratio(foreground, background) }
  })
}
