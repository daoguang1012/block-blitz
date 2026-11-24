export interface ElementOptions {
  className?: string;
  text?: string;
  attrs?: Record<string, string>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) {
    node.className = options.className;
  }
  if (options.text !== undefined) {
    node.textContent = options.text;
  }
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      node.setAttribute(key, value);
    }
  }
  if (children.length > 0) {
    node.append(...children);
  }
  return node;
}

export function createBlockAvatar(colorHex: string): HTMLElement {
  const avatar = el('div', {
    className: 'bb-avatar',
    attrs: { 'aria-hidden': 'true' },
  });
  avatar.style.setProperty('--avatar-color', colorHex);

  const visor = el('span', { className: 'bb-avatar-visor' });
  avatar.append(visor);
  return avatar;
}
